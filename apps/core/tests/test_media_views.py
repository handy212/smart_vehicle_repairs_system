"""Tests for authenticated media serving."""
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


class ProtectedMediaViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='media-user@test.com',
            username='media-user',
            password='testpass123',
            role='admin',
            is_staff=True,
        )

    def _write_media(self, relative: str, content: bytes = b'png-bytes') -> str:
        from django.conf import settings

        target = Path(settings.MEDIA_ROOT) / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return relative

    def test_branding_is_public(self):
        self._write_media('branding/logo_path.png', b'logo')
        response = self.client.get('/media/branding/logo_path.png')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(b''.join(response.streaming_content), b'logo')

    def test_private_media_requires_auth(self):
        self._write_media('vehicles/images/secret.jpg', b'secret')
        response = self.client.get('/media/vehicles/images/secret.jpg')
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_authenticated_user_can_read_private_media(self):
        self._write_media('vehicles/images/ok.jpg', b'ok-image')
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/media/vehicles/images/ok.jpg')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(b''.join(response.streaming_content), b'ok-image')

    def test_path_traversal_rejected(self):
        response = self.client.get('/media/../settings.py')
        # Traversal must never return file contents (401/403/404 are all acceptable denials).
        self.assertIn(
            response.status_code,
            (
                status.HTTP_401_UNAUTHORIZED,
                status.HTTP_403_FORBIDDEN,
                status.HTTP_404_NOT_FOUND,
            ),
        )
