from django.db import models
from django.contrib.auth import get_user_model
from django.core.validators import MinValueValidator
from decimal import Decimal
from django.utils import timezone

User = get_user_model()


class AssetCategory(models.Model):
    """Categories for fixed assets (vehicles, equipment, furniture, etc.)"""
    
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)
    default_useful_life_years = models.IntegerField(
        default=5,
        validators=[MinValueValidator(1)],
        help_text="Default useful life in years for assets in this category"
    )
    default_depreciation_method = models.CharField(
        max_length=20,
        choices=[
            ('straight_line', 'Straight Line'),
            ('declining_balance', 'Declining Balance'),
            ('units_of_production', 'Units of Production'),
        ],
        default='straight_line'
    )
    gl_asset_account_code = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Default GL account code for assets in this category"
    )
    gl_depreciation_expense_account_code = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Default GL account code for depreciation expense"
    )
    gl_accumulated_depreciation_account_code = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Default GL account code for accumulated depreciation (contra-asset)"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name_plural = "Asset Categories"
        ordering = ['name']
    
    def __str__(self):
        return self.name


class FixedAsset(models.Model):
    """Fixed assets register - tracks all company assets"""
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('disposed', 'Disposed'),
        ('sold', 'Sold'),
        ('retired', 'Retired'),
    ]
    
    # Basic Information
    asset_number = models.CharField(max_length=50, unique=True, db_index=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True)
    category = models.ForeignKey(
        AssetCategory,
        on_delete=models.PROTECT,
        related_name='assets'
    )
    
    # Financial Information
    acquisition_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    acquisition_date = models.DateField()
    salvage_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Expected value at end of useful life"
    )
    
    # Depreciation Settings
    depreciation_method = models.CharField(
        max_length=20,
        choices=[
            ('straight_line', 'Straight Line'),
            ('declining_balance', 'Declining Balance'),
            ('units_of_production', 'Units of Production'),
            ('none', 'No Depreciation'),
        ],
        default='straight_line'
    )
    useful_life_years = models.IntegerField(
        validators=[MinValueValidator(1)],
        help_text="Useful life in years"
    )
    depreciation_start_date = models.DateField(
        help_text="Date when depreciation starts (usually acquisition date or next month)"
    )
    
    # For declining balance method
    declining_balance_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('2.00'),
        validators=[MinValueValidator(Decimal('1.00'))],
        help_text="Declining balance multiplier (e.g., 2.00 for double-declining)"
    )
    
    # For units of production method
    total_units = models.IntegerField(
        null=True,
        blank=True,
        help_text="Total expected production units (for units of production method)"
    )
    units_produced = models.IntegerField(
        default=0,
        help_text="Units produced to date"
    )
    
    # GL Account Codes (can override category defaults)
    gl_asset_account_code = models.CharField(max_length=20, blank=True, null=True)
    gl_depreciation_expense_account_code = models.CharField(max_length=20, blank=True, null=True)
    gl_accumulated_depreciation_account_code = models.CharField(max_length=20, blank=True, null=True)
    
    # Status & Location
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='fixed_assets'
    )
    location = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        help_text="Physical location within branch (e.g., Workshop Bay 1, Office Floor 2)"
    )
    assigned_to = models.ForeignKey(
        'hr.EmployeeProfile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_assets',
        help_text="Staff member this asset is assigned to"
    )
    
    # Asset Details
    manufacturer = models.CharField(max_length=100, blank=True, null=True)
    model_number = models.CharField(max_length=100, blank=True, null=True)
    serial_number = models.CharField(max_length=100, blank=True, null=True)
    purchase_order = models.CharField(max_length=50, blank=True, null=True)
    supplier = models.ForeignKey(
        'inventory.Supplier',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='supplied_assets'
    )
    warranty_expiration = models.DateField(null=True, blank=True)
    
    # Disposal Information
    disposal_date = models.DateField(null=True, blank=True)
    disposal_method = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        choices=[
            ('sold', 'Sold'),
            ('scrapped', 'Scrapped'),
            ('donated', 'Donated'),
            ('traded_in', 'Traded In'),
        ]
    )
    disposal_proceeds = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Amount received from disposal/sale"
    )
    disposal_notes = models.TextField(blank=True, null=True)
    
    # Calculated Fields (stored for performance)
    accumulated_depreciation = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Total depreciation to date"
    )
    net_book_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Acquisition cost minus accumulated depreciation"
    )
    last_depreciation_date = models.DateField(null=True, blank=True)
    
    # Metadata
    notes = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_assets')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['asset_number']
        indexes = [
            models.Index(fields=['asset_number']),
            models.Index(fields=['status']),
            models.Index(fields=['branch']),
            models.Index(fields=['category']),
        ]
    
    def __str__(self):
        return f"{self.asset_number} - {self.name}"
    
    def save(self, *args, **kwargs):
        """Auto-update net book value on save"""
        self.net_book_value = self.acquisition_cost - self.accumulated_depreciation
        super().save(*args, **kwargs)
    
    @property
    def depreciable_amount(self):
        """Amount subject to depreciation (cost - salvage value)"""
        return self.acquisition_cost - self.salvage_value
    
    @property
    def is_fully_depreciated(self):
        """Check if asset is fully depreciated"""
        return self.accumulated_depreciation >= self.depreciable_amount
    
    @property
    def remaining_useful_life_months(self):
        """Calculate remaining useful life in months"""
        if self.status == 'disposed' or self.is_fully_depreciated:
            return 0
        
        total_months = self.useful_life_years * 12
        start_date = self.depreciation_start_date
        months_elapsed = (timezone.now().date().year - start_date.year) * 12 + \
                        (timezone.now().date().month - start_date.month)
        
        return max(0, total_months - months_elapsed)


class DepreciationSchedule(models.Model):
    """Planned depreciation schedule for an asset"""
    
    asset = models.ForeignKey(
        FixedAsset,
        on_delete=models.CASCADE,
        related_name='depreciation_schedules'
    )
    period_start_date = models.DateField()
    period_end_date = models.DateField()
    opening_book_value = models.DecimalField(max_digits=12, decimal_places=2)
    depreciation_amount = models.DecimalField(max_digits=12, decimal_places=2)
    accumulated_depreciation = models.DecimalField(max_digits=12, decimal_places=2)
    closing_book_value = models.DecimalField(max_digits=12, decimal_places=2)
    is_posted = models.BooleanField(default=False)
    posted_at = models.DateTimeField(null=True, blank=True)
    journal_entry_id = models.CharField(max_length=100, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['period_start_date']
        unique_together = ['asset', 'period_start_date']
    
    def __str__(self):
        return f"{self.asset.asset_number} - {self.period_start_date} to {self.period_end_date}"


class AssetMaintenance(models.Model):
    """Maintenance history for assets"""
    
    MAINTENANCE_TYPE_CHOICES = [
        ('routine', 'Routine Maintenance'),
        ('repair', 'Repair'),
        ('inspection', 'Inspection'),
        ('upgrade', 'Upgrade'),
    ]
    
    asset = models.ForeignKey(
        FixedAsset,
        on_delete=models.CASCADE,
        related_name='maintenance_records'
    )
    maintenance_type = models.CharField(max_length=20, choices=MAINTENANCE_TYPE_CHOICES)
    maintenance_date = models.DateField()
    description = models.TextField()
    cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))]
    )
    performed_by = models.CharField(max_length=200, help_text="Technician or vendor name")
    next_maintenance_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, null=True)
    
    # Link to invoice if maintenance was invoiced
    invoice = models.ForeignKey(
        'billing.Invoice',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='asset_maintenance'
    )
    
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-maintenance_date']
    
    def __str__(self):
        return f"{self.asset.name} - {self.maintenance_type} on {self.maintenance_date}"
