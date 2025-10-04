from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from .models import NotificationTemplate, Notification, NotificationPreference, NotificationLog


@admin.register(NotificationTemplate)
class NotificationTemplateAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'template_type_badge',
        'channel_badge',
        'is_active_badge',
        'created_by',
        'created_at'
    ]
    list_filter = ['template_type', 'channel', 'is_active', 'created_at']
    search_fields = ['name', 'subject', 'body']
    readonly_fields = ['created_at', 'updated_at', 'created_by']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'template_type', 'channel', 'is_active')
        }),
        ('Email Template', {
            'fields': ('subject', 'body', 'html_body'),
            'classes': ('collapse',)
        }),
        ('SMS Template', {
            'fields': ('sms_body',),
            'classes': ('collapse',)
        }),
        ('Push Notification Template', {
            'fields': ('push_title', 'push_body'),
            'classes': ('collapse',)
        }),
        ('Variables', {
            'fields': ('variables',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def template_type_badge(self, obj):
        colors = {
            'appointment_reminder': '#4CAF50',
            'appointment_confirmation': '#2196F3',
            'appointment_cancelled': '#F44336',
            'work_order_created': '#9C27B0',
            'work_order_completed': '#00BCD4',
            'work_order_approved': '#4CAF50',
            'invoice_generated': '#FF9800',
            'invoice_due': '#FFC107',
            'invoice_overdue': '#F44336',
            'payment_received': '#4CAF50',
            'inspection_completed': '#3F51B5',
            'low_stock_alert': '#FF5722',
            'service_due': '#FF9800',
            'vehicle_ready': '#4CAF50',
            'parts_arrived': '#2196F3',
        }
        color = colors.get(obj.template_type, '#757575')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            obj.get_template_type_display()
        )
    template_type_badge.short_description = 'Template Type'
    
    def channel_badge(self, obj):
        icons = {
            'email': '📧',
            'sms': '💬',
            'push': '🔔',
            'in_app': '📱'
        }
        colors = {
            'email': '#2196F3',
            'sms': '#4CAF50',
            'push': '#FF9800',
            'in_app': '#9C27B0'
        }
        icon = icons.get(obj.channel, '📨')
        color = colors.get(obj.channel, '#757575')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px;">{} {}</span>',
            color,
            icon,
            obj.get_channel_display()
        )
    channel_badge.short_description = 'Channel'
    
    def is_active_badge(self, obj):
        if obj.is_active:
            return format_html(
                '<span style="color: #4CAF50; font-weight: bold;">✓ Active</span>'
            )
        return format_html(
            '<span style="color: #F44336; font-weight: bold;">✗ Inactive</span>'
        )
    is_active_badge.short_description = 'Status'
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = [
        'title',
        'recipient',
        'notification_type_badge',
        'channel_badge',
        'priority_badge',
        'status_badge',
        'is_read_badge',
        'created_at'
    ]
    list_filter = [
        'notification_type',
        'channel',
        'priority',
        'status',
        'is_read',
        'created_at'
    ]
    search_fields = ['title', 'message', 'recipient__email', 'recipient__first_name', 'recipient__last_name']
    readonly_fields = [
        'status', 'is_read', 'read_at', 'sent_at', 'delivered_at',
        'failed_at', 'created_at', 'updated_at'
    ]
    date_hierarchy = 'created_at'
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('recipient', 'notification_type', 'channel', 'priority')
        }),
        ('Content', {
            'fields': ('title', 'message', 'data')
        }),
        ('Status', {
            'fields': (
                'status', 'is_read', 'read_at', 'sent_at',
                'delivered_at', 'failed_at', 'error_message'
            )
        }),
        ('Related Object', {
            'fields': ('related_object_type', 'related_object_id'),
            'classes': ('collapse',)
        }),
        ('Template', {
            'fields': ('template',),
            'classes': ('collapse',)
        }),
        ('Scheduling', {
            'fields': ('scheduled_for', 'expires_at'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def notification_type_badge(self, obj):
        colors = {
            'appointment': '#4CAF50',
            'work_order': '#2196F3',
            'invoice': '#FF9800',
            'payment': '#9C27B0',
            'inspection': '#3F51B5',
            'inventory': '#FF5722',
            'vehicle': '#00BCD4',
            'system': '#607D8B',
        }
        color = colors.get(obj.notification_type, '#757575')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 8px; '
            'border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            obj.get_notification_type_display()
        )
    notification_type_badge.short_description = 'Type'
    
    def channel_badge(self, obj):
        icons = {
            'email': '📧',
            'sms': '💬',
            'push': '🔔',
            'in_app': '📱'
        }
        icon = icons.get(obj.channel, '📨')
        return format_html(
            '<span title="{}">{}</span>',
            obj.get_channel_display(),
            icon
        )
    channel_badge.short_description = 'Channel'
    
    def priority_badge(self, obj):
        colors = {
            'low': '#9E9E9E',
            'normal': '#2196F3',
            'high': '#FF9800',
            'urgent': '#F44336'
        }
        color = colors.get(obj.priority, '#757575')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_priority_display().upper()
        )
    priority_badge.short_description = 'Priority'
    
    def status_badge(self, obj):
        colors = {
            'pending': '#9E9E9E',
            'sent': '#2196F3',
            'delivered': '#4CAF50',
            'failed': '#F44336',
            'read': '#00BCD4'
        }
        icons = {
            'pending': '⏳',
            'sent': '📤',
            'delivered': '✓',
            'failed': '✗',
            'read': '✓✓'
        }
        color = colors.get(obj.status, '#757575')
        icon = icons.get(obj.status, '•')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{} {}</span>',
            color,
            icon,
            obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def is_read_badge(self, obj):
        if obj.is_read:
            return format_html(
                '<span style="color: #4CAF50;">👁 Read</span>'
            )
        return format_html(
            '<span style="color: #9E9E9E;">○ Unread</span>'
        )
    is_read_badge.short_description = 'Read'
    
    actions = ['mark_as_read', 'mark_as_sent', 'resend_failed']
    
    def mark_as_read(self, request, queryset):
        count = 0
        for notification in queryset:
            notification.mark_as_read()
            count += 1
        self.message_user(request, f'{count} notifications marked as read')
    mark_as_read.short_description = 'Mark selected as read'
    
    def mark_as_sent(self, request, queryset):
        count = 0
        for notification in queryset.filter(status='pending'):
            notification.mark_as_sent()
            count += 1
        self.message_user(request, f'{count} notifications marked as sent')
    mark_as_sent.short_description = 'Mark selected as sent'
    
    def resend_failed(self, request, queryset):
        from .services import NotificationService
        service = NotificationService()
        count = 0
        for notification in queryset.filter(status='failed'):
            notification.status = 'pending'
            notification.save()
            service.send_notification(notification)
            count += 1
        self.message_user(request, f'{count} failed notifications resent')
    resend_failed.short_description = 'Resend failed notifications'


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = [
        'user',
        'email_badge',
        'sms_badge',
        'push_badge',
        'in_app_badge',
        'quiet_hours_badge',
        'updated_at'
    ]
    list_filter = [
        'email_enabled',
        'sms_enabled',
        'push_enabled',
        'in_app_enabled',
        'quiet_hours_enabled',
        'digest_enabled'
    ]
    search_fields = ['user__email', 'user__first_name', 'user__last_name', 'phone_number']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('User', {
            'fields': ('user',)
        }),
        ('Channel Preferences', {
            'fields': ('email_enabled', 'sms_enabled', 'push_enabled', 'in_app_enabled')
        }),
        ('Notification Type Preferences', {
            'fields': (
                'appointment_notifications',
                'work_order_notifications',
                'invoice_notifications',
                'payment_notifications',
                'inspection_notifications',
                'inventory_notifications',
                'vehicle_notifications',
                'system_notifications'
            )
        }),
        ('Timing Preferences', {
            'fields': ('quiet_hours_enabled', 'quiet_hours_start', 'quiet_hours_end')
        }),
        ('Digest Preferences', {
            'fields': ('digest_enabled', 'digest_frequency')
        }),
        ('Contact Information', {
            'fields': ('phone_number', 'push_token')
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def email_badge(self, obj):
        return self._channel_badge(obj.email_enabled, '📧')
    email_badge.short_description = 'Email'
    
    def sms_badge(self, obj):
        return self._channel_badge(obj.sms_enabled, '💬')
    sms_badge.short_description = 'SMS'
    
    def push_badge(self, obj):
        return self._channel_badge(obj.push_enabled, '🔔')
    push_badge.short_description = 'Push'
    
    def in_app_badge(self, obj):
        return self._channel_badge(obj.in_app_enabled, '📱')
    in_app_badge.short_description = 'In-App'
    
    def quiet_hours_badge(self, obj):
        if obj.quiet_hours_enabled:
            return format_html(
                '<span style="color: #FF9800;">🌙 {}-{}</span>',
                obj.quiet_hours_start.strftime('%H:%M') if obj.quiet_hours_start else '',
                obj.quiet_hours_end.strftime('%H:%M') if obj.quiet_hours_end else ''
            )
        return format_html('<span style="color: #9E9E9E;">—</span>')
    quiet_hours_badge.short_description = 'Quiet Hours'
    
    def _channel_badge(self, enabled, icon):
        if enabled:
            return format_html(
                '<span style="color: #4CAF50; font-size: 16px;">{}</span>',
                icon
            )
        return format_html(
            '<span style="color: #9E9E9E; font-size: 16px; opacity: 0.3;">{}</span>',
            icon
        )


@admin.register(NotificationLog)
class NotificationLogAdmin(admin.ModelAdmin):
    list_display = [
        'notification',
        'action_badge',
        'details_short',
        'timestamp'
    ]
    list_filter = ['action', 'timestamp']
    search_fields = ['notification__title', 'details']
    readonly_fields = ['notification', 'action', 'details', 'metadata', 'timestamp']
    date_hierarchy = 'timestamp'
    
    def has_add_permission(self, request):
        return False
    
    def has_change_permission(self, request, obj=None):
        return False
    
    def action_badge(self, obj):
        colors = {
            'created': '#2196F3',
            'scheduled': '#FF9800',
            'sent': '#4CAF50',
            'delivered': '#00BCD4',
            'failed': '#F44336',
            'read': '#9C27B0',
            'retried': '#FFC107'
        }
        color = colors.get(obj.action, '#757575')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 8px; '
            'border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            obj.get_action_display()
        )
    action_badge.short_description = 'Action'
    
    def details_short(self, obj):
        if len(obj.details) > 50:
            return obj.details[:50] + '...'
        return obj.details
    details_short.short_description = 'Details'
