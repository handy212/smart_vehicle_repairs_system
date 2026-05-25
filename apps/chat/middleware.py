from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken
from urllib.parse import parse_qs
import logging

logger = logging.getLogger(__name__)
User = get_user_model()


def _parse_cookie_header(scope, cookie_name: str) -> str | None:
    for header_name, header_value in scope.get('headers', []):
        if header_name != b'cookie':
            continue
        cookie_str = header_value.decode('latin-1')
        for part in cookie_str.split(';'):
            part = part.strip()
            if part.startswith(f'{cookie_name}='):
                return part.split('=', 1)[1]
    return None


@database_sync_to_async
def get_user(user_id):
    try:
        return User.objects.get(id=user_id)
    except User.DoesNotExist:
        return AnonymousUser()


class JWTAuthMiddleware:
    """
    Authenticate WebSockets via JWT query param or HttpOnly access_token cookie.
    """

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        scope['user'] = AnonymousUser()
        try:
            query_string = scope.get('query_string', b'').decode()
            query_params = parse_qs(query_string)
            token_list = query_params.get('token') or []

            if not token_list:
                cookie_token = _parse_cookie_header(scope, 'access_token')
                if cookie_token:
                    token_list = [cookie_token]

            if token_list:
                try:
                    access_token = AccessToken(token_list[0])
                    user_id = access_token['user_id']
                    scope['user'] = await get_user(user_id)
                except Exception as e:
                    logger.error('JWT Token validation failed: %s', e)
        except Exception as e:
            logger.error('JWTAuthMiddleware error: %s', e)

        return await self.inner(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    return JWTAuthMiddleware(inner)
