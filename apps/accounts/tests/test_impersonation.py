"""Tests for admin customer impersonation."""
import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.test import APIClient
from model_bakery import baker

from apps.accounts.models import User
from apps.customers.models import Customer


def _auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.cookies['access_token'] = str(refresh.access_token)
    client.cookies['svr_refresh_token'] = str(refresh)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client, refresh


@pytest.mark.django_db
def test_impersonate_customer_denied_for_technician():
    tech = baker.make(User, role='technician', is_active=True, email='tech-imp@example.com')
    customer_user = baker.make(
        User, role='customer', is_active=True, email='cust-imp@example.com'
    )
    customer = baker.make(Customer, user=customer_user, customer_number='CUS-TEST-IMP-000001')

    client, _ = _auth_client(tech)
    response = client.post(
        reverse('impersonate_customer'),
        {'customer_id': customer.id},
        format='json',
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_impersonate_works_without_refresh_cookie():
    """Access cookie alone is enough; staff refresh is minted for exit restore."""
    admin = baker.make(
        User,
        role='admin',
        is_active=True,
        is_staff=True,
        is_superuser=True,
        email='admin-imp-access@example.com',
    )
    customer_user = baker.make(
        User, role='customer', is_active=True, email='cust-access-only@example.com'
    )
    customer = baker.make(Customer, user=customer_user, customer_number='CUS-TEST-IMP-000003')

    client = APIClient()
    access = str(RefreshToken.for_user(admin).access_token)
    client.cookies['access_token'] = access
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

    start = client.post(
        reverse('impersonate_customer'),
        {'customer_id': customer.id},
        format='json',
    )
    assert start.status_code == status.HTTP_200_OK
    assert start.data['impersonating'] is True
    assert start.data.get('impersonator_refresh')

    admin = baker.make(
        User,
        role='admin',
        is_active=True,
        is_staff=True,
        is_superuser=True,
        email='admin-imp@example.com',
        first_name='Admin',
        last_name='User',
    )
    customer_user = baker.make(
        User,
        role='customer',
        is_active=True,
        email='cust-portal@example.com',
        first_name='Cust',
        last_name='Omer',
    )
    customer = baker.make(Customer, user=customer_user, customer_number='CUS-TEST-IMP-000002')

    client, admin_refresh = _auth_client(admin)

    start = client.post(
        reverse('impersonate_customer'),
        {'customer_id': customer.id, 'refresh': str(admin_refresh)},
        format='json',
    )
    assert start.status_code == status.HTTP_200_OK
    assert start.data['impersonating'] is True
    assert start.data['user']['id'] == customer_user.id
    assert start.data['user']['role'] == 'customer'
    assert start.data.get('access')
    assert start.data.get('refresh')
    assert start.data.get('impersonator_refresh')

    client.cookies['access_token'] = start.data['access']
    client.cookies['svr_refresh_token'] = start.data['refresh']
    client.cookies['svr_impersonator_refresh'] = start.data['impersonator_refresh']
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {start.data['access']}")

    me = client.get(reverse('user_me_no_slash'))
    assert me.status_code == status.HTTP_200_OK
    assert me.data['impersonating'] is True
    assert me.data['impersonator']['id'] == admin.id

    exit_resp = client.post(
        reverse('exit_impersonation'),
        {
            'refresh': start.data['refresh'],
            'impersonator_refresh': start.data['impersonator_refresh'],
        },
        format='json',
    )
    assert exit_resp.status_code == status.HTTP_200_OK
    assert exit_resp.data['user']['id'] == admin.id
    assert exit_resp.data.get('impersonating') is False
