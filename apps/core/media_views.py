"""Serve media with a public branding allowlist; everything else requires auth."""
from __future__ import annotations

import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import BasePermission
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.authentication import JWTCookieAuthentication

# Paths under MEDIA_ROOT that may be fetched without authentication.
PUBLIC_MEDIA_PREFIXES = (
    'branding/',
)


def _normalize_media_path(path: str) -> str:
    """Reject path traversal and return a relative POSIX path under MEDIA_ROOT."""
    if not path:
        raise Http404()
    # URL-decoded path from Django; normalize separators and strip leading slashes.
    cleaned = path.replace('\\', '/').lstrip('/')
    if cleaned.startswith('../') or '/../' in f'/{cleaned}/' or cleaned == '..':
        raise Http404()
    full = Path(settings.MEDIA_ROOT).resolve() / cleaned
    try:
        full.relative_to(Path(settings.MEDIA_ROOT).resolve())
    except ValueError as exc:
        raise Http404() from exc
    return cleaned


def is_public_media_path(path: str) -> bool:
    normalized = path.replace('\\', '/').lstrip('/')
    return any(normalized.startswith(prefix) for prefix in PUBLIC_MEDIA_PREFIXES)


class MediaAccessPermission(BasePermission):
    """Allow public branding; require an authenticated user for all other media."""

    def has_permission(self, request, view):
        path = view.kwargs.get('path', '')
        try:
            normalized = _normalize_media_path(path)
        except Http404:
            return False
        if is_public_media_path(normalized):
            return True
        return bool(request.user and request.user.is_authenticated)


class ProtectedMediaView(APIView):
    """
    Authenticated media gateway.

    Branding assets remain public for login/PWA. Private uploads (documents,
    HR, vehicles, work orders, etc.) require a valid session/JWT.
    """

    authentication_classes = [
        JWTCookieAuthentication,
        JWTAuthentication,
        SessionAuthentication,
    ]
    permission_classes = [MediaAccessPermission]

    def get(self, request, path: str):
        normalized = _normalize_media_path(path)
        absolute = Path(settings.MEDIA_ROOT).resolve() / normalized
        if not absolute.is_file():
            raise Http404()

        content_type, _ = mimetypes.guess_type(str(absolute))
        response = FileResponse(
            absolute.open('rb'),
            content_type=content_type or 'application/octet-stream',
        )
        # Branding may be cached publicly; private media must stay private.
        if is_public_media_path(normalized):
            response['Cache-Control'] = 'public, max-age=604800'
        else:
            response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response
