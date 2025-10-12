"""
Test configuration and fixtures for Smart Vehicle Repairs System.
"""
import pytest
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from model_bakery import baker
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder

User = get_user_model()


@pytest.fixture
def api_client():
    """Create an API client for testing."""
    return APIClient()


@pytest.fixture
def admin_user():
    """Create an admin user for testing."""
    return baker.make(
        User,
        email='admin@test.com',
        role='admin',
        is_staff=True,
        is_superuser=True,
        is_active=True
    )


@pytest.fixture
def manager_user():
    """Create a manager user for testing."""
    return baker.make(
        User,
        email='manager@test.com',
        role='manager',
        is_staff=True,
        is_active=True
    )


@pytest.fixture
def technician_user():
    """Create a technician user for testing."""
    return baker.make(
        User,
        email='technician@test.com',
        role='technician',
        is_staff=True,
        is_active=True
    )


@pytest.fixture
def customer_user():
    """Create a customer user for testing."""
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
    refresh = RefreshToken.for_user(admin_user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return api_client


@pytest.fixture
def customer_authenticated_client(api_client, customer_user):
    """Create an authenticated customer API client."""
    refresh = RefreshToken.for_user(customer_user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return api_client


@pytest.fixture
def sample_customer():
    """Create a sample customer for testing."""
    user = baker.make(User, role='customer', email='sample@customer.com')
    return baker.make(Customer, user=user)


@pytest.fixture
def sample_vehicle(sample_customer):
    """Create a sample vehicle for testing."""
    return baker.make(
        Vehicle,
        owner=sample_customer,
        make='Toyota',
        model='Camry',
        year=2020,
        vin='1HGBH41JXMN109186'
    )


@pytest.fixture
def sample_workorder(sample_vehicle):
    """Create a sample work order for testing."""
    return baker.make(
        WorkOrder,
        vehicle=sample_vehicle,
        customer=sample_vehicle.owner,
        status='draft'
    )