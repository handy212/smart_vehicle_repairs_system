from django.db import models
from django.conf import settings
from django.utils import timezone


class NotificationTemplate(models.Model):
    """
    Reusable notification templates with dynamic variables
    """
    TEMPLATE_TYPE_CHOICES = [
        ('appointment_reminder', 'Appointment Reminder'),
        ('appointment_confirmation', 'Appointment Confirmation'),
        ('appointment_cancelled', 'Appointment Cancelled'),
        ('work_order_created', 'Work Order Created'),
        ('work_order_completed', 'Work Order Completed'),
        ('work_order_approved', 'Work Order Approved'),
        ('invoice_generated', 'Invoice Generated'),
        ('invoice_due', 'Invoice Due'),
        ('invoice_overdue', 'Invoice Overdue'),
        ('payment_received', 'Payment Received'),
        ('inspection_completed', 'Inspection Completed'),
        ('inspection_approved', 'Inspection Approved'),
        ('inspection_rejected', 'Inspection Rejected'),
        ('inspection_sent_to_customer', 'Inspection Sent to Customer'),
        ('low_stock_alert', 'Low Stock Alert'),
        ('service_due', 'Service Due'),
        ('vehicle_ready', 'Vehicle Ready'),
        ('parts_arrived', 'Parts Arrived'),
        ('estimate_sent', 'Estimate Sent'),
        ('estimate_approved', 'Estimate Approved'),
        ('estimate_declined', 'Estimate Declined'),
        ('estimate_expiring_soon', 'Estimate Expiring Soon'),
        ('estimate_expired', 'Estimate Expired'),
        ('gate_pass_created', 'Gate Pass Created'),
        ('gate_pass_issued', 'Gate Pass Issued'),
        ('user_welcome', 'User Welcome'),
        ('password_reset', 'Password Reset'),
        ('password_reset_link', 'Password Reset Link'),
        ('custom', 'Custom'),
    ]
    
    CHANNEL_CHOICES = [
        ('email', 'Email'),
        ('sms', 'SMS'),
        ('call', 'Voice Call'),
        ('push', 'Push Notification'),
        ('in_app', 'In-App Notification'),
        ('whatsapp_manual', 'WhatsApp (Manual)'),
        ('whatsapp', 'WhatsApp (API)'),
    ]
    
    name = models.CharField(max_length=200)
    template_type = models.CharField(max_length=50, choices=TEMPLATE_TYPE_CHOICES)
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    
    # Email-specific fields
    subject = models.CharField(max_length=500, blank=True)
    body = models.TextField()
    html_body = models.TextField(blank=True, help_text="HTML version of email body")
    
    # SMS-specific fields
    sms_body = models.TextField(blank=True, max_length=320, help_text="SMS message (max 320 chars)")
    
    # WhatsApp Template Settings
    whatsapp_template_name = models.CharField(max_length=255, blank=True, help_text="Name of the Meta WhatsApp template")
    whatsapp_template_variables = models.JSONField(default=list, blank=True, help_text="List of variable mappings for the template, e.g. ['customer_name', 'total']")
    
    # Push notification fields
    push_title = models.CharField(max_length=100, blank=True)
    push_body = models.CharField(max_length=200, blank=True)
    
    is_active = models.BooleanField(default=True)
    variables = models.JSONField(
        default=dict,
        blank=True,
        help_text="Available variables: {customer_name}, {appointment_date}, {vehicle}, etc."
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_notification_templates'
    )
    
    class Meta:
        ordering = ['template_type', 'name']
        indexes = [
            models.Index(fields=['template_type', 'channel']),
        ]
    
    def __str__(self):
        return f"{self.get_template_type_display()} - {self.channel}"


class Notification(models.Model):
    """
    Individual notifications sent to users
    """
    NOTIFICATION_TYPE_CHOICES = [
        ('appointment', 'Appointment'),
        ('work_order', 'Work Order'),
        ('invoice', 'Invoice'),
        ('payment', 'Payment'),
        ('inspection', 'Inspection'),
        ('inventory', 'Inventory'),
        ('vehicle', 'Vehicle'),
        ('system', 'System'),
        ('roadside', 'Roadside Assistance'),
        ('gatepass', 'Gate Pass'),
        ('custom', 'Custom'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    
    CHANNEL_CHOICES = [
        ('email', 'Email'),
        ('sms', 'SMS'),
        ('call', 'Voice Call'),
        ('push', 'Push Notification'),
        ('in_app', 'In-App Notification'),
        ('whatsapp_manual', 'WhatsApp (Manual)'),
        ('whatsapp', 'WhatsApp (API)'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('sent', 'Sent'),
        ('delivered', 'Delivered'),
        ('failed', 'Failed'),
        ('read', 'Read'),
    ]
    
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='user_notifications'
    )
    notification_type = models.CharField(max_length=50, choices=NOTIFICATION_TYPE_CHOICES)
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal')
    
    title = models.CharField(max_length=200)
    message = models.TextField()
    data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional data (IDs, links, metadata)"
    )
    
    # Status tracking
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    
    # Delivery tracking
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    
    # Related objects (generic foreign key alternative)
    related_object_type = models.CharField(max_length=50, blank=True)
    related_object_id = models.IntegerField(null=True, blank=True)
    
    # Template reference
    template = models.ForeignKey(
        NotificationTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='notifications'
    )
    
    # Scheduling
    scheduled_for = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'is_read']),
            models.Index(fields=['status', 'scheduled_for']),
            models.Index(fields=['notification_type', 'created_at']),
        ]
    
    def __str__(self):
        return f"{self.get_notification_type_display()} to {self.recipient.email}"
    
    def mark_as_read(self):
        """Mark notification as read"""
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            if self.status == 'delivered':
                self.status = 'read'
            self.save(update_fields=['is_read', 'read_at', 'status', 'updated_at'])
    
    def mark_as_sent(self):
        """Mark notification as sent"""
        self.status = 'sent'
        self.sent_at = timezone.now()
        self.save(update_fields=['status', 'sent_at', 'updated_at'])
    
    def mark_as_delivered(self):
        """Mark notification as delivered"""
        self.status = 'delivered'
        self.delivered_at = timezone.now()
        self.save(update_fields=['status', 'delivered_at', 'updated_at'])
    
    def mark_as_failed(self, error_message):
        """Mark notification as failed"""
        self.status = 'failed'
        self.failed_at = timezone.now()
        self.error_message = error_message
        self.save(update_fields=['status', 'failed_at', 'error_message', 'updated_at'])


class NotificationPreference(models.Model):
    """
    User notification preferences and settings
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notification_preferences'
    )
    
    # Channel preferences
    email_enabled = models.BooleanField(default=True)
    sms_enabled = models.BooleanField(default=False)
    push_enabled = models.BooleanField(default=True)
    in_app_enabled = models.BooleanField(default=True)
    whatsapp_manual_enabled = models.BooleanField(default=True)
    whatsapp_enabled = models.BooleanField(default=True, verbose_name="WhatsApp (API)")
    sound_enabled = models.BooleanField(default=True, help_text="Play sound for in-app notifications")
    
    # Notification type preferences
    appointment_notifications = models.BooleanField(default=True)
    work_order_notifications = models.BooleanField(default=True)
    invoice_notifications = models.BooleanField(default=True)
    payment_notifications = models.BooleanField(default=True)
    inspection_notifications = models.BooleanField(default=True)
    inventory_notifications = models.BooleanField(default=True)
    vehicle_notifications = models.BooleanField(default=True)
    system_notifications = models.BooleanField(default=True)
    
    # Roadside assistance notification preferences
    roadside_requested_email = models.BooleanField(default=True, verbose_name="Roadside requested - Email")
    roadside_requested_sms = models.BooleanField(default=True, verbose_name="Roadside requested - SMS")
    roadside_dispatched_email = models.BooleanField(default=True, verbose_name="Technician dispatched - Email")
    roadside_dispatched_sms = models.BooleanField(default=True, verbose_name="Technician dispatched - SMS")
    roadside_arrived_email = models.BooleanField(default=True, verbose_name="Technician arrived - Email")
    roadside_arrived_sms = models.BooleanField(default=False, verbose_name="Technician arrived - SMS")
    roadside_completed_email = models.BooleanField(default=True, verbose_name="Service completed - Email")
    roadside_completed_sms = models.BooleanField(default=True, verbose_name="Service completed - SMS")
    
    # Timing preferences
    quiet_hours_enabled = models.BooleanField(default=False)
    quiet_hours_start = models.TimeField(null=True, blank=True, help_text="Start of quiet hours (no notifications)")
    quiet_hours_end = models.TimeField(null=True, blank=True, help_text="End of quiet hours")
    
    # Digest preferences
    digest_enabled = models.BooleanField(default=False)
    digest_frequency = models.CharField(
        max_length=20,
        choices=[
            ('daily', 'Daily'),
            ('weekly', 'Weekly'),
        ],
        default='daily',
        blank=True
    )
    
    # Contact information
    phone_number = models.CharField(max_length=20, blank=True, help_text="For SMS notifications")
    push_token = models.CharField(max_length=500, blank=True, help_text="Device push notification token")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name_plural = 'Notification preferences'
    
    def __str__(self):
        return f"Preferences for {self.user.email}"
    
    def should_send_notification(self, notification_type, channel):
        """
        Check if notification should be sent based on user preferences
        """
        # Check channel enabled
        channel_enabled = {
            'email': self.email_enabled,
            'sms': self.sms_enabled,
            'push': self.push_enabled,
            'in_app': self.in_app_enabled,
            'whatsapp_manual': self.whatsapp_manual_enabled,
            'whatsapp': self.whatsapp_enabled,
        }.get(channel, True)
        
        if not channel_enabled:
            return False
        
        # Check notification type enabled
        type_enabled = {
            'appointment': self.appointment_notifications,
            'work_order': self.work_order_notifications,
            'invoice': self.invoice_notifications,
            'payment': self.payment_notifications,
            'inspection': self.inspection_notifications,
            'inventory': self.inventory_notifications,
            'vehicle': self.vehicle_notifications,
            'system': self.system_notifications,
        }.get(notification_type, True)
        
        if not type_enabled:
            return False
        
        # Check quiet hours
        if self.quiet_hours_enabled and self.quiet_hours_start and self.quiet_hours_end:
            current_time = timezone.now().time()
            if self.quiet_hours_start <= current_time <= self.quiet_hours_end:
                return False
        
        return True


class WebPushSubscription(models.Model):
    """
    Web Push API subscription for sending push notifications
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='web_push_subscriptions'
    )
    
    endpoint = models.URLField(max_length=500, help_text="Push service endpoint URL")
    p256dh = models.CharField(max_length=200, help_text="User public key")
    auth = models.CharField(max_length=100, help_text="User auth secret")
    
    # Device information
    user_agent = models.TextField(blank=True)
    device_name = models.CharField(max_length=200, blank=True)
    
    # Status
    is_active = models.BooleanField(default=True)
    last_used = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['user', 'endpoint']
        indexes = [
            models.Index(fields=['user', 'is_active']),
        ]
    
    def __str__(self):
        return f"Push subscription for {self.user.email}"


class NotificationLog(models.Model):
    """
    Log of all notification attempts for auditing and debugging
    """
    notification = models.ForeignKey(
        Notification,
        on_delete=models.CASCADE,
        related_name='logs'
    )
    
    ACTION_CHOICES = [
        ('created', 'Created'),
        ('scheduled', 'Scheduled'),
        ('sent', 'Sent'),
        ('delivered', 'Delivered'),
        ('failed', 'Failed'),
        ('read', 'Read'),
        ('retried', 'Retried'),
        ('opened_link', 'Opened Link'),
    ]
    
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    details = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['notification', 'timestamp']),
        ]
    
    def __str__(self):
        return f"{self.get_action_display()} - {self.notification}"
