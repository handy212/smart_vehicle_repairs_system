"""Branch helper utilities."""
from __future__ import annotations

from typing import Optional

from django.http import HttpRequest
from django.db.models import QuerySet, Q

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

    session = getattr(request, "session", None)
    branch_candidates = []
    if branch_id:
        branch_candidates.append(branch_id)

    # Check query parameter
    query_branch_id = request.GET.get("branch_id") or request.GET.get("branch")
    if query_branch_id:
        branch_candidates.append(query_branch_id)

    # Check header
    header_branch_id = (
        request.headers.get("X-Branch-ID")
        or request.META.get("HTTP_X_BRANCH_ID")
        or request.headers.get("X_BRANCH_ID")
    )
    if header_branch_id:
        branch_candidates.append(header_branch_id)

    for candidate in branch_candidates:
        try:
            candidate_id = int(candidate)
        except (TypeError, ValueError):
            continue
        branch = branches.filter(id=candidate_id).first()
        if branch:
            if session:
                session["active_branch_id"] = branch.id
            return branch

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


def filter_queryset_for_user_branches(
    queryset,
    user,
    request=None,
    use_active_branch=True,
    include_unassigned=False,
):
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
    def apply_filter(base_filter: Q | None):
        if base_filter is None:
            return queryset
        if include_unassigned:
            base_filter = base_filter | Q(branch__isnull=True)
        return queryset.filter(base_filter)
    
    if getattr(user, "role", None) == "admin":
        if use_active_branch and request:
            active_branch = resolve_branch(request)
            if active_branch:
                return apply_filter(Q(branch=active_branch))
        return queryset
    
    # For non-admins, check if we should use active branch
    if use_active_branch and request:
        active_branch = resolve_branch(request)
        if active_branch and user.has_branch_access(active_branch):
            return apply_filter(Q(branch=active_branch))
    
    # Fall back to all accessible branches
    branches = get_user_accessible_branches(user)
    return apply_filter(Q(branch__in=branches))
