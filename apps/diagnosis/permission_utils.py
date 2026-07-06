"""Shared permission helpers for diagnosis API viewsets."""
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated

from apps.accounts.permissions import (
    HasAnyPermission,
    HasPermission,
    IsModuleEnabled,
    WORKORDER_VIEW_PERMISSIONS,
    user_has_permission,
)

# Stores workbench: quotation queue read access (broader than full diagnosis CRUD).
QUOTATION_QUEUE_VIEW_PERMISSIONS = (
    'view_diagnosis',
    'view_inventory',
    'manage_inventory',
    'approve_part_requests',
    'edit_estimates',
    'approve_estimates',
)

# Stores workbench: mark recommendations as quotation-ready.
QUOTATION_COMPLETE_PERMISSIONS = (
    'manage_diagnosis',
    'manage_inventory',
    'approve_part_requests',
)


def user_can_view_quotation_queue(user):
    """Whether the user may read the stores quotation queue."""
    return any(
        user_has_permission(user, permission_code)
        for permission_code in QUOTATION_QUEUE_VIEW_PERMISSIONS
    )


def user_can_complete_quotation(user):
    """Whether the user may mark stores quotations as ready."""
    return any(
        user_has_permission(user, permission_code)
        for permission_code in QUOTATION_COMPLETE_PERMISSIONS
    )


def quotation_queue_read_permissions():
    return diagnosis_module_permissions() + [
        HasAnyPermission(list(QUOTATION_QUEUE_VIEW_PERMISSIONS))(),
    ]


def quotation_complete_permissions():
    return diagnosis_module_permissions() + [
        HasAnyPermission(list(QUOTATION_COMPLETE_PERMISSIONS))(),
    ]


def diagnosis_module_permissions():
    return [IsAuthenticated(), IsModuleEnabled('diagnosis')]


def diagnosis_staff_read_permissions():
    """Staff list/detail requires view_diagnosis (not general work-order view)."""
    return diagnosis_module_permissions() + [
        HasPermission('view_diagnosis')(),
    ]


def diagnosis_customer_read_permissions():
    """Customer portal: own work orders via view_own_workorders (or view_diagnosis)."""
    return diagnosis_module_permissions() + [
        HasAnyPermission(['view_diagnosis', *WORKORDER_VIEW_PERMISSIONS])(),
    ]


def diagnosis_customer_portal_permissions():
    """Customer portal: module enabled only; queryset scopes to own work orders."""
    return diagnosis_module_permissions()


class _DenyAll(BasePermission):
    def has_permission(self, request, view):
        return False


def diagnosis_customer_deny_permissions():
    return diagnosis_module_permissions() + [_DenyAll()]


def diagnosis_write_permissions():
    return diagnosis_module_permissions() + [
        HasAnyPermission(['edit_diagnosis', 'manage_diagnosis'])(),
    ]


def diagnosis_create_permissions():
    return diagnosis_module_permissions() + [
        HasAnyPermission(['create_diagnosis', 'manage_diagnosis'])(),
    ]


def diagnosis_delete_permissions():
    return diagnosis_module_permissions() + [
        HasAnyPermission(['delete_diagnosis', 'manage_diagnosis'])(),
    ]


def diagnosis_code_read_permissions():
    return diagnosis_module_permissions() + [
        HasAnyPermission(['view_diagnostic_codes', 'view_diagnosis', 'manage_diagnosis'])(),
    ]


def diagnosis_code_manage_permissions():
    return diagnosis_module_permissions() + [
        HasAnyPermission(['manage_diagnostic_codes', 'manage_diagnosis'])(),
    ]


# Custom @action endpoints that only bump library analytics counters.
LIBRARY_USE_ACTIONS = frozenset({'use', 'increment_use'})


def diagnosis_code_use_permissions():
    """Allow technicians to record library usage during diagnosis (not full CRUD)."""
    return diagnosis_module_permissions() + [
        HasAnyPermission([
            'view_diagnostic_codes',
            'view_diagnosis',
            'create_diagnosis',
            'edit_diagnosis',
            'perform_diagnostic_tests',
            'manage_diagnostic_codes',
            'manage_diagnosis',
        ])(),
    ]


class DiagnosisPermissionMixin:
    """Standard CRUD permission mapping for diagnosis records."""

    CUSTOMER_PORTAL_READ_ACTIONS = frozenset({'list', 'retrieve', 'recommendations'})
    CUSTOMER_PORTAL_WRITE_ACTIONS = frozenset({'approve_recommendations'})

    def get_permissions(self):
        if getattr(self.request.user, 'role', None) == 'customer':
            action = getattr(self, 'action', None)
            if action in self.CUSTOMER_PORTAL_WRITE_ACTIONS:
                return diagnosis_customer_portal_permissions()
            if action in self.CUSTOMER_PORTAL_READ_ACTIONS or self.request.method in SAFE_METHODS:
                return diagnosis_customer_read_permissions()
            return diagnosis_customer_deny_permissions()

        if self.request.method in SAFE_METHODS:
            return diagnosis_staff_read_permissions()
        if self.request.method == 'POST':
            if getattr(self, 'action', None) == 'approve_recommendations':
                return diagnosis_write_permissions()
            return diagnosis_create_permissions()
        if self.request.method == 'DELETE':
            return diagnosis_delete_permissions()
        return diagnosis_write_permissions()


class DiagnosisCodeLibraryPermissionMixin:
    """Permissions for diagnostic code / test procedure libraries."""

    def get_permissions(self):
        if getattr(self, 'action', None) in LIBRARY_USE_ACTIONS:
            return diagnosis_code_use_permissions()
        if self.request.method in SAFE_METHODS:
            return diagnosis_code_read_permissions()
        return diagnosis_code_manage_permissions()
