"""Branch helper utilities."""
from __future__ import annotations

import re
from typing import Optional

from django.conf import settings
from django.http import HttpRequest
from django.db.models import QuerySet, Q

from .models import Branch

_BRANCH_SUFFIX_RE = re.compile(r'\s+branch$', re.IGNORECASE)


def branch_print_display_name(name: str) -> str:
    """Strip a trailing 'Branch' word for print/PDF footers only."""
    text = (name or '').strip()
    if not text:
        return text
    stripped = _BRANCH_SUFFIX_RE.sub('', text).strip()
    return stripped or text


def get_user_accessible_branches(user) -> QuerySet:
    """Return the active branches the authenticated user can access."""
    if not user or not getattr(user, "is_authenticated", False):
        return Branch.objects.none()
    return user.get_accessible_branches()


def resolve_branch(
    request: HttpRequest,
    branch_id: Optional[int] = None,
    *,
    persist_session: bool = True,
) -> Optional[Branch]:
    """Resolve the branch to use for the current request.

    ``persist_session=False`` is intended for read-only list filters where an
    explicit query/header branch must not change the user's active branch.
    """
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
            if session and persist_session:
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

    branch = branches.first()
    if not branch:
        # Global fallback: try headquarters, then any active branch
        # This is useful for customers or unassigned staff creating records
        return Branch.objects.filter(is_active=True, is_headquarters=True).first() or \
               Branch.objects.filter(is_active=True).first()
    
    return branch


def filter_queryset_for_user_branches(
    queryset: QuerySet,
    user,
    request: HttpRequest | None = None,
    use_active_branch: bool = True,
    include_unassigned: bool = False,
    branch_lookup: str = "branch",
) -> QuerySet:
    """
    Limit queryset to branches the user can access.
    
    Args:
        queryset: The queryset to filter
        user: The user making the request
        request: Optional HttpRequest to get active branch from session
        use_active_branch: If True and request provided, filter by active branch only
                          If False, filter by all accessible branches
        include_unassigned: If True, include records with no branch assignment
        branch_lookup: The field lookup path to the branch (default: "branch")
    """
    if not user or not getattr(user, "is_authenticated", False):
        return queryset.none()
    
    # Admins can see all branches unless use_active_branch is True and active branch is set
    def apply_filter(branch_obj_or_ids, is_list=False):
        q_kwargs = {}
        if is_list:
            q_kwargs[f"{branch_lookup}__in"] = branch_obj_or_ids
        else:
            q_kwargs[branch_lookup] = branch_obj_or_ids
            
        base_filter = Q(**q_kwargs)
        
        if include_unassigned:
            null_kwargs = {f"{branch_lookup}__isnull": True}
            base_filter = base_filter | Q(**null_kwargs)
            
        return queryset.filter(base_filter)
    
    if getattr(user, "role", None) == "admin":
        if (
            use_active_branch
            and request
            and getattr(settings, 'BRANCH_FILTER_USE_ACTIVE_BRANCH_FOR_ADMIN', True)
        ):
            active_branch = resolve_branch(request)
            if active_branch:
                return apply_filter(active_branch)
        return queryset
    
    # For non-admins, check if we should use active branch
    if use_active_branch and request:
        active_branch = resolve_branch(request)
        if active_branch and user.has_branch_access(active_branch):
            return apply_filter(active_branch)
    
    # Fall back to all accessible branches
    branches = get_user_accessible_branches(user)
    return apply_filter(branches, is_list=True)
