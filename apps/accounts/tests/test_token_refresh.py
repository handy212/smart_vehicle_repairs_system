from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


@override_settings(SKIP_MODULE_PERMISSION_CHECKS=True)
class CookieTokenRefreshTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="refresh-user",
            email="refresh-user@example.com",
            password="test-pass-123",
        )

    def test_refresh_returns_401_when_user_no_longer_exists(self):
        refresh = RefreshToken.for_user(self.user)
        token = str(refresh)
        user_id = self.user.id
        self.user.delete()
        self.assertFalse(User.objects.filter(pk=user_id).exists())

        response = self.client.post(
            "/api/auth/token/refresh/",
            {"refresh": token},
            format="json",
        )

        self.assertEqual(response.status_code, 401, response.data)
        self.assertNotIn("access", response.data)
