"""
Tests for accounts app.
"""
import pytest
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken
from model_bakery import baker

User = get_user_model()


class UserModelTest(TestCase):
    """Test cases for User model."""

    def setUp(self):
        """Set up test data."""
        self.user_data = {
            'email': 'test@example.com',
            'username': 'testuser',
            'password': 'testpass123',
            'first_name': 'Test',
            'last_name': 'User',
            'role': 'technician'
        }

    def test_create_user(self):
        """Test creating a user."""
        user = User.objects.create_user(**self.user_data)
        self.assertEqual(user.email, 'test@example.com')
        self.assertEqual(user.role, 'technician')
        self.assertTrue(user.check_password('testpass123'))
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)

    def test_create_superuser(self):
        """Test creating a superuser."""
        user = User.objects.create_superuser(
            email='admin@example.com',
            username='admin',
            password='adminpass123'
        )
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertEqual(user.role, 'super-admin')

    def test_user_string_representation(self):
        """Test user string representation."""
        user = User.objects.create_user(**self.user_data)
        expected = "Test User (test@example.com)"
        self.assertEqual(str(user), expected)

    def test_user_role_choices(self):
        """Test user role choices are valid."""
        valid_roles = ['admin', 'manager', 'receptionist', 'technician', 'parts_manager', 'customer']
        for role in valid_roles:
            user = baker.make(User, role=role)
            self.assertEqual(user.role, role)

    def test_email_required(self):
        """Test that email is required."""
        with self.assertRaises(TypeError):
            User.objects.create_user()

    def test_email_unique(self):
        """Test that email must be unique."""
        User.objects.create_user(**self.user_data)
        with self.assertRaises(Exception):
            User.objects.create_user(**self.user_data)


class UserAuthenticationAPITest(APITestCase):
    """Test cases for user authentication API."""

    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            email='test@example.com',
            username='testuser',
            password='testpass123',
            role='technician'
        )
        self.login_url = reverse('token_obtain_pair')
        self.refresh_url = reverse('token_refresh')

    def test_user_login(self):
        """Test user login with valid credentials."""
        response = self.client.post(self.login_url, {
            'email': 'test@example.com',
            'password': 'testpass123'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_user_login_invalid_credentials(self):
        """Test user login with invalid credentials."""
        response = self.client.post(self.login_url, {
            'email': 'test@example.com',
            'password': 'wrongpassword'
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_login_nonexistent_user(self):
        """Test user login with nonexistent user."""
        response = self.client.post(self.login_url, {
            'email': 'nonexistent@example.com',
            'password': 'testpass123'
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_refresh(self):
        """Test token refresh functionality."""
        # Get initial tokens
        login_response = self.client.post(self.login_url, {
            'email': 'test@example.com',
            'password': 'testpass123'
        })
        refresh_token = login_response.data['refresh']

        # Test refresh
        response = self.client.post(self.refresh_url, {
            'refresh': refresh_token
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)

    def test_protected_endpoint_with_token(self):
        """Test accessing protected endpoint with valid token."""
        # Get token
        login_response = self.client.post(self.login_url, {
            'email': 'test@example.com',
            'password': 'testpass123'
        })
        access_token = login_response.data['access']

        # Access protected endpoint
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        response = self.client.get('/api/auth/users/me/')
        # Should not return 401 (unauthorized)
        self.assertNotEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_protected_endpoint_without_token(self):
        """Test accessing protected endpoint without token."""
        response = self.client.get('/api/auth/users/me/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class LoginTemplateTest(TestCase):
    """Regression tests for the staff login page."""

    def test_login_page_renders(self):
        response = self.client.get(reverse('login'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertContains(response, "Sign in")


@pytest.mark.django_db
class TestUserModel:
    """Pytest-style tests for User model."""

    def test_user_creation_with_baker(self):
        """Test user creation using model_bakery."""
        user = baker.make(User, email='baker@test.com')
        assert user.email == 'baker@test.com'
        assert user.pk is not None

    def test_user_role_defaults_to_customer(self):
        """Test that user role defaults to customer."""
        user = baker.make(User)
        assert user.role == 'customer'

    def test_user_password_hashing(self):
        """Test that passwords are properly hashed."""
        user = User.objects.create_user(
            email='hash@test.com',
            username='hashuser',
            password='plaintext123'
        )
        assert user.password != 'plaintext123'
        assert user.check_password('plaintext123')

    @pytest.mark.parametrize('role', [
        'admin', 'manager', 'receptionist', 
        'technician', 'parts_manager', 'customer'
    ])
    def test_all_user_roles(self, role):
        """Test all valid user roles."""
        user = baker.make(User, role=role)
        assert user.role == role


@pytest.mark.django_db
class TestUserSecurity:
    """Security-focused tests for User model."""

    def test_password_not_stored_in_plain_text(self):
        """Test that passwords are never stored in plain text."""
        user = User.objects.create_user(
            email='security@test.com',
            username='securityuser',
            password='secret123'
        )
        assert 'secret123' not in user.password
        assert len(user.password) > 50  # Hashed passwords are much longer

    def test_inactive_user_cannot_login(self):
        """Test that inactive users cannot login."""
        user = User.objects.create_user(
            email='inactive@test.com',
            username='inactiveuser',
            password='test123',
            is_active=False
        )
        from django.contrib.auth import authenticate
        authenticated_user = authenticate(
            email='inactive@test.com',
            password='test123'
        )
        assert authenticated_user is None

    def test_email_case_insensitive(self):
        """Test that email authentication is case insensitive."""
        User.objects.create_user(
            email='CaseTest@Example.Com',
            username='caseuser',
            password='test123'
        )
        from django.contrib.auth import authenticate
        user = authenticate(
            email='casetest@example.com',
            password='test123'
        )
        assert user is not None
