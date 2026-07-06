from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.db import transaction
from apps.workorders.models import WorkOrder
from .models import Conversation, ChatMessage, ChatMembership
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import logging

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=WorkOrder)
def capture_original_status(sender, instance, **kwargs):
    """
    Store the original status before a save so we can detect changes.
    """
    if instance.pk:
        try:
            instance.__original_status = WorkOrder.objects.filter(
                pk=instance.pk
            ).values_list('status', flat=True).first()
        except Exception:
            instance.__original_status = None
    else:
        instance.__original_status = None


@receiver(post_save, sender=WorkOrder)
def work_order_status_update_notification(sender, instance, created, **kwargs):
    """
    Automated system notification for Work Order status changes.
    Only fires when the status actually changed, or when a new WO is created.
    """
    original_status = getattr(instance, '__original_status', None)
    status_changed = created or (original_status is not None and original_status != instance.status)

    if not status_changed:
        return  # Prevent noise on unrelated field saves

    status_display = instance.get_status_display()

    # Check if a system conversation exists or create one. Production can also
    # have private/user chats linked to the same work order, so avoid a broad
    # get_or_create() that can raise MultipleObjectsReturned.
    with transaction.atomic():
        conversations = Conversation.objects.select_for_update().filter(
            related_object_type='workorder',
            related_object_id=instance.id,
            type='system',
        ).order_by('id')
        conversation = conversations.first()
        if conversation:
            duplicate_count = conversations.count() - 1
            if duplicate_count:
                logger.warning(
                    "Found %s duplicate chat conversation(s) for work order %s; using conversation %s.",
                    duplicate_count,
                    instance.id,
                    conversation.id,
                )
        else:
            conversation = Conversation.objects.create(
                related_object_type='workorder',
                related_object_id=instance.id,
                title=f"Work Order {instance.work_order_number}",
                type='system',
            )

        # Ensure customer and coordinator are members
        if instance.customer and hasattr(instance.customer, 'user') and instance.customer.user:
            ChatMembership.objects.get_or_create(
                user=instance.customer.user,
                conversation=conversation,
                defaults={'role': 'member'}
            )

        if instance.service_coordinator:
            ChatMembership.objects.get_or_create(
                user=instance.service_coordinator,
                conversation=conversation,
                defaults={'role': 'member'}
            )

        # Create the system message
        text = (
            f"System: New Work Order {instance.work_order_number} has been created."
            if created else
            f"System: Work Order {instance.work_order_number} status updated to {status_display}."
        )

        msg = ChatMessage.objects.create(
            conversation=conversation,
            sender=None,  # System message
            message=text,
            message_type='system'
        )

    # Broadcast to WebSocket — guard against unconfigured channel layer
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            logger.warning("No channel layer configured; skipping WebSocket broadcast for WO signal.")
            return

        group_name = f"chat_{conversation.id}"

        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "chat.message",
                "id": msg.id,
                "message": msg.message,
                "message_type": msg.message_type,
                "sender": None,
                "sender_id": None,
                "sender_name": "System",
                "timestamp": msg.timestamp.isoformat(),
                "is_read": False,
                "metadata": msg.metadata
            }
        )
    except Exception as e:
        logger.error(f"Failed to broadcast system message for WO {instance.id}: {e}")
