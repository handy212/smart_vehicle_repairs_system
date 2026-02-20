import pytest
import os
import django
from django.conf import settings

def pytest_configure(config):
    """Configure Django before any test modules are imported."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.testing')
    if not settings.configured:
        django.setup()

@pytest.fixture
def api_client():
    """Create an API client for testing."""
    from rest_framework.test import APIClient
    return APIClient()


@pytest.fixture
def admin_user(db):
    """Create an admin user for testing."""
    from django.contrib.auth import get_user_model
    from model_bakery import baker
    User = get_user_model()
    return baker.make(
        User,
        email='admin@test.com',
        role='admin',
        is_staff=True,
        is_superuser=True,
        is_active=True
    )


@pytest.fixture
def manager_user(db):
    """Create a manager user for testing."""
    from django.contrib.auth import get_user_model
    from model_bakery import baker
    User = get_user_model()
    return baker.make(
        User,
        email='manager@test.com',
        role='manager',
        is_staff=True,
        is_active=True
    )


@pytest.fixture
def technician_user(db):
    """Create a technician user for testing."""
    from django.contrib.auth import get_user_model
    from model_bakery import baker
    User = get_user_model()
    return baker.make(
        User,
        email='technician@test.com',
        role='technician',
        is_staff=True,
        is_active=True
    )


@pytest.fixture
def customer_user(db):
    """Create a customer user for testing."""
    from django.contrib.auth import get_user_model
    from model_bakery import baker
    from apps.customers.models import Customer
    User = get_user_model()
    user = baker.make(
        User,
        email='customer@test.com',
        role='customer',
        is_active=True
    )
    # Create customer profile
    baker.make(Customer, user=user)
    return user


@pytest.fixture
def authenticated_client(api_client, admin_user):
    """Create an authenticated API client."""
    from rest_framework_simplejwt.tokens import RefreshToken
    refresh = RefreshToken.for_user(admin_user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return api_client


@pytest.fixture
def customer_authenticated_client(api_client, customer_user):
    """Create an authenticated customer API client."""
    from rest_framework_simplejwt.tokens import RefreshToken
    refresh = RefreshToken.for_user(customer_user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return api_client


@pytest.fixture
def sample_customer(db):
    """Create a sample customer for testing."""
    from django.contrib.auth import get_user_model
    from model_bakery import baker
    from apps.customers.models import Customer
    User = get_user_model()
    user = baker.make(User, role='customer', email='sample@customer.com')
    return baker.make(Customer, user=user)


@pytest.fixture
def sample_vehicle(sample_customer):
    """Create a sample vehicle for testing."""
    from model_bakery import baker
    from apps.vehicles.models import Vehicle
    return baker.make(
        Vehicle,
        owner=sample_customer,
        make='Toyota',
        model='Camry',
        year=2020,
        vin='1HGBH41JXMN109186'
    )


@pytest.fixture
def sample_workorder(db, sample_vehicle):
    """Create a sample work order for testing."""
    from model_bakery import baker
    from apps.workorders.models import WorkOrder
    return baker.make(
        WorkOrder,
        vehicle=sample_vehicle,
        customer=sample_vehicle.owner,
        status='draft'
    )