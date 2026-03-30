from django.utils.functional import SimpleLazyObject
from django.contrib.auth.models import AnonymousUser
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
