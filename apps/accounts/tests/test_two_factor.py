import pytest
from rest_framework import status
from rest_framework.test import APIClient
from django.urls import reverse
from django.contrib.auth import get_user_model
import pyotp
from django.core.signing import TimestampSigner

User = get_user_model()

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def user():
    return User.objects.create_user(
        email='testuser@example.com',
        username='testuser@example.com',
        password='testpassword123',
        first_name='Test',
        last_name='User'
    )

@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client

@pytest.mark.django_db
class TestTwoFactorSetup:
    def test_setup_generates_secret_and_qr(self, auth_client, user):
        response = auth_client.post('/api/accounts/2fa/setup/')
        assert response.status_code == status.HTTP_200_OK
        assert 'secret' in response.data
        assert 'qr_code' in response.data
        
        # Verify secret was saved to user
        user.refresh_from_db()
        assert user.two_factor_secret == response.data['secret']
        assert user.two_factor_enabled is False

    def test_setup_requires_auth(self, api_client):
        response = api_client.post('/api/accounts/2fa/setup/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

@pytest.mark.django_db
class TestTwoFactorVerifySetup:
    def test_verify_setup_success(self, auth_client, user):
        # First generate secret
        secret = pyotp.random_base32()
        user.two_factor_secret = secret
        user.save()
        
        # Keep track of old state
        assert user.two_factor_enabled is False
        
        # Generate valid code
        totp = pyotp.TOTP(secret)
        valid_code = totp.now()
        
        # Verify
        response = auth_client.post('/api/accounts/2fa/verify_setup/', {'code': valid_code})
        assert response.status_code == status.HTTP_200_OK
        
        # Check user state updated
        user.refresh_from_db()
        assert user.two_factor_enabled is True
        
    def test_verify_setup_invalid_code(self, auth_client, user):
        secret = pyotp.random_base32()
        user.two_factor_secret = secret
        user.save()
        
        response = auth_client.post('/api/accounts/2fa/verify_setup/', {'code': '000000'})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        
        user.refresh_from_db()
        assert user.two_factor_enabled is False

@pytest.mark.django_db
class TestTwoFactorDisable:
    def test_disable_success(self, auth_client, user):
        user.two_factor_enabled = True
        user.two_factor_secret = 'A' * 32
        user.save()
        
        response = auth_client.post('/api/accounts/2fa/disable/', {'password': 'testpassword123'})
        assert response.status_code == status.HTTP_200_OK
        
        user.refresh_from_db()
        assert user.two_factor_enabled is False
        assert user.two_factor_secret == ''

    def test_disable_wrong_password(self, auth_client, user):
        user.two_factor_enabled = True
        user.two_factor_secret = 'A' * 32
        user.save()
        
        response = auth_client.post('/api/accounts/2fa/disable/', {'password': 'wrongpassword'})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        
        user.refresh_from_db()
        assert user.two_factor_enabled is True

@pytest.mark.django_db
class TestTwoFactorLogin:
    def test_login_returns_temp_token_if_2fa_enabled(self, api_client, user):
        user.two_factor_enabled = True
        user.two_factor_secret = pyotp.random_base32()
        user.save()
        
        # Normal login via obtaining token
        # Usually /api/accounts/token/ maps to RecaptchaTokenObtainPairView
        response = api_client.post('/api/accounts/token/', {
            'email': 'testuser@example.com',
            'password': 'testpassword123'
        })
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data.get('requires_2fa') is True
        assert 'temp_token' in response.data

    def test_verify_login_success(self, api_client, user):
        user.two_factor_enabled = True
        user.two_factor_secret = pyotp.random_base32()
        user.save()
        
        signer = TimestampSigner()
        temp_token = signer.sign_object({'user_id': user.id})
        
        totp = pyotp.TOTP(user.two_factor_secret)
        valid_code = totp.now()
        
        response = api_client.post('/api/accounts/2fa/verify_login/', {
            'temp_token': temp_token,
            'code': valid_code
        })
        
        assert response.status_code == status.HTTP_200_OK
        assert 'access' in response.data
        assert 'refresh' in response.data
        assert 'user' in response.data

    def test_verify_login_invalid_code(self, api_client, user):
        user.two_factor_enabled = True
        user.two_factor_secret = pyotp.random_base32()
        user.save()
        
        signer = TimestampSigner()
        temp_token = signer.sign_object({'user_id': user.id})
        
        response = api_client.post('/api/accounts/2fa/verify_login/', {
            'temp_token': temp_token,
            'code': '000000'
        })
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_verify_login_invalid_temp_token(self, api_client, user):
        response = api_client.post('/api/accounts/2fa/verify_login/', {
            'temp_token': 'invalid_token',
            'code': '123456'
        })
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
