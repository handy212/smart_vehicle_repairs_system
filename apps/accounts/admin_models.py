"""
Admin and Settings Models for Smart Vehicle Repairs System
"""
from django.db import models
from django.contrib.auth import get_user_model
from django.utils.translation import gettext_lazy as _
from django.core.exceptions import ValidationError
import json

User = get_user_model()


class SystemSettings(models.Model):
    """
    System-wide configuration settings
    """
    CATEGORY_CHOICES = (
        ('company', 'Company Info'),
        ('branding', 'Branding & Theme'),
        ('email', 'Email Settings'),
        ('sms', 'SMS Settings'),
        ('payment', 'Payment & Billing'),
        ('notification', 'Notifications'),
        ('security', 'Security'),
        ('business', 'Business Settings'),
        ('integration', 'Integrations'),
        ('maintenance', 'Maintenance'),
        ('tax', 'Tax & Compliance'),
    )
    
    category = models.CharField(_('category'), max_length=50, choices=CATEGORY_CHOICES)
    key = models.CharField(_('setting key'), max_length=100, unique=True)
    value = models.TextField(_('value'), blank=True)
    description = models.TextField(_('description'), blank=True)
    is_secret = models.BooleanField(_('is secret'), default=False, help_text='Mask value in UI')
    is_active = models.BooleanField(_('is active'), default=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='updated_settings')
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)
    
    class Meta:
        verbose_name = _('system setting')
        verbose_name_plural = _('system settings')
        ordering = ['category', 'key']
    
    def __str__(self):
        return f"{self.category} - {self.key}"
    
    @property
    def display_name(self):
        """Convert key to human-readable display name"""
        return self.key.replace('_', ' ').title()

    TAX_SETTING_DEFAULTS = [
        ('tax_enabled', 'true', 'Enable Ghana tax computation for invoices and estimates'),
        ('tax_regime', 'ghana_standard', 'Tax regime identifier (e.g., ghana_standard)'),
        ('tax_vat_rate', '15.0', 'Value Added Tax percentage applied on taxable supply plus levies'),
        ('tax_nhil_rate', '2.5', 'National Health Insurance Levy percentage applied on taxable supply'),
        ('tax_getfund_rate', '2.5', 'GETFund levy percentage applied on taxable supply'),
        ('tax_covid_rate', '1.0', 'COVID-19 Health Recovery Levy percentage applied on taxable supply'),
    ]
    
    @classmethod
    def get_setting(cls, key, default=None):
        """Get setting value by key"""
        try:
            setting = cls.objects.get(key=key, is_active=True)
            return setting.value
        except cls.DoesNotExist:
            return default
    
    @classmethod
    def set_setting(cls, key, value, category='general', description='', user=None):
        """Set or update a setting"""
        from .settings_utils import clear_setting_cache
        setting, created = cls.objects.update_or_create(
            key=key,
            defaults={
                'value': value,
                'category': category,
                'description': description,
                'updated_by': user
            }
        )
        # Clear cache for this specific setting
        clear_setting_cache(key)
        return setting
    
    def save(self, *args, **kwargs):
        """Override save to clear cache when settings are updated"""
        from .settings_utils import clear_setting_cache
        # Get the old key before saving (in case key changed)
        old_key = None
        if self.pk:
            try:
                old_setting = SystemSettings.objects.get(pk=self.pk)
                old_key = old_setting.key
            except SystemSettings.DoesNotExist:
                pass
        
        super().save(*args, **kwargs)
        
        # Clear cache for both old and new keys
        if old_key and old_key != self.key:
            clear_setting_cache(old_key)
        clear_setting_cache(self.key)

    @classmethod
    def ensure_tax_settings(cls):
        """Ensure Tax & Compliance settings exist so UI is never empty."""
        for key, value, description in cls.TAX_SETTING_DEFAULTS:
            cls.objects.get_or_create(
                key=key,
                defaults={
                    'category': 'tax',
                    'value': value,
                    'description': description,
                    'is_secret': False,
                    'is_active': True,
                }
            )


class AuditLog(models.Model):
    """
    Audit logging for system actions
    """
    ACTION_CHOICES = (
        ('create', 'Create'),
        ('update', 'Update'),
        ('delete', 'Delete'),
        ('login', 'Login'),
        ('logout', 'Logout'),
        ('view', 'View'),
        ('export', 'Export'),
        ('import', 'Import'),
        ('settings_change', 'Settings Change'),
        ('role_change', 'Role Change'),
        ('permission_change', 'Permission Change'),
    )
    
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='audit_logs')
    action = models.CharField(_('action'), max_length=50, choices=ACTION_CHOICES)
    model_name = models.CharField(_('model name'), max_length=100, blank=True)
    object_id = models.CharField(_('object ID'), max_length=100, blank=True)
    object_repr = models.CharField(_('object representation'), max_length=200, blank=True)
    changes = models.JSONField(_('changes'), default=dict, blank=True)
    ip_address = models.GenericIPAddressField(_('IP address'), null=True, blank=True)
    user_agent = models.TextField(_('user agent'), blank=True)
    timestamp = models.DateTimeField(_('timestamp'), auto_now_add=True, db_index=True)
    
    class Meta:
        verbose_name = _('audit log')
        verbose_name_plural = _('audit logs')
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['-timestamp', 'user']),
            models.Index(fields=['action', '-timestamp']),
        ]
    
    def __str__(self):
        return f"{self.user} - {self.action} - {self.timestamp}"
    
    def get_changes_display(self):
        """Format changes for display"""
        if not self.changes:
            return "No changes"
        return json.dumps(self.changes, indent=2)


class SystemBackup(models.Model):
    """
    System backup records
    """
    BACKUP_TYPE_CHOICES = (
        ('full', 'Full Backup'),
        ('database', 'Database Only'),
        ('media', 'Media Files Only'),
    )
    
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    )
    
    backup_type = models.CharField(_('backup type'), max_length=20, choices=BACKUP_TYPE_CHOICES)
    status = models.CharField(_('status'), max_length=20, choices=STATUS_CHOICES, default='pending')
    file_path = models.CharField(_('file path'), max_length=500, blank=True)
    file_size = models.BigIntegerField(_('file size (bytes)'), null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_backups')
    notes = models.TextField(_('notes'), blank=True)
    error_message = models.TextField(_('error message'), blank=True)
    started_at = models.DateTimeField(_('started at'), auto_now_add=True)
    completed_at = models.DateTimeField(_('completed at'), null=True, blank=True)
    
    class Meta:
        verbose_name = _('system backup')
        verbose_name_plural = _('system backups')
        ordering = ['-started_at']
    
    def __str__(self):
        return f"{self.backup_type} - {self.started_at.strftime('%Y-%m-%d %H:%M')}"
    
    def get_file_size_display(self):
        """Format file size for display"""
        if not self.file_size:
            return "N/A"
        
        # Convert bytes to human-readable format
        size = self.file_size
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size < 1024.0:
                return f"{size:.2f} {unit}"
            size /= 1024.0
        return f"{size:.2f} PB"


class EmailTemplate(models.Model):
    """
    Email templates for system notifications
    """
    TEMPLATE_TYPE_CHOICES = (
        ('appointment_confirmation', 'Appointment Confirmation'),
        ('appointment_reminder', 'Appointment Reminder'),
        ('invoice_ready', 'Invoice Ready'),
        ('payment_received', 'Payment Received'),
        ('vehicle_ready', 'Vehicle Ready for Pickup'),
        ('workorder_status', 'Work Order Status Update'),
        ('welcome', 'Welcome Email'),
        ('password_reset', 'Password Reset'),
        ('custom', 'Custom'),
    )
    
    name = models.CharField(_('template name'), max_length=100, unique=True)
    template_type = models.CharField(_('template type'), max_length=50, choices=TEMPLATE_TYPE_CHOICES)
    subject = models.CharField(_('subject'), max_length=200)
    body_html = models.TextField(_('HTML body'))
    body_text = models.TextField(_('text body'), blank=True, help_text='Plain text fallback')
    variables = models.JSONField(_('available variables'), default=list, blank=True,
                                  help_text='List of variables that can be used in template')
    is_active = models.BooleanField(_('is active'), default=True)
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    
    class Meta:
        verbose_name = _('email template')
        verbose_name_plural = _('email templates')
        ordering = ['template_type', 'name']
    
    def __str__(self):
        return self.name


class SMSTemplate(models.Model):
    """
    SMS templates for notifications
    """
    TEMPLATE_TYPE_CHOICES = (
        ('appointment_reminder', 'Appointment Reminder'),
        ('vehicle_ready', 'Vehicle Ready'),
        ('payment_reminder', 'Payment Reminder'),
        ('custom', 'Custom'),
    )
    
    name = models.CharField(_('template name'), max_length=100, unique=True)
    template_type = models.CharField(_('template type'), max_length=50, choices=TEMPLATE_TYPE_CHOICES)
    message = models.TextField(_('message'), max_length=160, help_text='Maximum 160 characters')
    variables = models.JSONField(_('available variables'), default=list, blank=True)
    is_active = models.BooleanField(_('is active'), default=True)
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)
    
    class Meta:
        verbose_name = _('SMS template')
        verbose_name_plural = _('SMS templates')
        ordering = ['template_type', 'name']
    
    def __str__(self):
        return self.name
    
    def clean(self):
        if len(self.message) > 160:
            raise ValidationError({'message': 'SMS message cannot exceed 160 characters'})
