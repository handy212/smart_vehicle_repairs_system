from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
from apps.accounts.models import User
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.inventory.models import Part
from apps.branches.models import Branch
from apps.workorders.models import WorkOrder
from apps.inventory.models import Part


class TaxRate(models.Model):
    """Tax rate configuration for different jurisdictions/categories"""
    
    name = models.CharField(max_length=100, unique=True)  # e.g., "State Sales Tax", "County Tax"
    description = models.TextField(blank=True)
    rate = models.DecimalField(
        max_digits=5, 
        decimal_places=3,  # Allows for rates like 8.875%
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))]
    )  # Stored as percentage (e.g., 8.5 for 8.5%)
    
    # Tax applicability
    applies_to_labor = models.BooleanField(default=True)
    applies_to_parts = models.BooleanField(default=True)
    applies_to_sublet = models.BooleanField(default=True)
    
    # Geographical scope
    state = models.CharField(max_length=2, blank=True)  # Two-letter state code
    county = models.CharField(max_length=100, blank=True)
    city = models.CharField(max_length=100, blank=True)
    zip_code = models.CharField(max_length=10, blank=True)
    
    is_active = models.BooleanField(default=True)
    effective_date = models.DateField(default=timezone.now)
    expiration_date = models.DateField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='tax_rates_created')
    
    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['is_active', 'effective_date']),
            models.Index(fields=['state', 'county', 'city']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.rate}%)"
    
    @property
    def is_valid(self):
        """Check if tax rate is currently valid"""
        today = timezone.now().date()
        if not self.is_active:
            return False
        if today < self.effective_date:
            return False
        if self.expiration_date and today > self.expiration_date:
            return False
        return True
    
    def calculate_tax(self, amount):
        """Calculate tax amount for given base amount"""
        if not self.is_valid:
            return Decimal('0')
        return (amount * self.rate / 100).quantize(Decimal('0.01'))


class Estimate(models.Model):
    """Estimates/Quotes for potential work"""
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('sent', 'Sent to Customer'),
        ('viewed', 'Viewed by Customer'),
        ('approved', 'Approved'),
        ('declined', 'Declined'),
        ('expired', 'Expired'),
        ('converted', 'Converted to Work Order'),
    ]
    
    # Auto-generated estimate number
    estimate_number = models.CharField(max_length=20, unique=True, editable=False)
    
    # Branch assignment
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='estimates',
        null=True,  # Allow null for migration
        blank=True,
        help_text="Branch where this estimate was created"
    )
    
    # References
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='estimates')
    vehicle = models.ForeignKey(
        Vehicle, 
        on_delete=models.CASCADE, 
        related_name='estimates',
        null=True,
        blank=True,
        help_text="Optional vehicle for this estimate"
    )
    work_order = models.OneToOneField(
        WorkOrder, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='estimate'
    )  # Link if converted to work order
    reference_number = models.CharField(max_length=50, blank=True, help_text="External reference number")

    # Status and dates
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    estimate_date = models.DateField(default=timezone.now)
    valid_until = models.DateField()  # Expiration date
    approved_date = models.DateTimeField(null=True, blank=True)
    declined_date = models.DateTimeField(null=True, blank=True)
    converted_date = models.DateTimeField(null=True, blank=True)
    
    # Description
    title = models.CharField(max_length=200, blank=True) # made optional
    description = models.TextField(blank=True) # made optional
    notes = models.TextField(blank=True)  # Internal notes
    customer_notes = models.TextField(blank=True)  # Notes visible to customer
    
    # Financial totals (calculated from line items)
    labor_subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    parts_subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    sublet_subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    
    # Discounts
    DISCOUNT_TYPE_CHOICES = [
        ('none', 'No Discount'),
        ('before_tax', 'Before Tax'),
        ('after_tax', 'After Tax'),
    ]
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    discount_percentage = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        default=Decimal('0'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))]
    )
    discount_type = models.CharField(max_length=20, choices=DISCOUNT_TYPE_CHOICES, default='before_tax')
    discount_reason = models.CharField(max_length=200, blank=True)
    
    # Sales Agent
    sales_agent = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='estimates_sold',
        help_text="Sales agent responsible for this estimate"
    )
    
    # Tax
    tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    taxable_subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    tax_nhil_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    tax_getfund_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    tax_hrl_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    tax_vat_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    tax_regime = models.CharField(max_length=50, blank=True)
    
    # Shop supplies/environmental fees
    shop_supplies_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    environmental_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    
    # Grand total
    total = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    
    # Tracking
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='estimates_created')
    approved_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='estimates_approved'
    )
    sent_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='estimates_sent'
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    viewed_at = models.DateTimeField(null=True, blank=True)  # First time customer viewed
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['estimate_number']),
            models.Index(fields=['customer', 'status']),
            models.Index(fields=['status', 'estimate_date']),
            models.Index(fields=['valid_until']),
        ]
    
    def __str__(self):
        return f"{self.estimate_number} - {self.customer}"
    
    def save(self, *args, **kwargs):
        # Auto-generate estimate number using branch sequence
        if not self.estimate_number and self.branch:
            self.estimate_number = self.branch.get_next_estimate_number()
        
        super().save(*args, **kwargs)
    
    def sync_parts_to_work_order(self):
        """
        Sync estimate financial fields to the linked work order.

        Work-order parts are owned by the diagnosis/recommendation flow. Billing
        estimates may quote those parts, but they must not create or mutate
        WorkOrderPart rows or overwrite the work order's parts cost from
        estimate line items.
        """
        if not self.work_order:
            return
        
        from django.db import transaction
        from django.db.models import Sum
        
        with transaction.atomic():
            self._remove_non_diagnosis_part_lines()

            # Ensure totals are calculated before syncing
            self.calculate_totals()
            self.refresh_from_db()

            # Always update work order estimated totals from estimate (even if no parts)
            # Refresh line items queryset to ensure we have latest data
            from apps.billing.models import EstimateLineItem
            line_items = EstimateLineItem.objects.filter(estimate=self)
            
            # Parts cost comes only from diagnosis-created work-order part rows.
            parts_subtotal = self.work_order.parts.aggregate(
                total=Sum('selling_price')
            )['total'] or Decimal('0')
            
            # Calculate labor cost from estimate line items
            labor_subtotal = sum(
                Decimal(str(item.total or '0')) for item in line_items if item.item_type == 'labor'
            ) or Decimal('0')
            
            # Calculate labor hours
            labor_hours = sum(
                Decimal(str(item.labor_hours or '0')) for item in line_items if item.item_type == 'labor'
            ) or Decimal('0')
            
            # Update work order fields
            self.work_order.estimated_parts_cost = parts_subtotal
            self.work_order.estimated_labor_cost = labor_subtotal
            self.work_order.estimated_labor_hours = labor_hours
            
            # Work-order financial summary total follows its diagnosis-owned
            # parts plus quoted labor, not the billing estimate's customer quote
            # total with taxes/fees.
            estimated_total = parts_subtotal + labor_subtotal
            
            self.work_order.estimated_total = estimated_total
            
            # Save work order
            self.work_order.save(update_fields=[
                'estimated_parts_cost',
                'estimated_labor_cost',
                'estimated_labor_hours',
                'estimated_total'
            ])
            
            # Log for debugging
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"Synced estimate {self.id} to work order {self.work_order.id}: "
                       f"total=${estimated_total}, parts=${parts_subtotal}, labor=${labor_subtotal}, "
                       f"estimate.total={self.total}, estimate.subtotal={self.subtotal}")

    def _remove_non_diagnosis_part_lines(self):
        """
        Diagnosis quotation estimates may price parts, but the part list itself
        must originate from diagnosis recommendations.
        """
        diagnosis_marker = '[DIAG-REC:'
        if not self.line_items.filter(item_type='part', notes__contains=diagnosis_marker).exists():
            return

        self.line_items.filter(item_type='part').exclude(
            notes__contains=diagnosis_marker
        ).delete()
    
    def calculate_totals(self):
        """Calculate all totals from line items"""
        from apps.billing.models import EstimateLineItem
        
        line_items = EstimateLineItem.objects.filter(estimate=self)
        
        # Calculate subtotals by type
        self.labor_subtotal = sum(
            item.total for item in line_items if item.item_type == 'labor'
        ) or Decimal('0')
        
        self.parts_subtotal = sum(
            item.total for item in line_items if item.item_type == 'part'
        ) or Decimal('0')
        
        self.sublet_subtotal = sum(
            item.total for item in line_items if item.item_type == 'sublet'
        ) or Decimal('0')
        
        # Total before discount and tax
        self.subtotal = self.labor_subtotal + self.parts_subtotal + self.sublet_subtotal
        
        # Apply discount
        if self.discount_percentage > 0:
            self.discount_amount = (self.subtotal * self.discount_percentage / 100).quantize(Decimal('0.01'))
        else:
            # Explicitly reset discount_amount to 0 when discount_percentage is 0
            self.discount_amount = Decimal('0')
        
        subtotal_after_discount = self.subtotal - self.discount_amount
        
        # Calculate tax based on Ghana standard regime
        taxable_before_discount = sum(
            item.total for item in line_items if item.is_taxable
        ) or Decimal('0')
        discount_ratio = Decimal('0')
        if self.subtotal > 0 and self.discount_amount > 0:
            discount_ratio = (self.discount_amount / self.subtotal)
        taxable_discount = (taxable_before_discount * discount_ratio).quantize(Decimal('0.01')) if discount_ratio > 0 else Decimal('0')
        taxable_after_discount = max(taxable_before_discount - taxable_discount, Decimal('0'))
        
        from apps.billing.tax_service import TaxService
        breakdown = TaxService.calculate_breakdown(taxable_after_discount)
        self.taxable_subtotal = breakdown.taxable_subtotal
        self.tax_nhil_amount = breakdown.nhil_amount
        self.tax_getfund_amount = breakdown.getfund_amount
        self.tax_hrl_amount = Decimal('0')  # COVID levy abolished in 2026
        self.tax_vat_amount = breakdown.vat_amount
        self.tax_amount = breakdown.total_tax
        self.tax_regime = breakdown.regime
        
        # Grand total
        self.total = (
            subtotal_after_discount + 
            self.tax_amount + 
            self.shop_supplies_fee + 
            self.environmental_fee
        ).quantize(Decimal('0.01'))
        
        self.save()
    
    @property
    def is_expired(self):
        """Check if estimate has expired"""
        return timezone.now().date() > self.valid_until
    
    @property
    def days_until_expiration(self):
        """Days until estimate expires"""
        if self.is_expired:
            return 0
        delta = self.valid_until - timezone.now().date()
        return delta.days

    @property
    def can_be_approved(self):
        """Check if estimate can be approved"""
        return self.status in ['sent', 'viewed'] and not self.is_expired
    
    @property
    def can_be_converted(self):
        """Check if estimate can be converted to work order or invoice"""
        # Can be converted if approved and no invoice has already been created from it
        if self.status != 'approved':
            return False
        return not self.invoices.exclude(status='void').exists()
    
    @property
    def subtotal_after_discount(self):
        """Calculate subtotal after discount"""
        return self.subtotal - self.discount_amount

    def duplicate(self, created_by=None):
        """Duplicate an existing estimate and its line items"""
        new_estimate = Estimate.objects.get(pk=self.pk)
        new_estimate.pk = None
        new_estimate.id = None
        new_estimate.estimate_number = "" # Will be auto-generated on save
        new_estimate.status = 'draft'
        new_estimate.created_at = None 
        new_estimate.updated_at = None
        if created_by:
            new_estimate.created_by = created_by
        new_estimate.save()
        
        # Duplicate line items
        for item in self.line_items.all():
            item.pk = None
            item.id = None
            item.estimate = new_estimate
            item.save()
            
        new_estimate.calculate_totals()
        return new_estimate

    def convert_to_work_order(self):
        """Convert estimate to a Work Order"""
        from apps.workorders.models import WorkOrder

        if self.work_order:
            return self.work_order

        if not self.vehicle:
            raise ValueError("A vehicle is required before converting an estimate to a work order.")
        
        # Create work order
        work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns=self.description or self.title or f"Work order from estimate {self.estimate_number}",
            special_instructions=f"Converted from Estimate {self.estimate_number}",
            status='draft',
            priority='medium',
            created_by=self.created_by,
            estimated_labor_cost=self.labor_subtotal,
            estimated_parts_cost=self.parts_subtotal,
            estimated_labor_hours=sum(
                item.labor_hours or Decimal('0')
                for item in self.line_items.all()
                if item.item_type == 'labor'
            ),
            odometer_in=self.vehicle.current_mileage or 0,
        )
        
        # Link estimate to work order
        self.work_order = work_order
        self.status = 'converted'
        self.save()
        
        # Sync parts
        self.sync_parts_to_work_order()
        
        return work_order

    def convert_to_invoice(self):
        """Convert estimate to an Invoice"""
        from apps.billing.models import Invoice, InvoiceLineItem

        existing_invoice = self.invoices.exclude(status='void').order_by('-created_at').first()
        if existing_invoice is not None:
            return existing_invoice
        
        # Create invoice
        invoice = Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            work_order=self.work_order,
            estimate=self,
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=15),
            status='draft',
            description=f"Generated from Estimate {self.estimate_number}",
            created_by=self.created_by,
            subtotal=self.subtotal,
            discount_percentage=self.discount_percentage,
            discount_amount=self.discount_amount,
            taxable_subtotal=self.taxable_subtotal,
            tax_amount=self.tax_amount,
            total=self.total,
            amount_due=self.total
        )
        
        # Copy line items
        for item in self.line_items.all():
            InvoiceLineItem.objects.create(
                invoice=invoice,
                item_type=item.item_type,
                description=item.description,
                notes=item.notes,
                part=item.part,
                part_number=item.part_number,
                quantity=item.quantity,
                unit_price=item.unit_price,
                discount_percentage=item.discount_percentage,
                discount_amount=item.discount_amount,
                total=item.total,
                is_taxable=item.is_taxable
            )
        
        self.status = 'converted'
        self.save()
        
        return invoice


class EstimateLineItem(models.Model):
    """Line items in an estimate"""
    
    ITEM_TYPE_CHOICES = [
        ('labor', 'Labor'),
        ('part', 'Part'),
        ('sublet', 'Sublet/Outsource'),
        ('fee', 'Fee'),
        ('other', 'Other'),
    ]
    
    estimate = models.ForeignKey(Estimate, on_delete=models.CASCADE, related_name='line_items')
    
    # Item details
    item_type = models.CharField(max_length=20, choices=ITEM_TYPE_CHOICES)
    description = models.CharField(max_length=500)
    notes = models.TextField(blank=True)
    
    # Part reference (if applicable)
    part = models.ForeignKey(Part, on_delete=models.SET_NULL, null=True, blank=True)
    part_number = models.CharField(max_length=100, blank=True)
    
    # Quantity and pricing
    quantity = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    unit_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))]
    )
    discount_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))]
    )
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    total = models.DecimalField(max_digits=10, decimal_places=2, editable=False)
    
    # Labor-specific fields
    labor_hours = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(Decimal('0'))]
    )
    labor_rate = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(Decimal('0'))]
    )
    
    # Taxability
    is_taxable = models.BooleanField(default=True)
    
    # Order
    order = models.PositiveIntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['order', 'id']
    
    def __str__(self):
        return f"{self.estimate.estimate_number} - {self.description}"
    
    def save(self, *args, **kwargs):
        if self.item_type == 'labor' and self.labor_hours is not None and self.labor_rate is not None:
            gross_total = self.labor_hours * self.labor_rate
        else:
            gross_total = self.quantity * self.unit_price

        self.discount_amount = Decimal('0')
        if self.discount_percentage > 0:
            self.discount_amount = (gross_total * self.discount_percentage / Decimal('100')).quantize(Decimal('0.01'))

        self.total = max(gross_total - self.discount_amount, Decimal('0')).quantize(Decimal('0.01'))
        
        super().save(*args, **kwargs)
        
        # Update estimate totals
        self.estimate.calculate_totals()


class Invoice(models.Model):
    """Invoices for completed work"""
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('proforma', 'Proforma'),
        ('sent', 'Sent to Customer'),
        ('viewed', 'Viewed by Customer'),
        ('partial', 'Partially Paid'),
        ('paid', 'Paid in Full'),
        ('overdue', 'Overdue'),
        ('void', 'Void'),
        ('refunded', 'Refunded'),
    ]
    
    # Auto-generated invoice number
    invoice_number = models.CharField(max_length=20, unique=True, editable=False)
    
    # Branch assignment
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='invoices',
        null=True,  # Allow null for migration
        blank=True,
        help_text="Branch where this invoice was created"
    )
    
    # References
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='invoices')
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name='invoices', null=True, blank=True)
    work_order = models.OneToOneField(
        WorkOrder, 
        on_delete=models.PROTECT,
        related_name='invoice',
        null=True,
        blank=True
    )
    estimate = models.ForeignKey(
        Estimate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices'
    )  # Link to original estimate if applicable
    
    # Django Ledger Invoice reference (for full accounting integration)
    # ledger_invoice = models.OneToOneField(
    #     'django_ledger.InvoiceModel',
    #     on_delete=models.SET_NULL,
    #     null=True,
    #     blank=True,
    #     related_name='repair_invoice',
    #     help_text="Django Ledger Invoice for full accounting integration"
    # )
    
    # Status and dates
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    invoice_date = models.DateField(default=timezone.now)
    due_date = models.DateField(null=True, blank=True)
    
    # Description
    description = models.TextField(blank=True)
    notes = models.TextField(blank=True)  # Internal notes
    customer_notes = models.TextField(blank=True)  # Notes visible to customer
    terms = models.TextField(blank=True)  # Payment terms
    
    # Financial totals (calculated from work order or line items)
    labor_subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    parts_subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    sublet_subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    
    # Discounts
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    discount_percentage = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        default=Decimal('0'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))]
    )
    discount_reason = models.CharField(max_length=200, blank=True)
    
    # Tax
    tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    taxable_subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    tax_nhil_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    tax_getfund_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    tax_hrl_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    tax_vat_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    tax_regime = models.CharField(max_length=50, blank=True)
    
    # Shop supplies/environmental fees
    shop_supplies_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    environmental_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    
    # Grand total
    total = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    
    # Payment tracking
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    amount_due = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    
    # Tracking
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='invoices_created')
    sent_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='invoices_sent'
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    viewed_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)  # When fully paid
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='invoices_voided'
    )
    void_reason = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['invoice_number']),
            models.Index(fields=['customer', 'status']),
            models.Index(fields=['status', 'due_date']),
            models.Index(fields=['work_order']),
        ]
    
    def __str__(self):
        return f"{self.invoice_number} - {self.customer}"
    
    @property
    def subtotal_after_discount(self):
        """Calculate subtotal after discount"""
        return self.subtotal - self.discount_amount
    
    def save(self, *args, **kwargs):
        # Auto-generate invoice number
        if not self.invoice_number:
            if self.branch:
                # Use branch sequence if branch is available
                # Use separate numbering for proforma invoices
                if self.status == 'proforma':
                    self.invoice_number = self.branch.get_next_proforma_number()
                else:
                    self.invoice_number = self.branch.get_next_invoice_number()
            else:
                # Fallback: Generate invoice number without branch code
                # Find last invoice number and increment
                if self.status == 'proforma':
                    # For proforma without branch, use PRO prefix
                    last_proforma = Invoice.objects.filter(
                        status='proforma'
                    ).exclude(invoice_number='').order_by('-id').first()
                    if last_proforma and last_proforma.invoice_number:
                        try:
                            number_part = last_proforma.invoice_number.split('-')[-1]
                            if number_part.startswith('PRO'):
                                num_str = number_part.replace('PRO', '')
                                next_num = int(num_str) + 1
                                self.invoice_number = f"PRO{next_num:06d}"
                            else:
                                self.invoice_number = "PRO000001"
                        except (ValueError, AttributeError):
                            self.invoice_number = "PRO000001"
                    else:
                        self.invoice_number = "PRO000001"
                else:
                    # Standard invoice fallback numbering
                    last_invoice = Invoice.objects.exclude(invoice_number='').order_by('-id').first()
                    if last_invoice and last_invoice.invoice_number:
                        try:
                            # Try to extract number from last invoice
                            # Handle formats like: "BR001-INV000001" or "INV000001"
                            number_part = last_invoice.invoice_number.split('-')[-1]
                            if number_part.startswith('INV'):
                                num_str = number_part.replace('INV', '')
                                next_num = int(num_str) + 1
                                self.invoice_number = f"INV{next_num:06d}"
                            else:
                                # Fallback to simple increment
                                next_num = Invoice.objects.count() + 1
                                self.invoice_number = f"INV{next_num:06d}"
                        except (ValueError, AttributeError):
                            # If parsing fails, use simple increment
                            next_num = Invoice.objects.count() + 1
                            self.invoice_number = f"INV{next_num:06d}"
                    else:
                        # First invoice without branch
                        self.invoice_number = "INV000001"
        
        # Calculate amount due
        self.amount_due = (self.total - self.amount_paid).quantize(Decimal('0.01'))
        
        # Auto-update status based on payment
        if self.amount_paid >= self.total and self.total > 0:
            if self.status not in ['void', 'refunded']:
                self.status = 'paid'
                if not self.paid_at:
                    self.paid_at = timezone.now()
        elif self.amount_paid > 0:
            if self.status not in ['void', 'refunded']:
                self.status = 'partial'
                self.paid_at = None
        else:
            # No payments at all
            if self.status in ['paid', 'partial']:
                self.status = 'sent' # Demote back to sent
                self.paid_at = None
        
        # Check if overdue
        if self.status not in ['paid', 'void', 'refunded'] and self.due_date:
            if timezone.now().date() > self.due_date:
                self.status = 'overdue'
        
        super().save(*args, **kwargs)
    
    def calculate_totals_from_work_order(self):
        """Calculate invoice totals from work order"""
        if not self.work_order:
            return
        
        # Get labor subtotal from service tasks
        self.labor_subtotal = sum(
            task.labor_cost for task in self.work_order.tasks.all()
        ) or Decimal('0')
        
        # Get parts subtotal from work order
        self.parts_subtotal = self.work_order.actual_parts_cost or Decimal('0')
        
        # Sublet would come from service tasks marked as sublet (if implemented)
        # For now, set to 0
        self.sublet_subtotal = Decimal('0')
        
        # Total before discount and tax
        self.subtotal = self.labor_subtotal + self.parts_subtotal + self.sublet_subtotal
        
        # Apply discount
        if self.discount_percentage > 0:
            self.discount_amount = (self.subtotal * self.discount_percentage / 100).quantize(Decimal('0.01'))
        else:
            # Explicitly reset discount_amount to 0 when discount_percentage is 0
            self.discount_amount = Decimal('0')
        
        subtotal_after_discount = self.subtotal - self.discount_amount
        
        # Ghana tax regime (assume work order totals are taxable)
        taxable_before_discount = self.subtotal
        discount_ratio = Decimal('0')
        if self.subtotal > 0 and self.discount_amount > 0:
            discount_ratio = (self.discount_amount / self.subtotal)
        taxable_discount = (taxable_before_discount * discount_ratio).quantize(Decimal('0.01')) if discount_ratio > 0 else Decimal('0')
        taxable_after_discount = max(taxable_before_discount - taxable_discount, Decimal('0'))
        
        from apps.billing.tax_service import TaxService
        breakdown = TaxService.calculate_breakdown(taxable_after_discount)
        self.taxable_subtotal = breakdown.taxable_subtotal
        self.tax_nhil_amount = breakdown.nhil_amount
        self.tax_getfund_amount = breakdown.getfund_amount
        self.tax_hrl_amount = Decimal('0')  # COVID levy abolished in 2026
        self.tax_vat_amount = breakdown.vat_amount
        self.tax_amount = breakdown.total_tax
        self.tax_regime = breakdown.regime
        
        # Grand total
        self.total = (
            subtotal_after_discount + 
            self.tax_amount + 
            self.shop_supplies_fee + 
            self.environmental_fee
        ).quantize(Decimal('0.01'))
        
        # Amount due
        self.amount_due = (self.total - self.amount_paid).quantize(Decimal('0.01'))
    
    @property
    def is_overdue(self):
        """Check if invoice is overdue"""
        if self.status in ['paid', 'void', 'refunded'] or not self.due_date:
            return False
        return timezone.now().date() > self.due_date
    
    @property
    def days_overdue(self):
        """Days since invoice became overdue"""
        if not self.is_overdue:
            return 0
        delta = timezone.now().date() - self.due_date
        return delta.days
    
    @property
    def days_until_due(self):
        """Days until invoice is due"""
        if self.is_overdue or not self.due_date:
            return 0
        delta = self.due_date - timezone.now().date()
        return delta.days
    
    @property
    def is_paid(self):
        """Check if invoice is fully paid"""
        return self.amount_paid >= self.total and self.total > 0
    
    @property
    def is_partially_paid(self):
        """Check if invoice is partially paid"""
        return 0 < self.amount_paid < self.total
    
    @property
    def payment_percentage(self):
        """Percentage of invoice paid"""
        if self.total == 0:
            return Decimal('0')
        return ((self.amount_paid / self.total) * 100).quantize(Decimal('0.01'))

    def recalculate_amount_paid_from_collections(self):
        """
        Set amount_paid from completed payments (net of refunds) plus
        credit note applications. Then save() refreshes amount_due and status.
        """
        from django.db.models import Sum

        total_payments = sum(
            (p.amount - (p.refund_amount or Decimal('0')))
            for p in self.payments.filter(status='completed')
        ) or Decimal('0')
        credit_total = self.credit_note_applications.aggregate(t=Sum('amount'))['t'] or Decimal('0')
        self.amount_paid = (total_payments + credit_total).quantize(Decimal('0.01'))
        self.save()


class InvoiceLineItem(models.Model):
    """Line items recorded on an invoice (standalone invoices)"""
    
    ITEM_TYPE_CHOICES = [
        ('labor', 'Labor'),
        ('part', 'Part'),
        ('fee', 'Fee'),
        ('discount', 'Discount'),
        ('sublet', 'Sublet/Outsource'),
        ('other', 'Other'),
    ]
    
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='line_items')
    
    item_type = models.CharField(max_length=20, choices=ITEM_TYPE_CHOICES)
    description = models.CharField(max_length=500)
    notes = models.TextField(blank=True)
    
    part = models.ForeignKey(Part, on_delete=models.SET_NULL, null=True, blank=True)
    part_number = models.CharField(max_length=100, blank=True)
    
    quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0'))]
    )
    discount_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))]
    )
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    total = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    
    labor_hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0'))]
    )
    labor_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0'))]
    )
    
    is_taxable = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['order', 'id']
    
    def __str__(self):
        return f"{self.invoice.invoice_number} - {self.description}"
    
    def save(self, *args, **kwargs):
        gross_total = Decimal('0')
        if self.item_type == 'labor' and self.labor_hours and self.labor_rate:
            gross_total = self.labor_hours * self.labor_rate
        elif self.quantity and self.unit_price:
            gross_total = self.quantity * self.unit_price
        elif self.unit_price:
            gross_total = self.unit_price
        elif self.total:
            gross_total = self.total

        self.discount_amount = Decimal('0')
        if self.discount_percentage > 0:
            self.discount_amount = (gross_total * self.discount_percentage / Decimal('100')).quantize(Decimal('0.01'))

        self.total = max(gross_total - self.discount_amount, Decimal('0')).quantize(Decimal('0.01'))
        super().save(*args, **kwargs)

class Payment(models.Model):
    """Payment records for invoices"""
    
    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('check', 'Check'),
        ('credit_card', 'Credit Card'),
        ('debit_card', 'Debit Card'),
        ('ach', 'ACH/Bank Transfer'),
        ('wire', 'Wire Transfer'),
        ('paypal', 'PayPal'),
        ('venmo', 'Venmo'),
        ('zelle', 'Zelle'),
        # Ghana Mobile Money (Hubtel)
        ('mtn_momo', 'MTN Mobile Money'),
        ('vodafone_cash', 'Vodafone Cash'),
        ('airteltigo_money', 'AirtelTigo Money'),
        ('hubtel_card', 'Card Payment (Hubtel)'),
        # Paystack (Ghana Payment Gateway)
        ('paystack', 'Paystack'),
        ('other', 'Other'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('refunded', 'Refunded'),
        ('cancelled', 'Cancelled'),
    ]
    
    # Auto-generated payment number
    payment_number = models.CharField(max_length=20, unique=True, editable=False)
    
    # References
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name='payments')
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='payments')
    till = models.ForeignKey(
        'CashierTill',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='payments',
        help_text="Open cashier till used for cash payments"
    )
    
    # Payment details
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='completed')
    
    amount = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    
    payment_date = models.DateTimeField(default=timezone.now)
    
    # Additional payment info
    reference_number = models.CharField(max_length=100, blank=True)  # Check #, confirmation #, etc.
    card_last_four = models.CharField(max_length=4, blank=True)  # Last 4 digits of card
    card_type = models.CharField(max_length=20, blank=True)  # Visa, MasterCard, etc.
    
    # Hubtel/Mobile Money specific fields
    transaction_id = models.CharField(max_length=100, blank=True, db_index=True)  # External transaction ID
    phone_number = models.CharField(max_length=20, blank=True)  # For mobile money payments
    network_provider = models.CharField(max_length=50, blank=True)  # MTN, Vodafone, AirtelTigo
    
    notes = models.TextField(blank=True)
    
    # Refund tracking
    refund_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    refund_date = models.DateTimeField(null=True, blank=True)
    refund_reason = models.TextField(blank=True)
    refunded_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='payments_refunded'
    )
    
    # Tracking
    processed_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='payments_processed')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-payment_date']
        indexes = [
            models.Index(fields=['payment_number']),
            models.Index(fields=['invoice', 'status']),
            models.Index(fields=['customer', 'payment_date']),
            models.Index(fields=['payment_method', 'status']),
        ]
    
    def __str__(self):
        return f"{self.payment_number} - {self.amount} ({self.payment_method})"
    
    def save(self, *args, **kwargs):
        # Auto-generate payment number if not set
        if not self.payment_number:
            last_payment = Payment.objects.order_by('-id').first()
            if last_payment and last_payment.payment_number:
                try:
                    last_number = int(last_payment.payment_number.replace('PAY', ''))
                    new_number = last_number + 1
                except (ValueError, AttributeError):
                    new_number = 1
            else:
                new_number = 1
            self.payment_number = f'PAY{new_number:06d}'
        
        is_new = self.pk is None
        old_status = None
        old_amount = None
        old_refund_amount = None
        
        if not is_new:
            old_payment = Payment.objects.get(pk=self.pk)
            old_status = old_payment.status
            old_amount = old_payment.amount
            old_refund_amount = old_payment.refund_amount
        else:
            # For new payments, validate that invoice can accept payments
            if self.invoice_id:
                # Refresh invoice to get latest state
                invoice = self.invoice
                invoice.refresh_from_db()
                
                # Only prevent payments if invoice is explicitly marked as paid
                # This is the most reliable check - other statuses may still accept payments
                if invoice.status == 'paid':
                    from django.core.exceptions import ValidationError
                    inv_num = getattr(invoice, 'invoice_number', f'#{invoice.id}')
                    raise ValidationError(
                        f"Cannot record payment: Invoice {inv_num} is already fully paid."
                    )
        
        super().save(*args, **kwargs)
        
        # Update invoice amount_paid when payment is completed
        completed_amount_changed = (
            not is_new and
            self.status == 'completed' and
            old_status == 'completed' and
            (old_amount != self.amount or old_refund_amount != self.refund_amount)
        )

        if self.status == 'completed' and (is_new or old_status != 'completed' or completed_amount_changed):
            self.update_invoice_payment()
        elif old_status == 'completed' and self.status != 'completed':
            # Payment was completed but now is not (refunded, cancelled, failed)
            self.update_invoice_payment()
    
    def update_invoice_payment(self):
        """Update the invoice's amount_paid"""
        self.invoice.recalculate_amount_paid_from_collections()
    
    @property
    def net_amount(self):
        """Net amount after refunds"""
        if self.amount is None:
            return Decimal('0')
        return self.amount - self.refund_amount
    
    @property
    def is_refunded(self):
        """Check if payment is fully refunded"""
        if self.amount is None:
            return False
        return self.refund_amount >= self.amount
    
    @property
    def is_partially_refunded(self):
        """Check if payment is partially refunded"""
        if self.amount is None:
            return False
        return 0 < self.refund_amount < self.amount


# ==============================================================================
# PHASE 2: CASH & PAYMENT MANAGEMENT MODELS
# ==============================================================================

class CashierTill(models.Model):
    """Cash register/till tracking for cashiers"""
    
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('closed', 'Closed'),
    ]
    
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='tills'
    )
    cashier = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='tills'
    )
    
    # Till times
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    
    # Balances
    opening_balance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
        validators=[MinValueValidator(Decimal('0'))]
    )
    closing_balance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )
    expected_balance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )
    variance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Difference between expected and actual closing balance"
    )
    
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='open')
    notes = models.TextField(blank=True)
    
    # Tracking
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-opened_at']
        indexes = [
            models.Index(fields=['branch', 'status']),
            models.Index(fields=['cashier', 'opened_at']),
            models.Index(fields=['status', 'opened_at']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['cashier'],
                condition=models.Q(status='open'),
                name='unique_open_till_per_cashier'
            )
        ]
    
    def __str__(self):
        return f"Till {self.id} - {self.cashier.get_full_name()} ({self.status})"
    
    @property
    def duration(self):
        """Calculate how long till has been open"""
        if self.opened_at is None:
            return None
        if self.closed_at:
            return self.closed_at - self.opened_at
        return timezone.now() - self.opened_at
    
    @property
    def is_balanced(self):
        """Check if till is balanced (variance within acceptable range)"""
        if self.variance is None:
            return None
        return abs(self.variance) < Decimal('0.01')

    def cash_payments_total(self):
        """Cash collected into this till, before any later refund adjustments."""
        return self.payments.filter(
            payment_method='cash',
            status='completed',
        ).aggregate(total=models.Sum('amount'))['total'] or Decimal('0')

    def cash_refunds_total(self):
        """Cash paid out from this till for completed refunds."""
        return self.refunds.filter(
            status='completed',
        ).aggregate(total=models.Sum('amount'))['total'] or Decimal('0')

    def till_cash_movements_net(self):
        """Net effect of pay-in / pay-out movements on drawer (positive adds cash)."""
        stats = self.cash_movements.aggregate(
            pi=models.Sum('amount', filter=models.Q(movement_type='pay_in')),
            po=models.Sum('amount', filter=models.Q(movement_type='pay_out')),
        )
        pi = stats['pi'] or Decimal('0')
        po = stats['po'] or Decimal('0')
        return (pi - po).quantize(Decimal('0.01'))

    def calculate_expected_balance(self):
        return (
            self.opening_balance
            + self.cash_payments_total()
            - self.cash_refunds_total()
            + self.till_cash_movements_net()
        ).quantize(Decimal('0.01'))


class CashCount(models.Model):
    """Cash denomination breakdown for till opening/closing"""
    
    COUNT_TYPE_CHOICES = [
        ('opening', 'Opening Count'),
        ('closing', 'Closing Count'),
    ]
    
    till = models.ForeignKey(
        CashierTill,
        on_delete=models.CASCADE,
        related_name='cash_counts'
    )
    
    count_type = models.CharField(max_length=10, choices=COUNT_TYPE_CHOICES)
    
    # Denomination (e.g., 100, 50, 20, 10, 5, 1, 0.50, 0.25, 0.10, 0.05)
    denomination = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    quantity = models.IntegerField(
        validators=[MinValueValidator(0)]
    )
    total = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        editable=False
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-denomination']
        indexes = [
            models.Index(fields=['till', 'count_type']),
        ]
    
    def __str__(self):
        return f"{self.count_type} - ${self.denomination} x {self.quantity} = ${self.total}"
    
    def save(self, *args, **kwargs):
        # Auto-calculate total
        self.total = (self.denomination * self.quantity).quantize(Decimal('0.01'))
        super().save(*args, **kwargs)


class TillCashMovement(models.Model):
    """
    Non-invoice cash into or out of the drawer while the till is open
    (e.g. float from safe, safe drop, bank change, petty reimbursement).
    """

    MOVEMENT_TYPE_CHOICES = [
        ('pay_in', 'Pay in'),
        ('pay_out', 'Pay out'),
    ]

    till = models.ForeignKey(
        CashierTill,
        on_delete=models.CASCADE,
        related_name='cash_movements',
    )
    movement_type = models.CharField(max_length=10, choices=MOVEMENT_TYPE_CHOICES)
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    reason = models.CharField(max_length=500, blank=True)
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='till_cash_movements',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['till', '-created_at']),
            models.Index(fields=['till', 'movement_type']),
        ]

    def __str__(self):
        return f"{self.get_movement_type_display()} {self.amount} on till {self.till_id}"


class PaymentAllocation(models.Model):
    """Track payment allocation to multiple invoices"""
    
    payment = models.ForeignKey(
        Payment,
        on_delete=models.CASCADE,
        related_name='allocations'
    )
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name='payment_allocations'
    )
    
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    
    allocated_at = models.DateTimeField(auto_now_add=True)
    allocated_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='payment_allocations_made'
    )
    
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-allocated_at']
        indexes = [
            models.Index(fields=['payment', 'invoice']),
            models.Index(fields=['invoice', 'allocated_at']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['payment', 'invoice'],
                name='unique_payment_invoice_allocation'
            )
        ]
    
    def __str__(self):
        return f"{self.payment.payment_number} -> {self.invoice.invoice_number}: ${self.amount}"


class Refund(models.Model):
    """Refund tracking and processing"""
    
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('completed', 'Completed'),
        ('rejected', 'Rejected'),
        ('cancelled', 'Cancelled'),
    ]
    
    REFUND_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('cheque', 'Cheque'),
        ('bank_transfer', 'Bank Transfer'),
        ('pos', 'POS/Card'),
        ('mobile_money', 'Mobile Money'),
        ('original_method', 'Original Payment Method'),
    ]
    
    # Reference
    refund_number = models.CharField(max_length=20, unique=True, editable=False)
    
    original_payment = models.ForeignKey(
        Payment,
        on_delete=models.PROTECT,
        related_name='refunds'
    )
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.PROTECT,
        related_name='refunds'
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name='refunds'
    )
    
    # Refund details
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    reason = models.TextField()
    refund_method = models.CharField(max_length=20, choices=REFUND_METHOD_CHOICES)
    reference_number = models.CharField(max_length=100, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Tracking
    requested_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='refunds_requested'
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='refunds_approved'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    
    processed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='refunds_processed'
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    
    # Till reference if refunded via till
    till = models.ForeignKey(
        CashierTill,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='refunds'
    )
    
    notes = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-requested_at']
        indexes = [
            models.Index(fields=['status', 'requested_at']),
            models.Index(fields=['customer', 'status']),
            models.Index(fields=['invoice', 'status']),
        ]
    
    def __str__(self):
        return f"{self.refund_number} - ${self.amount} ({self.status})"
    
    def save(self, *args, **kwargs):
        # Auto-generate refund number
        if not self.refund_number:
            from datetime import datetime
            today = datetime.now()
            prefix = f"RF{today.strftime('%Y%m%d')}"
            
            # Get last refund number for today
            last_refund = Refund.objects.filter(
                refund_number__startswith=prefix
            ).order_by('-refund_number').first()
            
            if last_refund:
                # Extract sequence and increment
                last_seq = int(last_refund.refund_number[-4:])
                new_seq = last_seq + 1
            else:
                new_seq = 1
            
            self.refund_number = f"{prefix}{new_seq:04d}"
        
        super().save(*args, **kwargs)

# Audit Log Registration
from auditlog.registry import auditlog
auditlog.register(Invoice)
auditlog.register(Payment)
auditlog.register(Estimate)


class CreditNote(models.Model):
    credit_note_number = models.CharField(max_length=20, unique=True, editable=False)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='credit_notes')
    invoice = models.ForeignKey(
        Invoice, on_delete=models.SET_NULL, null=True, blank=True, 
        related_name='credit_notes',
        help_text="Optional link to an original invoice"
    )
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='credit_notes', null=True)
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('issued', 'Issued'),
        ('applied', 'Applied'),
        ('refunded', 'Refunded'),
        ('void', 'Void'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    credit_date = models.DateField(default=timezone.now)
    reason = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)
    
    # Financials
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    unused_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_credit_notes')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-credit_date', '-credit_note_number']

    def __str__(self):
        return f"{self.credit_note_number} - {self.customer}"

    def save(self, *args, **kwargs):
        if not self.credit_note_number:
            from django.utils.crypto import get_random_string
            self.credit_note_number = f"CN-{get_random_string(8).upper()}"
        
        if self.pk is None:
            self.unused_amount = self.total
            
        super().save(*args, **kwargs)

    def calculate_totals(self):
        """Recalculate totals based on line items"""
        lines = self.line_items.all()
        self.subtotal = sum(line.total for line in lines)
        # Simplified tax logic for now
        self.tax_amount = 0 
        self.total = self.subtotal + self.tax_amount
        
        if self.status == 'draft':
            self.unused_amount = self.total
        elif self.status in ('issued', 'applied') and self.pk:
            from django.db.models import Sum

            applied_sum = self.applications.aggregate(t=Sum('amount'))['t'] or Decimal('0')
            self.unused_amount = max(
                Decimal('0'),
                (self.total - applied_sum).quantize(Decimal('0.01')),
            )
            if self.status == 'issued' and self.unused_amount == 0 and self.total > 0:
                self.status = 'applied'
        self.save()


class CreditNoteLineItem(models.Model):
    credit_note = models.ForeignKey(CreditNote, on_delete=models.CASCADE, related_name='line_items')
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_taxable = models.BooleanField(default=True)
    
    def save(self, *args, **kwargs):
        self.total = self.quantity * self.unit_price
        super().save(*args, **kwargs)


class CreditNoteApplication(models.Model):
    """
    Applies issued credit note balance toward a customer invoice (reduces amount due).
    Operational allocation; GL for the note is posted when the credit note is issued.
    """

    credit_note = models.ForeignKey(
        CreditNote,
        on_delete=models.CASCADE,
        related_name='applications',
    )
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.PROTECT,
        related_name='credit_note_applications',
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    applied_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='credit_note_applications_recorded',
    )
    applied_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-applied_at']
        indexes = [
            models.Index(fields=['credit_note', '-applied_at']),
            models.Index(fields=['invoice', '-applied_at']),
        ]

    def __str__(self):
        return f"{self.credit_note_id} → Inv {self.invoice_id}: {self.amount}"


auditlog.register(CreditNote)


class Bill(models.Model):
    """
    Vendor Bills (Accounts Payable)
    Independent of Inventory Purchase Orders - for rent, utilities, services, etc.
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending_approval', 'Pending Approval'),
        ('rejected', 'Rejected'),
        ('open', 'Open'),
        ('partially_paid', 'Partially Paid'),
        ('paid', 'Paid'),
        ('overdue', 'Overdue'),
        ('void', 'Void'),
    ]

    # Identifiers
    bill_number = models.CharField(max_length=50, unique=True, editable=False)
    vendor = models.ForeignKey(
        'inventory.Supplier', 
        on_delete=models.PROTECT, 
        related_name='bills',
        help_text="Vendor/Supplier who sent this bill"
    )
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='bills',
        help_text="Branch responsible for this bill"
    )

    # Details
    reference_number = models.CharField(max_length=100, blank=True, help_text="Vendor's invoice number")
    bill_date = models.DateField(default=timezone.now)
    due_date = models.DateField()
    terms = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    # Financials
    currency = models.CharField(max_length=3, default='GHS')
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    amount_due = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    # Integration
    purchase_order = models.ForeignKey(
        'inventory.PurchaseOrder',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bills',
        help_text="Link to Purchase Order for inventory tracking"
    )
    # ledger_bill = models.OneToOneField(
    #     'django_ledger.BillModel',
    #     on_delete=models.SET_NULL,
    #     null=True,
    #     blank=True,
    #     related_name='repair_bill',
    #     help_text="Django Ledger Bill for AP tracking"
    # )

    # Tracking
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='bills_created')
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='bills_submitted')
    submitted_at = models.DateTimeField(null=True, blank=True)
    assigned_approver = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='bills_assigned_for_approval')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='bills_approved')
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='bills_rejected')
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-bill_date', '-created_at']
        indexes = [
            models.Index(fields=['bill_number']),
            models.Index(fields=['vendor', 'status']),
            models.Index(fields=['due_date']),
        ]

    def __str__(self):
        return f"{self.bill_number} - {self.vendor.name}"

    def save(self, *args, **kwargs):
        # Auto-generate bill number
        if not self.bill_number:
            prefix = "BILL" 
            if self.branch:
                # Try to include branch prefix if possible, e.g., ACC-BILL-...
                # Assuming branch has a code or similar, or just leave as BILL
                pass
            
            # Simple fallback generation
            last_id = Bill.objects.aggregate(max_id=models.Max('id'))['max_id'] or 0
            self.bill_number = f"{prefix}{(last_id + 1):06d}"

        # Calculate amount due
        self.amount_due = self.total - self.amount_paid
        
        # Update status based on payment
        if self.status not in ['draft', 'pending_approval', 'rejected', 'void']:
            if self.amount_paid >= self.total and self.total > 0:
                self.status = 'paid'
            elif self.amount_paid > 0:
                self.status = 'partially_paid'
            elif self.due_date and timezone.now().date() > self.due_date:
                self.status = 'overdue'
            else:
                self.status = 'open'

        super().save(*args, **kwargs)

    def calculate_totals(self):
        """Calculate totals from line items"""
        lines = self.line_items.all()
        self.subtotal = sum(line.total for line in lines)
        # Tax could be sum of line items or handled separately. 
        # For simplicity, let's assume tax is not auto-calculated per line item yet unless specified.
        # But if we had tax fields on line items, we'd sum them.
        # For now, we will rely on frontend or manual input for tax if lines don't specify it, 
        # OR just sum total.
        # Let's simple sum totals.
        self.total = self.subtotal + self.tax_amount
        self.save()


class BillLineItem(models.Model):
    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name='line_items')
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('1.00'))
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    
    # Optional: Link to an expense account if user knows it
    # For now, just a text field or simple category
    expense_category = models.CharField(max_length=100, blank=True)
    
    inventory_item = models.ForeignKey(
        'inventory.Part',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='bill_line_items',
        help_text='Inventory item associated with this line item'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.total = self.quantity * self.unit_price
        super().save(*args, **kwargs)
        self.bill.calculate_totals()

class BillPayment(models.Model):
    """
    Payments made to Vendors for Bills
    """
    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('check', 'Check'),
        ('bank_transfer', 'Bank Transfer'),
        ('mobile_money', 'Mobile Money'),
        ('credit_card', 'Credit Card'),
        ('other', 'Other'),
    ]

    payment_number = models.CharField(max_length=50, unique=True, editable=False)
    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name='payments')
    
    amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    payment_date = models.DateField(default=timezone.now)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES)
    reference_number = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    
    paid_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='bill_payments_made')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-payment_date', '-created_at']
        indexes = [
            models.Index(fields=['payment_number']),
            models.Index(fields=['payment_date']),
        ]

    def __str__(self):
        return f"{self.payment_number} - {self.amount} for {self.bill.bill_number}"

    def save(self, *args, **kwargs):
        if not self.payment_number:
            # Simple ID generation
            last_id = BillPayment.objects.aggregate(max_id=models.Max('id'))['max_id'] or 0
            self.payment_number = f"BPAY{(last_id + 1):06d}"
            
        super().save(*args, **kwargs)
        self.update_bill_status()

    def update_bill_status(self):
        """Update parent bill amount_paid and status"""
        total_paid = self.bill.payments.aggregate(total=models.Sum('amount'))['total'] or Decimal('0')
        self.bill.amount_paid = total_paid
        self.bill.save() # Bill.save() handles status update logic
