"""Shared permission helpers for diagnosis API viewsets."""
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated

from apps.accounts.permissions import HasAnyPermission, HasPermission, IsModuleEnabled


def diagnosis_module_permissions():
    return [IsAuthenticated(), IsModuleEnabled('diagnosis')]


def diagnosis_read_permissions():
    return diagnosis_module_permissions() + [HasPermission('view_diagnosis')()]


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


class DiagnosisPermissionMixin:
    """Standard CRUD permission mapping for diagnosis records."""

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return diagnosis_read_permissions()
        if self.request.method == 'POST':
            return diagnosis_create_permissions()
        if self.request.method == 'DELETE':
            return diagnosis_delete_permissions()
        return diagnosis_write_permissions()


class DiagnosisCodeLibraryPermissionMixin:
    """Permissions for diagnostic code / test procedure libraries."""

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return diagnosis_code_read_permissions()
        return diagnosis_code_manage_permissions()
