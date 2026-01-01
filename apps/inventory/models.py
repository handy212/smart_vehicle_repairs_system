from django.db import models
from django.core.validators import MinValueValidator
from django.utils import timezone
from decimal import Decimal
from apps.accounts.models import User


class PartCategory(models.Model):
    """Categories for organizing parts (e.g., Engine, Brakes, Electrical)"""
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    parent = models.ForeignKey(
        'self', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='subcategories'
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Part Category'
        verbose_name_plural = 'Part Categories'
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def full_path(self):
        """Returns the full category path (e.g., 'Engine > Cooling System')"""
        if self.parent:
            return f"{self.parent.full_path} > {self.name}"
        return self.name


class Supplier(models.Model):
    """Suppliers/vendors for parts"""
    SUPPLIER_TYPE_CHOICES = [
        ('manufacturer', 'Manufacturer'),
        ('distributor', 'Distributor'),
        ('wholesaler', 'Wholesaler'),
        ('retailer', 'Retailer'),
        ('other', 'Other'),
    ]

    name = models.CharField(max_length=200)
    supplier_code = models.CharField(max_length=50, unique=True)
    supplier_type = models.CharField(max_length=20, choices=SUPPLIER_TYPE_CHOICES, default='distributor')
    
    # Contact information
    contact_person = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    fax = models.CharField(max_length=20, blank=True)
    website = models.URLField(blank=True)
    
    # Address
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=50, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, default='USA')
    
    # Business details
    tax_id = models.CharField(max_length=50, blank=True, verbose_name='Tax ID/EIN')
    payment_terms = models.CharField(max_length=100, blank=True, help_text='e.g., Net 30, COD')
    credit_limit = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    
    # Status
    is_active = models.BooleanField(default=True)
    is_preferred = models.BooleanField(default=False, help_text='Preferred supplier for pricing/availability')
    
    # Notes
    notes = models.TextField(blank=True)
    
    # Django Ledger Vendor reference (for AP tracking)
    ledger_vendor = models.OneToOneField(
        'django_ledger.VendorModel',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='repair_supplier',
        help_text="Django Ledger Vendor for AP tracking and aging reports"
    )
    
    # Tracking
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='suppliers_created')

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['supplier_code']),
            models.Index(fields=['name']),
            models.Index(fields=['is_active', 'is_preferred']),
        ]

    def __str__(self):
        return f"{self.name} ({self.supplier_code})"


class Part(models.Model):
    """Parts inventory catalog"""
    UNIT_CHOICES = [
        ('piece', 'Piece'),
        ('set', 'Set'),
        ('pair', 'Pair'),
        ('gallon', 'Gallon'),
        ('quart', 'Quart'),
        ('liter', 'Liter'),
        ('bottle', 'Bottle'),
        ('can', 'Can'),
        ('box', 'Box'),
        ('package', 'Package'),
        ('roll', 'Roll'),
        ('foot', 'Foot'),
        ('meter', 'Meter'),
        ('other', 'Other'),
    ]

    # Basic information
    part_number = models.CharField(max_length=100, unique=True, db_index=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    category = models.ForeignKey(PartCategory, on_delete=models.PROTECT, related_name='parts')
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='parts',
        help_text='Branch this part inventory belongs to'
    )
    
    # Manufacturer info
    manufacturer = models.CharField(max_length=200, blank=True)
    manufacturer_part_number = models.CharField(max_length=100, blank=True)
    
    # Supplier info
    suppliers = models.ManyToManyField(Supplier, related_name='parts', blank=True)
    preferred_supplier = models.ForeignKey(
        Supplier, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='preferred_parts'
    )
    
    # Inventory
    quantity_in_stock = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    quantity_reserved = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    quantity_on_order = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    reorder_point = models.IntegerField(default=10, validators=[MinValueValidator(0)])
    reorder_quantity = models.IntegerField(default=20, validators=[MinValueValidator(0)])
    minimum_stock = models.IntegerField(default=5, validators=[MinValueValidator(0)])
    maximum_stock = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(0)])
    
    # Unit
    unit = models.CharField(max_length=20, choices=UNIT_CHOICES, default='piece')
    
    # Pricing
    cost_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
        help_text='Cost per unit from supplier'
    )
    selling_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
        help_text='Price charged to customer'
    )
    markup_percentage = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))]
    )
    list_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Manufacturer suggested retail price'
    )
    
    # Location
    bin_location = models.CharField(max_length=50, blank=True, help_text='Physical storage location')
    shelf = models.CharField(max_length=50, blank=True)
    
    # Specifications
    weight = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='Weight in pounds')
    dimensions = models.CharField(max_length=100, blank=True, help_text='L x W x H')
    
    # Compatibility
    compatible_makes = models.CharField(max_length=500, blank=True, help_text='Comma-separated list of makes')
    compatible_models = models.CharField(max_length=500, blank=True, help_text='Comma-separated list of models')
    compatible_years = models.CharField(max_length=100, blank=True, help_text='e.g., 2015-2023')
    
    # Warranty
    warranty_months = models.IntegerField(null=True, blank=True)
    warranty_notes = models.TextField(blank=True)
    
    # Image
    image = models.ImageField(upload_to='parts/images/%Y/%m/', null=True, blank=True)
    
    # Status
    is_active = models.BooleanField(default=True)
    is_taxable = models.BooleanField(default=True)
    is_core = models.BooleanField(default=False, help_text='Requires core exchange')
    core_charge = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    
    # Django Ledger Item reference (for inventory accounting)
    ledger_item = models.OneToOneField(
        'django_ledger.ItemModel',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='repair_part',
        help_text="Django Ledger Item for inventory accounting and COGS tracking"
    )
    
    # Tracking
    last_cost_update = models.DateTimeField(null=True, blank=True)
    last_price_update = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='parts_created')

    class Meta:
        ordering = ['part_number']
        indexes = [
            models.Index(fields=['part_number']),
            models.Index(fields=['name']),
            models.Index(fields=['category', 'is_active']),
            models.Index(fields=['quantity_in_stock']),
            models.Index(fields=['manufacturer']),
        ]

    def __str__(self):
        return f"{self.part_number} - {self.name}"

    @property
    def available_quantity(self):
        """Quantity available for use (not reserved)"""
        if self.quantity_in_stock is None or self.quantity_reserved is None:
            return 0
        return self.quantity_in_stock - self.quantity_reserved

    @property
    def is_low_stock(self):
        """Check if stock is below reorder point"""
        if self.quantity_in_stock is None or self.reorder_point is None:
            return False
        return self.quantity_in_stock <= self.reorder_point

    @property
    def is_out_of_stock(self):
        """Check if part is out of stock"""
        if self.quantity_in_stock is None:
            return False
        return self.quantity_in_stock == 0

    @property
    def needs_reorder(self):
        """Check if part needs to be reordered"""
        return self.is_low_stock and not self.is_out_of_stock

    @property
    def profit_margin(self):
        """Calculate profit margin percentage"""
        if not self.cost_price or not self.selling_price or self.cost_price == 0:
            return Decimal('0.00')
        return ((self.selling_price - self.cost_price) / self.cost_price) * 100

    @property
    def total_value(self):
        """Total inventory value (cost * quantity)"""
        if not self.cost_price or self.quantity_in_stock is None:
            return Decimal('0.00')
        return self.cost_price * self.quantity_in_stock

    def save(self, *args, **kwargs):
        # Auto-calculate selling price if markup is set
        if self.markup_percentage > 0 and self.cost_price:
            self.selling_price = self.cost_price * (1 + self.markup_percentage / 100)
        
        # Update price timestamp if price changed
        if self.pk:
            old_part = Part.objects.filter(pk=self.pk).first()
            if old_part:
                if old_part.cost_price != self.cost_price:
                    self.last_cost_update = timezone.now()
                if old_part.selling_price != self.selling_price:
                    self.last_price_update = timezone.now()
        
        super().save(*args, **kwargs)


class PurchaseOrder(models.Model):
    """Purchase orders for ordering parts from suppliers"""
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('confirmed', 'Confirmed'),
        ('partially_received', 'Partially Received'),
        ('received', 'Received'),
        ('cancelled', 'Cancelled'),
    ]

    # Auto-generated PO number
    po_number = models.CharField(max_length=20, unique=True, editable=False, db_index=True)
    
    # Supplier
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='purchase_orders')
    
    # Branch assignment (for accounting)
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='purchase_orders',
        help_text="Branch where this purchase order is for"
    )
    
    # Django Ledger Bill reference (for AP tracking when PO is received)
    ledger_bill = models.OneToOneField(
        'django_ledger.BillModel',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='repair_purchase_order',
        help_text="Django Ledger Bill created when PO is received (for AP tracking)"
    )
    
    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft', db_index=True)
    
    # Dates
    order_date = models.DateField(default=timezone.now)
    expected_delivery_date = models.DateField(null=True, blank=True)
    received_date = models.DateField(null=True, blank=True)
    
    # Financial
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    shipping_cost = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    total = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    
    # Notes
    notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True, help_text='Internal notes not visible to supplier')
    
    # Tracking
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='purchase_orders_created')
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='purchase_orders_submitted')
    submitted_at = models.DateTimeField(null=True, blank=True)
    received_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='purchase_orders_received')

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['po_number']),
            models.Index(fields=['status', 'order_date']),
            models.Index(fields=['supplier', 'status']),
        ]

    def __str__(self):
        return f"{self.po_number} - {self.supplier.name}"

    def save(self, *args, **kwargs):
        if not self.po_number:
            # Generate PO number: PO000001, PO000002, etc.
            last_po = PurchaseOrder.objects.order_by('-id').first()
            if last_po and last_po.po_number:
                last_number = int(last_po.po_number[2:])
                new_number = last_number + 1
            else:
                new_number = 1
            self.po_number = f"PO{new_number:06d}"
        
        super().save(*args, **kwargs)

    @property
    def total_items(self):
        """Total number of line items"""
        return self.items.count()

    @property
    def total_quantity(self):
        """Total quantity of all items"""
        return self.items.aggregate(total=models.Sum('quantity'))['total'] or 0

    @property
    def received_quantity(self):
        """Total quantity received"""
        return self.items.aggregate(total=models.Sum('quantity_received'))['total'] or 0

    @property
    def is_fully_received(self):
        """Check if all items have been received"""
        total_qty = self.total_quantity
        received_qty = self.received_quantity
        if total_qty is None or total_qty == 0:
            return False
        return received_qty >= total_qty

    @property
    def is_partially_received(self):
        """Check if some items have been received"""
        received_qty = self.received_quantity
        total_qty = self.total_quantity
        if received_qty is None or total_qty is None:
            return False
        return 0 < received_qty < total_qty

    def calculate_totals(self):
        """Recalculate order totals from line items"""
        items = self.items.all()
        self.subtotal = sum(item.total for item in items)
        self.total = self.subtotal + self.tax_amount + self.shipping_cost
        self.save()


class PurchaseOrderItem(models.Model):
    """Line items in a purchase order"""
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='items')
    part = models.ForeignKey(Part, on_delete=models.PROTECT, related_name='purchase_order_items')
    
    # Quantities
    quantity = models.IntegerField(validators=[MinValueValidator(1)])
    quantity_received = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    
    # Pricing
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    total = models.DecimalField(max_digits=10, decimal_places=2, editable=False)
    
    # Receiving
    received_date = models.DateField(null=True, blank=True)
    
    # Notes
    notes = models.TextField(blank=True)
    
    # Tracking
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['id']
        unique_together = ['purchase_order', 'part']

    def __str__(self):
        return f"{self.purchase_order.po_number} - {self.part.part_number}"

    def save(self, *args, **kwargs):
        # Calculate total
        self.total = self.quantity * self.unit_cost
        super().save(*args, **kwargs)
        
        # Update purchase order totals
        self.purchase_order.calculate_totals()
        
        # Update part quantity_on_order
        if self.purchase_order.status in ['submitted', 'confirmed']:
            pending_qty = self.quantity - self.quantity_received
            # Recalculate total on order for this part
            total_on_order = PurchaseOrderItem.objects.filter(
                part=self.part,
                purchase_order__status__in=['submitted', 'confirmed']
            ).aggregate(
                total=models.Sum(models.F('quantity') - models.F('quantity_received'))
            )['total'] or 0
            self.part.quantity_on_order = total_on_order
            self.part.save()

    @property
    def is_fully_received(self):
        """Check if this line item is fully received"""
        if self.quantity_received is None or self.quantity is None:
            return False
        return self.quantity_received >= self.quantity

    @property
    def remaining_quantity(self):
        """Quantity still to be received"""
        if self.quantity is None or self.quantity_received is None:
            return 0
        return self.quantity - self.quantity_received


class InventoryTransaction(models.Model):
    """Log of all inventory movements"""
    TRANSACTION_TYPE_CHOICES = [
        ('purchase', 'Purchase/Receive'),
        ('sale', 'Sale/Usage'),
        ('adjustment', 'Manual Adjustment'),
        ('return', 'Return to Supplier'),
        ('damage', 'Damage/Loss'),
        ('transfer', 'Transfer'),
        ('count', 'Physical Count'),
        ('reserve', 'Reservation'),
        ('release', 'Release Reservation'),
    ]

    part = models.ForeignKey(Part, on_delete=models.PROTECT, related_name='transactions')
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPE_CHOICES, db_index=True)
    
    # Quantity change (positive for additions, negative for removals)
    quantity = models.IntegerField()
    
    # Balance after transaction
    balance_after = models.IntegerField()
    
    # Cost
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    total_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    
    # References
    purchase_order = models.ForeignKey(
        PurchaseOrder, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='inventory_transactions'
    )
    work_order = models.ForeignKey(
        'workorders.WorkOrder',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='inventory_transactions'
    )
    
    # Notes
    reason = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    
    # Tracking
    transaction_date = models.DateTimeField(default=timezone.now, db_index=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='inventory_transactions')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-transaction_date']
        indexes = [
            models.Index(fields=['part', 'transaction_date']),
            models.Index(fields=['transaction_type', 'transaction_date']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        sign = '+' if self.quantity > 0 else ''
        return f"{self.part.part_number} - {sign}{self.quantity} ({self.get_transaction_type_display()})"

    def save(self, *args, **kwargs):
        # Calculate total cost if not set
        if self.unit_cost and self.quantity and not self.total_cost:
            self.total_cost = abs(self.quantity) * self.unit_cost
        
        # Update part quantity if this is a new transaction
        if not self.pk:
            # Handle Reservations (affect quantity_reserved)
            if self.transaction_type == 'reserve':
                self.part.quantity_reserved += abs(self.quantity)
                self.balance_after = self.part.quantity_in_stock # Physical stock doesn't change
                self.part.save()
            
            elif self.transaction_type == 'release':
                self.part.quantity_reserved = max(0, self.part.quantity_reserved - abs(self.quantity))
                self.balance_after = self.part.quantity_in_stock
                self.part.save()
            
            # Handle Physical Stock Changes (affect quantity_in_stock)
            else:
                # For adjustment-type transactions, balance_after is set explicitly in the view
                # to handle negative stock prevention. In this case, use balance_after directly.
                # For other transactions, calculate from current stock + quantity
                adjustment_types = ['adjustment', 'damage', 'count', 'return']
                try:
                    balance_check = self.balance_after is not None and self.balance_after >= 0
                except:
                    balance_check = False

                if self.transaction_type in adjustment_types and balance_check:
                    # balance_after was calculated and set explicitly in adjust_stock view
                    # Update stock to match the explicitly set balance
                    self.part.quantity_in_stock = self.balance_after
                    self.part.save()
                else:
                    # Calculate balance normally (for purchase, sale, transfer transactions)
                    new_stock = max(0, self.part.quantity_in_stock + self.quantity)
                    self.part.quantity_in_stock = new_stock
                    self.balance_after = new_stock
                    self.part.save()
        
        super().save(*args, **kwargs)


class ServicePackage(models.Model):
    """
    Service Packages (Job Kits) - Pre-defined bundles of parts and labor
    Used for quick-select in recommendations and estimates.
    """
    name = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True)
    category = models.ForeignKey(
        PartCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='service_packages',
        help_text="Category for this service package"
    )
    
    # Labor Estimates
    estimated_labor_hours = models.DecimalField(
        max_digits=6, 
        decimal_places=2, 
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Standard labor hours for this job"
    )
    
    # Metadata
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['name']
        verbose_name = 'Service Package'
        verbose_name_plural = 'Service Packages'

    def __str__(self):
        return self.name

    @property
    def total_parts_cost(self):
        """Calculate total estimated cost of parts in this package"""
        total = Decimal('0.00')
        for item in self.parts.all():
            if item.part.selling_price:
                total += item.part.selling_price * item.quantity
        return total


class ServicePackagePart(models.Model):
    """Parts included in a Service Package"""
    service_package = models.ForeignKey(
        ServicePackage,
        on_delete=models.CASCADE,
        related_name='parts'
    )
    part = models.ForeignKey(
        Part,
        on_delete=models.CASCADE,
        related_name='service_packages'
    )
    quantity = models.DecimalField(
        max_digits=8, 
        decimal_places=2, 
        default=Decimal('1.00'),
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        unique_together = ['service_package', 'part']
        verbose_name = 'Service Package Part'
        verbose_name_plural = 'Service Package Parts'

    def __str__(self):
        return f"{self.quantity}x {self.part.part_number} for {self.service_package.name}"
