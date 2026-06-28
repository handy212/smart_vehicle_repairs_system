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
    
    STATUS_CHOICES = [
        ('synced', 'Synced Successfully'),
        ('failed', 'Sync Failed'),
        ('pending', 'Pending Sync'),
    ]
    
    qbo_id = models.CharField(max_length=50, blank=True, help_text="ID in QuickBooks Online")
    qbo_sync_token = models.CharField(max_length=50, blank=True, help_text="Sync token for optimistic locking")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    error_message = models.TextField(blank=True, null=True, help_text="Last synchronization error")
    last_synced_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('content_type', 'object_id')
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['qbo_id']),
        ]

    def __str__(self):
        return f"Mapping: {self.content_object} -> QBO {self.qbo_id}"


class QBOSyncLog(models.Model):
    """
    Records each inbound synchronization run (pull from QBO) and its outcome.
    """
    ENTITY_TYPES = [
        ('vendor', 'Vendors (Suppliers)'),
        ('invoice', 'Invoices'),
        ('bill', 'Bills (Purchase Orders)'),
        ('purchase_order', 'Purchase Orders (Outbound)'),
        ('estimate', 'Estimates'),
        ('credit_memo', 'Credit Memos'),
        ('vendor_credit', 'Vendor Credits'),
        ('vendor_bill', 'Vendor Bills (AP)'),
        ('payment', 'Customer Payments'),
        ('bill_payment', 'Vendor Bill Payments'),
        ('customer', 'Customers'),
        ('item', 'Items (Parts catalog)'),
        ('all', 'Full Inbound Sync'),
    ]

    DIRECTION_CHOICES = [
        ('inbound', 'Inbound (QBO → SVR)'),
        ('outbound', 'Outbound (SVR → QBO)'),
    ]

    STATUS_CHOICES = [
        ('running', 'Running'),
        ('success', 'Success'),
        ('failed', 'Failed'),
    ]

    entity_type = models.CharField(max_length=20, choices=ENTITY_TYPES)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES, default='inbound')
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    records_pulled = models.IntegerField(default=0, help_text="Total records fetched from QBO")
    records_created = models.IntegerField(default=0, help_text="New records created locally")
    records_updated = models.IntegerField(default=0, help_text="Existing records updated locally")
    records_skipped = models.IntegerField(default=0, help_text="Records skipped (no local match found)")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='running')
    error_message = models.TextField(blank=True)
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="User who manually triggered this sync (null = scheduled)"
    )

    class Meta:
        ordering = ['-started_at']
        verbose_name = "QBO Sync Log"
        verbose_name_plural = "QBO Sync Logs"

    def __str__(self):
        return f"{self.get_entity_type_display()} sync @ {self.started_at:%Y-%m-%d %H:%M} [{self.status}]"


class QBOAccountMapping(models.Model):
    """
    Maps SVR accounting roles (control accounts, payment methods, line types)
    to QuickBooks chart-of-accounts entries or service/inventory items.
    """

    MAPPING_KIND_CHOICES = [
        ('control_account', 'Control Account'),
        ('invoice_line_type', 'Invoice Line Type'),
        ('payment_method', 'Customer Payment Method'),
        ('vendor_payment_method', 'Vendor Payment Method'),
        ('bill_line_kind', 'Bill Line Kind'),
        ('svr_account', 'SVR GL Account'),
        ('tax_code', 'Tax Code'),
        ('income_class', 'Income Class'),
        ('revenue_product_class', 'Revenue Product Class'),
        ('expense_class', 'Expense Class'),
    ]

    STATUS_CHOICES = [
        ('synced', 'Mapped'),
        ('failed', 'Failed'),
        ('pending', 'Pending'),
    ]

    mapping_kind = models.CharField(max_length=32, choices=MAPPING_KIND_CHOICES)
    mapping_key = models.CharField(max_length=64, help_text="Role key, e.g. sales_revenue_account or cash")

    qbo_account_id = models.CharField(max_length=50, blank=True)
    qbo_account_name = models.CharField(max_length=255, blank=True)
    qbo_account_number = models.CharField(
        max_length=64,
        blank=True,
        help_text='QuickBooks chart account number (AcctNum) when mapped.',
    )
    qbo_account_type = models.CharField(max_length=64, blank=True)

    qbo_item_id = models.CharField(max_length=50, blank=True)
    qbo_item_name = models.CharField(max_length=255, blank=True)

    qbo_class_id = models.CharField(max_length=50, blank=True)
    qbo_class_name = models.CharField(max_length=255, blank=True)

    svr_account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='qbo_account_mappings',
        help_text='Optional SVR GL account this row mirrors (bank/cash accounts).',
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='synced')
    error_message = models.TextField(blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='qbo_account_mappings_updated',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('mapping_kind', 'mapping_key')
        indexes = [
            models.Index(fields=['mapping_kind', 'mapping_key']),
            models.Index(fields=['qbo_account_id']),
            models.Index(fields=['qbo_item_id']),
            models.Index(fields=['qbo_class_id']),
        ]
        verbose_name = 'QBO Account Mapping'
        verbose_name_plural = 'QBO Account Mappings'

    def __str__(self):
        target = self.qbo_class_id or self.qbo_item_id or self.qbo_account_id or 'unmapped'
        return f'{self.mapping_kind}:{self.mapping_key} -> {target}'
