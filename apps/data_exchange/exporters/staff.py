"""Export staff / employees in an import-compatible workbook."""
from __future__ import annotations

from typing import Any

from apps.data_exchange.exporters.base import BaseExporter
from apps.hr.models import EmployeeProfile
from apps.hr.serializers import STAFF_PROFILE_ROLES


class StaffExporter(BaseExporter):
    key = 'staff'
    label = 'Staff / Employees'
    description = 'Export staff profiles for backup or re-import (password column left blank).'

    def export(self, options: dict[str, Any] | None = None) -> tuple:
        headers = [
            'email',
            'first_name',
            'last_name',
            'password',
            'phone',
            'role',
            'branch',
            'department',
            'position',
            'employment_type',
            'employment_status',
            'start_date',
            'end_date',
            'salary_type',
            'base_salary',
            'bank_name',
            'bank_account_number',
            'bank_branch',
            'national_id',
            'tax_id',
            'emergency_contact_name',
            'emergency_contact_phone',
            'emergency_contact_relationship',
            'notes',
        ]
        rows = []
        qs = (
            EmployeeProfile.objects.select_related(
                'user',
                'user__branch',
                'department',
                'position',
            )
            .filter(user__role__in=STAFF_PROFILE_ROLES)
            .order_by('user__first_name', 'user__last_name')
        )
        for profile in qs.iterator(chunk_size=500):
            user = profile.user
            branch = user.branch
            rows.append([
                user.email,
                user.first_name,
                user.last_name,
                '',  # never export passwords
                user.phone or '',
                user.role,
                branch.code if branch else '',
                profile.department.name if profile.department_id else '',
                profile.position.title if profile.position_id else '',
                profile.employment_type,
                profile.employment_status,
                profile.start_date.isoformat() if profile.start_date else '',
                profile.end_date.isoformat() if profile.end_date else '',
                profile.salary_type,
                profile.base_salary,
                profile.bank_name or '',
                profile.bank_account_number or '',
                profile.bank_branch or '',
                profile.national_id or '',
                profile.tax_id or '',
                profile.emergency_contact_name or '',
                profile.emergency_contact_phone or '',
                profile.emergency_contact_relationship or '',
                profile.notes or '',
            ])
        buffer = self._workbook_from_rows(headers, rows, 'Staff')
        return buffer, 'staff_export.xlsx', (
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
