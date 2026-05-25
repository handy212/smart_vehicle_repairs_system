"""Branch resolution and notification helpers for roadside requests."""
from __future__ import annotations

from typing import Optional

from django.db.models import Q, QuerySet
from rest_framework.exceptions import ValidationError

from apps.branches.models import Branch
from apps.branches.utils import resolve_branch


# Roles that receive in-app alerts when a request is created for their branch.
ROADSIDE_BRANCH_NOTIFY_ROLES = (
    "admin",
    "super-admin",
    "manager",
    "service_coordinator",
    "receptionist",
)


def resolve_roadside_branch(request, branch_id: Optional[int] = None) -> Branch:
    """
    Resolve the service branch for a new roadside request.

    Customers must explicitly choose an active branch. Staff use branch access
    rules (body, session, header, or primary branch).
    """
    user = getattr(request, "user", None)
    raw_id = branch_id or request.data.get("branch") or request.data.get("branch_id")

    if user and getattr(user, "role", None) == "customer":
        if raw_id is None:
            raise ValidationError({"branch": "Please select a service branch."})
        try:
            branch_pk = int(raw_id)
        except (TypeError, ValueError):
            raise ValidationError({"branch": "Invalid branch selected."})
        branch = Branch.objects.filter(id=branch_pk, is_active=True).first()
        if not branch:
            raise ValidationError({"branch": "Selected branch is not available."})
        return branch

    try:
        parsed_id = int(raw_id) if raw_id is not None else None
    except (TypeError, ValueError):
        parsed_id = None

    branch = resolve_branch(request, branch_id=parsed_id)
    if branch is None:
        raise ValidationError({"branch": "A valid branch assignment is required."})
    return branch


def get_roadside_branch_notification_recipients(branch: Optional[Branch]) -> QuerySet:
    """Staff who should receive in-app alerts for a new request at ``branch``."""
    from apps.accounts.models import User

    if not branch:
        return User.objects.none()

    active = Q(is_active=True)
    role_filter = Q(role__in=ROADSIDE_BRANCH_NOTIFY_ROLES)

    global_oversight = Q(role__in=("admin", "super-admin"))
    branch_staff = Q(
        branch=branch,
        role__in=("service_coordinator", "receptionist"),
    )
    branch_managers = Q(role="manager", managed_branches=branch)

    return (
        User.objects.filter(active & role_filter & (global_oversight | branch_staff | branch_managers))
        .distinct()
    )
