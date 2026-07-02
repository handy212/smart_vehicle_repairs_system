"""
Helpers for dynamic role codes (system + custom roles).
"""
from __future__ import annotations

from functools import lru_cache

CUSTOMER_ROLE_CODE = 'customer'
SUPER_ADMIN_ROLE_CODE = 'super-admin'
ADMIN_ROLE_CODE = 'admin'
MANAGER_ROLE_CODE = 'manager'

# Legacy single-branch staff role codes (custom roles use permission heuristics).
SINGLE_BRANCH_STAFF_ROLE_CODES = frozenset({
    'receptionist',
    'technician',
    'parts_manager',
    'service_coordinator',
    'accountant',
    'hr_manager',
})

STAFF_ROLE_CODES = frozenset({
    ADMIN_ROLE_CODE,
    MANAGER_ROLE_CODE,
    *SINGLE_BRANCH_STAFF_ROLE_CODES,
})


def get_active_role_record(code: str | None):
    if not code:
        return None
    from apps.accounts.permission_models import Role

    try:
        return Role.objects.get(code=code, is_active=True)
    except Role.DoesNotExist:
        return None


def is_valid_assignable_role_code(code: str | None) -> bool:
    """Role codes that may be assigned to users via the API (excludes super-admin)."""
    if not code or code == SUPER_ADMIN_ROLE_CODE:
        return False
    return get_active_role_record(code) is not None


def is_customer_role_code(code: str | None) -> bool:
    return code == CUSTOMER_ROLE_CODE


def is_staff_role_code(code: str | None) -> bool:
    if not code or is_customer_role_code(code):
        return False
    if code in (SUPER_ADMIN_ROLE_CODE, *STAFF_ROLE_CODES):
        return True
    return get_active_role_record(code) is not None


@lru_cache(maxsize=128)
def _role_permission_codes(code: str) -> frozenset[str]:
    role = get_active_role_record(code)
    if not role:
        return frozenset()
    return frozenset(role.get_permission_codes())


def role_has_permission(code: str | None, permission_code: str) -> bool:
    if not code:
        return False
    return permission_code in _role_permission_codes(code)


def role_uses_managed_branches(code: str | None) -> bool:
    if code == MANAGER_ROLE_CODE:
        return True
    if not code or is_customer_role_code(code):
        return False
    perms = _role_permission_codes(code)
    return 'manage_branch_staff' in perms and 'manage_branches' not in perms


def role_has_all_branches_access(code: str | None) -> bool:
    if code in (SUPER_ADMIN_ROLE_CODE, ADMIN_ROLE_CODE):
        return True
    if not code:
        return False
    perms = _role_permission_codes(code)
    return 'manage_branches' in perms


def role_requires_single_branch(code: str | None) -> bool:
    if not code or is_customer_role_code(code):
        return False
    if code in (SUPER_ADMIN_ROLE_CODE, ADMIN_ROLE_CODE) or role_has_all_branches_access(code):
        return False
    if role_uses_managed_branches(code):
        return False
    if code in SINGLE_BRANCH_STAFF_ROLE_CODES:
        return True
    role = get_active_role_record(code)
    if not role:
        return False
    perms = _role_permission_codes(code)
    return 'view_branch_data' in perms or bool(perms - {'view_own_profile', 'edit_own_profile'})


def clear_role_permission_cache() -> None:
    _role_permission_codes.cache_clear()
