from rest_framework import serializers
from .models import Conversation, ChatMessage, ChatMembership, MessageReadReceipt
from django.contrib.auth import get_user_model

User = get_user_model()


class ChatUserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name', 'full_name',
            'role', 'profile_picture', 'avatar_url', 'is_online', 'last_seen'
        ]

    def get_avatar_url(self, obj):
        request = self.context.get('request')
        if obj.profile_picture:
            url = obj.profile_picture.url if hasattr(obj.profile_picture, 'url') else str(obj.profile_picture)
            if request:
                return request.build_absolute_uri(url)
            return url
        return None


class ChatMembershipSerializer(serializers.ModelSerializer):
    user = ChatUserSerializer(read_only=True)

    class Meta:
        model = ChatMembership
        fields = ['user', 'role', 'last_read_at', 'joined_at']


class ParentMessageSerializer(serializers.ModelSerializer):
    """Lightweight serializer for quoted/reply context."""
    sender_name = serializers.SerializerMethodField()

    class Meta:
        model = ChatMessage
        fields = ['id', 'message', 'sender_name', 'timestamp']

    def get_sender_name(self, obj):
        if obj.sender:
            return obj.sender.get_full_name() or obj.sender.email
        return 'System'


class ChatMessageSerializer(serializers.ModelSerializer):
    sender_email = serializers.SerializerMethodField()
    sender_name = serializers.SerializerMethodField()
    sender_id = serializers.SerializerMethodField()
    parent_message_detail = ParentMessageSerializer(source='parent_message', read_only=True)

    class Meta:
        model = ChatMessage
        fields = [
            'id', 'conversation', 'sender', 'sender_id', 'sender_email', 'sender_name',
            'message_type', 'message', 'attachment', 'metadata',
            'parent_message', 'parent_message_detail',
            'timestamp', 'is_read', 'read_at'
        ]
        read_only_fields = ['sender', 'timestamp', 'read_at']

    def get_sender_email(self, obj):
        return obj.sender.email if obj.sender else None

    def get_sender_name(self, obj):
        if obj.sender:
            return obj.sender.get_full_name() or obj.sender.email
        return 'System'

    def get_sender_id(self, obj):
        return obj.sender.id if obj.sender else None


class ConversationSerializer(serializers.ModelSerializer):
    memberships = ChatMembershipSerializer(source='chatmembership_set', many=True, read_only=True)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    participant_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False
    )

    class Meta:
        model = Conversation
        fields = [
            'id', 'type', 'room_id', 'is_archived', 'title',
            'memberships', 'participant_ids', 'created_at', 'updated_at',
            'last_message', 'unread_count',
            'related_object_type', 'related_object_id'
        ]

    def get_last_message(self, obj):
        last_msg = obj.messages.last()
        if last_msg:
            return ChatMessageSerializer(last_msg).data
        return None

    def get_unread_count(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return 0
        user = request.user
        # Count messages not sent by the user that have no read receipt from this user
        return obj.messages.exclude(sender=user).exclude(
            read_receipts__user=user
        ).count()

    def create(self, validated_data):
        validated_data.pop('participant_ids', [])
        conversation = Conversation.objects.create(**validated_data)
        # Participants will be added in the ViewSet to handle roles properly
        return conversation
