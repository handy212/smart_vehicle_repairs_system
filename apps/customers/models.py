"""
Customer models for managing customer information and relationships
"""
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils.translation import gettext_lazy as _


class Customer(models.Model):
    """
    Customer model - extends User model for customer-specific information
    Links to User with role='customer'
    """
    
    CUSTOMER_TYPE_CHOICES = [
        ('individual', 'Individual'),
        ('business', 'Business'),
        ('fleet', 'Fleet'),
    ]
    
    PAYMENT_TERMS_CHOICES = [
        ('due_on_receipt', 'Due on Receipt'),
        ('net_15', 'Net 15'),
        ('net_30', 'Net 30'),
        ('net_60', 'Net 60'),
        ('prepaid', 'Prepaid'),
    ]
    
    CONTACT_METHOD_CHOICES = [
        ('email', 'Email'),
        ('phone', 'Phone'),
        ('sms', 'SMS'),
        ('mail', 'Mail'),
    ]
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('suspended', 'Suspended'),
    ]
    
    # Link to User model
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='customer_profile',
        limit_choices_to={'role': 'customer'},
        help_text="Link to user account with customer role"
    )
    
    # Django Ledger Customer reference (for AR tracking)
    ledger_customer = models.OneToOneField(
        'django_ledger.CustomerModel',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='repair_customer',
        help_text="Django Ledger Customer for AR tracking and aging reports"
    )
    
    # Customer identification
    customer_number = models.CharField(
        max_length=20,
        unique=True,
        db_index=True,
        help_text="Unique customer identification number"
    )
    
    # Business information (for business/fleet customers)
    company_name = models.CharField(
        max_length=255,
        blank=True,
        help_text="Company name for business customers"
    )
    business_type = models.CharField(
        max_length=100,
        blank=True,
        help_text="Type of business (e.g., Construction, Delivery, etc.)"
    )
    tax_id = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Tax ID / EIN",
        help_text="Tax identification number or EIN"
    )
    
    # Customer classification
    customer_type = models.CharField(
        max_length=20,
        choices=CUSTOMER_TYPE_CHOICES,
        default='individual',
        help_text="Type of customer account"
    )
    
    # Service address (can be different from billing address)
    service_address = models.TextField(
        blank=True,
        help_text="Primary service/pickup address"
    )
    service_city = models.CharField(max_length=100, blank=True)
    service_state = models.CharField(max_length=50, blank=True)
    service_zip_code = models.CharField(max_length=20, blank=True)
    
    # Billing address (inherited from User model, but can override)
    billing_address = models.TextField(
        blank=True,
        help_text="Billing address if different from service address"
    )
    billing_city = models.CharField(max_length=100, blank=True)
    billing_state = models.CharField(max_length=50, blank=True)
    billing_zip_code = models.CharField(max_length=20, blank=True)
    
    # Financial information
    payment_terms = models.CharField(
        max_length=20,
        choices=PAYMENT_TERMS_CHOICES,
        default='due_on_receipt',
        help_text="Default payment terms for this customer"
    )
    credit_limit = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        validators=[MinValueValidator(0)],
        help_text="Maximum credit allowed for this customer"
    )
    current_balance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        help_text="Current outstanding balance"
    )
    
    # Contact preferences
    preferred_contact_method = models.CharField(
        max_length=20,
        choices=CONTACT_METHOD_CHOICES,
        default='email',
        help_text="Preferred method of contact"
    )
    
    # Customer status and ratings
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active',
        db_index=True,
        help_text="Current customer status"
    )
    
    # Loyalty and engagement
    customer_since = models.DateField(
        auto_now_add=True,
        help_text="Date customer was created"
    )
    loyalty_points = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Accumulated loyalty points"
    )
    loyalty_tier = models.CharField(
        max_length=20,
        blank=True,
        help_text="Loyalty program tier (e.g., Silver, Gold, Platinum)"
    )
    
    # Emergency contact
    emergency_contact_name = models.CharField(max_length=255, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)
    emergency_contact_relationship = models.CharField(max_length=50, blank=True)
    
    # Insurance information
    insurance_provider = models.CharField(
        max_length=255,
        blank=True,
        help_text="Primary insurance provider"
    )
    insurance_policy_number = models.CharField(max_length=100, blank=True)
    insurance_phone = models.CharField(max_length=20, blank=True)
    
    # Additional information
    notes = models.TextField(
        blank=True,
        help_text="Internal notes about this customer"
    )
    tags = models.CharField(
        max_length=255,
        blank=True,
        help_text="Comma-separated tags for categorization"
    )
    
    # Referral tracking
    referred_by = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='referrals',
        help_text="Customer who referred this customer"
    )
    
    # Marketing preferences
    marketing_emails = models.BooleanField(
        default=True,
        help_text="Opt-in for marketing emails"
    )
    marketing_sms = models.BooleanField(
        default=False,
        help_text="Opt-in for marketing SMS"
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Customer'
        verbose_name_plural = 'Customers'
        indexes = [
            models.Index(fields=['customer_number']),
            models.Index(fields=['status', 'customer_type']),
            models.Index(fields=['company_name']),
        ]
    
    def __str__(self):
        if self.company_name:
            return f"{self.customer_number} - {self.company_name}"
        return f"{self.customer_number} - {self.user.get_full_name()}"
    
    def save(self, *args, **kwargs):
        # Auto-generate customer number if not set
        if not self.customer_number:
            last_customer = Customer.objects.order_by('-id').first()
            if last_customer and last_customer.customer_number.startswith('CUST'):
                try:
                    # Handle both formats: CUST-00006 and CUST000001
                    number_part = last_customer.customer_number.replace('CUST-', '').replace('CUST', '')
                    last_number = int(number_part)
                    self.customer_number = f"CUST-{last_number + 1:05d}"
                except ValueError:
                    # Fallback to ID-based numbering
                    next_id = Customer.objects.count() + 1
                    self.customer_number = f"CUST-{next_id:05d}"
            else:
                self.customer_number = "CUST-00001"
        super().save(*args, **kwargs)
    
    @property
    def full_name(self):
        """Get customer full name"""
        return self.user.get_full_name() or self.user.username
    
    @property
    def email(self):
        """Get customer email"""
        return self.user.email
    
    @property
    def phone(self):
        """Get customer phone"""
        return self.user.phone
    
    @property
    def available_credit(self):
        """Calculate available credit"""
        return self.credit_limit - self.current_balance
    
    @property
    def vehicle_count(self):
        """Count of vehicles owned by this customer"""
        return self.vehicles.count()
    
    @property
    def is_fleet_customer(self):
        """Check if customer is fleet type"""
        return self.customer_type == 'fleet'


class CustomerNote(models.Model):
    """
    Notes and communications log for customers
    """
    
    NOTE_TYPE_CHOICES = [
        ('general', 'General Note'),
        ('phone_call', 'Phone Call'),
        ('email', 'Email'),
        ('meeting', 'Meeting'),
        ('complaint', 'Complaint'),
        ('compliment', 'Compliment'),
    ]
    
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='customer_notes'  # Changed back to customer_notes to avoid conflict with notes field
    )
    note_type = models.CharField(
        max_length=20,
        choices=NOTE_TYPE_CHOICES,
        default='general'
    )
    note = models.TextField(help_text="Note content", blank=True, default='')  # Made nullable with default
    subject = models.CharField(max_length=255, blank=True)  # Made optional
    content = models.TextField(blank=True, default='')  # Made optional for backward compatibility
    is_important = models.BooleanField(
        default=False,
        help_text="Flag for important notes"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='customer_notes_created'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Customer Note'
        verbose_name_plural = 'Customer Notes'
    
    def __str__(self):
        return f"{self.customer.customer_number} - {self.subject or 'Note'}"
    
    def save(self, *args, **kwargs):
        # If note field is used, copy to content for backward compatibility
        if self.note and not self.content:
            self.content = self.note
        if self.content and not self.note:
            self.note = self.content
        super().save(*args, **kwargs)




