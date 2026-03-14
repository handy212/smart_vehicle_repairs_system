from rest_framework import serializers
from .models import Conversation, ChatMessage
from django.contrib.auth import get_user_model

User = get_user_model()

class ChatUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'first_name', 'last_name']

class ChatMessageSerializer(serializers.ModelSerializer):
    sender_email = serializers.EmailField(source='sender.email', read_only=True)
    
    class Meta:
        model = ChatMessage
        fields = ['id', 'conversation', 'sender', 'sender_email', 'message', 'timestamp', 'is_read', 'read_at']
        read_only_fields = ['sender', 'timestamp', 'read_at']

class ConversationSerializer(serializers.ModelSerializer):
    participants = ChatUserSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()
    participant_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False
    )

    class Meta:
        model = Conversation
        fields = ['id', 'participants', 'participant_ids', 'title', 'created_at', 'updated_at', 'last_message', 'related_object_type', 'related_object_id']

    def get_last_message(self, obj):
        last_msg = obj.messages.last()
        if last_msg:
            return ChatMessageSerializer(last_msg).data
        return None

    def create(self, validated_data):
        participant_ids = validated_data.pop('participant_ids', [])
        conversation = Conversation.objects.create(**validated_data)
        if participant_ids:
            conversation.participants.set(participant_ids)
        return conversation
