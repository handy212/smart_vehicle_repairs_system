"""Context processors for branches app."""
from __future__ import annotations

from typing import Any, Dict

from django.http import HttpRequest


def branch_context(request: HttpRequest) -> Dict[str, Any]:
    """Expose branch information to all templates.

    Provides the authenticated user with:
      * ``branch_accessible_branches`` – queryset of branches the user may access
      * ``branch_active_branch`` – best-guess active branch for current session
      * ``branch_can_select_branch`` – flag for showing branch selector controls
    """
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        return {}

    branches = user.get_accessible_branches()

    active_branch = None
    selected_branch_id = request.session.get("active_branch_id")
    if selected_branch_id:
        active_branch = branches.filter(id=selected_branch_id).first()

    if active_branch is None:
        active_branch = user.primary_branch

    return {
        "branch_accessible_branches": branches,
        "branch_active_branch": active_branch,
        "branch_active_branch_id": getattr(active_branch, "id", None),
        "branch_can_select_branch": branches.count() > 1,
    }
