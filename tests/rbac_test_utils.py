"""Shared helpers for RBAC and branch isolation tests."""
from django.contrib.auth import get_user_model

from apps.accounts.admin_models import SystemModule
from apps.accounts.permissions import user_has_permission
from apps.branches.models import Branch

User = get_user_model()

STAFF_ROLES = (
    'admin',
    'manager',
    'service_coordinator',
    'receptionist',
    'parts_manager',
    'accountant',
    'technician',
    'hr_manager',
)

MODULE_SLUGS = (
    'dashboard',
    'workorders',
    'customers',
    'vehicles',
    'appointments',
    'inventory',
    'billing',
    'accounting',
    'reports',
    'hr',
    'gatepass',
    'subscriptions',
    'roadside',
    'inspections',
    'diagnosis',
    'documents',
    'notifications_app',
    'fixed-assets',
    'technicians',
    'branches',
    'portal',
)


def enable_system_modules():
    for slug in MODULE_SLUGS:
        label = slug.replace('-', ' ').replace('_', ' ').title()
        SystemModule.objects.update_or_create(
            slug=slug,
            defaults={'name': label, 'is_enabled': True},
        )


def create_role_user(role, *, email=None, username=None, password='password123', branch=None):
    email = email or f'{role}_matrix@test.com'
    username = username or f'{role}_matrix'
    user = User.objects.create_user(
        username=username,
        email=email,
        password=password,
        first_name=role.replace('_', ' ').title(),
        last_name='Matrix',
        role=role,
        is_staff=True,
        is_active=True,
    )
    if branch is not None:
        if role == 'manager':
            user.managed_branches.add(branch)
        else:
            user.branch = branch
            user.save(update_fields=['branch'])
    return user


def user_has_any_permission(user, permission_codes):
    return any(user_has_permission(user, code) for code in permission_codes)


def user_allowed(user, *, permission=None, any_of=None):
    if any_of:
        return user_has_any_permission(user, any_of)
    return user_has_permission(user, permission)


def create_test_branches(admin_user, codes=('BRA', 'BRB')):
    branches = []
    for index, code in enumerate(codes, start=1):
        branches.append(
            Branch.objects.create(
                name=f'Branch {code}',
                code=code,
                is_active=True,
                created_by=admin_user,
            )
        )
    return branches
