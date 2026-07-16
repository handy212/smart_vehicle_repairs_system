"""
Realtime fan-out for in-app notifications via Django Channels.
"""

from __future__ import annotations

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def user_notification_group(user_id: int) -> str:
    return f"notifications_user_{user_id}"


def serialize_notification_for_ws(notification) -> dict:
    return {
        "id": notification.id,
        "recipient": notification.recipient_id,
        "notification_type": notification.notification_type,
        "channel": notification.channel,
        "priority": notification.priority,
        "title": notification.title,
        "message": notification.message,
        "data": notification.data or {},
        "status": notification.status,
        "is_read": bool(notification.is_read),
        "read_at": notification.read_at.isoformat() if notification.read_at else None,
        "related_object_type": notification.related_object_type,
        "related_object_id": notification.related_object_id,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }


def unread_count_for_user(user_id: int) -> int:
    from .models import Notification

    return Notification.objects.filter(
        recipient_id=user_id,
        channel="in_app",
        is_read=False,
    ).count()


def broadcast_in_app_notification(notification) -> None:
    """
    Push a newly created in-app notification to the recipient's live socket.
    Safe no-op if Channels / Redis is unavailable.
    """
    if not notification or not getattr(notification, "recipient_id", None):
        return

    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            logger.debug("No channel layer; skip realtime notification broadcast")
            return

        payload = serialize_notification_for_ws(notification)
        unread = unread_count_for_user(notification.recipient_id)

        async_to_sync(channel_layer.group_send)(
            user_notification_group(notification.recipient_id),
            {
                "type": "notification.message",
                "notification": payload,
                "unread_count": unread,
            },
        )
    except Exception as exc:
        logger.error(
            "Failed to broadcast in-app notification %s: %s",
            getattr(notification, "id", None),
            exc,
        )
