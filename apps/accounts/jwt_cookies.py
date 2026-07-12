"""HttpOnly JWT cookie helpers for access + refresh tokens."""
from django.conf import settings


def refresh_cookie_name() -> str:
    return getattr(settings, 'JWT_REFRESH_COOKIE_NAME', 'svr_refresh_token')


def refresh_cookie_path() -> str:
    return getattr(settings, 'JWT_REFRESH_COOKIE_PATH', '/api/auth/')


def access_cookie_name() -> str:
    return getattr(settings, 'JWT_ACCESS_COOKIE_NAME', 'access_token')


def access_cookie_path() -> str:
    return getattr(settings, 'JWT_ACCESS_COOKIE_PATH', '/')


def impersonator_cookie_name() -> str:
    return getattr(settings, 'JWT_IMPERSONATOR_COOKIE_NAME', 'svr_impersonator_refresh')


def impersonator_cookie_path() -> str:
    return getattr(settings, 'JWT_IMPERSONATOR_COOKIE_PATH', refresh_cookie_path())


def _cookie_secure() -> bool:
    if hasattr(settings, 'JWT_REFRESH_COOKIE_SECURE'):
        return bool(settings.JWT_REFRESH_COOKIE_SECURE)
    return not settings.DEBUG


def refresh_cookie_max_age() -> int:
    lifetime = getattr(settings, 'SIMPLE_JWT', {}).get('REFRESH_TOKEN_LIFETIME')
    if lifetime is None:
        return 24 * 3600
    return int(lifetime.total_seconds())


def access_cookie_max_age() -> int:
    lifetime = getattr(settings, 'SIMPLE_JWT', {}).get('ACCESS_TOKEN_LIFETIME')
    if lifetime is None:
        return 3600
    return int(lifetime.total_seconds())


def get_refresh_from_request(request) -> str | None:
    """Read refresh token from JSON body or HttpOnly cookie."""
    token = None
    if hasattr(request, 'data') and request.data:
        token = request.data.get('refresh')
    if not token:
        token = request.COOKIES.get(refresh_cookie_name())
    return token or None


def get_impersonator_refresh_from_request(request) -> str | None:
    """Read stashed admin refresh while impersonating a customer."""
    token = None
    if hasattr(request, 'data') and request.data:
        token = request.data.get('impersonator_refresh')
    if not token:
        token = request.COOKIES.get(impersonator_cookie_name())
    return token or None


def set_refresh_cookie(response, refresh_token: str) -> None:
    response.set_cookie(
        refresh_cookie_name(),
        refresh_token,
        max_age=refresh_cookie_max_age(),
        httponly=True,
        secure=_cookie_secure(),
        samesite=getattr(settings, 'JWT_REFRESH_COOKIE_SAMESITE', 'Lax'),
        path=refresh_cookie_path(),
    )


def set_access_cookie(response, access_token: str) -> None:
    response.set_cookie(
        access_cookie_name(),
        access_token,
        max_age=access_cookie_max_age(),
        httponly=True,
        secure=_cookie_secure(),
        samesite=getattr(settings, 'JWT_ACCESS_COOKIE_SAMESITE', 'Lax'),
        path=access_cookie_path(),
    )


def set_impersonator_cookie(response, refresh_token: str) -> None:
    response.set_cookie(
        impersonator_cookie_name(),
        refresh_token,
        max_age=refresh_cookie_max_age(),
        httponly=True,
        secure=_cookie_secure(),
        samesite=getattr(settings, 'JWT_REFRESH_COOKIE_SAMESITE', 'Lax'),
        path=impersonator_cookie_path(),
    )


def clear_refresh_cookie(response) -> None:
    response.delete_cookie(
        refresh_cookie_name(),
        path=refresh_cookie_path(),
        samesite=getattr(settings, 'JWT_REFRESH_COOKIE_SAMESITE', 'Lax'),
    )


def clear_access_cookie(response) -> None:
    response.delete_cookie(
        access_cookie_name(),
        path=access_cookie_path(),
        samesite=getattr(settings, 'JWT_ACCESS_COOKIE_SAMESITE', 'Lax'),
    )


def clear_impersonator_cookie(response) -> None:
    response.delete_cookie(
        impersonator_cookie_name(),
        path=impersonator_cookie_path(),
        samesite=getattr(settings, 'JWT_REFRESH_COOKIE_SAMESITE', 'Lax'),
    )


def strip_refresh_from_response_data(data: dict) -> dict:
    if getattr(settings, 'JWT_EMIT_TOKENS_IN_JSON', False):
        return data
    if isinstance(data, dict) and 'refresh' in data:
        data = dict(data)
        data.pop('refresh', None)
    return data


def strip_access_from_response_data(data: dict) -> dict:
    if getattr(settings, 'JWT_OMIT_ACCESS_FROM_JSON', False) and isinstance(data, dict) and 'access' in data:
        data = dict(data)
        data.pop('access', None)
    return data


def apply_auth_cookies(response, data: dict) -> dict:
    """Set HttpOnly cookies and optionally strip tokens from JSON body."""
    if not isinstance(data, dict):
        return data
    refresh = data.get('refresh')
    access = data.get('access')
    if refresh:
        set_refresh_cookie(response, refresh)
    if access:
        set_access_cookie(response, access)
    data = strip_refresh_from_response_data(data)
    data = strip_access_from_response_data(data)
    return data
