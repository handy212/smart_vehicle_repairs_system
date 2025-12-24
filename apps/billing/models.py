from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from decimal import Decimal
from apps.accounts.models import User
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
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
    
    # Status and dates
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    estimate_date = models.DateField(default=timezone.now)
    valid_until = models.DateField()  # Expiration date
    approved_date = models.DateTimeField(null=True, blank=True)
    declined_date = models.DateTimeField(null=True, blank=True)
    converted_date = models.DateTimeField(null=True, blank=True)
    
    # Description
    title = models.CharField(max_length=200)
    description = models.TextField()
    notes = models.TextField(blank=True)  # Internal notes
    customer_notes = models.TextField(blank=True)  # Notes visible to customer
    
    # Financial totals (calculated from line items)
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
        """Sync parts from estimate line items to work order parts and update work order totals"""
        if not self.work_order:
            return
        
        from apps.workorders.models import WorkOrderPart
        from django.db import transaction
        
        # Ensure totals are calculated before syncing
        self.calculate_totals()
        self.refresh_from_db()
        
        # Get all part-type line items
        part_line_items = self.line_items.filter(item_type='part')
        
        with transaction.atomic():
            # Sync parts if any exist
            if part_line_items.exists():
                # Get existing work order parts from this estimate (tracked by notes or other marker)
                # For now, we'll sync all parts - in the future, we could track which ones came from estimate
                
                # Check which parts already exist to avoid duplicates
                existing_part_numbers = set(
                    self.work_order.parts.values_list('part_number', flat=True).distinct()
                )
                
                # Create WorkOrderPart for each EstimateLineItem that's a part
                for line_item in part_line_items:
                    # Generate a unique part number for this line item if it doesn't have one
                    part_number = line_item.part_number or f"EST-{self.id}-{line_item.id}"
                    
                    # Skip if this part already exists (by part_number)
                    if part_number in existing_part_numbers:
                        continue
                    
                    # Create WorkOrderPart
                    WorkOrderPart.objects.create(
                        work_order=self.work_order,
                        part_number=part_number,
                        part_name=line_item.description[:255] if line_item.description else f"Part from Estimate {self.estimate_number}",
                        description=line_item.notes or f"From estimate {self.estimate_number}",
                        quantity=line_item.quantity,
                        unit_cost=line_item.unit_price,
                        total_cost=line_item.total,
                        selling_price=line_item.total,  # Use total as selling price initially
                        markup_percentage=0,  # Can be adjusted later
                        status='pending',  # Default to pending, technician will update as parts are ordered/received
                    )
                    # Add to existing set to prevent duplicates in same sync
                    existing_part_numbers.add(part_number)
            
            # Always update work order estimated totals from estimate (even if no parts)
            # Refresh line items queryset to ensure we have latest data
            from apps.billing.models import EstimateLineItem
            line_items = EstimateLineItem.objects.filter(estimate=self)
            
            # Calculate parts cost from estimate line items
            parts_subtotal = sum(
                Decimal(str(item.total or '0')) for item in line_items if item.item_type == 'part'
            ) or Decimal('0')
            
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
            
            # Total estimate amount (includes tax, fees, etc.)
            # Use the estimate's calculated total which includes all taxes and fees
            # Ensure we have a valid total
            estimated_total = self.total
            if not estimated_total or estimated_total == Decimal('0'):
                # Recalculate total as fallback
                estimated_total = (
                    (self.subtotal or Decimal('0')) - (self.discount_amount or Decimal('0')) +
                    (self.tax_amount or Decimal('0')) +
                    (self.shop_supplies_fee or Decimal('0')) +
                    (self.environmental_fee or Decimal('0'))
                )
                # If still 0, use subtotal at minimum
                if estimated_total == Decimal('0') and self.subtotal:
                    estimated_total = self.subtotal
            
            # Ensure we always set a non-zero value if we have costs
            if estimated_total == Decimal('0') and (parts_subtotal > 0 or labor_subtotal > 0):
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
        self.tax_hrl_amount = breakdown.hrl_amount
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
        # Can be converted if approved and not already converted
        return self.status == 'approved'
    
    @property
    def subtotal_after_discount(self):
        """Calculate subtotal after discount"""
        return self.subtotal - self.discount_amount


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
        # Calculate total
        self.total = (self.quantity * self.unit_price).quantize(Decimal('0.01'))
        
        super().save(*args, **kwargs)
        
        # Update estimate totals
        self.estimate.calculate_totals()


class Invoice(models.Model):
    """Invoices for completed work"""
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
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
    ledger_invoice = models.OneToOneField(
        'django_ledger.InvoiceModel',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='repair_invoice',
        help_text="Django Ledger Invoice for full accounting integration"
    )
    
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
                self.invoice_number = self.branch.get_next_invoice_number()
            else:
                # Fallback: Generate invoice number without branch code
                # Find last invoice number and increment
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
        self.tax_hrl_amount = breakdown.hrl_amount
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
        total = Decimal('0')
        if self.item_type == 'labor' and self.labor_hours and self.labor_rate:
            total = (self.labor_hours * self.labor_rate)
        elif self.quantity and self.unit_price:
            total = (self.quantity * self.unit_price)
        elif self.unit_price:
            total = self.unit_price
        elif self.total:
            total = self.total
        self.total = total.quantize(Decimal('0.01'))
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
        
        if not is_new:
            old_payment = Payment.objects.get(pk=self.pk)
            old_status = old_payment.status
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
        if self.status == 'completed' and (is_new or old_status != 'completed'):
            self.update_invoice_payment()
        elif old_status == 'completed' and self.status != 'completed':
            # Payment was completed but now is not (refunded, cancelled, failed)
            self.update_invoice_payment()
    
    def update_invoice_payment(self):
        """Update the invoice's amount_paid"""
        total_paid = sum(
            payment.amount - payment.refund_amount
            for payment in self.invoice.payments.filter(status='completed')
        )
        self.invoice.amount_paid = total_paid
        self.invoice.save()
    
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
