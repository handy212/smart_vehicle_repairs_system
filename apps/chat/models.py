from django.db import models
from django.conf import settings
from django.utils import timezone


class Conversation(models.Model):
    """
    A conversation between two or more users.
    """
    TYPE_CHOICES = (
        ('private', 'Private'),
        ('group', 'Group'),
        ('system', 'System'),
    )

    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='private')
    participants = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through='ChatMembership',
        related_name='conversations'
    )
    title = models.CharField(max_length=255, blank=True, null=True)
    room_id = models.SlugField(max_length=100, unique=True, blank=True, null=True)
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Optional: Link to a specific work order or appointment
    related_object_type = models.CharField(max_length=50, blank=True, null=True)
    related_object_id = models.PositiveIntegerField(blank=True, null=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        if self.title:
            return self.title
        return f"{self.type.title()} Conversation {self.id}"

    def get_unread_count(self, user):
        """Returns the count of unread messages for a specific user."""
        return self.messages.exclude(sender=user).filter(
            ~models.Q(read_receipts__user=user)
        ).count()


class ChatMembership(models.Model):
    """
    Tracks user membership in a conversation with roles and read status.
    """
    ROLE_CHOICES = (
        ('member', 'Member'),
        ('admin', 'Admin'),
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='member')
    last_read_at = models.DateTimeField(default=timezone.now)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'conversation')


class ChatMessage(models.Model):
    """
    An individual message within a conversation.
    """
    MESSAGE_TYPES = (
        ('text', 'Text'),
        ('image', 'Image'),
        ('file', 'File'),
        ('system', 'System Alert'),
    )

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name='messages', db_index=True
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sent_messages',
        null=True, blank=True  # System messages might not have a sender
    )
    message_type = models.CharField(max_length=20, choices=MESSAGE_TYPES, default='text')
    message = models.TextField(blank=True)
    attachment = models.FileField(upload_to='chat/attachments/', blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    parent_message = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='replies'
    )
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    # Legacy global read flag — kept for backward compat; per-user tracking via MessageReadReceipt
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        sender_name = self.sender.email if self.sender else "System"
        return f"From {sender_name} at {self.timestamp}"

    def mark_as_read(self):
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=['is_read', 'read_at'])

    def mark_read_by(self, user):
        """Record a per-user read receipt. Idempotent."""
        MessageReadReceipt.objects.get_or_create(
            message=self,
            user=user,
            defaults={'read_at': timezone.now()}
        )
        # Also update legacy flag if the reader is not the sender
        if self.sender_id != user.pk and not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=['is_read', 'read_at'])


class MessageReadReceipt(models.Model):
    """
    Per-user read receipt for a chat message.
    Enables accurate 'seen by' tracking in group conversations.
    """
    message = models.ForeignKey(
        ChatMessage, on_delete=models.CASCADE, related_name='read_receipts', db_index=True
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='chat_read_receipts'
    )
    read_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ('message', 'user')
        ordering = ['read_at']

    def __str__(self):
        return f"{self.user} read message {self.message_id} at {self.read_at}"
