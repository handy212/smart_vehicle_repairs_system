"""DRF authentication helpers for SPA cookie + Bearer token flows."""
from rest_framework_simplejwt.authentication import JWTAuthentication

from .jwt_cookies import access_cookie_name


class JWTCookieAuthentication(JWTAuthentication):
    """
    Accept JWT from Authorization header or the HttpOnly access_token cookie
    set at login. Header takes precedence when both are present.
    """

    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            return super().authenticate(request)

        raw_token = request.COOKIES.get(access_cookie_name())
        if not raw_token:
            return None

        try:
            validated_token = self.get_validated_token(raw_token)
        except Exception:
            return None

        return self.get_user(validated_token), validated_token
