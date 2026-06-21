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
    # ledger_vendor = models.OneToOneField(
    #     'django_ledger.VendorModel',
    #     on_delete=models.SET_NULL,
    #     null=True,
    #     blank=True,
    #     related_name='repair_supplier',
    #     help_text="Django Ledger Vendor for AP tracking and aging reports"
    # )
    
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

    @property
    def open_balance(self):
        """
        Sum of totals for Purchase Orders that are synced to QBO but not yet fully settled.
        Currently, in our sync logic, 'received' status on a synced PO indicates it is paid in QBO.
        """
        from apps.quickbooks_online.models import QBOMapping
        from django.contrib.contenttypes.models import ContentType
        
        po_ct = ContentType.objects.get_for_model(self.purchase_orders.model)
        synced_po_ids = QBOMapping.objects.filter(
            content_type=po_ct,
            status='synced'
        ).values_list('object_id', flat=True)
        
        # Open POs are those synced but not yet 'received' (paid) or 'cancelled'
        open_pos = self.purchase_orders.filter(
            id__in=synced_po_ids,
            status__in=['approved', 'confirmed', 'partially_received']
        )
        return open_pos.aggregate(total=models.Sum('total'))['total'] or Decimal('0.00')

    @property
    def overdue_payment(self):
        """
        Sum of totals for open Purchase Orders that are past their due date.
        """
        from apps.quickbooks_online.models import QBOMapping
        from django.contrib.contenttypes.models import ContentType
        
        po_ct = ContentType.objects.get_for_model(self.purchase_orders.model)
        synced_po_ids = QBOMapping.objects.filter(
            content_type=po_ct,
            status='synced'
        ).values_list('object_id', flat=True)
        
        overdue_pos = self.purchase_orders.filter(
            id__in=synced_po_ids,
            status__in=['approved', 'confirmed', 'partially_received'],
            due_date__lt=timezone.now().date()
        )
        return overdue_pos.aggregate(total=models.Sum('total'))['total'] or Decimal('0.00')


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

    ITEM_TYPE_CHOICES = [
        ('inventory', 'Inventory'),
        ('non_inventory', 'Non-inventory'),
        ('service', 'Service'),
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
    barcode = models.CharField(max_length=100, blank=True, null=True, unique=True, db_index=True, help_text='UPC/EAN or internal barcode sequence')
    
    # Supplier info
    suppliers = models.ManyToManyField(Supplier, related_name='parts', blank=True)
    preferred_supplier = models.ForeignKey(
        Supplier, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='preferred_parts'
    )
    
    # Inventory - DEPRECATED: Use StockItem model for branch-specific inventory
    quantity_in_stock = models.IntegerField(default=0, validators=[MinValueValidator(0)], help_text="DEPRECATED: Use StockItem")
    quantity_reserved = models.IntegerField(default=0, validators=[MinValueValidator(0)], help_text="DEPRECATED: Use StockItem")
    quantity_on_order = models.IntegerField(default=0, validators=[MinValueValidator(0)], help_text="DEPRECATED: Use StockItem")
    reorder_point = models.IntegerField(default=10, validators=[MinValueValidator(0)], help_text="DEPRECATED: Use StockItem")
    reorder_quantity = models.IntegerField(default=20, validators=[MinValueValidator(0)], help_text="DEPRECATED: Use StockItem")
    minimum_stock = models.IntegerField(default=5, validators=[MinValueValidator(0)], help_text="DEPRECATED: Use StockItem")
    maximum_stock = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(0)], help_text="DEPRECATED: Use StockItem")
    
    # Unit
    unit = models.CharField(max_length=20, choices=UNIT_CHOICES, default='piece')

    # QuickBooks Online item classification (maps to QBO Item.Type)
    item_type = models.CharField(
        max_length=20,
        choices=ITEM_TYPE_CHOICES,
        default='inventory',
        db_index=True,
        help_text='How this part syncs to QuickBooks Online (Inventory, NonInventory, or Service).',
    )
    inventory_start_date = models.DateField(
        null=True,
        blank=True,
        help_text='Opening inventory date sent to QBO when first synced as an Inventory item.',
    )
    
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
    
    # Location - DEPRECATED: Use StockItem
    bin_location = models.CharField(max_length=50, blank=True, help_text='DEPRECATED: Use StockItem')
    shelf = models.CharField(max_length=50, blank=True, help_text='DEPRECATED: Use StockItem')
    
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
    # ledger_item = models.OneToOneField(
    #     'django_ledger.ItemModel',
    #     on_delete=models.SET_NULL,
    #     null=True,
    #     blank=True,
    #     related_name='repair_part',
    #     help_text="Django Ledger Item for inventory accounting and COGS tracking"
    # )
    
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
            models.Index(fields=['quantity_in_stock']),  # DEPRECATED: Kept for backward compatibility
            models.Index(fields=['manufacturer']),
        ]

    def __str__(self):
        return f"{self.part_number} - {self.name}"

    @property
    def qbo_item_type(self):
        """QuickBooks Online Item.Type value for this part."""
        return {
            'inventory': 'Inventory',
            'non_inventory': 'NonInventory',
            'service': 'Service',
        }.get(self.item_type, 'Inventory')

    def tracks_inventory(self):
        return self.item_type == 'inventory'

    def total_quantity_on_hand(self):
        """Sum on-hand quantity across all branch StockItem rows."""
        total = self.stock_items.aggregate(total=models.Sum('quantity_in_stock'))['total']
        return int(total or 0)

    @property
    def available_quantity(self):
        """
        Quantity available for use (not reserved).
        
        DEPRECATED: This property uses deprecated Part.quantity_in_stock and quantity_reserved fields.
        For branch-aware inventory, use StockItem model instead.
        This property is kept for backward compatibility with legacy code.
        """
        if self.quantity_in_stock is None or self.quantity_reserved is None:
            return 0
        return self.quantity_in_stock - self.quantity_reserved

    @property
    def is_low_stock(self):
        """
        Check if stock is below reorder point.
        
        DEPRECATED: This property uses deprecated Part.quantity_in_stock and reorder_point fields.
        For branch-aware inventory, use StockItem model instead.
        This property is kept for backward compatibility with legacy code.
        """
        if self.quantity_in_stock is None or self.reorder_point is None:
            return False
        return self.quantity_in_stock <= self.reorder_point

    @property
    def is_out_of_stock(self):
        """
        Check if part is out of stock.
        
        DEPRECATED: This property uses deprecated Part.quantity_in_stock field.
        For branch-aware inventory, use StockItem model instead.
        This property is kept for backward compatibility with legacy code.
        """
        if self.quantity_in_stock is None:
            return False
        return self.quantity_in_stock == 0

    @property
    def needs_reorder(self):
        """
        Check if part needs to be reordered.
        
        DEPRECATED: This property uses deprecated Part fields.
        For branch-aware inventory, use StockItem model instead.
        This property is kept for backward compatibility with legacy code.
        """
        return self.is_low_stock and not self.is_out_of_stock

    @property
    def profit_margin(self):
        """Calculate profit margin percentage"""
        if not self.cost_price or not self.selling_price or self.cost_price == 0:
            return Decimal('0.00')
        return ((self.selling_price - self.cost_price) / self.cost_price) * 100

    @property
    def total_value(self):
        """
        Total inventory value (cost * quantity).
        
        DEPRECATED: This property uses deprecated Part.quantity_in_stock field.
        For branch-aware inventory, calculate from StockItem model instead.
        This property is kept for backward compatibility with legacy code.
        """
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


class StockItem(models.Model):
    """
    Inventory stock tracking per branch.
    Replaces the global inventory fields in Part model.
    """
    part = models.ForeignKey(Part, on_delete=models.CASCADE, related_name='stock_items')
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='stock_items',
        help_text='Branch where this stock is held'
    )
    
    # Inventory Levels
    quantity_in_stock = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    quantity_reserved = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    quantity_on_order = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    
    # Settings
    reorder_point = models.IntegerField(default=10, validators=[MinValueValidator(0)])
    reorder_quantity = models.IntegerField(default=20, validators=[MinValueValidator(0)])
    minimum_stock = models.IntegerField(default=5, validators=[MinValueValidator(0)])
    maximum_stock = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(0)])
    
    # Location
    bin_location = models.CharField(max_length=50, blank=True, help_text='Physical storage location at this branch')
    shelf = models.CharField(max_length=50, blank=True)
    
    # Tracking
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['part', 'branch']
        unique_together = ['part', 'branch']
        indexes = [
            models.Index(fields=['part', 'branch']),
            models.Index(fields=['branch', 'quantity_in_stock']),
            models.Index(fields=['branch', 'bin_location']),
        ]
    
    def __str__(self):
        return f"{self.part.part_number} at {self.branch.name}"
    
    @property
    def available_quantity(self):
        """Quantity available for use (not reserved)"""
        return max(0, self.quantity_in_stock - self.quantity_reserved)
    
    @property
    def is_low_stock(self):
        """Check if stock is below reorder point"""
        return self.quantity_in_stock <= self.reorder_point
    
    @property
    def is_out_of_stock(self):
        """Check if part is out of stock"""
        return self.quantity_in_stock == 0
    
    @property
    def total_value(self):
        """Total inventory value at this branch (cost * quantity)"""
        if not self.part.cost_price:
            return Decimal('0.00')
        return self.part.cost_price * self.quantity_in_stock


class Transfer(models.Model):
    """
    Stock transfer between branches
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending_approval', 'Pending Approval'),
        ('requested', 'Requested'), # Kept for backward compatibility
        ('approved', 'Approved'),
        ('in_transit', 'In Transit'),
        ('received', 'Received'),
        ('rejected', 'Rejected'),
        ('cancelled', 'Cancelled'),
    ]
    
    transfer_number = models.CharField(max_length=20, unique=True, editable=False, db_index=True)
    
    # Branches
    source_branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='transfers_out',
        help_text="Branch sending the stock"
    )
    destination_branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='transfers_in',
        help_text="Branch receiving the stock"
    )
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft', db_index=True)
    
    # Dates
    requested_date = models.DateTimeField(default=timezone.now)
    approved_date = models.DateTimeField(null=True, blank=True)
    shipped_date = models.DateTimeField(null=True, blank=True)
    received_date = models.DateTimeField(null=True, blank=True)
    
    # Notes
    notes = models.TextField(blank=True)
    rejection_reason = models.TextField(blank=True)
    
    # Tracking
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='transfers_created')
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='transfers_submitted')
    submitted_at = models.DateTimeField(null=True, blank=True)
    assigned_approver = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='transfers_assigned', help_text='User selected to approve this transfer')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='transfers_approved')
    rejected_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='transfers_rejected')
    rejected_at = models.DateTimeField(null=True, blank=True)
    received_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='transfers_received')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['source_branch', 'destination_branch']),
        ]
        
    def __str__(self):
        return f"{self.transfer_number}: {self.source_branch.code} -> {self.destination_branch.code}"
        
    def save(self, *args, **kwargs):
        if not self.transfer_number:
            # Generate Transfer number: TRF000001
            last_trf = Transfer.objects.order_by('-id').first()
            if last_trf and last_trf.transfer_number:
                last_number = int(last_trf.transfer_number[3:])
                new_number = last_number + 1
            else:
                new_number = 1
            self.transfer_number = f"TRF{new_number:06d}"
        
        super().save(*args, **kwargs)


class TransferApproval(models.Model):
    """Individual approval assignment for a stock transfer."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    transfer = models.ForeignKey(Transfer, on_delete=models.CASCADE, related_name='approvals')
    approver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='transfer_approvals')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at', 'id']
        unique_together = ['transfer', 'approver']
        indexes = [
            models.Index(fields=['transfer', 'status']),
            models.Index(fields=['approver', 'status']),
        ]

    def __str__(self):
        return f"{self.transfer.transfer_number} - {self.approver.get_full_name() or self.approver.username}"


class TransferItem(models.Model):
    """Item within a stock transfer"""
    transfer = models.ForeignKey(Transfer, on_delete=models.CASCADE, related_name='items')
    part = models.ForeignKey(Part, on_delete=models.PROTECT, related_name='transfer_items')
    
    quantity_requested = models.IntegerField(validators=[MinValueValidator(1)])
    quantity_sent = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    quantity_received = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    
    notes = models.CharField(max_length=255, blank=True)
    
    class Meta:
        unique_together = ['transfer', 'part']
        
    def __str__(self):
        return f"{self.transfer.transfer_number} - {self.part.part_number}"

class PurchaseOrder(models.Model):
    """Purchase orders for ordering parts from suppliers"""
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending_approval', 'Pending Approval'),
        ('approved', 'Approved'),
        ('confirmed', 'Confirmed'),
        ('partially_received', 'Partially Received'),
        ('received', 'Received'),
        ('rejected', 'Rejected'),
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
    # ledger_bill = models.OneToOneField(
    #     'django_ledger.BillModel',
    #     on_delete=models.SET_NULL,
    #     null=True,
    #     blank=True,
    #     related_name='repair_purchase_order',
    #     help_text="Django Ledger Bill created when PO is received (for AP tracking)"
    # )
    
    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft', db_index=True)
    
    # Dates
    order_date = models.DateField(default=timezone.now)
    expected_delivery_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True, help_text="Due date for payment")
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
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='purchase_orders_approved')
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='purchase_orders_rejected')
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    received_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='purchase_orders_received')
    assigned_approver = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='purchase_orders_assigned', help_text='User selected to approve this PO')

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


class PurchaseOrderApproval(models.Model):
    """Individual approval assignment for a purchase order."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='approvals')
    approver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='purchase_order_approvals')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at', 'id']
        unique_together = ['purchase_order', 'approver']
        indexes = [
            models.Index(fields=['purchase_order', 'status']),
            models.Index(fields=['approver', 'status']),
        ]

    def __str__(self):
        return f"{self.purchase_order.po_number} - {self.approver.get_full_name() or self.approver.username}"


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
        
        # Update StockItem quantity_on_order (inventory catalog parts only)
        if self.part.tracks_inventory() and self.purchase_order.status in ['pending_approval', 'approved', 'confirmed']:
            branch = self.purchase_order.branch
            if branch:
                # Get or create StockItem for this branch
                stock_item, _ = StockItem.objects.get_or_create(
                    part=self.part,
                    branch=branch,
                    defaults={
                        'reorder_point': self.part.reorder_point,
                        'reorder_quantity': self.part.reorder_quantity,
                        'minimum_stock': self.part.minimum_stock,
                    }
                )
                # Recalculate total on order for this part at this branch
                total_on_order = PurchaseOrderItem.objects.filter(
                    part=self.part,
                    purchase_order__status__in=['pending_approval', 'approved', 'confirmed'],
                    purchase_order__branch=branch
                ).aggregate(
                    total=models.Sum(models.F('quantity') - models.F('quantity_received'))
                )['total'] or 0
                stock_item.quantity_on_order = max(0, total_on_order)
                stock_item.save()

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
        ('loss', 'Loss'),
        ('transfer', 'Transfer'),
        ('transfer_in', 'Transfer In'),
        ('transfer_out', 'Transfer Out'),
        ('count', 'Physical Count'),
        ('correction', 'Correction'),
        ('found', 'Found Stock'),
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
    transfer = models.ForeignKey(
        Transfer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='inventory_transactions'
    )
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        null=True, # Allow null for migration of old records
        blank=True,
        related_name='inventory_transactions',
        help_text="Branch where this transaction occurred"
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
        
        # NOTE: Stock updates are handled by InventoryService.record_transaction()
        # This model's save method should NOT modify stock directly.
        # The balance_after field should be set by the service layer.
        
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


class StockAlert(models.Model):
    """
    Stock alerts for low stock, out of stock, and reorder notifications.
    Branch-aware alerts based on StockItem levels.
    """
    ALERT_TYPE_CHOICES = [
        ('low_stock', 'Low Stock'),
        ('out_of_stock', 'Out of Stock'),
        ('reorder_point', 'Reorder Point Reached'),
        ('overstock', 'Overstock'),
    ]
    
    SEVERITY_CHOICES = [
        ('info', 'Info'),
        ('warning', 'Warning'),
        ('critical', 'Critical'),
    ]
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('acknowledged', 'Acknowledged'),
        ('resolved', 'Resolved'),
        ('dismissed', 'Dismissed'),
    ]
    
    part = models.ForeignKey(
        Part,
        on_delete=models.CASCADE,
        related_name='stock_alerts',
        help_text='Part that triggered this alert'
    )
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='stock_alerts',
        help_text='Branch where this alert applies'
    )
    stock_item = models.ForeignKey(
        StockItem,
        on_delete=models.CASCADE,
        related_name='alerts',
        null=True,
        blank=True,
        help_text='StockItem that triggered this alert'
    )
    
    alert_type = models.CharField(
        max_length=20,
        choices=ALERT_TYPE_CHOICES,
        help_text='Type of stock alert'
    )
    severity = models.CharField(
        max_length=20,
        choices=SEVERITY_CHOICES,
        default='warning',
        help_text='Severity level of the alert'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active',
        help_text='Current status of the alert'
    )
    
    # Stock levels at time of alert
    current_quantity = models.IntegerField(
        default=0,
        help_text='Stock quantity when alert was created'
    )
    reorder_point = models.IntegerField(
        default=0,
        help_text='Reorder point for this part at this branch'
    )
    minimum_stock = models.IntegerField(
        default=0,
        help_text='Minimum stock level for this part'
    )
    
    # Alert metadata
    message = models.TextField(
        blank=True,
        help_text='Alert message or description'
    )
    acknowledged_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acknowledged_stock_alerts',
        help_text='User who acknowledged this alert'
    )
    acknowledged_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When this alert was acknowledged'
    )
    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When this alert was resolved'
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at', '-severity']
        indexes = [
            models.Index(fields=['status', 'alert_type']),
            models.Index(fields=['branch', 'status']),
            models.Index(fields=['part', 'branch']),
        ]
        verbose_name = 'Stock Alert'
        verbose_name_plural = 'Stock Alerts'
    
    def __str__(self):
        return f"{self.get_alert_type_display()} - {self.part.name} ({self.branch.name})"
    
    def acknowledge(self, user):
        """Mark alert as acknowledged"""
        self.status = 'acknowledged'
        self.acknowledged_by = user
        self.acknowledged_at = timezone.now()
        self.save(update_fields=['status', 'acknowledged_by', 'acknowledged_at', 'updated_at'])
    
    def resolve(self):
        """Mark alert as resolved"""
        self.status = 'resolved'
        self.resolved_at = timezone.now()
        self.save(update_fields=['status', 'resolved_at', 'updated_at'])
    
    def dismiss(self):
        """Dismiss the alert"""
        self.status = 'dismissed'
        self.save(update_fields=['status', 'updated_at'])


class PhysicalCountSession(models.Model):
    """
    Physical inventory count session - tracks a complete physical count of inventory
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    session_number = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
        db_index=True,
        help_text='Auto-generated session number'
    )
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='physical_count_sessions',
        help_text='Branch where physical count is being performed'
    )
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        db_index=True
    )
    
    # Count details
    count_date = models.DateField(
        default=timezone.now,
        help_text='Date when physical count was performed'
    )
    notes = models.TextField(
        blank=True,
        help_text='Notes about this count session'
    )
    
    # Statistics
    total_items_counted = models.IntegerField(
        default=0,
        help_text='Total number of items counted in this session'
    )
    total_discrepancies = models.IntegerField(
        default=0,
        help_text='Total number of items with discrepancies'
    )
    
    # Tracking
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='physical_count_sessions_created',
        help_text='User who created this count session'
    )
    completed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='physical_count_sessions_completed',
        help_text='User who completed this count session'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['session_number']),
            models.Index(fields=['branch', 'status']),
            models.Index(fields=['count_date', 'status']),
        ]
        verbose_name = 'Physical Count Session'
        verbose_name_plural = 'Physical Count Sessions'
    
    def __str__(self):
        return f"{self.session_number} - {self.branch.name} ({self.get_status_display()})"
    
    def save(self, *args, **kwargs):
        if not self.session_number:
            # Generate session number: PC000001, PC000002, etc.
            last_session = PhysicalCountSession.objects.order_by('-id').first()
            if last_session and last_session.session_number:
                try:
                    last_number = int(last_session.session_number[2:])
                    new_number = last_number + 1
                except ValueError:
                    new_number = 1
            else:
                new_number = 1
            self.session_number = f"PC{new_number:06d}"
        
        super().save(*args, **kwargs)
    
    def start(self):
        """Start the count session"""
        if self.status != 'draft':
            raise ValueError("Can only start a draft session")
        self.status = 'in_progress'
        self.save(update_fields=['status', 'updated_at'])
    
    def complete(self, user):
        """Complete the count session"""
        if self.status != 'in_progress':
            raise ValueError("Can only complete an in-progress session")
        self.status = 'completed'
        self.completed_by = user
        self.completed_at = timezone.now()
        # Recalculate statistics
        self.total_items_counted = self.count_items.count()
        self.total_discrepancies = self.count_items.filter(
            discrepancy__isnull=False
        ).exclude(discrepancy=0).count()
        self.save(update_fields=['status', 'completed_by', 'completed_at', 'total_items_counted', 'total_discrepancies', 'updated_at'])
    
    def cancel(self):
        """Cancel the count session"""
        if self.status == 'completed':
            raise ValueError("Cannot cancel a completed session")
        self.status = 'cancelled'
        self.save(update_fields=['status', 'updated_at'])


class PhysicalCountItem(models.Model):
    """
    Individual item counted in a physical count session
    """
    session = models.ForeignKey(
        PhysicalCountSession,
        on_delete=models.CASCADE,
        related_name='count_items',
        help_text='Physical count session this item belongs to'
    )
    part = models.ForeignKey(
        Part,
        on_delete=models.CASCADE,
        related_name='physical_count_items',
        help_text='Part that was counted'
    )
    stock_item = models.ForeignKey(
        StockItem,
        on_delete=models.CASCADE,
        related_name='physical_count_items',
        help_text='StockItem that was counted'
    )
    
    # Count values
    system_quantity = models.IntegerField(
        help_text='Quantity in system before count'
    )
    physical_quantity = models.IntegerField(
        help_text='Quantity physically counted'
    )
    discrepancy = models.IntegerField(
        default=0,
        help_text='Difference: physical_quantity - system_quantity'
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        help_text='Notes about this count item'
    )
    
    # Reconciliation
    reconciled = models.BooleanField(
        default=False,
        help_text='Whether discrepancy has been reconciled'
    )
    reconciled_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When this item was reconciled'
    )
    reconciled_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='physical_count_items_reconciled',
        help_text='User who reconciled this item'
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['session', 'part', 'stock_item']
        indexes = [
            models.Index(fields=['session', 'reconciled']),
            models.Index(fields=['part', 'stock_item']),
        ]
        verbose_name = 'Physical Count Item'
        verbose_name_plural = 'Physical Count Items'
    
    def __str__(self):
        return f"{self.part.name} - System: {self.system_quantity}, Physical: {self.physical_quantity}"
    
    def save(self, *args, **kwargs):
        # Calculate discrepancy
        self.discrepancy = self.physical_quantity - self.system_quantity
        super().save(*args, **kwargs)
    
    def reconcile(self, user, create_adjustment=True):
        """
        Reconcile the discrepancy by creating an adjustment transaction
        
        Args:
            user: User performing the reconciliation
            create_adjustment: If True, create an inventory adjustment transaction
        """
        if self.reconciled:
            raise ValueError("Item is already reconciled")
        
        if create_adjustment and self.discrepancy != 0:
            from .services import InventoryService

            # Create adjustment transaction
            InventoryService.record_transaction(
                part=self.part,
                quantity=self.discrepancy,
                transaction_type='correction',
                user=user,
                branch=self.stock_item.branch,
                reason=f'Physical count reconciliation - Session {self.session.session_number}',
                notes=f'System: {self.system_quantity}, Physical: {self.physical_quantity}, Discrepancy: {self.discrepancy}'
            )
        
        self.reconciled = True
        self.reconciled_by = user
        self.reconciled_at = timezone.now()
        self.save(update_fields=['reconciled', 'reconciled_by', 'reconciled_at', 'updated_at'])


class ServiceBundle(models.Model):
    """
    Bundle of parts and services for routine maintenance (e.g., Minor Service, Major Service)
    """
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    
    total_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        default=Decimal('0.00'),
        help_text="Total price for the bundle"
    )
    
    # Link to ServiceType (from vehicles app)
    service_type = models.OneToOneField(
        'vehicles.ServiceType',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='service_bundle',
        help_text="The service type this bundle fulfills (e.g., 'Minor Service')"
    )
    
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='service_bundles_created'
    )

    class Meta:
        ordering = ['name']
        verbose_name = 'Service Bundle'
        verbose_name_plural = 'Service Bundles'

    def __str__(self):
        return self.name


class ServiceBundleItem(models.Model):
    """
    Item within a service bundle (Part + Quantity)
    """
    bundle = models.ForeignKey(ServiceBundle, on_delete=models.CASCADE, related_name='items')
    part = models.ForeignKey(Part, on_delete=models.PROTECT, related_name='bundle_items')
    quantity = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        default=1,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [['bundle', 'part']]
        verbose_name = 'Service Bundle Item'
        verbose_name_plural = 'Service Bundle Items'

    def __str__(self):
        return f"{self.bundle.name} - {self.part.name} (x{self.quantity})"
