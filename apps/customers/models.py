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
    
    DEFAULT_PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('momo', 'MoMo'),
        ('card', 'Card'),
        ('bank_transfer', 'Bank Transfer'),
        ('check', 'Check'),
    ]
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('suspended', 'Suspended'),
        ('blacklisted', 'Blacklisted'),
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
    # ledger_customer = models.OneToOneField(
    #     'django_ledger.CustomerModel',
    #     on_delete=models.SET_NULL,
    #     null=True,
    #     blank=True,
    #     related_name='repair_customer',
    #     help_text="Django Ledger Customer for AR tracking and aging reports"
    # )
    
    # Customer identification
    customer_number = models.CharField(
        max_length=20,
        unique=True,
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
    contact_person_name = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Primary contact person at the company"
    )
    company_email = models.EmailField(
        blank=True,
        null=True,
        help_text="General contact email for the company"
    )
    company_phone = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="General contact phone for the company"
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
        null=True,
        help_text="Primary service/pickup address"
    )
    service_city = models.CharField(max_length=100, blank=True, null=True)
    service_state = models.CharField(max_length=50, blank=True, null=True)
    service_zip_code = models.CharField(max_length=20, blank=True, null=True)
    
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
        blank=True,
        null=True,
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
    default_payment_method = models.CharField(
        max_length=20,
        choices=DEFAULT_PAYMENT_METHOD_CHOICES,
        default='cash',
        blank=True,
        null=True,
        help_text="Default payment method preferred by the customer"
    )
    
    # Contact preferences
    preferred_contact_method = models.CharField(
        max_length=20,
        choices=CONTACT_METHOD_CHOICES,
        default='email',
        blank=True,
        null=True,
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
    
    # Extended profile information
    alternative_phone = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Alternative contact phone number"
    )
    occupation = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Customer's occupation or job title"
    )
    assigned_manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_customers',
        help_text="Staff member assigned to manage this account"
    )
    
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
            from django.db import transaction
            with transaction.atomic():
                # Find the most recent customer with a CUST- style number to increment
                last_customer = (
                    Customer.objects
                    .select_for_update()
                    .filter(customer_number__startswith='CUST-')
                    .order_by('-customer_number')
                    .first()
                )
                
                if last_customer:
                    try:
                        # Extract the numeric part after 'CUST-'
                        # Using regex or simpler split to get the last numeric part if possible
                        import re
                        match = re.search(r'(\d+)$', last_customer.customer_number)
                        if match:
                            last_number = int(match.group(1))
                            self.customer_number = f"CUST-{last_number + 1:05d}"
                        else:
                            raise ValueError("No numeric part found")
                    except (ValueError, TypeError):
                        # Fallback if numeric part is not cleanly extractable
                        next_id = Customer.objects.count() + 1
                        self.customer_number = f"CUST-{next_id:05d}"
                else:
                    # If no CUST- numbers exist, start from 00001
                    self.customer_number = "CUST-00001"
                
                # FINAL SAFETY CHECK: Ensure the generated number is TRULY unique
                # This handles cases where numbers might be out of sync or manually entered
                attempts = 0
                while Customer.objects.filter(customer_number=self.customer_number).exists() and attempts < 100:
                    attempts += 1
                    try:
                        import re
                        match = re.search(r'(\d+)$', self.customer_number)
                        if match:
                            num = int(match.group(1))
                            self.customer_number = f"CUST-{num + 1:05d}"
                        else:
                            import uuid
                            self.customer_number = f"CUST-{uuid.uuid4().hex[:6].upper()}"
                    except:
                        import uuid
                        self.customer_number = f"CUST-{uuid.uuid4().hex[:6].upper()}"
                
                # Ultimate fallback to UUID if loop fails
                if attempts >= 100:
                    import uuid
                    self.customer_number = f"CUST-{uuid.uuid4().hex[:8].upper()}"
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
    
    def get_last_visit_date(self):
        """
        Get the date of the customer's last visit based on completed work orders.
        Returns the completed_at date of the most recent completed/invoiced/closed work order.
        """
        from apps.workorders.models import WorkOrder
        last_work_order = WorkOrder.objects.filter(
            customer=self,
            status__in=['completed', 'invoiced', 'closed'],
            completed_at__isnull=False
        ).order_by('-completed_at').first()
        
        if last_work_order:
            return last_work_order.completed_at.date()
        return None
    
    def get_days_since_last_visit(self):
        """
        Calculate days since last visit.
        Returns None if customer has never visited.
        """
        last_visit = self.get_last_visit_date()
        if last_visit:
            from django.utils import timezone
            return (timezone.now().date() - last_visit).days
        return None


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





class CustomerContact(models.Model):
    """
    Additional contacts for a customer (multi-contact support)
    """
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='contacts'
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    job_title = models.CharField(max_length=100, blank=True)
    is_primary = models.BooleanField(
        default=False,
        help_text="Primary contact for this customer"
    )
    is_billing = models.BooleanField(
        default=False,
        help_text="Billing contact (receives invoices)"
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_primary', 'first_name']
        verbose_name = 'Customer Contact'
        verbose_name_plural = 'Customer Contacts'

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.customer})"


class CustomerReminder(models.Model):
    """
    Reminders for customer follow-ups
    """
    REMINDER_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='reminders'
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    due_date = models.DateTimeField()
    status = models.CharField(
        max_length=20,
        choices=REMINDER_STATUS_CHOICES,
        default='pending'
    )
    is_system_generated = models.BooleanField(
        default=False,
        help_text="Automatically generated reminder"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_reminders'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['due_date']
        verbose_name = 'Customer Reminder'
        verbose_name_plural = 'Customer Reminders'

    def __str__(self):
        return f"{self.title} - {self.customer}"


class CustomerDocument(models.Model):
    """
    Documents uploaded for a customer
    """
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='documents'
    )
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to='customer_documents/')
    description = models.TextField(blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='customer_uploaded_documents'
    )
    is_public = models.BooleanField(
        default=False, 
        help_text="Visible to customer in portal"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Customer Document'
        verbose_name_plural = 'Customer Documents'

    def __str__(self):
        return f"{self.name} ({self.customer})"
        
    @property
    def size(self):
        try:
            return self.file.size
        except (FileNotFoundError, OSError, Exception):
            return 0
            
    @property
    def extension(self):
        import os
        name, extension = os.path.splitext(self.file.name)
        return extension.lower().replace('.', '')


class CustomerContract(models.Model):
    """
    Contracts and agreements for a customer
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('sent', 'Sent'),
        ('active', 'Active'),
        ('expired', 'Expired'),
        ('terminated', 'Terminated'),
    ]

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='contracts'
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft'
    )
    value = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        default=0.00
    )
    document = models.FileField(upload_to='customer_contracts/', null=True, blank=True)
    signed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_contracts'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Customer Contract'
        verbose_name_plural = 'Customer Contracts'

    def __str__(self):
        return f"{self.title} - {self.customer}"
