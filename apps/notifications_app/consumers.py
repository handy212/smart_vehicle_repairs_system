import json
import logging

from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)


class NotificationConsumer(AsyncWebsocketConsumer):
    """
    Per-user notification socket.
    Clients join group notifications_user_{id} and receive notification.new events.
    """

    async def connect(self):
        self.user = self.scope.get("user")
        if not self.user or self.user.is_anonymous:
            await self.close(code=4001)
            return

        self.group_name = f"notifications_user_{self.user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.debug("NotificationConsumer connected user=%s", self.user.id)

    async def disconnect(self, close_code):
        group = getattr(self, "group_name", None)
        if group:
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive(self, text_data):
        # Optional keepalive / future client commands
        try:
            data = json.loads(text_data or "{}")
        except (json.JSONDecodeError, TypeError):
            return
        if data.get("type") == "ping":
            await self.send(text_data=json.dumps({"type": "pong"}))

    async def notification_message(self, event):
        """Channel-layer handler (type: notification.message)."""
        await self.send(
            text_data=json.dumps(
                {
                    "type": "notification.new",
                    "notification": event.get("notification"),
                    "unread_count": event.get("unread_count"),
                }
            )
        )
