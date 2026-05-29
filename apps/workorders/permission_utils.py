"""Shared permission helpers for work order API viewsets."""
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated

from apps.accounts.permissions import (
    HasAnyPermission,
    HasPermission,
    IsModuleEnabled,
    WORKORDER_STATUS_PERMISSIONS,
    WORKORDER_VIEW_PERMISSIONS,
)


def workorder_module_permissions():
    return [IsAuthenticated(), IsModuleEnabled('workorders')]


def workorder_read_permissions():
    return workorder_module_permissions() + [
        HasAnyPermission(list(WORKORDER_VIEW_PERMISSIONS))(),
    ]


def workorder_edit_permissions():
    return workorder_module_permissions() + [HasPermission('edit_workorders')()]


def workorder_status_change_permissions():
    return workorder_module_permissions() + [
        HasAnyPermission(list(WORKORDER_STATUS_PERMISSIONS))(),
    ]


def workorder_task_workflow_permissions():
    """Technicians may start/complete assigned tasks without full WO edit access."""
    return workorder_module_permissions() + [
        HasAnyPermission([*WORKORDER_STATUS_PERMISSIONS, 'clock_work_time'])(),
    ]


class WorkOrderRelatedPermissionMixin:
    """Apply view/edit permission codes to work-order satellite viewsets."""

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return workorder_read_permissions()
        return workorder_edit_permissions()
