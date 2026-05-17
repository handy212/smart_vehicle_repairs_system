import pytest


@pytest.fixture(scope='session', autouse=True)
def seed_rbac(django_db_setup, django_db_blocker):
    """Seed roles and permissions once per test session for consistent RBAC."""
    with django_db_blocker.unblock():
        from django.core.management import call_command

        call_command('init_permissions', verbosity=0)


@pytest.fixture
def api_client():
    """Expose a DRF API client to app-level test modules."""
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def admin_user(db):
    """Project-aware admin fixture for app-level API tests."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return User.objects.create_user(
        username='admin',
        email='admin@test.com',
        password='test123',
        first_name='Admin',
        last_name='User',
        role='admin',
        is_staff=True,
        is_superuser=True,
        is_active=True,
    )
