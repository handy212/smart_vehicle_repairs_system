import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Conversation, ChatMessage, ChatMembership, MessageReadReceipt
from django.contrib.auth import get_user_model
from django.utils import timezone

logger = logging.getLogger(__name__)
User = get_user_model()


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.conversation_id = self.scope['url_route']['kwargs']['conversation_id']
        self.room_group_name = f'chat_{self.conversation_id}'
        self.user = self.scope["user"]

        # Reject anonymous connections
        if self.user.is_anonymous:
            await self.close(code=4001)
            return

        # Authorization: user must be a member of this conversation
        is_member = await self.check_membership(self.user.id, self.conversation_id)
        if not is_member:
            logger.warning(
                f"User {self.user.id} attempted to connect to conversation "
                f"{self.conversation_id} without membership"
            )
            await self.close(code=4003)
            return

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

        # Update presence and broadcast to all conversations this user is in
        await self.update_user_presence(True)
        await self.broadcast_presence(True)

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

        # Only mark offline if the user isn't connected elsewhere
        # (presence broadcast handles this via the group)
        await self.update_user_presence(False)
        await self.broadcast_presence(False)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, TypeError):
            logger.error("ChatConsumer received invalid JSON")
            return

        action_type = data.get('type')

        if action_type == 'typing':
            await self.handle_typing(data.get('is_typing', False))
        elif action_type == 'read_receipt':
            await self.handle_read_receipt(data.get('message_id'))
        elif action_type == 'chat_message':
            await self.handle_chat_message(data)

    async def handle_chat_message(self, data):
        message = data.get('message', '').strip()
        message_type = data.get('message_type', 'text')
        attachment_id = data.get('attachment_id')
        parent_message_id = data.get('parent_message_id')

        if not message and not attachment_id:
            return

        # Save message to database
        try:
            chat_message = await self.save_message(
                self.user.id, self.conversation_id, message, message_type, parent_message_id
            )
        except Exception as e:
            logger.error(f"Failed to save chat message: {e}")
            await self.send(text_data=json.dumps({
                'type': 'chat.error',
                'error': 'Failed to send message. Please try again.'
            }))
            return

        # Resolve parent snippet for context
        parent_snippet = None
        if parent_message_id:
            parent_snippet = await self.get_message_snippet(parent_message_id)

        # Send message to room group
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'chat.message',
                'id': chat_message.id,
                'message': chat_message.message,
                'message_type': chat_message.message_type,
                'sender_email': self.user.email,
                'sender_name': f"{self.user.first_name} {self.user.last_name}".strip(),
                'sender_id': self.user.id,
                'timestamp': chat_message.timestamp.isoformat(),
                'metadata': chat_message.metadata,
                'is_read': False,
                'parent_message_id': parent_message_id,
                'parent_snippet': parent_snippet,
            }
        )

    async def handle_typing(self, is_typing):
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'chat.typing',
                'user_id': self.user.id,
                'user_name': self.user.get_full_name(),
                'is_typing': is_typing
            }
        )

    async def handle_read_receipt(self, message_id):
        if not message_id:
            return
        try:
            await self.mark_message_read(message_id)
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'chat.read_receipt',
                    'message_id': message_id,
                    'user_id': self.user.id
                }
            )
        except Exception as e:
            logger.error(f"Failed to handle read receipt for message {message_id}: {e}")

    # ── DB helpers ────────────────────────────────────────────────────────────

    @database_sync_to_async
    def check_membership(self, user_id, conversation_id):
        return ChatMembership.objects.filter(
            user_id=user_id, conversation_id=conversation_id
        ).exists()

    @database_sync_to_async
    def update_user_presence(self, is_online):
        User.objects.filter(id=self.user.id).update(
            is_online=is_online,
            last_seen=timezone.now()
        )

    @database_sync_to_async
    def save_message(self, sender_id, conversation_id, message, message_type='text', parent_message_id=None):
        conversation = Conversation.objects.get(id=conversation_id)
        sender = User.objects.get(id=sender_id)
        parent = None
        if parent_message_id:
            try:
                parent = ChatMessage.objects.get(id=parent_message_id)
            except ChatMessage.DoesNotExist:
                pass
        msg = ChatMessage.objects.create(
            conversation=conversation,
            sender=sender,
            message=message,
            message_type=message_type,
            parent_message=parent,
        )
        # Bump conversation updated_at so sidebar ordering stays correct
        Conversation.objects.filter(id=conversation_id).update(updated_at=timezone.now())
        return msg

    @database_sync_to_async
    def mark_message_read(self, message_id):
        try:
            msg = ChatMessage.objects.get(id=message_id)
            if msg.sender_id != self.user.id:
                msg.mark_read_by(self.user)
        except ChatMessage.DoesNotExist:
            pass

    @database_sync_to_async
    def get_message_snippet(self, message_id):
        try:
            msg = ChatMessage.objects.select_related('sender').get(id=message_id)
            return {
                'id': msg.id,
                'message': msg.message[:100],
                'sender_name': msg.sender.get_full_name() if msg.sender else 'System',
            }
        except ChatMessage.DoesNotExist:
            return None

    @database_sync_to_async
    def get_user_conversation_groups(self):
        """Return group names for all conversations this user is a member of."""
        conv_ids = ChatMembership.objects.filter(
            user_id=self.user.id
        ).values_list('conversation_id', flat=True)
        return [f'chat_{cid}' for cid in conv_ids]

    async def broadcast_presence(self, is_online):
        """Broadcast is_online status to all conversation groups this user belongs to."""
        try:
            groups = await self.get_user_conversation_groups()
            for group in groups:
                await self.channel_layer.group_send(
                    group,
                    {
                        'type': 'chat.presence',
                        'user_id': self.user.id,
                        'is_online': is_online,
                    }
                )
        except Exception as e:
            logger.error(f"Failed to broadcast presence for user {self.user.id}: {e}")

    # ── Group event handlers ──────────────────────────────────────────────────

    async def chat_message(self, event):
        await self.send(text_data=json.dumps(event))

    async def chat_typing(self, event):
        await self.send(text_data=json.dumps(event))

    async def chat_read_receipt(self, event):
        await self.send(text_data=json.dumps(event))

    async def chat_presence(self, event):
        await self.send(text_data=json.dumps(event))
