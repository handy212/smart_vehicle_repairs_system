#!/usr/bin/env python3
"""
Create deterministic E2E users for Playwright role-based smoke tests.

Run during CI before starting the API server:
  python scripts/create_e2e_user.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')

import django

django.setup()

from django.contrib.auth import get_user_model
from django.core.management import call_command

from apps.branches.models import Branch

User = get_user_model()

PASSWORD = os.environ.get('E2E_PASSWORD', 'e2e_test_pass_123')

MODULE_SLUGS = (
    'dashboard', 'workorders', 'customers', 'vehicles', 'appointments', 'inventory',
    'billing', 'accounting', 'reports', 'hr', 'gatepass', 'subscriptions', 'roadside',
    'inspections', 'diagnosis', 'documents', 'notifications_app', 'fixed-assets',
    'technicians', 'branches', 'portal',
)


def enable_system_modules():
    from apps.accounts.admin_models import SystemModule

    for slug in MODULE_SLUGS:
        label = slug.replace('-', ' ').replace('_', ' ').title()
        SystemModule.objects.update_or_create(
            slug=slug,
            defaults={'name': label, 'is_enabled': True},
        )

E2E_USERS = [
    {
        'email': os.environ.get('E2E_EMAIL', 'e2e_admin@example.com'),
        'username': 'e2e_admin',
        'role': 'admin',
        'is_superuser': True,
        'is_staff': True,
    },
    {
        'email': os.environ.get('E2E_MANAGER_EMAIL', 'e2e_manager@example.com'),
        'username': 'e2e_manager',
        'role': 'manager',
        'managed_branch': True,
    },
    {
        'email': os.environ.get('E2E_RECEPTIONIST_EMAIL', 'e2e_receptionist@example.com'),
        'username': 'e2e_receptionist',
        'role': 'receptionist',
        'branch': True,
    },
    {
        'email': os.environ.get('E2E_ACCOUNTANT_EMAIL', 'e2e_accountant@example.com'),
        'username': 'e2e_accountant',
        'role': 'accountant',
        'branch': True,
    },
    {
        'email': os.environ.get('E2E_TECH_EMAIL', 'e2e_technician@example.com'),
        'username': 'e2e_technician',
        'role': 'technician',
        'branch': True,
    },
    {
        'email': os.environ.get('E2E_COORDINATOR_EMAIL', 'e2e_coordinator@example.com'),
        'username': 'e2e_coordinator',
        'role': 'service_coordinator',
        'branch': True,
    },
    {
        'email': os.environ.get('E2E_PARTS_EMAIL', 'e2e_parts@example.com'),
        'username': 'e2e_parts',
        'role': 'parts_manager',
        'branch': True,
    },
    {
        'email': os.environ.get('E2E_HR_EMAIL', 'e2e_hr@example.com'),
        'username': 'e2e_hr',
        'role': 'hr_manager',
        'branch': True,
    },
]


def main() -> int:
    call_command('init_permissions', verbosity=0)
    enable_system_modules()

    admin_seed = User.objects.filter(role='admin').first()
    branch, _ = Branch.objects.get_or_create(
        code='E2E01',
        defaults={
            'name': 'E2E Main Branch',
            'is_active': True,
            'created_by': admin_seed,
        },
    )
    branch_b, _ = Branch.objects.get_or_create(
        code='E2E02',
        defaults={
            'name': 'E2E Second Branch',
            'is_active': True,
            'created_by': admin_seed,
        },
    )
    for b in (branch, branch_b):
        if admin_seed and b.created_by_id is None:
            b.created_by = admin_seed
            b.save(update_fields=['created_by'])

    for spec in E2E_USERS:
        user, _ = User.objects.update_or_create(
            email=spec['email'],
            defaults={
                'username': spec['username'],
                'first_name': spec['role'].replace('_', ' ').title(),
                'last_name': 'E2E',
                'role': spec['role'],
                'is_active': True,
                'is_staff': spec.get('is_staff', True),
                'is_superuser': spec.get('is_superuser', False),
            },
        )
        user.set_password(PASSWORD)
        user.save()

        if spec.get('managed_branch'):
            user.managed_branches.set([branch])
            user.branch = None
            user.save(update_fields=['branch'])
        elif spec.get('branch'):
            user.branch = branch
            user.save(update_fields=['branch'])

        print(f"Ensured E2E user: {user.email} ({user.role})")

    return 0


if __name__ == '__main__':
    sys.exit(main())
