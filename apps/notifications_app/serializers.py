from rest_framework import serializers
from django.utils import timezone
from .models import NotificationTemplate, Notification, NotificationPreference, NotificationLog


class NotificationTemplateSerializer(serializers.ModelSerializer):
    """Serializer for notification templates"""
    created_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = NotificationTemplate
        fields = [
            'id', 'name', 'template_type', 'channel', 'subject', 'body',
            'html_body', 'sms_body', 'push_title', 'push_body', 'is_active',
            'variables', 'created_at', 'updated_at', 'created_by', 'created_by_name'
        ]
        read_only_fields = ['created_at', 'updated_at', 'created_by']
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}"
        return None


class NotificationTemplateListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing templates"""
    class Meta:
        model = NotificationTemplate
        fields = [
            'id', 'name', 'template_type', 'channel', 'subject', 'body', 'html_body',
            'is_active', 'created_at', 'updated_at'
        ]


class NotificationSerializer(serializers.ModelSerializer):
    """Serializer for notifications"""
    recipient_name = serializers.SerializerMethodField()
    recipient_email = serializers.CharField(source='recipient.email', read_only=True)
    template_name = serializers.CharField(source='template.name', read_only=True)
    is_expired = serializers.SerializerMethodField()
    
    class Meta:
        model = Notification
        fields = [
            'id', 'recipient', 'recipient_name', 'recipient_email',
            'notification_type', 'channel', 'priority', 'title', 'message',
            'data', 'status', 'is_read', 'read_at', 'sent_at', 'delivered_at',
            'failed_at', 'error_message', 'related_object_type', 'related_object_id',
            'template', 'template_name', 'scheduled_for', 'expires_at',
            'is_expired', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'status', 'is_read', 'read_at', 'sent_at', 'delivered_at',
            'failed_at', 'created_at', 'updated_at'
        ]
    
    def get_recipient_name(self, obj):
        return f"{obj.recipient.first_name} {obj.recipient.last_name}"
    
    def get_is_expired(self, obj):
        if obj.expires_at:
            return timezone.now() > obj.expires_at
        return False


class NotificationListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing notifications"""
    recipient_name = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()
    
    class Meta:
        model = Notification
        fields = [
            'id', 'recipient', 'recipient_name', 'notification_type',
            'channel', 'priority', 'title', 'status', 'is_read',
            'is_expired', 'created_at'
        ]
    
    def get_recipient_name(self, obj):
        return f"{obj.recipient.first_name} {obj.recipient.last_name}"
    
    def get_is_expired(self, obj):
        if obj.expires_at:
            return timezone.now() > obj.expires_at
        return False


class NotificationCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating notifications"""
    class Meta:
        model = Notification
        fields = [
            'recipient', 'notification_type', 'channel', 'priority',
            'title', 'message', 'data', 'related_object_type',
            'related_object_id', 'template', 'scheduled_for', 'expires_at'
        ]


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    """Serializer for notification preferences"""
    user_email = serializers.CharField(source='user.email', read_only=True)
    user_name = serializers.SerializerMethodField()
    
    class Meta:
        model = NotificationPreference
        fields = [
            'id', 'user', 'user_email', 'user_name',
            'email_enabled', 'sms_enabled', 'push_enabled', 'in_app_enabled',
            'appointment_notifications', 'work_order_notifications',
            'invoice_notifications', 'payment_notifications',
            'inspection_notifications', 'inventory_notifications',
            'vehicle_notifications', 'system_notifications',
            'quiet_hours_enabled', 'quiet_hours_start', 'quiet_hours_end',
            'digest_enabled', 'digest_frequency',
            'phone_number', 'push_token',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['user', 'created_at', 'updated_at']
    
    def get_user_name(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}"


class NotificationLogSerializer(serializers.ModelSerializer):
    """Serializer for notification logs"""
    notification_title = serializers.CharField(source='notification.title', read_only=True)
    
    class Meta:
        model = NotificationLog
        fields = [
            'id', 'notification', 'notification_title', 'action',
            'details', 'metadata', 'timestamp'
        ]
        read_only_fields = ['timestamp']


class BulkNotificationSerializer(serializers.Serializer):
    """Serializer for sending bulk notifications"""
    recipient_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of user IDs to send notification to"
    )
    notification_type = serializers.ChoiceField(choices=Notification.NOTIFICATION_TYPE_CHOICES)
    channel = serializers.ChoiceField(choices=Notification.CHANNEL_CHOICES)
    priority = serializers.ChoiceField(
        choices=Notification.PRIORITY_CHOICES,
        default='normal'
    )
    title = serializers.CharField(max_length=200)
    message = serializers.CharField()
    data = serializers.JSONField(required=False, default=dict)
    scheduled_for = serializers.DateTimeField(required=False, allow_null=True)
    expires_at = serializers.DateTimeField(required=False, allow_null=True)


class NotificationStatsSerializer(serializers.Serializer):
    """Serializer for notification statistics"""
    total_notifications = serializers.IntegerField()
    unread_count = serializers.IntegerField()
    by_type = serializers.DictField()
    by_channel = serializers.DictField()
    by_status = serializers.DictField()
    recent_notifications = NotificationListSerializer(many=True)
