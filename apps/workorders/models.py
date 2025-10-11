from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from apps.accounts.models import User
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.appointments.models import Appointment


class WorkOrder(models.Model):
    """
    Work Order - Main service/repair job tracking
    Linked to appointment or walk-in
    """
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('inspection', 'Initial Inspection'),
        ('intake', 'Intake'),
        ('diagnosis', 'Diagnosis'),
        ('awaiting_approval', 'Awaiting Customer Approval'),
        ('approved', 'Approved'),
        ('in_progress', 'In Progress'),
        ('paused', 'Paused'),
        ('quality_check', 'Quality Check'),
        ('completed', 'Completed'),
        ('invoiced', 'Invoiced'),
        ('closed', 'Closed'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    
    # Auto-generated work order number
    work_order_number = models.CharField(max_length=20, unique=True, editable=False, db_index=True)
    
    # Relationships
    appointment = models.ForeignKey(
        Appointment, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='work_orders',
        help_text="Optional - link to appointment if scheduled"
    )
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='work_orders')
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name='work_orders')
    
    # Status and Priority
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft', db_index=True)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='normal')
    
    # Technician Assignment
    primary_technician = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='primary_work_orders',
        limit_choices_to={'role__in': ['technician', 'manager']}
    )
    assigned_technicians = models.ManyToManyField(
        User,
        related_name='assigned_work_orders',
        limit_choices_to={'role__in': ['technician', 'manager']},
        blank=True
    )
    
    # Dates and Times
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    estimated_completion = models.DateTimeField(null=True, blank=True)
    
    # Customer Information
    customer_concerns = models.TextField(
        help_text="What the customer reported"
    )
    special_instructions = models.TextField(blank=True)
    
    # Diagnosis
    diagnosis_notes = models.TextField(
        blank=True,
        help_text="Technician's diagnosis of the issues"
    )
    diagnosis_completed_at = models.DateTimeField(null=True, blank=True)
    diagnosis_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='diagnosed_work_orders',
        limit_choices_to={'role__in': ['technician', 'manager']}
    )
    
    # Approval
    requires_approval = models.BooleanField(default=False)
    approval_requested_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by_customer = models.BooleanField(default=False)
    approval_method = models.CharField(
        max_length=20,
        choices=[
            ('phone', 'Phone'),
            ('email', 'Email'),
            ('in_person', 'In Person'),
            ('text', 'Text Message'),
        ],
        blank=True
    )
    approval_notes = models.TextField(blank=True)
    
    # Cost Estimates
    estimated_labor_hours = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    estimated_labor_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    estimated_parts_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    estimated_total = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    
    # Actual Costs (calculated from tasks and parts)
    actual_labor_hours = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    actual_labor_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    actual_parts_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    actual_total = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    
    # Mileage
    odometer_in = models.PositiveIntegerField(
        help_text="Vehicle mileage at intake"
    )
    odometer_out = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Vehicle mileage at completion"
    )
    
    # Quality Control
    quality_check_required = models.BooleanField(default=True)
    quality_check_completed = models.BooleanField(default=False)
    quality_check_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='quality_checked_work_orders',
        limit_choices_to={'role__in': ['technician', 'manager']}
    )
    quality_check_at = models.DateTimeField(null=True, blank=True)
    quality_check_notes = models.TextField(blank=True)
    quality_check_passed = models.BooleanField(default=False)
    
    # Tracking
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_work_orders',
        limit_choices_to={'role__in': ['receptionist', 'manager', 'admin']}
    )
    
    # Flags
    is_warranty = models.BooleanField(default=False)
    is_recall = models.BooleanField(default=False)
    is_customer_waiting = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['work_order_number']),
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['customer', 'created_at']),
            models.Index(fields=['vehicle', 'created_at']),
            models.Index(fields=['primary_technician', 'status']),
        ]
    
    def __str__(self):
        return f"{self.work_order_number} - {self.customer} - {self.vehicle}"
    
    def save(self, *args, **kwargs):
        # Auto-generate work order number
        if not self.work_order_number:
            last_wo = WorkOrder.objects.order_by('-id').first()
            if last_wo and last_wo.work_order_number:
                try:
                    last_number = int(last_wo.work_order_number.replace('WO', ''))
                    new_number = last_number + 1
                except (ValueError, AttributeError):
                    new_number = 1
            else:
                new_number = 1
            self.work_order_number = f'WO{new_number:06d}'
        
        # Calculate estimated total
        self.estimated_total = self.estimated_labor_cost + self.estimated_parts_cost
        
        # Calculate actual total
        self.actual_total = self.actual_labor_cost + self.actual_parts_cost
        
        super().save(*args, **kwargs)
    
    @property
    def is_overdue(self):
        """Check if work order is past estimated completion"""
        if self.estimated_completion and self.status not in ['completed', 'invoiced', 'closed']:
            return timezone.now() > self.estimated_completion
        return False
    
    @property
    def days_in_shop(self):
        """Calculate days in shop"""
        if not self.created_at:
            return 0
        if self.completed_at:
            return (self.completed_at - self.created_at).days
        return (timezone.now() - self.created_at).days
    
    @property
    def is_approved(self):
        """Check if approved or doesn't require approval"""
        return not self.requires_approval or self.approved_by_customer
    
    @property
    def technician_names(self):
        """Get comma-separated technician names"""
        techs = self.assigned_technicians.all()
        return ', '.join([f"{t.first_name} {t.last_name}" for t in techs])
    
    @property
    def cost_variance(self):
        """Calculate variance between estimated and actual costs"""
        if self.estimated_total is None or self.actual_total is None:
            return 0
        if self.estimated_total > 0:
            return self.actual_total - self.estimated_total
        return 0
    
    @property
    def cost_variance_percentage(self):
        """Calculate percentage variance"""
        if self.estimated_total is None or self.estimated_total == 0:
            return 0
        variance = self.cost_variance
        if variance == 0:
            return 0
        return (variance / self.estimated_total) * 100


class ServiceTask(models.Model):
    """
    Individual service task/line item within a work order
    """
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('skipped', 'Skipped'),
    ]
    
    TASK_TYPE_CHOICES = [
        ('inspection', 'Inspection'),
        ('maintenance', 'Maintenance'),
        ('repair', 'Repair'),
        ('diagnostic', 'Diagnostic'),
        ('replacement', 'Replacement'),
        ('adjustment', 'Adjustment'),
        ('cleaning', 'Cleaning'),
        ('other', 'Other'),
    ]
    
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name='tasks')
    
    # Task Details
    task_type = models.CharField(max_length=20, choices=TASK_TYPE_CHOICES, default='repair')
    description = models.CharField(max_length=255)
    detailed_notes = models.TextField(blank=True)
    
    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    sequence_order = models.PositiveIntegerField(default=0, help_text="Order of execution")
    
    # Assignment
    assigned_to = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_tasks',
        limit_choices_to={'role__in': ['technician', 'manager']}
    )
    
    # Time Tracking
    estimated_hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    actual_hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    # Cost
    labor_rate = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0,
        help_text="Labor rate per hour"
    )
    labor_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    
    # Tracking
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['work_order', 'sequence_order', 'created_at']
    
    def __str__(self):
        return f"{self.work_order.work_order_number} - {self.description}"
    
    def save(self, *args, **kwargs):
        # Calculate labor cost from hours and rate
        if self.actual_hours and self.labor_rate:
            self.labor_cost = self.actual_hours * self.labor_rate
        
        super().save(*args, **kwargs)
        
        # Update work order totals
        self.update_work_order_totals()
    
    def update_work_order_totals(self):
        """Update work order's actual labor hours and cost"""
        work_order = self.work_order
        tasks = work_order.tasks.all()
        
        # Sum up actual hours and costs
        work_order.actual_labor_hours = sum(task.actual_hours for task in tasks)
        work_order.actual_labor_cost = sum(task.labor_cost for task in tasks)
        work_order.save(update_fields=['actual_labor_hours', 'actual_labor_cost', 'actual_total'])


class WorkOrderPart(models.Model):
    """
    Parts used in a work order
    Links to inventory system (Phase 4)
    """
    
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name='parts')
    task = models.ForeignKey(
        ServiceTask,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='parts',
        help_text="Optional - link to specific task"
    )
    
    # Part Details
    part_number = models.CharField(max_length=100)
    part_name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    
    # Quantity and Cost
    quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=1,
        validators=[MinValueValidator(0.01)]
    )
    unit_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    total_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    
    # Markup
    markup_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    selling_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    
    # Status
    STATUS_CHOICES = [
        ('pending', 'Pending Order'),
        ('ordered', 'Ordered'),
        ('received', 'Received'),
        ('installed', 'Installed'),
        ('returned', 'Returned'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Warranty
    warranty_months = models.PositiveIntegerField(default=0, help_text="Warranty period in months")
    warranty_notes = models.TextField(blank=True)
    
    # Tracking
    ordered_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    installed_at = models.DateTimeField(null=True, blank=True)
    installed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='installed_parts',
        limit_choices_to={'role__in': ['technician', 'manager']}
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['work_order', 'created_at']
    
    def __str__(self):
        return f"{self.part_number} - {self.part_name} (x{self.quantity})"
    
    def save(self, *args, **kwargs):
        # Calculate total cost
        self.total_cost = self.quantity * self.unit_cost
        
        # Calculate selling price with markup
        if self.markup_percentage > 0:
            self.selling_price = self.total_cost * (1 + (self.markup_percentage / 100))
        else:
            self.selling_price = self.total_cost
        
        super().save(*args, **kwargs)
        
        # Update work order parts cost
        self.update_work_order_parts_cost()
    
    def update_work_order_parts_cost(self):
        """Update work order's actual parts cost"""
        work_order = self.work_order
        parts = work_order.parts.all()
        
        # Sum up selling prices
        work_order.actual_parts_cost = sum(part.selling_price for part in parts)
        work_order.save(update_fields=['actual_parts_cost', 'actual_total'])


class TechnicianTimeLog(models.Model):
    """
    Detailed time tracking for technicians on work orders
    """
    
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name='time_logs')
    task = models.ForeignKey(
        ServiceTask,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='time_logs'
    )
    technician = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='time_logs',
        limit_choices_to={'role__in': ['technician', 'manager']}
    )
    
    # Time
    clock_in = models.DateTimeField()
    clock_out = models.DateTimeField(null=True, blank=True)
    duration_hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    
    # Details
    description = models.TextField(help_text="What was worked on")
    notes = models.TextField(blank=True)
    
    # Cost
    hourly_rate = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0
    )
    labor_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    
    # Flags
    is_billable = models.BooleanField(default=True)
    is_approved = models.BooleanField(default=False)
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_time_logs',
        limit_choices_to={'role': 'manager'}
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['work_order', 'clock_in']
    
    def __str__(self):
        return f"{self.technician} - {self.work_order.work_order_number} - {self.duration_hours}h"
    
    def save(self, *args, **kwargs):
        # Calculate duration if clock_out is set
        if self.clock_out and self.clock_in:
            duration = self.clock_out - self.clock_in
            self.duration_hours = duration.total_seconds() / 3600
        
        # Calculate labor cost
        if self.duration_hours and self.hourly_rate:
            self.labor_cost = self.duration_hours * self.hourly_rate
        
        super().save(*args, **kwargs)


class WorkOrderNote(models.Model):
    """
    Notes and communication log for work orders
    """
    
    NOTE_TYPE_CHOICES = [
        ('internal', 'Internal Note'),
        ('customer', 'Customer Communication'),
        ('technician', 'Technician Note'),
        ('parts', 'Parts Note'),
        ('approval', 'Approval Note'),
        ('quality', 'Quality Check Note'),
        ('general', 'General'),
    ]
    
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name='notes')
    
    note_type = models.CharField(max_length=20, choices=NOTE_TYPE_CHOICES, default='general')
    note = models.TextField()
    
    # Attachments (for future use)
    is_important = models.BooleanField(default=False)
    is_customer_visible = models.BooleanField(default=False)
    
    # Tracking
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='work_order_notes')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.work_order.work_order_number} - {self.note_type} - {self.created_at.strftime('%Y-%m-%d')}"


class WorkOrderPhoto(models.Model):
    """
    Photos documenting work order (before/after/during)
    """
    
    PHOTO_TYPE_CHOICES = [
        ('before', 'Before Service'),
        ('during', 'During Service'),
        ('after', 'After Service'),
        ('damage', 'Damage Documentation'),
        ('part', 'Part Photo'),
        ('diagnostic', 'Diagnostic'),
        ('other', 'Other'),
    ]
    
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name='photos')
    
    photo = models.ImageField(upload_to='workorders/photos/%Y/%m/')
    photo_type = models.CharField(max_length=20, choices=PHOTO_TYPE_CHOICES, default='other')
    caption = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    
    # Metadata
    taken_at = models.DateTimeField(default=timezone.now)
    taken_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='work_order_photos',
        limit_choices_to={'role__in': ['technician', 'manager']}
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['work_order', 'taken_at']
    
    def __str__(self):
        return f"{self.work_order.work_order_number} - {self.photo_type} - {self.caption}"
