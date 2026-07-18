"""Staff / employee importer for the centralized data exchange hub."""
from __future__ import annotations

import secrets
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

import openpyxl
from django.contrib.auth import get_user_model
from django.db import transaction

from apps.branches.models import Branch
from apps.data_exchange.importers.base import (
    BaseImporter,
    ImportCommitResult,
    ImportPreviewResult,
    RowIssue,
)
from apps.data_exchange.utils import clean_value, normalize_header
from apps.hr.models import Department, EmployeeProfile, Position
from apps.hr.serializers import (
    STAFF_BRANCH_ROLES,
    STAFF_PROFILE_ROLES,
    account_is_active_for_employment_status,
)

User = get_user_model()

EMPLOYMENT_TYPES = {c[0] for c in EmployeeProfile.EMPLOYMENT_TYPE_CHOICES}
EMPLOYMENT_STATUSES = {c[0] for c in EmployeeProfile.EMPLOYMENT_STATUS_CHOICES}
SALARY_TYPES = {c[0] for c in EmployeeProfile.SALARY_TYPE_CHOICES}


class StaffImporter(BaseImporter):
    key = 'staff'
    label = 'Staff / Employees'
    description = (
        'Import staff users and HR employee profiles. '
        'Required columns: email, first_name, last_name. Password is optional '
        '(a temporary password is generated when blank).'
    )
    supports_export = True

    REQUIRED_HEADERS = ('email', 'first_name', 'last_name')

    def default_options(self) -> dict[str, Any]:
        return {
            'update_existing': False,
            'generate_temp_password': True,
            'default_role': 'technician',
            'default_branch_id': None,
            'default_branch_code': '',
        }

    def preview(self, file_obj, options: dict[str, Any] | None = None) -> ImportPreviewResult:
        opts = {**self.default_options(), **(options or {})}
        plan = self._build_plan(file_obj, opts, persist=False)
        return ImportPreviewResult(
            format_detected=plan['format_detected'],
            summary=plan['summary'],
            issues=plan['issues'],
            sample_creates=plan['sample_creates'],
            options_echo=opts,
        )

    def commit(self, file_obj, options: dict[str, Any] | None = None) -> ImportCommitResult:
        opts = {**self.default_options(), **(options or {})}
        plan = self._build_plan(file_obj, opts, persist=True)
        return ImportCommitResult(
            summary=plan['summary'],
            created_refs=plan['created_refs'],
            issues=plan['issues'],
        )

    def rollback(self, created_refs: dict[str, list[int]]) -> dict[str, Any]:
        deleted = {'employee_profile': 0, 'user': 0}
        skipped = {'employee_profile': 0, 'user': 0}
        errors: list[str] = []

        profile_ids = list(created_refs.get('employee_profile') or [])
        user_ids = set(created_refs.get('user') or [])

        for profile_id in profile_ids:
            try:
                profile = EmployeeProfile.objects.filter(pk=profile_id).select_related('user').first()
                if not profile:
                    skipped['employee_profile'] += 1
                    continue
                if profile.user_id:
                    user_ids.add(profile.user_id)
                profile.delete()
                deleted['employee_profile'] += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(f'EmployeeProfile {profile_id}: {exc}')

        for user_id in user_ids:
            try:
                user = User.objects.filter(pk=user_id).first()
                if not user:
                    skipped['user'] += 1
                    continue
                if EmployeeProfile.objects.filter(user_id=user_id).exists():
                    skipped['user'] += 1
                    errors.append(f'User {user_id} still has a profile; skipped')
                    continue
                user.delete()
                deleted['user'] += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(f'User {user_id}: {exc}')

        return {'deleted': deleted, 'skipped': skipped, 'errors': errors}

    def _build_plan(self, file_obj, opts: dict, *, persist: bool) -> dict:
        rows, _headers = self._load_rows(file_obj)
        issues: list[RowIssue] = []
        sample_creates: list[dict] = []
        created_refs = {'employee_profile': [], 'user': []}
        summary = {
            'total_rows': 0,
            'rows_to_create': 0,
            'staff_to_create': 0,
            'staff_to_update': 0,
            'staff_created': 0,
            'staff_updated': 0,
            'rows_failed': 0,
            'rows_skipped': 0,
            'temp_passwords_generated': 0,
        }
        seen_emails: set[str] = set()
        default_branch = self._resolve_branch(
            opts.get('default_branch_id'),
            opts.get('default_branch_code'),
        )

        for row_number, row in rows:
            summary['total_rows'] += 1
            mapped = self._map_row(row, row_number, opts, default_branch)
            if mapped is None:
                summary['rows_skipped'] += 1
                continue

            email = mapped['email']
            if email in seen_emails:
                summary['rows_failed'] += 1
                issues.append(RowIssue(
                    row_number=row_number,
                    level='error',
                    entity_type='staff',
                    action='skip',
                    code='duplicate_in_file',
                    identifier=email,
                    message=f'Duplicate email in file: {email}',
                ))
                continue
            seen_emails.add(email)

            row_issues = self._validate_mapped(mapped)
            if row_issues:
                summary['rows_failed'] += 1
                issues.extend(row_issues)
                continue

            existing_user = User.objects.filter(email__iexact=email).first()
            existing_profile = None
            if existing_user:
                existing_profile = EmployeeProfile.objects.filter(user=existing_user).first()

            if existing_user and not opts.get('update_existing'):
                summary['rows_skipped'] += 1
                issues.append(RowIssue(
                    row_number=row_number,
                    level='warning',
                    entity_type='staff',
                    action='skip',
                    code='exists',
                    identifier=email,
                    message=f'Staff with email {email} already exists; skipped',
                ))
                continue

            action = 'update' if existing_user else 'create'
            if action == 'create':
                summary['staff_to_create'] += 1
                summary['rows_to_create'] += 1
                if mapped.get('generated_password'):
                    summary['temp_passwords_generated'] += 1
            else:
                summary['staff_to_update'] += 1

            if len(sample_creates) < 25 and action == 'create':
                sample_creates.append({
                    'row_number': row_number,
                    'email': email,
                    'name': f"{mapped['first_name']} {mapped['last_name']}".strip(),
                    'role': mapped['role'],
                    'branch': mapped['branch'].code if mapped.get('branch') else '',
                    'temp_password': mapped['password'] if mapped.get('generated_password') else '',
                })

            if mapped.get('generated_password'):
                issues.append(RowIssue(
                    row_number=row_number,
                    level='info',
                    entity_type='staff',
                    action=action,
                    code='temp_password',
                    identifier=email,
                    message=(
                        f'Temporary password generated for {email}: {mapped["password"]}. '
                        'Share securely and require a change on first login.'
                    ),
                    payload={'temp_password': mapped['password']} if not persist else {},
                ))

            if not persist:
                continue

            try:
                with transaction.atomic():
                    profile, user, created = self._persist_staff(
                        mapped,
                        existing_user=existing_user,
                        existing_profile=existing_profile,
                    )
                if created:
                    created_refs['employee_profile'].append(profile.id)
                    created_refs['user'].append(user.id)
                    summary['staff_created'] += 1
                else:
                    summary['staff_updated'] += 1
            except Exception as exc:  # noqa: BLE001
                summary['rows_failed'] += 1
                issues.append(RowIssue(
                    row_number=row_number,
                    level='error',
                    entity_type='staff',
                    action='skip',
                    code='persist_failed',
                    identifier=email,
                    message=str(exc),
                ))

        return {
            'format_detected': 'native_staff',
            'summary': summary,
            'issues': issues,
            'sample_creates': sample_creates,
            'created_refs': created_refs,
        }

    def _load_rows(self, file_obj) -> tuple[list[tuple[int, dict]], list[str]]:
        workbook = openpyxl.load_workbook(file_obj, read_only=True, data_only=True)
        worksheet = workbook.active
        iterator = worksheet.iter_rows(values_only=True)
        raw_headers = next(iterator, None)
        if not raw_headers:
            workbook.close()
            raise ValueError('Excel file is empty')

        headers = [normalize_header(h) for h in raw_headers]
        if not all(required in headers for required in self.REQUIRED_HEADERS):
            workbook.close()
            raise ValueError(
                f'Excel file must contain these columns: {", ".join(self.REQUIRED_HEADERS)}'
            )

        rows: list[tuple[int, dict]] = []
        for idx, values in enumerate(iterator, start=2):
            row = {}
            for col_index, header in enumerate(headers):
                if not header:
                    continue
                row[header] = values[col_index] if col_index < len(values) else None
            if any(clean_value(v) for v in row.values()):
                rows.append((idx, row))
        workbook.close()
        return rows, headers

    def _resolve_branch(self, branch_id: Any, branch_code: Any) -> Branch | None:
        if branch_id:
            try:
                found = Branch.objects.filter(pk=int(branch_id), is_active=True).first()
                if found:
                    return found
            except (TypeError, ValueError):
                pass
        code = clean_value(branch_code).upper()
        if code:
            return Branch.objects.filter(code__iexact=code, is_active=True).first()
        return None

    def _map_row(
        self,
        row: dict,
        row_number: int,
        opts: dict,
        default_branch: Branch | None,
    ) -> dict | None:
        email = clean_value(row.get('email')).lower()
        first_name = clean_value(row.get('first_name'))
        last_name = clean_value(row.get('last_name'))
        if not email and not first_name and not last_name:
            return None

        password = clean_value(row.get('password'))
        generated_password = False
        if not password and opts.get('generate_temp_password', True):
            password = secrets.token_urlsafe(12)
            generated_password = True

        role = clean_value(row.get('role')).lower().replace(' ', '_') or clean_value(
            opts.get('default_role')
        ).lower() or 'technician'
        branch = self._resolve_branch(row.get('branch_id'), row.get('branch') or row.get('branch_code'))
        if not branch:
            branch = default_branch

        employment_type = clean_value(row.get('employment_type')).lower() or 'full_time'
        employment_status = clean_value(row.get('employment_status')).lower() or 'active'
        salary_type = clean_value(row.get('salary_type')).lower() or 'monthly'

        return {
            'row_number': row_number,
            'email': email,
            'first_name': first_name,
            'last_name': last_name,
            'password': password,
            'generated_password': generated_password,
            'phone': clean_value(row.get('phone'))[:20],
            'role': role,
            'branch': branch,
            'department_name': clean_value(row.get('department')),
            'position_title': clean_value(row.get('position')),
            'employment_type': employment_type,
            'employment_status': employment_status,
            'start_date': self._parse_date(row.get('start_date')),
            'end_date': self._parse_date(row.get('end_date')),
            'salary_type': salary_type,
            'base_salary': self._parse_decimal(row.get('base_salary'), Decimal('0.00')),
            'bank_name': clean_value(row.get('bank_name')),
            'bank_account_number': clean_value(row.get('bank_account_number')),
            'bank_branch': clean_value(row.get('bank_branch')),
            'national_id': clean_value(row.get('national_id')),
            'tax_id': clean_value(row.get('tax_id')),
            'emergency_contact_name': clean_value(row.get('emergency_contact_name')),
            'emergency_contact_phone': clean_value(row.get('emergency_contact_phone'))[:20],
            'emergency_contact_relationship': clean_value(row.get('emergency_contact_relationship')),
            'notes': clean_value(row.get('notes')),
        }

    def _validate_mapped(self, mapped: dict) -> list[RowIssue]:
        issues: list[RowIssue] = []
        row_number = mapped['row_number']
        email = mapped['email']

        if not email or '@' not in email:
            issues.append(RowIssue(
                row_number=row_number,
                level='error',
                entity_type='staff',
                action='skip',
                code='invalid_email',
                identifier=email,
                message='Valid email is required',
            ))
        if not mapped['first_name'] or not mapped['last_name']:
            issues.append(RowIssue(
                row_number=row_number,
                level='error',
                entity_type='staff',
                action='skip',
                code='missing_name',
                identifier=email,
                message='first_name and last_name are required',
            ))
        if not mapped['password']:
            issues.append(RowIssue(
                row_number=row_number,
                level='error',
                entity_type='staff',
                action='skip',
                code='missing_password',
                identifier=email,
                message='Password is required (or enable generate_temp_password)',
            ))
        if mapped['role'] not in STAFF_PROFILE_ROLES:
            issues.append(RowIssue(
                row_number=row_number,
                level='error',
                entity_type='staff',
                action='skip',
                code='invalid_role',
                identifier=email,
                message=(
                    f'Invalid role "{mapped["role"]}". '
                    f'Allowed: {", ".join(sorted(STAFF_PROFILE_ROLES))}'
                ),
            ))
        if mapped['role'] in STAFF_BRANCH_ROLES and not mapped.get('branch'):
            issues.append(RowIssue(
                row_number=row_number,
                level='error',
                entity_type='staff',
                action='skip',
                code='branch_required',
                identifier=email,
                message=f'Role {mapped["role"]} requires a branch (branch / branch_code column or default)',
            ))
        if mapped['employment_type'] not in EMPLOYMENT_TYPES:
            issues.append(RowIssue(
                row_number=row_number,
                level='error',
                entity_type='staff',
                action='skip',
                code='invalid_employment_type',
                identifier=email,
                message=f'Invalid employment_type "{mapped["employment_type"]}"',
            ))
        if mapped['employment_status'] not in EMPLOYMENT_STATUSES:
            issues.append(RowIssue(
                row_number=row_number,
                level='error',
                entity_type='staff',
                action='skip',
                code='invalid_employment_status',
                identifier=email,
                message=f'Invalid employment_status "{mapped["employment_status"]}"',
            ))
        if mapped['salary_type'] not in SALARY_TYPES:
            issues.append(RowIssue(
                row_number=row_number,
                level='error',
                entity_type='staff',
                action='skip',
                code='invalid_salary_type',
                identifier=email,
                message=f'Invalid salary_type "{mapped["salary_type"]}"',
            ))
        return issues

    def _parse_date(self, value: Any):
        if value is None or value == '':
            return None
        if hasattr(value, 'date'):
            try:
                return value.date()
            except Exception:  # noqa: BLE001
                pass
        if isinstance(value, datetime):
            return value.date()
        text = clean_value(value)
        if not text:
            return None
        for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y'):
            try:
                return datetime.strptime(text, fmt).date()
            except ValueError:
                continue
        return None

    def _parse_decimal(self, value: Any, default: Decimal) -> Decimal:
        text = clean_value(value)
        if not text:
            return default
        try:
            return Decimal(text)
        except (InvalidOperation, ValueError):
            return default

    def _resolve_department(self, name: str, branch: Branch | None) -> Department | None:
        if not name or not branch:
            return None
        dept, _ = Department.objects.get_or_create(
            name=name,
            branch=branch,
            defaults={'is_active': True},
        )
        return dept

    def _resolve_position(self, title: str, department: Department | None) -> Position | None:
        if not title or not department:
            return None
        position = Position.objects.filter(
            title__iexact=title,
            department=department,
        ).first()
        if position:
            return position
        return Position.objects.create(
            title=title,
            department=department,
            is_active=True,
        )

    def _persist_staff(
        self,
        mapped: dict,
        *,
        existing_user,
        existing_profile,
    ) -> tuple[EmployeeProfile, Any, bool]:
        department = self._resolve_department(mapped['department_name'], mapped.get('branch'))
        position = self._resolve_position(mapped['position_title'], department)
        profile_defaults = {
            'department': department,
            'position': position,
            'employment_type': mapped['employment_type'],
            'employment_status': mapped['employment_status'],
            'start_date': mapped['start_date'],
            'end_date': mapped['end_date'],
            'salary_type': mapped['salary_type'],
            'base_salary': mapped['base_salary'],
            'bank_name': mapped['bank_name'],
            'bank_account_number': mapped['bank_account_number'],
            'bank_branch': mapped['bank_branch'],
            'national_id': mapped['national_id'],
            'tax_id': mapped['tax_id'],
            'emergency_contact_name': mapped['emergency_contact_name'],
            'emergency_contact_phone': mapped['emergency_contact_phone'],
            'emergency_contact_relationship': mapped['emergency_contact_relationship'],
            'notes': mapped['notes'],
        }

        if existing_user:
            user = existing_user
            user.first_name = mapped['first_name']
            user.last_name = mapped['last_name']
            user.phone = mapped['phone']
            user.role = mapped['role']
            user.is_staff = mapped['role'] != 'customer'
            user.branch = mapped.get('branch')
            if mapped['password'] and not mapped.get('generated_password'):
                user.set_password(mapped['password'])
            user.save()
            profile, _ = EmployeeProfile.objects.update_or_create(
                user=user,
                defaults=profile_defaults,
            )
            user.is_active = account_is_active_for_employment_status(profile.employment_status)
            user.save(update_fields=['is_active', 'updated_at'])
            return profile, user, False

        user = User.objects.create_user(
            username=mapped['email'],
            email=mapped['email'],
            password=mapped['password'],
            first_name=mapped['first_name'],
            last_name=mapped['last_name'],
            phone=mapped['phone'],
            role=mapped['role'],
            is_staff=mapped['role'] != 'customer',
            branch=mapped.get('branch'),
        )
        # HR signals may create an empty profile on user save — always upsert.
        profile, _ = EmployeeProfile.objects.update_or_create(
            user=user,
            defaults=profile_defaults,
        )
        user.is_active = account_is_active_for_employment_status(profile.employment_status)
        user.save(update_fields=['is_active', 'updated_at'])
        return profile, user, True
