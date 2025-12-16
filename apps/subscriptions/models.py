"""
Subscription models for managing customer subscription packages
"""
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from decimal import Decimal
import json

# Valid feature keys for packages
VALID_FEATURE_KEYS = {
    'kilometers',
    'call_out_charges',
    'towing_services',
    'roadside_assistance',
    'free_inspections',
    'discount_percentage',
}


class Package(models.Model):
    """
    Subscription package definition (template)
    Examples: Lite Package, Premium Package, etc.
    """
    
    name = models.CharField(
        _('package name'),
        max_length=200,
        unique=True,
        help_text="Package name (e.g., 'Lite Package', 'Premium Package')"
    )
    code = models.CharField(
        _('package code'),
        max_length=50,
        unique=True,
        help_text="Short code for the package (e.g., 'LITE', 'PREMIUM')"
    )
    description = models.TextField(
        _('description'),
        blank=True,
        help_text="Detailed description of the package"
    )
    price = models.DecimalField(
        _('price'),
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        help_text="Package price"
    )
    duration_months = models.IntegerField(
        _('duration in months'),
        default=12,
        validators=[MinValueValidator(1)],
        help_text="Subscription duration in months (default: 12 for 1 year)"
    )
    is_active = models.BooleanField(
        _('active'),
        default=True,
        help_text="Whether this package is available for purchase"
    )
    features = models.JSONField(
        _('features'),
        default=dict,
        help_text="Package features/inclusions as JSON. Example: {'kilometers': 100, 'call_out_charges': 2, 'towing_services': 2}"
    )
    metadata = models.JSONField(
        _('metadata'),
        default=dict,
        blank=True,
        help_text="Additional package metadata"
    )
    
    # Timestamps
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='packages_created',
        limit_choices_to={'role__in': ['admin']}
    )
    
    class Meta:
        ordering = ['name']
        verbose_name = _('package')
        verbose_name_plural = _('packages')
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['is_active']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.code})"
    
    def save(self, *args, **kwargs):
        # Convert code to uppercase
        if self.code:
            self.code = self.code.upper()
        
        # Validate and normalize features
        if self.features:
            normalized_features = {}
            for key, value in self.features.items():
                # Normalize key (lowercase, replace spaces with underscores)
                normalized_key = key.lower().replace(' ', '_').replace('-', '_')
                if normalized_key in VALID_FEATURE_KEYS:
                    normalized_features[normalized_key] = value
            self.features = normalized_features
        
        super().save(*args, **kwargs)
    
    @property
    def feature_kilometers(self):
        """Get kilometers allowance from features"""
        return self.features.get('kilometers', 0)
    
    @property
    def feature_call_out_charges(self):
        """Get call out charges allowance from features"""
        return self.features.get('call_out_charges', 0)
    
    @property
    def feature_towing_services(self):
        """Get towing services allowance from features"""
        return self.features.get('towing_services', 0)


class Subscription(models.Model):
    """
    Customer subscription to a package
    """
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
        ('suspended', 'Suspended'),
    ]
    
    PAYMENT_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('failed', 'Failed'),
        ('refunded', 'Refunded'),
    ]
    
    # Auto-generated subscription number
    subscription_number = models.CharField(
        _('subscription number'),
        max_length=50,
        unique=True,
        editable=False,
        help_text="Auto-generated subscription ID"
    )
    
    # References
    customer = models.ForeignKey(
        'customers.Customer',
        on_delete=models.CASCADE,
        related_name='subscriptions',
        help_text="Customer who owns this subscription"
    )
    package = models.ForeignKey(
        Package,
        on_delete=models.PROTECT,
        related_name='subscriptions',
        help_text="Package type"
    )
    
    # Dates
    start_date = models.DateField(
        _('start date'),
        help_text="Subscription start date"
    )
    end_date = models.DateField(
        _('end date'),
        help_text="Subscription end date"
    )
    
    # Status
    status = models.CharField(
        _('status'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='active',
        db_index=True,
        help_text="Current subscription status"
    )
    
    # Renewal
    auto_renew = models.BooleanField(
        _('auto renew'),
        default=False,
        help_text="Whether to automatically renew this subscription"
    )
    
    # Pricing
    purchase_price = models.DecimalField(
        _('purchase price'),
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        help_text="Price at time of purchase (for historical tracking)"
    )
    
    # Payment
    payment_status = models.CharField(
        _('payment status'),
        max_length=20,
        choices=PAYMENT_STATUS_CHOICES,
        default='pending',
        help_text="Payment status for this subscription"
    )
    
    # Cancellation
    cancelled_at = models.DateTimeField(
        _('cancelled at'),
        null=True,
        blank=True,
        help_text="When subscription was cancelled"
    )
    cancellation_reason = models.TextField(
        _('cancellation reason'),
        blank=True,
        help_text="Reason for cancellation"
    )
    
    # Metadata
    metadata = models.JSONField(
        _('metadata'),
        default=dict,
        blank=True,
        help_text="Additional subscription metadata (e.g., invoice_id)"
    )
    
    # Timestamps
    purchased_at = models.DateTimeField(
        _('purchased at'),
        auto_now_add=True,
        help_text="When subscription was purchased"
    )
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = _('subscription')
        verbose_name_plural = _('subscriptions')
        indexes = [
            models.Index(fields=['subscription_number']),
            models.Index(fields=['customer', 'status']),
            models.Index(fields=['status', 'end_date']),
        ]
    
    def __str__(self):
        return f"{self.subscription_number} - {self.customer.customer_number} - {self.package.name}"
    
    def save(self, *args, **kwargs):
        # Auto-generate subscription number if not set
        if not self.subscription_number:
            last_subscription = Subscription.objects.order_by('-id').first()
            if last_subscription and last_subscription.subscription_number.startswith('SUB'):
                try:
                    # Handle format: SUB-00001
                    number_part = last_subscription.subscription_number.replace('SUB-', '').replace('SUB', '')
                    last_number = int(number_part)
                    self.subscription_number = f"SUB-{last_number + 1:05d}"
                except ValueError:
                    next_id = Subscription.objects.count() + 1
                    self.subscription_number = f"SUB-{next_id:05d}"
            else:
                self.subscription_number = "SUB-00001"
        
        # Calculate end_date if not set and start_date is provided
        if self.start_date and not self.end_date and self.package:
            # Calculate end date by adding months
            year = self.start_date.year
            month = self.start_date.month + self.package.duration_months
            day = self.start_date.day
            
            # Handle year overflow
            while month > 12:
                month -= 12
                year += 1
            
            # Handle day overflow (e.g., Feb 30 -> Feb 28/29)
            import calendar
            max_day = calendar.monthrange(year, month)[1]
            if day > max_day:
                day = max_day
            
            from datetime import date
            self.end_date = date(year, month, day)
        
        super().save(*args, **kwargs)
    
    def is_active(self):
        """Check if subscription is currently active"""
        if self.status != 'active':
            return False
        today = timezone.now().date()
        return self.start_date <= today <= self.end_date
    
    def is_expired(self):
        """Check if subscription has expired"""
        if self.status == 'expired':
            return True
        today = timezone.now().date()
        if today > self.end_date and self.status == 'active':
            # Auto-update status to expired
            self.status = 'expired'
            self.save(update_fields=['status'])
            return True
        return False
    
    def days_remaining(self):
        """Calculate days until expiration"""
        if self.is_expired():
            return 0
        today = timezone.now().date()
        delta = self.end_date - today
        return max(0, delta.days)
    
    def renew(self, months=None):
        """Renew the subscription for another period"""
        if months is None:
            months = self.package.duration_months
        
        from datetime import timedelta, date
        import calendar
        
        # Start from day after current end date
        self.start_date = self.end_date + timedelta(days=1)
        
        # Calculate new end date
        year = self.start_date.year
        month = self.start_date.month + months
        day = self.start_date.day
        
        # Handle year overflow
        while month > 12:
            month -= 12
            year += 1
        
        # Handle day overflow
        max_day = calendar.monthrange(year, month)[1]
        if day > max_day:
            day = max_day
        
        self.end_date = date(year, month, day)
        self.status = 'active'
        self.payment_status = 'pending'  # Will need new payment
        self.save()
        return self
    
    def cancel(self, reason=''):
        """Cancel the subscription"""
        self.status = 'cancelled'
        self.cancelled_at = timezone.now()
        self.cancellation_reason = reason
        self.auto_renew = False
        self.save()
        return self
    
    def get_remaining_allowance(self, feature_type):
        """Get remaining allowance for a specific feature type"""
        if not self.is_active() or self.is_expired():
            return 0
        
        # Get initial allowance from package
        initial_allowance = self.package.features.get(feature_type, 0)
        if initial_allowance == 0:
            return 0
        
        # Calculate total used
        total_used = self.usage_records.filter(
            usage_type=feature_type
        ).aggregate(
            total=models.Sum('quantity_used')
        )['total'] or 0
        
        # Return remaining
        remaining = initial_allowance - total_used
        return max(0, remaining)
    
    def get_all_remaining_allowances(self):
        """Get all remaining allowances as a dictionary"""
        allowances = {}
        for feature_type in self.package.features.keys():
            if isinstance(self.package.features[feature_type], (int, float)):
                allowances[feature_type] = self.get_remaining_allowance(feature_type)
        return allowances


class SubscriptionUsage(models.Model):
    """
    Tracks usage/consumption of subscription benefits
    """
    
    USAGE_TYPE_CHOICES = [
        ('kilometer', 'Kilometer'),
        ('call_out', 'Call Out'),
        ('towing', 'Towing Service'),
        ('inspection', 'Inspection'),
        ('roadside_assistance', 'Roadside Assistance'),
        ('other', 'Other'),
    ]
    
    REFERENCE_TYPE_CHOICES = [
        ('workorder', 'Work Order'),
        ('appointment', 'Appointment'),
        ('inspection', 'Inspection'),
        ('other', 'Other'),
    ]
    
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.CASCADE,
        related_name='usage_records',
        help_text="Related subscription"
    )
    usage_type = models.CharField(
        _('usage type'),
        max_length=50,
        choices=USAGE_TYPE_CHOICES,
        help_text="Type of usage/consumption"
    )
    quantity_used = models.DecimalField(
        _('quantity used'),
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        help_text="Amount/quantity consumed"
    )
    service_date = models.DateField(
        _('service date'),
        default=timezone.now,
        help_text="Date when service was used"
    )
    reference_type = models.CharField(
        _('reference type'),
        max_length=50,
        choices=REFERENCE_TYPE_CHOICES,
        null=True,
        blank=True,
        help_text="Type of related object"
    )
    reference_id = models.IntegerField(
        _('reference id'),
        null=True,
        blank=True,
        help_text="ID of related object (e.g., WorkOrder ID)"
    )
    description = models.TextField(
        _('description'),
        blank=True,
        help_text="Description of the usage"
    )
    
    # Timestamps
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='subscription_usage_created',
        help_text="User who recorded the usage"
    )
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = _('subscription usage')
        verbose_name_plural = _('subscription usages')
        indexes = [
            models.Index(fields=['subscription', 'usage_type']),
            models.Index(fields=['service_date']),
            models.Index(fields=['reference_type', 'reference_id']),
        ]
    
    def __str__(self):
        return f"{self.subscription.subscription_number} - {self.usage_type} - {self.quantity_used}"

