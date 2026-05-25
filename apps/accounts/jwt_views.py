"""JWT views with HttpOnly cookies + blacklist logout."""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.views import TokenRefreshView
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from rest_framework_simplejwt.tokens import RefreshToken

from .recaptcha_views import RecaptchaTokenObtainPairView
from .jwt_cookies import (
    get_refresh_from_request,
    apply_auth_cookies,
    clear_refresh_cookie,
    clear_access_cookie,
)
from .throttles import RefreshTokenRateThrottle


class CookieTokenObtainPairView(RecaptchaTokenObtainPairView):
    """Login: store tokens in HttpOnly cookies."""

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200 and isinstance(response.data, dict):
            if response.data.get('requires_2fa'):
                return response
            response.data = apply_auth_cookies(response, response.data)
        return response


class CookieTokenRefreshSerializer(TokenRefreshSerializer):
    pass


class CookieTokenRefreshView(TokenRefreshView):
    serializer_class = CookieTokenRefreshSerializer
    throttle_classes = [RefreshTokenRateThrottle]

    def post(self, request, *args, **kwargs):
        refresh = get_refresh_from_request(request)
        if not refresh:
            return Response(
                {'detail': 'Refresh token was not provided.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = self.get_serializer(data={'refresh': refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0]) from e

        data = dict(serializer.validated_data)
        response = Response(data, status=status.HTTP_200_OK)
        response.data = apply_auth_cookies(response, response.data)
        return response


class LogoutView(APIView):
    """Blacklist refresh token and clear auth cookies."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        refresh = get_refresh_from_request(request)
        if refresh:
            try:
                RefreshToken(refresh).blacklist()
            except TokenError:
                pass

        response = Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)
        clear_refresh_cookie(response)
        clear_access_cookie(response)
        return response
