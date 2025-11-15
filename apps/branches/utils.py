"""Branch helper utilities."""
from __future__ import annotations

from typing import Optional

from django.http import HttpRequest
from django.db.models import QuerySet

from .models import Branch


def get_user_accessible_branches(user) -> QuerySet:
    """Return the active branches the authenticated user can access."""
    if not user or not getattr(user, "is_authenticated", False):
        return Branch.objects.none()
    return user.get_accessible_branches()


def resolve_branch(request: HttpRequest, branch_id: Optional[int] = None) -> Optional[Branch]:
    """Resolve the branch to use for the current request."""
    user = getattr(request, "user", None)
    if not user or not getattr(user, "is_authenticated", False):
        return None

    branches = get_user_accessible_branches(user)

    if branch_id:
        branch = branches.filter(id=branch_id).first()
        if branch:
            return branch

    session = getattr(request, "session", None)
    if session:
        active_id = session.get("active_branch_id")
        if active_id:
            branch = branches.filter(id=active_id).first()
            if branch:
                return branch

    primary = getattr(user, "primary_branch", None)
    if primary and branches.filter(id=primary.id).exists():
        return primary

    return branches.first()


def filter_queryset_for_user_branches(queryset, user, request=None, use_active_branch=True):
    """
    Limit queryset to branches the user can access.
    
    Args:
        queryset: The queryset to filter
        user: The user making the request
        request: Optional HttpRequest to get active branch from session
        use_active_branch: If True and request provided, filter by active branch only
                          If False, filter by all accessible branches
    """
    if not user or not getattr(user, "is_authenticated", False):
        return queryset.none()
    
    # Admins can see all branches unless use_active_branch is True and active branch is set
    if getattr(user, "role", None) == "admin":
        if use_active_branch and request:
            active_branch = resolve_branch(request)
            if active_branch:
                return queryset.filter(branch=active_branch)
        return queryset
    
    # For non-admins, check if we should use active branch
    if use_active_branch and request:
        active_branch = resolve_branch(request)
        if active_branch and user.has_branch_access(active_branch):
            return queryset.filter(branch=active_branch)
    
    # Fall back to all accessible branches
    branches = get_user_accessible_branches(user)
    return queryset.filter(branch__in=branches)
