"""
Reusable helpers for consistent module + CRUD permission enforcement.
"""
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated

from apps.accounts.permissions import HasAnyPermission, HasPermission, IsModuleEnabled


def module_permission_instances(module_slug):
    return [IsAuthenticated(), IsModuleEnabled(module_slug)()]


def crud_permission_instances(
    module_slug,
    *,
    view_code,
    create_code=None,
    edit_code=None,
    delete_code=None,
    manage_code=None,
    request=None,
):
    """
    Build DRF permission instances for a request using standard CRUD codes.
    Never returns auth-only — always includes a capability check for staff.
    """
    base = module_permission_instances(module_slug)
    create_code = create_code or edit_code or manage_code or view_code
    edit_code = edit_code or manage_code or create_code
    delete_code = delete_code or manage_code or edit_code

    if request is None:
        return base + [HasPermission(view_code)()]

    method = request.method
    if method in SAFE_METHODS:
        return base + [HasPermission(view_code)()]
    if method == 'POST':
        codes = [c for c in (create_code, manage_code) if c]
        return base + [HasAnyPermission(codes)()]
    if method == 'DELETE':
        codes = [c for c in (delete_code, manage_code) if c]
        return base + [HasAnyPermission(codes)()]
    codes = [c for c in (edit_code, manage_code) if c]
    return base + [HasAnyPermission(codes)()]


def action_permission_instances(
    module_slug,
    action,
    *,
    view_code,
    create_code=None,
    edit_code=None,
    delete_code=None,
    manage_code=None,
    customer_actions=None,
    request=None,
):
    """Map DRF actions to permission codes; optional customer portal bypass."""
    customer_actions = customer_actions or frozenset()
    if (
        request
        and action in customer_actions
        and getattr(request.user, 'role', None) == 'customer'
    ):
        return module_permission_instances(module_slug)

    base = module_permission_instances(module_slug)
    create_code = create_code or edit_code or manage_code or view_code
    edit_code = edit_code or manage_code or create_code
    delete_code = delete_code or manage_code or edit_code

    if action in ('list', 'retrieve') or (request and request.method in SAFE_METHODS):
        return base + [HasPermission(view_code)()]
    if action == 'create':
        codes = [c for c in (create_code, manage_code) if c]
        return base + [HasAnyPermission(codes)()]
    if action == 'destroy':
        codes = [c for c in (delete_code, manage_code) if c]
        return base + [HasAnyPermission(codes)()]
    if action in ('update', 'partial_update'):
        codes = [c for c in (edit_code, manage_code) if c]
        return base + [HasAnyPermission(codes)()]
    if request and request.method == 'POST':
        codes = [c for c in (edit_code, create_code, manage_code) if c]
        return base + [HasAnyPermission(codes)()]
    if request and request.method == 'DELETE':
        codes = [c for c in (delete_code, manage_code) if c]
        return base + [HasAnyPermission(codes)()]
    codes = [c for c in (edit_code, manage_code, view_code) if c]
    return base + [HasAnyPermission(codes)()]
