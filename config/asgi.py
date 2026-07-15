import os
import django
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from apps.chat.middleware import JWTAuthMiddleware
import apps.chat.routing
import apps.notifications_app.routing

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    # JWT must run *inside* AuthMiddlewareStack so session auth does not
    # overwrite scope["user"] with AnonymousUser after the token is applied.
    "websocket": AuthMiddlewareStack(
        JWTAuthMiddleware(
            URLRouter(
                apps.chat.routing.websocket_urlpatterns
                + apps.notifications_app.routing.websocket_urlpatterns
            )
        )
    ),
})
