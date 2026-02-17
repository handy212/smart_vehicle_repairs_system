from django.db import models
from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType

class QBOConfig(models.Model):
    """
    Configuration for QuickBooks Online connection.
    Singleton model - only one active config expected.
    """
    client_id = models.CharField(max_length=255, help_text="QBO Client ID from App Settings")
    client_secret = models.CharField(max_length=255, help_text="QBO Client Secret")
    realm_id = models.CharField(max_length=50, blank=True, help_text="Company ID (filled after auth)")
    is_sandbox = models.BooleanField(default=True, help_text="Use Sandbox environment")
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        env = "Sandbox" if self.is_sandbox else "Production"
        return f"QBO Config ({env})"

    class Meta:
        verbose_name = "QuickBooks Configuration"
        verbose_name_plural = "QuickBooks Configuration"

    def save(self, *args, **kwargs):
        # Ensure only one active config exists
        if self.is_active:
            QBOConfig.objects.filter(is_active=True).exclude(pk=self.pk).update(is_active=False)
        super().save(*args, **kwargs)


class QBOToken(models.Model):
    """
    Stores OAuth2 tokens for QBO access.
    """
    config = models.OneToOneField(QBOConfig, on_delete=models.CASCADE, related_name='token')
    access_token = models.TextField()
    refresh_token = models.TextField()
    expires_at = models.DateTimeField(help_text="When the access token expires")
    refresh_token_expires_at = models.DateTimeField(help_text="When the refresh token expires")
    
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Token for {self.config}"


class QBOMapping(models.Model):
    """
    Maps local objects to QBO objects to track synchronization.
    """
    # Polymorphic link to local object (Customer, Invoice, etc.)
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey('content_type', 'object_id')
    
    qbo_id = models.CharField(max_length=50, help_text="ID in QuickBooks Online")
    qbo_sync_token = models.CharField(max_length=50, blank=True, help_text="Sync token for optimistic locking")
    last_synced_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('content_type', 'object_id')
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['qbo_id']),
        ]

    def __str__(self):
        return f"Mapping: {self.content_object} -> QBO {self.qbo_id}"
