"""API root / homepage hardening checks."""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


@pytest.mark.django_db
def test_anonymous_api_root_is_minimal():
    client = APIClient()
    response = client.get('/api/')
    assert response.status_code == 200
    data = response.json()
    assert 'modules' not in data.get('endpoints', {})
    assert 'documentation' not in data
    assert data['endpoints']['health'] == '/api/health/'
    assert 'login' in data['endpoints']['authentication']


@pytest.mark.django_db
def test_authenticated_api_root_includes_modules():
    user = User.objects.create_user(
        email='api-root@test.com',
        username='api-root',
        password='testpass123',
        role='admin',
        is_staff=True,
    )
    client = APIClient()
    client.force_authenticate(user=user)
    response = client.get('/api/')
    assert response.status_code == 200
    data = response.json()
    assert 'modules' in data['endpoints']
    assert 'documentation' in data


@pytest.mark.django_db
def test_test_fcm_not_registered_when_debug_false(settings):
    """Production-like settings must not expose /test-fcm/."""
    assert settings.DEBUG is False
    client = APIClient()
    response = client.get('/test-fcm/')
    assert response.status_code == 404
