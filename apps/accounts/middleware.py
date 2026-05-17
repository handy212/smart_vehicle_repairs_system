from django.utils.functional import SimpleLazyObject
from django.contrib.auth.models import AnonymousUser
from django.http import HttpResponse, JsonResponse
from django.utils.html import escape
from rest_framework_simplejwt.authentication import JWTAuthentication
from auditlog.context import set_actor
from rest_framework.request import Request
from rest_framework.authentication import TokenAuthentication


ACCESS_TOKEN_COOKIE_NAME = "access_token"

def get_user_from_jwt(request):
    """
    Attempt to authenticate using JWT
    """
    try:
        authenticator = JWTAuthentication()
        # JWTAuthentication expects a Request object or we just pass the original request
        # and it parses headers.
        response = authenticator.authenticate(request)
        if response is not None:
            user, token = response
            return user
    except Exception:
        pass
    return None

class AuditlogDRFMiddleware:
    """
    Middleware to ensure django-auditlog captures the actor when using DRF authentication (JWT/Token).
    Standard Django AuthenticationMiddleware only handles Sessions.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # If user is already authenticated (e.g. via session), do nothing
        if not hasattr(request, 'user') or request.user.is_anonymous:
            # Support direct browser navigations to Django views by promoting the
            # SPA's access token cookie into the header SimpleJWT expects.
            if 'HTTP_AUTHORIZATION' not in request.META:
                access_token = request.COOKIES.get(ACCESS_TOKEN_COOKIE_NAME)
                if access_token:
                    request.META['HTTP_AUTHORIZATION'] = f'Bearer {access_token}'

            # Check for Authorization header
            if 'HTTP_AUTHORIZATION' in request.META:
                user = get_user_from_jwt(request)
                if user:
                    request.user = user
                    set_actor(user)
        
        # If user was already authenticated or we just authenticated them, set actor
        if hasattr(request, 'user') and not request.user.is_anonymous:
            # This ensures set_actor is called even if AuditlogMiddleware runs later
            # (though normally AuditlogMiddleware calls it too, calling it twice is safe/last-one-wins)
            set_actor(request.user)

        response = self.get_response(request)
        return response


class MaintenanceModeMiddleware:
    """
    Blocks non-admin traffic when the maintenance_mode system setting is enabled.
    """
    EXEMPT_PATH_PREFIXES = (
        '/api/health/',
        '/api/auth/token/',
        '/api/auth/users/me/',
        '/api/accounts/token/',
        '/api/accounts/users/me/',
        '/api/accounts/admin/settings/public/',
        '/accounts/login/',
        '/accounts/logout/',
        '/admin/login/',
        '/static/',
        '/media/',
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if self._should_skip(request):
            return self.get_response(request)

        from .settings_utils import get_setting

        enabled = str(get_setting('maintenance_mode', 'false')).strip().lower() in {'true', '1', 'yes', 'on'}
        if not enabled or self._is_admin_user(getattr(request, 'user', None)):
            return self.get_response(request)

        message = get_setting(
            'maintenance_message',
            'System is under maintenance. Please check back later.',
        )
        request._maintenance_mode_response = True
        return self._maintenance_response(request, message)

    def _should_skip(self, request):
        path = request.path_info or request.path
        return any(path.startswith(prefix) for prefix in self.EXEMPT_PATH_PREFIXES)

    def _is_admin_user(self, user):
        if not user or not user.is_authenticated:
            return False
        return (
            getattr(user, 'is_superuser', False)
            or getattr(user, 'is_staff', False)
            or getattr(user, 'role', None) in {'admin', 'super-admin'}
        )

    def _maintenance_response(self, request, message):
        if (request.path_info or request.path).startswith('/api/'):
            return JsonResponse(
                {
                    'detail': message,
                    'maintenance_mode': True,
                },
                status=503,
            )

        escaped_message = escape(message)
        return HttpResponse(
            (
                '<!doctype html><html><head><title>Maintenance</title></head>'
                '<body><main style="font-family: sans-serif; max-width: 640px; margin: 10vh auto; padding: 24px;">'
                '<h1>Maintenance Mode</h1>'
                f'<p>{escaped_message}</p>'
                '</main></body></html>'
            ),
            status=503,
            content_type='text/html',
        )
