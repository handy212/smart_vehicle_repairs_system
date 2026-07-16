"""JWT views with HttpOnly cookies + blacklist logout."""
import logging

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenRefreshView
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from rest_framework_simplejwt.tokens import RefreshToken

from .authentication import JWTCookieAuthentication
from .permissions import HasAnyPermission
from .recaptcha_views import RecaptchaTokenObtainPairView
from .jwt_cookies import (
    get_refresh_from_request,
    get_impersonator_refresh_from_request,
    apply_auth_cookies,
    clear_refresh_cookie,
    clear_access_cookie,
    clear_impersonator_cookie,
    set_impersonator_cookie,
)
from .throttles import RefreshTokenRateThrottle

logger = logging.getLogger(__name__)
User = get_user_model()


def _token_claim(token, key, default=None):
    if token is None:
        return default
    try:
        return token.get(key, default)
    except Exception:
        return default


def _is_impersonating(request) -> bool:
    return bool(_token_claim(getattr(request, 'auth', None), 'impersonating'))


def _impersonator_payload(user):
    return {
        'id': user.id,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
    }


def _issue_tokens_for_user(user, *, impersonator_id=None):
    refresh = RefreshToken.for_user(user)
    if impersonator_id is not None:
        refresh['impersonating'] = True
        refresh['impersonator_id'] = impersonator_id
        refresh.access_token['impersonating'] = True
        refresh.access_token['impersonator_id'] = impersonator_id
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    }


class CookieTokenObtainPairView(RecaptchaTokenObtainPairView):
    """Login: store tokens in HttpOnly cookies."""

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200 and isinstance(response.data, dict):
            if response.data.get('requires_2fa'):
                return response
            response.data = apply_auth_cookies(response, response.data)
            clear_impersonator_cookie(response)
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
        # Preserve impersonation claims across refresh rotation.
        try:
            old = RefreshToken(refresh)
            if old.get('impersonating') and data.get('refresh'):
                new_refresh = RefreshToken(data['refresh'])
                new_refresh['impersonating'] = True
                new_refresh['impersonator_id'] = old.get('impersonator_id')
                new_refresh.access_token['impersonating'] = True
                new_refresh.access_token['impersonator_id'] = old.get('impersonator_id')
                data['refresh'] = str(new_refresh)
                data['access'] = str(new_refresh.access_token)
        except TokenError:
            pass

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

        impersonator_refresh = get_impersonator_refresh_from_request(request)
        if impersonator_refresh:
            try:
                RefreshToken(impersonator_refresh).blacklist()
            except TokenError:
                pass

        response = Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)
        clear_refresh_cookie(response)
        clear_access_cookie(response)
        clear_impersonator_cookie(response)
        return response


class SessionView(APIView):
    """BFF session check — verify access cookie and return current user profile."""

    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTCookieAuthentication]

    def get(self, request, *args, **kwargs):
        from .serializers import UserSerializer

        serializer = UserSerializer(request.user, context={'request': request})
        return Response({'ok': True, 'user': serializer.data})


class ImpersonateCustomerView(APIView):
    """Staff: start a customer portal session as the selected customer."""

    permission_classes = [
        IsAuthenticated,
        HasAnyPermission(['manage_customers', 'manage_users']),
    ]
    authentication_classes = [JWTCookieAuthentication]

    def post(self, request, *args, **kwargs):
        if _is_impersonating(request):
            return Response(
                {'detail': 'Already impersonating. Exit the current session first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if getattr(request.user, 'role', None) == 'customer':
            return Response(
                {'detail': 'Customers cannot impersonate other accounts.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        customer_id = request.data.get('customer_id')
        if not customer_id:
            return Response(
                {'detail': 'customer_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.customers.models import Customer

        try:
            customer = Customer.objects.select_related('user').get(pk=customer_id)
        except Customer.DoesNotExist:
            return Response({'detail': 'Customer not found.'}, status=status.HTTP_404_NOT_FOUND)

        target = customer.user
        if not target or getattr(target, 'role', None) != 'customer':
            return Response(
                {'detail': 'This customer does not have a portal login account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not target.is_active:
            return Response(
                {'detail': 'Cannot impersonate an inactive customer account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target.id == request.user.id:
            return Response(
                {'detail': 'Cannot impersonate your own account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Prefer the staff refresh cookie (for exit). If the BFF/session only has a
        # valid access token (e.g. refresh cookie missing after cookie-path migration),
        # mint a fresh staff refresh so exit can still restore the admin session.
        admin_refresh = get_refresh_from_request(request)
        if not admin_refresh:
            admin_refresh = _issue_tokens_for_user(request.user)['refresh']

        tokens = _issue_tokens_for_user(target, impersonator_id=request.user.id)
        from .serializers import UserSerializer

        user_data = UserSerializer(target, context={'request': request}).data
        impersonator = _impersonator_payload(request.user)
        user_data['impersonating'] = True
        user_data['impersonator'] = impersonator

        data = {
            **tokens,
            'impersonator_refresh': admin_refresh,
            'user': user_data,
            'impersonating': True,
            'impersonator': impersonator,
        }

        logger.info(
            'User %s (%s) started impersonating customer %s (user %s)',
            request.user.id,
            request.user.email,
            customer.id,
            target.id,
        )

        response = Response(data, status=status.HTTP_200_OK)
        # Keep tokens in JSON for the Next.js BFF; also set cookies for direct callers.
        apply_auth_cookies(response, dict(tokens))
        set_impersonator_cookie(response, admin_refresh)
        # Re-attach tokens for BFF (apply_auth_cookies may strip refresh)
        response.data = {
            **data,
            'access': tokens['access'],
            'refresh': tokens['refresh'],
            'impersonator_refresh': admin_refresh,
        }
        return response


class ExitImpersonationView(APIView):
    """Restore the staff session after customer impersonation."""

    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTCookieAuthentication]

    def post(self, request, *args, **kwargs):
        if not _is_impersonating(request):
            return Response(
                {'detail': 'Not currently impersonating a customer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        impersonator_refresh = get_impersonator_refresh_from_request(request)
        if not impersonator_refresh:
            return Response(
                {'detail': 'Impersonator session expired. Please log in again.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Blacklist the customer impersonation refresh.
        current_refresh = get_refresh_from_request(request)
        if current_refresh:
            try:
                RefreshToken(current_refresh).blacklist()
            except TokenError:
                pass

        try:
            admin_token = RefreshToken(impersonator_refresh)
            admin_user = User.objects.get(pk=admin_token['user_id'])
        except (TokenError, User.DoesNotExist, KeyError):
            clear_response = Response(
                {'detail': 'Impersonator session expired. Please log in again.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_refresh_cookie(clear_response)
            clear_access_cookie(clear_response)
            clear_impersonator_cookie(clear_response)
            return clear_response

        if not admin_user.is_active:
            return Response(
                {'detail': 'Impersonator account is inactive.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Prefer rotating to a fresh staff session.
        tokens = _issue_tokens_for_user(admin_user)
        try:
            RefreshToken(impersonator_refresh).blacklist()
        except TokenError:
            pass

        from .serializers import UserSerializer

        user_data = UserSerializer(admin_user, context={'request': request}).data
        user_data['impersonating'] = False
        user_data['impersonator'] = None

        data = {
            **tokens,
            'user': user_data,
            'impersonating': False,
        }

        logger.info(
            'User %s exited impersonation of user %s',
            admin_user.id,
            request.user.id,
        )

        response = Response(data, status=status.HTTP_200_OK)
        apply_auth_cookies(response, dict(tokens))
        clear_impersonator_cookie(response)
        response.data = {
            **data,
            'access': tokens['access'],
            'refresh': tokens['refresh'],
        }
        return response
