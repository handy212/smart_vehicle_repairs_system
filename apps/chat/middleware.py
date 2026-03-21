from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken
from urllib.parse import parse_qs
import logging

logger = logging.getLogger(__name__)
User = get_user_model()

@database_sync_to_async
def get_user(user_id):
    try:
        return User.objects.get(id=user_id)
    except User.DoesNotExist:
        return AnonymousUser()

class JWTAuthMiddleware:
    """
    Custom middleware to authenticate WebSockets using JWT in the query string.
    Usage: ws://host/ws/chat/room/?token=JWT_TOKEN
    """
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        try:
            query_string = scope.get("query_string", b"").decode()
            query_params = parse_qs(query_string)
            token = query_params.get("token")

            if token:
                try:
                    access_token = AccessToken(token[0])
                    user_id = access_token["user_id"]
                    scope["user"] = await get_user(user_id)
                except Exception as e:
                    logger.error(f"JWT Token validation failed: {e}")
                    scope["user"] = AnonymousUser()
            else:
                # Fallback to session auth if available (for admin/browser tests)
                if "user" not in scope or scope["user"].is_anonymous:
                    scope["user"] = AnonymousUser()
        except Exception as e:
            logger.error(f"JWTAuthMiddleware error: {e}")
            scope["user"] = AnonymousUser()

        return await self.inner(scope, receive, send)

def JWTAuthMiddlewareStack(inner):
    return JWTAuthMiddleware(inner)
