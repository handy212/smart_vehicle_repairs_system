from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from decimal import Decimal
from apps.accounts.models import User
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder


class InspectionTemplate(models.Model):
    """Reusable inspection templates (e.g., Multi-point, State Inspection, Pre-delivery)"""
    
    name = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    
    # Template settings
    requires_odometer = models.BooleanField(default=True)
    requires_technician_signature = models.BooleanField(default=True)
    requires_customer_signature = models.BooleanField(default=False)
    allows_photos = models.BooleanField(default=True)
    allows_video = models.BooleanField(default=False)
    
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='inspection_templates_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['name']
    
    def __str__(self):
        return self.name
    
    def save(self, *args, **kwargs):
        # If this is set as default, remove default from others
        if self.is_default:
            InspectionTemplate.objects.exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


class InspectionCategory(models.Model):
    """Categories within an inspection template (e.g., Brakes, Engine, Electrical)"""
    
    template = models.ForeignKey(InspectionTemplate, on_delete=models.CASCADE, related_name='categories')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)
    
    class Meta:
        ordering = ['order', 'id']
        verbose_name_plural = 'Inspection categories'
    
    def __str__(self):
        return f"{self.template.name} - {self.name}"


class InspectionItem(models.Model):
    """Individual items to check within a category"""
    
    ITEM_TYPE_CHOICES = [
        ('pass_fail', 'Pass/Fail'),
        ('measurement', 'Measurement'),
        ('percentage', 'Percentage'),
        ('rating', 'Rating (1-5)'),
        ('condition', 'Condition Assessment'),
        ('text', 'Text Note'),
    ]
    
    category = models.ForeignKey(InspectionCategory, on_delete=models.CASCADE, related_name='items')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    item_type = models.CharField(max_length=20, choices=ITEM_TYPE_CHOICES, default='pass_fail')
    
    # For measurements
    measurement_unit = models.CharField(max_length=50, blank=True)  # e.g., "mm", "psi", "%"
    min_acceptable = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Minimum acceptable value for measurements"
    )
    max_acceptable = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Maximum acceptable value for measurements"
    )
    
    order = models.PositiveIntegerField(default=0)
    is_critical = models.BooleanField(default=False, help_text="Mark as critical safety item")
    
    class Meta:
        ordering = ['order', 'id']
    
    def __str__(self):
        return f"{self.category.name} - {self.name}"


class VehicleInspection(models.Model):
    """An actual inspection performed on a vehicle"""
    
    STATUS_CHOICES = [
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    
    OVERALL_RESULT_CHOICES = [
        ('pass', 'Pass'),
        ('pass_with_advisory', 'Pass with Advisory'),
        ('fail', 'Fail'),
        ('needs_attention', 'Needs Attention'),
    ]
    
    # Auto-generated inspection number
    inspection_number = models.CharField(max_length=20, unique=True, editable=False)
    
    # References
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='inspections')
    work_order = models.ForeignKey(
        WorkOrder, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='inspections'
    )
    template = models.ForeignKey(InspectionTemplate, on_delete=models.PROTECT, related_name='inspections')
    
    # Inspection details
    inspection_date = models.DateTimeField(default=timezone.now)
    odometer_reading = models.PositiveIntegerField(null=True, blank=True)
    
    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='in_progress')
    overall_result = models.CharField(
        max_length=30, 
        choices=OVERALL_RESULT_CHOICES, 
        null=True, 
        blank=True
    )
    
    # Personnel
    performed_by = models.ForeignKey(
        User, 
        on_delete=models.PROTECT, 
        related_name='inspections_performed',
        limit_choices_to={'role__in': ['technician', 'manager', 'admin']}
    )
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='inspections_approved'
    )
    
    # Signatures
    technician_signature = models.TextField(blank=True, help_text="Base64 encoded signature image")
    customer_signature = models.TextField(blank=True, help_text="Base64 encoded signature image")
    
    # Notes
    notes = models.TextField(blank=True)
    recommendations = models.TextField(blank=True, help_text="Recommended services or repairs")
    
    # Vehicle Damage Assessment
    vehicle_damage = models.JSONField(
        default=list,
        blank=True,
        help_text="JSON data of marked damage locations on vehicle diagram"
    )
    
    # Timestamps
    completed_at = models.DateTimeField(null=True, blank=True)
    sent_to_customer_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['inspection_number']),
            models.Index(fields=['vehicle', 'inspection_date']),
            models.Index(fields=['status', 'inspection_date']),
            models.Index(fields=['work_order']),
        ]
    
    def __str__(self):
        return f"{self.inspection_number} - {self.vehicle}"
    
    def save(self, *args, **kwargs):
        # Auto-generate inspection number if not set
        if not self.inspection_number:
            last_inspection = VehicleInspection.objects.order_by('-id').first()
            if last_inspection and last_inspection.inspection_number:
                try:
                    last_number = int(last_inspection.inspection_number.replace('INS', ''))
                    new_number = last_number + 1
                except (ValueError, AttributeError):
                    new_number = 1
            else:
                new_number = 1
            self.inspection_number = f'INS{new_number:06d}'
        
        # Auto-set completed_at when status changes to completed
        if self.status == 'completed' and not self.completed_at:
            self.completed_at = timezone.now()
        
        super().save(*args, **kwargs)
    
    @property
    def pass_count(self):
        """Count of items that passed"""
        return self.results.filter(result='pass').count()
    
    @property
    def fail_count(self):
        """Count of items that failed"""
        return self.results.filter(result='fail').count()
    
    @property
    def advisory_count(self):
        """Count of items with advisory/needs attention"""
        return self.results.filter(result='advisory').count()
    
    @property
    def total_items(self):
        """Total number of items inspected"""
        return self.results.count()
    
    @property
    def completion_percentage(self):
        """Percentage of inspection completed"""
        template_items = InspectionItem.objects.filter(category__template=self.template).count()
        if template_items == 0:
            return 0
        completed_items = self.results.count()
        return int((completed_items / template_items) * 100)
    
    @property
    def has_critical_issues(self):
        """Check if any critical items failed"""
        return self.results.filter(
            inspection_item__is_critical=True,
            result__in=['fail', 'critical']
        ).exists()


class InspectionResult(models.Model):
    """Results for individual inspection items"""
    
    RESULT_CHOICES = [
        ('pass', 'Pass'),
        ('fail', 'Fail'),
        ('advisory', 'Advisory/Needs Attention'),
        ('not_applicable', 'Not Applicable'),
        ('not_checked', 'Not Checked'),
    ]
    
    CONDITION_CHOICES = [
        ('excellent', 'Excellent'),
        ('good', 'Good'),
        ('fair', 'Fair'),
        ('poor', 'Poor'),
        ('critical', 'Critical'),
    ]
    
    inspection = models.ForeignKey(VehicleInspection, on_delete=models.CASCADE, related_name='results')
    inspection_item = models.ForeignKey(InspectionItem, on_delete=models.PROTECT, related_name='results')
    
    # Result data
    result = models.CharField(max_length=20, choices=RESULT_CHOICES, default='not_checked')
    measurement_value = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Measured value (for measurement type items)"
    )
    percentage_value = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))],
        help_text="Percentage value (0-100)"
    )
    rating_value = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Rating from 1 to 5"
    )
    condition = models.CharField(max_length=20, choices=CONDITION_CHOICES, null=True, blank=True)
    text_note = models.TextField(blank=True)
    
    # Additional info
    needs_immediate_attention = models.BooleanField(default=False)
    recommendation = models.TextField(blank=True, help_text="Specific recommendation for this item")
    estimated_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Estimated cost to address this issue"
    )
    
    # Documentation
    notes = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['inspection_item__category__order', 'inspection_item__order']
        unique_together = ['inspection', 'inspection_item']
    
    def __str__(self):
        return f"{self.inspection.inspection_number} - {self.inspection_item.name}: {self.result}"
    
    def save(self, *args, **kwargs):
        # Auto-determine result for measurements
        if self.inspection_item.item_type == 'measurement' and self.measurement_value is not None:
            item = self.inspection_item
            if item.min_acceptable is not None and self.measurement_value < item.min_acceptable:
                self.result = 'fail'
            elif item.max_acceptable is not None and self.measurement_value > item.max_acceptable:
                self.result = 'fail'
            else:
                self.result = 'pass'
        
        # Auto-determine result for percentages
        if self.inspection_item.item_type == 'percentage' and self.percentage_value is not None:
            if self.percentage_value < 25:
                self.result = 'fail'
            elif self.percentage_value < 50:
                self.result = 'advisory'
            else:
                self.result = 'pass'
        
        # Auto-determine result for ratings
        if self.inspection_item.item_type == 'rating' and self.rating_value is not None:
            if self.rating_value <= 2:
                self.result = 'fail'
            elif self.rating_value == 3:
                self.result = 'advisory'
            else:
                self.result = 'pass'
        
        super().save(*args, **kwargs)


class InspectionPhoto(models.Model):
    """Photos attached to inspection results"""
    
    result = models.ForeignKey(InspectionResult, on_delete=models.CASCADE, related_name='photos')
    image = models.ImageField(upload_to='inspections/%Y/%m/%d/')
    caption = models.CharField(max_length=200, blank=True)
    order = models.PositiveIntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['order', 'created_at']
    
    def __str__(self):
        return f"Photo for {self.result}"
