import uuid
import logging
from django.apps import apps as django_apps
from django.db import models
from django.db.models import Max, Q
from django.core.exceptions import FieldDoesNotExist
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from django.utils.text import slugify
from decimal import Decimal, InvalidOperation
from apps.accounts.models import User
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.appointments.models import Appointment

logger = logging.getLogger(__name__)


class WorkflowConfiguration(models.Model):
    """
    Configuration for automatically generated tasks during work order state transitions.
    """
    status = models.CharField(
        max_length=50, 
        unique=True,
        help_text="The work order status that triggers this task"
    )
    task_type = models.CharField(
        max_length=20, 
        default='other',
        help_text="The type of task to create"
    )
    description = models.CharField(max_length=255, help_text="Default description for the created task")
    sequence_order = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['sequence_order']

    def __str__(self):
        return f"Workflow for {self.status}: {self.description}"

class WorkOrder(models.Model):
    """
    Work Order - Main service/repair job tracking
    Linked to appointment or walk-in
    """
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('inspection', 'Initial Inspection'),
        ('intake', 'Intake'),
        ('assigned', 'Assigned'),
        ('diagnosis', 'Diagnosis'),
        ('awaiting_approval', 'Awaiting Customer Approval'),
        ('approved', 'Approved'),
        ('in_progress', 'In Progress'),
        ('additional_work_found', 'Additional Work Found'),
        ('paused', 'Paused'),
        ('quality_check', 'Quality Check'),
        ('discontinued_pending_bill', 'Discontinued — Pending Invoice'),
        ('completed', 'Completed'),
        ('invoiced', 'Invoiced'),
        ('closed', 'Closed'),
    ]

    CUSTOMER_DISCONTINUATION_REASON_CHOICES = [
        (
            'declined_estimate_or_work',
            'Customer declined estimate / further work',
        ),
        (
            'stopped_mid_repair',
            'Customer stopped work mid-repair',
        ),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    
    # Auto-generated work order number
    work_order_number = models.CharField(max_length=20, unique=True, editable=False, db_index=True)
    
    # Secure Access Token
    access_token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, db_index=True)
    
    # Branch assignment
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='work_orders',
        null=True,  # Allow null for migration
        blank=True,
        help_text="Branch where this work order is being handled"
    )
    
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
    status = models.CharField(max_length=25, choices=STATUS_CHOICES, default='draft', db_index=True)
    paused_from_status = models.CharField(
        max_length=25,
        choices=STATUS_CHOICES,
        blank=True,
        null=True,
        help_text='Work order status before entering paused (diagnosis vs repairs).',
    )
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='normal')

    # Customer discontinued job (bill for work performed, then invoice + close)
    customer_discontinuation_reason = models.CharField(
        max_length=50,
        choices=CUSTOMER_DISCONTINUATION_REASON_CHOICES,
        blank=True,
        help_text='Why the customer discontinued; set when moving to Discontinued — Pending Invoice.',
    )
    customer_discontinuation_notes = models.TextField(blank=True)
    customer_discontinued_at = models.DateTimeField(null=True, blank=True)
    customer_discontinued_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='work_orders_discontinued',
    )
    
    # Service Coordinator Assignment (Required before diagnosis)
    service_coordinator = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='coordinated_work_orders',
        limit_choices_to={'role__in': ['service_coordinator', 'manager']},
        help_text="Service Coordinator assigned to this work order. Required before diagnosis can be carried out."
    )
    
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
    customer_rating = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Customer satisfaction rating (1-5) after work completion",
    )
    customer_feedback = models.TextField(
        blank=True,
        help_text="Optional customer feedback after work completion",
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
    requires_approval = models.BooleanField(default=True)
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
    quality_check_signature = models.TextField(
        null=True, 
        blank=True,
        help_text="Base64 encoded signature of the technician who performed the quality check"
    )
    
    # Tracking
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_work_orders',
        limit_choices_to={'role__in': ['receptionist', 'manager', 'admin', 'service_coordinator']}
    )
    
    # Flags
    is_warranty = models.BooleanField(default=False)
    is_recall = models.BooleanField(default=False)
    is_customer_waiting = models.BooleanField(default=False)
    
    # Repeat Visit / Warranty Rework Tracking
    is_warranty_rework = models.BooleanField(
        default=False,
        help_text="Flag if this is a warranty/rework case (vehicle returned within 30 days for similar issue)"
    )
    related_work_order = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rework_work_orders',
        help_text="Link to original work order if this is a rework"
    )
    warranty_reason = models.TextField(
        blank=True,
        help_text="Reason for warranty/rework"
    )

    # Maintenance Type Link
    MAINTENANCE_TYPE_CHOICES = [
        ('general', 'General Repair'),
        ('routine', 'Routine Maintenance'),
    ]
    maintenance_type = models.CharField(
        max_length=20,
        choices=MAINTENANCE_TYPE_CHOICES,
        default='general',
        help_text="Type of maintenance (General or Routine)"
    )
    service_type = models.ForeignKey(
        'vehicles.ServiceType',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='work_orders',
        help_text="Required if maintenance_type is 'routine'"
    )
    service_bundle = models.ForeignKey(
        'inventory.ServiceBundle',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='work_orders',
        help_text="Service bundle associated with this work order"
    )

    BROUGHT_BY_TYPE_CHOICES = [
        ('account_holder', 'Account Holder'),
        ('saved_contact', 'Saved Contact'),
        ('third_party', 'Third Party / Driver'),
    ]
    brought_by_type = models.CharField(
        max_length=20,
        choices=BROUGHT_BY_TYPE_CHOICES,
        default='account_holder',
        help_text="Who physically brought the vehicle for this work order"
    )
    brought_by_contact = models.ForeignKey(
        'customers.CustomerContact',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='work_orders_brought_in',
        help_text="Saved business contact who brought the vehicle"
    )
    brought_by_name = models.CharField(
        max_length=255,
        blank=True,
        help_text="Name of the person who brought the vehicle when not using the account holder directly"
    )
    brought_by_phone = models.CharField(
        max_length=20,
        blank=True,
        help_text="Phone number for the person who brought the vehicle"
    )
    brought_by_email = models.EmailField(
        blank=True,
        help_text="Email for the person who brought the vehicle"
    )
    brought_by_relationship = models.CharField(
        max_length=100,
        blank=True,
        help_text="Relationship to the customer or business, e.g. Driver, Staff, Relative"
    )
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['work_order_number']),
            models.Index(fields=['branch', 'status', 'created_at']),
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['customer', 'created_at']),
            models.Index(fields=['vehicle', 'created_at']),
            models.Index(fields=['primary_technician', 'status']),
        ]
    
    def __str__(self):
        return f"{self.work_order_number} - {self.customer} - {self.vehicle}"

    @property
    def invoice(self):
        """Latest non-void invoice for this work order (billing source of truth)."""
        from apps.billing.work_order_invoices import get_primary_invoice

        return get_primary_invoice(self)
    
    def save(self, *args, **kwargs):
        # Track if this is a new work order
        is_new = self.pk is None
        
        # Auto-generate work order number using branch sequence
        if not self.work_order_number:
            if self.branch:
                self.work_order_number = self.branch.get_next_workorder_number()
            else:
                # Fallback: use timestamp-based number if branch is not set
                from datetime import datetime
                timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
                self.work_order_number = f"WO-{timestamp}"
        
        # Calculate estimated total
        self.estimated_total = self.estimated_labor_cost + self.estimated_parts_cost
        
        # Calculate actual total
        self.actual_total = self.actual_labor_cost + self.actual_parts_cost
        
        super().save(*args, **kwargs)
        
        # Initialize workflow tasks for new work orders or when transitioning from draft
        if is_new and self.status == 'draft':
            # Don't create tasks for draft status - they'll be created on first transition
            pass
        elif is_new and self.status != 'draft':
            # New work order starting with a non-draft status - create workflow task
            from .services import handle_workflow_tasks
            handle_workflow_tasks(self, 'draft', self.status, None)
    
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

    def get_linked_diagnosis(self):
        """Return the linked diagnosis record, if one exists."""
        try:
            return self.diagnosis
        except Exception:
            return None

    @property
    def is_diagnosis_paused(self):
        """True when the work order is paused during an active diagnosis session."""
        if self.status != 'paused':
            return False
        if self.paused_from_status == 'diagnosis':
            return True
        diagnosis = self.get_linked_diagnosis()
        return diagnosis is not None and diagnosis.status == 'paused'
    
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

    @property
    def lead_technician(self):
        """Return primary technician or fall back to the first assigned technician"""
        if self.primary_technician:
            return self.primary_technician
        return self.assigned_technicians.first()
    
    VALID_TRANSITIONS = {
        'draft': ['inspection'],
        'inspection': ['intake', 'draft', 'discontinued_pending_bill'],
        'intake': ['assigned', 'discontinued_pending_bill'],
        'assigned': ['diagnosis', 'intake', 'discontinued_pending_bill'],
        'diagnosis': ['awaiting_approval', 'paused', 'discontinued_pending_bill'],
        'awaiting_approval': ['approved', 'diagnosis', 'discontinued_pending_bill'],
        'approved': ['in_progress', 'additional_work_found', 'discontinued_pending_bill'],
        'in_progress': ['paused', 'quality_check', 'additional_work_found', 'discontinued_pending_bill'],
        'additional_work_found': ['awaiting_approval', 'discontinued_pending_bill'],
        'paused': ['diagnosis', 'in_progress', 'additional_work_found', 'discontinued_pending_bill'],
        'quality_check': ['completed', 'in_progress', 'discontinued_pending_bill'],
        'discontinued_pending_bill': ['invoiced'],
        'completed': ['invoiced', 'closed'],
        'invoiced': ['closed'],
        'closed': [],
    }

    STRICTLY_BLOCKED_DIRECT_TRANSITIONS = {
        ('draft', 'intake'): 'Initial inspection must be started and completed before intake.',
        ('intake', 'diagnosis'): 'Assign a Service Coordinator before diagnosis.',
        ('diagnosis', 'approved'): 'Send diagnosis and estimate for customer approval before repairs.',
        ('diagnosis', 'in_progress'): 'Diagnosis must be approved before repair work can start.',
        ('approved', 'awaiting_approval'): 'Use the additional-work approval flow instead of moving approved work backwards.',
        ('in_progress', 'completed'): 'Quality check must be requested and passed before completion.',
        ('additional_work_found', 'in_progress'): 'Additional work must be sent for customer approval before repairs resume.',
    }

    def get_incomplete_mechanical_tasks(self):
        """Mechanical tasks that must be completed or skipped before QC/completion."""
        return self.tasks.filter(is_workflow_task=False).exclude(status__in=['completed', 'skipped'])

    def get_transition_blockers(self, new_status):
        blockers = {
            'errors': [],
            'blocking_tasks': [],
            'blocking_parts': [],
            'next_step': '',
        }

        if new_status in {'quality_check', 'completed'}:
            incomplete_tasks = self.get_incomplete_mechanical_tasks()
            if new_status == 'quality_check':
                if not self.tasks.filter(is_workflow_task=False).exists():
                    blockers['errors'].append('Create at least one mechanical repair task before requesting quality check.')
                    blockers['next_step'] = 'Add repair tasks from the approved diagnosis recommendations.'
                elif incomplete_tasks.exists():
                    blockers['errors'].append('Complete or skip all mechanical tasks before requesting quality check.')
                    blockers['next_step'] = 'Open the Tasks tab, then complete or skip each listed mechanical task.'
            elif incomplete_tasks.exists():
                blockers['errors'].append('Complete or skip all mechanical tasks before completing the work order.')
                blockers['next_step'] = 'Open the Tasks tab, then complete or skip each listed mechanical task.'

            blockers['blocking_tasks'] = [
                {
                    'id': task.id,
                    'description': task.description,
                    'status': task.get_status_display(),
                    'assigned_to': task.assigned_to.get_full_name() if task.assigned_to else '',
                }
                for task in incomplete_tasks.order_by('sequence_order', 'id')[:10]
            ]

        if new_status == 'completed':
            unresolved_parts = self.parts.exclude(status__in=['installed', 'returned'])
            blockers['blocking_parts'] = [
                {
                    'id': part.id,
                    'part_name': part.part_name,
                    'status': part.get_status_display(),
                }
                for part in unresolved_parts.order_by('created_at', 'id')[:10]
            ]
            if unresolved_parts.exists():
                blockers['errors'].append('Install required parts or formally return unused parts before completing.')
                blockers['next_step'] = blockers['next_step'] or 'Open the Parts tab and resolve each required part.'

        return blockers

    def can_transition_to(self, new_status):
        """
        Validate if status transition is allowed.
        Returns (can_transition: bool, error_message: str or None)
        """
        blocked_message = self.STRICTLY_BLOCKED_DIRECT_TRANSITIONS.get((self.status, new_status))
        if blocked_message:
            return False, blocked_message

        # Validate transition graph. When the workflow builder app is enabled, its
        # default definition becomes the allowed edge list; otherwise use the
        # explicit map below until the repair flow is fully stable.
        from .workflow_bridge import get_workflow_allowed_targets

        workflow_allowed = get_workflow_allowed_targets(self)
        if workflow_allowed is not None:
            if new_status not in workflow_allowed:
                return False, f"Cannot transition from {self.get_status_display()} to {new_status}"
        else:
            valid_next_statuses = self.VALID_TRANSITIONS.get(self.status, [])
            if new_status not in valid_next_statuses:
                return False, f"Cannot transition from {self.get_status_display()} to {new_status}"

        # Discontinued — pending invoice (customer stops job; bill then close via invoiced → closed)
        if new_status == 'discontinued_pending_bill':
            if not getattr(self, 'customer_discontinuation_reason', None):
                return False, 'Select a discontinuation reason before marking this job as discontinued.'
            if self.customer_discontinuation_reason not in dict(self.CUSTOMER_DISCONTINUATION_REASON_CHOICES):
                return False, 'Invalid discontinuation reason.'
        
        # Validate Service Coordinator is assigned before diagnosis
        if new_status == 'diagnosis' and self.status != 'paused' and not self.service_coordinator:
            return (False, 'A Service Coordinator must be assigned before diagnosis can be carried out.')
        
        # Validate Service Coordinator is assigned when transitioning to assigned status
        if new_status == 'assigned' and not self.service_coordinator:
            return (False, 'A Service Coordinator must be assigned when moving to assigned status.')
            
        # Validate Initial Inspection is performed and completed before moving to intake
        if new_status == 'intake':
            if not self.inspections.filter(status__in=['completed', 'approved']).exists():
                return False, "Initial inspection must be completed and approved before starting intake."
        
        # Check prerequisites
        if new_status == 'awaiting_approval':
            if not self.diagnosis_notes:
                return False, "Diagnosis notes are required before requesting approval"
        
        if new_status == 'approved':
            if not self.requires_approval:
                return False, "Work order does not require approval"
        
        if new_status == 'diagnosis' and self.status == 'paused':
            diagnosis = self.get_linked_diagnosis()
            if not diagnosis or diagnosis.status != 'paused':
                return False, "Work order is not in a paused diagnosis session."

        if new_status == 'in_progress':
            # Special case: If transitioning from quality_check, this means QC failed
            # Work order should already be approved and have technicians, so bypass strict checks
            current_status = self.status  # Current status before transition (old_status)
            if current_status == 'paused':
                if self.paused_from_status == 'diagnosis':
                    return False, "Diagnosis is paused. Resume the diagnosis session before starting repairs."
                diagnosis = self.get_linked_diagnosis()
                if diagnosis and diagnosis.status == 'paused':
                    return False, "Diagnosis is paused. Resume the diagnosis session before starting repairs."
                if diagnosis and diagnosis.status != 'completed':
                    return False, "Complete diagnosis before starting or resuming repair work."
            if current_status != 'quality_check':
                # Only check approval for new transitions to in_progress (not returning from QC)
                if not self.is_approved:
                    return False, "Work order must be approved before starting work"
                if not self.primary_technician and not self.assigned_technicians.exists():
                    return False, "At least one technician must be assigned before starting work"
        
        if new_status == 'quality_check':
            if not self.tasks.filter(is_workflow_task=False).exists():
                return False, "Create at least one mechanical repair task before requesting quality check."
            incomplete_tasks = self.get_incomplete_mechanical_tasks()
            if incomplete_tasks.exists():
                task_names = ', '.join(incomplete_tasks.values_list('description', flat=True)[:3])
                suffix = f": {task_names}" if task_names else ""
                return False, f"Complete or skip all mechanical tasks before requesting quality check{suffix}"

        # Skip full repair-completion rules when invoicing after customer discontinuation
        if self.status == 'discontinued_pending_bill' and new_status == 'invoiced':
            if not self.odometer_out:
                return False, "Odometer out is required before invoicing"
            if django_apps.is_installed('apps.billing'):
                Invoice = django_apps.get_model('billing', 'Invoice')
                invoice = Invoice.objects.filter(work_order=self).exclude(status='proforma').first()
                if not invoice:
                    return False, "Create and link an invoice to this work order before marking as invoiced."
                if not (self.is_warranty or self.is_recall) and invoice.total <= 0:
                    return False, "Invoice total must be greater than zero before the work order can be marked as invoiced."
            return True, None

        if new_status == 'completed':
            if not self.tasks.filter(is_workflow_task=False).exists():
                return False, "At least one mechanical task must exist before completing"
            if self.quality_check_required and not self.quality_check_completed:
                return False, "Quality check must be completed first"
            incomplete_tasks = self.get_incomplete_mechanical_tasks()
            if incomplete_tasks.exists():
                task_names = ', '.join(incomplete_tasks.values_list('description', flat=True)[:3])
                suffix = f": {task_names}" if task_names else ""
                return False, f"Complete or skip all mechanical tasks before completing{suffix}"

            unresolved_parts = self.parts.exclude(status__in=['installed', 'returned'])
            if unresolved_parts.exists():
                return False, f"{unresolved_parts.count()} part(s) must be installed or formally returned before completing"

            returned_without_reason = self.parts.filter(status='returned').filter(
                Q(resolution_notes__isnull=True) | Q(resolution_notes__exact='')
            )
            if returned_without_reason.exists():
                return False, "Every returned part must include a return reason before completing"

            tasks_missing_labor = [
                task.description
                for task in self.tasks.filter(is_workflow_task=False, status='completed')
                if task.calculated_actual_hours <= 0
            ]
            if tasks_missing_labor:
                return False, "Actual labor hours are required for every completed mechanical task before completing the work order"
        
        if new_status == 'invoiced':
            if not self.odometer_out:
                return False, "Odometer out is required before invoicing"
            if django_apps.is_installed('apps.billing'):
                Invoice = django_apps.get_model('billing', 'Invoice')
                invoice = Invoice.objects.filter(work_order=self).exclude(status='proforma').first()
                if not invoice:
                    return False, "A finalized invoice must be created before the work order can be marked as invoiced."
                if not (self.is_warranty or self.is_recall) and invoice.total <= 0:
                    return False, "Invoice total must be greater than zero before the work order can be marked as invoiced."

        if new_status == 'closed' and django_apps.is_installed('apps.billing'):
            Invoice = django_apps.get_model('billing', 'Invoice')
            invoice = Invoice.objects.filter(work_order=self).exclude(status='proforma').first()
            if not invoice:
                return False, "A finalized invoice is required before the work order can be closed."
            if invoice.status == 'draft':
                return False, "Invoice must be issued before the work order can be closed."
            if not (self.is_warranty or self.is_recall) and invoice.total <= 0:
                return False, "Invoice total must be greater than zero before the work order can be closed."
        
        return True, None
    
    def validate_before_status_change(self, new_status):
        """
        Validate required fields before status change.
        Returns list of error messages (empty if valid).
        """
        errors = []
        
        if new_status in ['diagnosis', 'intake', 'assigned']:
            if not self.customer_concerns or not self.customer_concerns.strip():
                errors.append("Customer concerns are required")
        
        if new_status == 'awaiting_approval':
            if not self.diagnosis_notes or not self.diagnosis_notes.strip():
                errors.append("Diagnosis notes are required")
        
        if new_status == 'in_progress':
            if not self.primary_technician and not self.assigned_technicians.exists():
                errors.append("At least one technician must be assigned")
            if not self.is_approved:
                errors.append("Work order must be approved")
        
        if new_status == 'completed':
            incomplete_tasks = self.tasks.filter(is_workflow_task=False).exclude(status__in=['completed', 'skipped'])
            if incomplete_tasks.exists():
                errors.append("All mechanical tasks must be completed or skipped")

            unresolved_parts = self.parts.exclude(status__in=['installed', 'returned'])
            if unresolved_parts.exists():
                errors.append(f"{unresolved_parts.count()} part(s) must be installed or formally returned")

            returned_without_reason = self.parts.filter(status='returned').filter(
                Q(resolution_notes__isnull=True) | Q(resolution_notes__exact='')
            )
            if returned_without_reason.exists():
                errors.append("Every returned part must include a return reason")

            tasks_missing_labor = [
                task.description
                for task in self.tasks.filter(is_workflow_task=False, status='completed')
                if task.calculated_actual_hours <= 0
            ]
            if tasks_missing_labor:
                errors.append("Actual labor hours are required for every completed mechanical task")
        
        if new_status == 'invoiced':
            if not self.odometer_out:
                errors.append("Odometer out is required before invoicing")
        
        return errors
    
    def transition_to(self, new_status, user=None, notify=True):
        """
        Safely transition to new status with validation.
        Raises ValidationError if transition is not allowed.
        
        Args:
            new_status: Target status
            user: User making the transition (for logging)
            notify: Whether to send notifications (default: True)
        """
        from django.core.exceptions import ValidationError
        
        # Validate transition
        can_transition, error = self.can_transition_to(new_status)
        if not can_transition:
            raise ValidationError(error)

        from .workflow_bridge import evaluate_workflow_guards_for_transition
        guard_error = evaluate_workflow_guards_for_transition(self, new_status, user=user)
        if guard_error:
            raise ValidationError(guard_error)
        
        # Validate required fields
        field_errors = self.validate_before_status_change(new_status)
        if field_errors:
            raise ValidationError('; '.join(field_errors))
        
        old_status = self.status
        self.status = new_status

        if new_status == 'paused':
            self.paused_from_status = old_status
        elif old_status == 'paused':
            self.paused_from_status = None
        
        # Handle additional_work_found: reset approval and require new approval
        if new_status == 'additional_work_found':
            self.requires_approval = True
            self.approved_by_customer = False
            self.approved_at = None
            # Add note about additional work
            if user:
                WorkOrderNote.objects.create(
                    work_order=self,
                    note_type='internal',
                    note='Additional work discovered during repair - customer approval required',
                    created_by=user,
                    is_important=True
                )
        
        # Update timestamps
        now = timezone.now()
        if new_status == 'in_progress' and not self.started_at:
            self.started_at = now
        elif new_status == 'completed' and not self.completed_at:
            self.completed_at = now
        
        self.save()

        # Inventory Integration (Phase 4)
        try:
            from apps.inventory.services import InventoryService
            if new_status == 'in_progress':
                InventoryService.reserve_parts_for_work_order(self, user)
            elif new_status == 'completed':
                InventoryService.consume_parts_for_work_order(self, user)
        except Exception as e:
            # Log error but preserve transaction status (don't rollback whole WO transition)
            # In strict mode, we might want to raise here.
            logger.error(f"Inventory integration failed for WO {self.work_order_number}: {e}")
        
        # Update service schedules when work order is completed
        if new_status == 'completed' and old_status != 'completed':
            try:
                self._update_service_schedules()
            except Exception as e:
                # Log error but don't fail the transition
                logger.error(f"Failed to update service schedules for WO {self.work_order_number}: {e}", exc_info=True)
        
        # Convert repair recommendations to tasks when starting work
        if new_status == 'in_progress' and old_status != 'in_progress':
            # This will be called from start_work endpoint, but also handle here as backup
            # Only convert if no tasks exist yet (to avoid duplicates)
            if not self.tasks.filter(is_workflow_task=False).exists():
                self.convert_recommendations_to_tasks(user=user)
        
        # Handle workflow task creation and completion
        from .services import handle_workflow_tasks
        handle_workflow_tasks(self, old_status, new_status, user)
        
        # Auto-create gate pass if closed
        if new_status == 'closed' and old_status != 'closed':
            try:
                from apps.gatepass.models import GatePass
                if not GatePass.objects.filter(work_order=self).exists():
                    issuer = user or self.service_coordinator or self.created_by
                    if issuer:
                        GatePass.objects.create(
                            work_order=self,
                            branch=self.branch,
                            vehicle=self.vehicle,
                            customer=self.customer,
                            issued_by=issuer,
                            status='pending'
                        )
            except Exception as e:
                logger.error(f"Failed to auto-create gate pass for WO {self.work_order_number}: {e}", exc_info=True)
        
        # Log transition
        if user:
            WorkOrderNote.objects.create(
                work_order=self,
                note_type='internal',
                note=f'Status changed from {old_status} to {new_status}',
                created_by=user
            )
        
        # Send notifications
        if notify:
            self._send_status_notification(new_status, old_status)
        return True
    
    def _send_status_notification(self, new_status, old_status):
        """Work order stage notifications are handled centrally by post-save signals."""
        return
    
    def _update_service_schedules(self):
        """
        Update vehicle service schedules when work order is completed.
        Checks service tasks and matches them to service types, then updates schedules.
        """
        try:
            from apps.vehicles.models import ServiceType, VehicleServiceSchedule
            from django.utils import timezone
            
            if not self.vehicle:
                return
            
            # Get completed service tasks that might match service types
            # Look for maintenance tasks or tasks with descriptions matching service types
            completed_tasks = self.tasks.filter(
                status='completed',
                task_type='maintenance'
            )
            
            if not completed_tasks.exists():
                return
            
            # Get all active service types
            service_types = ServiceType.objects.filter(is_active=True)
            
            # Try to match tasks to service types
            for task in completed_tasks:
                # Try to find matching service type by name in task description
                task_description_lower = task.description.lower()
                
                for service_type in service_types:
                    service_name_lower = service_type.name.lower()
                    
                    # Check if service type name appears in task description
                    if service_name_lower in task_description_lower:
                        # Found a match - update or create service schedule
                        schedule, created = VehicleServiceSchedule.objects.get_or_create(
                            vehicle=self.vehicle,
                            service_type=service_type,
                            defaults={
                                'is_active': True,
                            }
                        )
                        
                        # Update last service info
                        service_date = self.completed_at.date() if self.completed_at else timezone.now().date()
                        schedule.last_service_date = service_date
                        schedule.last_service_mileage = self.odometer_in or self.vehicle.current_mileage
                        
                        # Recalculate next service due
                        schedule.calculate_next_service_due()
                        
                        logger.info(
                            f"Updated service schedule for {self.vehicle} - {service_type.name} "
                            f"from work order {self.work_order_number}"
                        )
                        break  # Only match to first service type found
            
            # Also check if work order has a general service completion
            # Update vehicle's general last_service_date if not already set
            if self.vehicle and not self.vehicle.last_service_date:
                self.vehicle.last_service_date = self.completed_at.date() if self.completed_at else timezone.now().date()
                if self.odometer_in:
                    self.vehicle.current_mileage = self.odometer_in
                self.vehicle.save(update_fields=['last_service_date', 'current_mileage'])
                
        except Exception as e:
            # Log error but don't fail the work order completion
            logger.error(f"Error updating service schedules for work order {self.id}: {e}", exc_info=True)
    
    def recalculate_totals(self):
        """
        Recalculate all totals from related objects.
        This ensures consistency across the work order.
        """
        from django.db.models import Sum
        
        # Labor costs from tasks
        labor_data = self.tasks.aggregate(
            total_hours=Sum('actual_hours'),
            total_cost=Sum('labor_cost')
        )
        self.actual_labor_hours = labor_data['total_hours'] or Decimal('0')
        self.actual_labor_cost = labor_data['total_cost'] or Decimal('0')
        
        # Parts costs
        parts_data = self.parts.aggregate(total=Sum('selling_price'))
        self.actual_parts_cost = parts_data['total'] or Decimal('0')
        
        # Totals
        self.estimated_total = self.estimated_labor_cost + self.estimated_parts_cost
        self.actual_total = self.actual_labor_cost + self.actual_parts_cost
        
        self.save(update_fields=[
            'actual_labor_hours', 'actual_labor_cost',
            'actual_parts_cost', 'estimated_total', 'actual_total'
        ])
    
    def check_parts_availability(self):
        """
        Check if all required parts are available.
        Returns list of unavailable parts.
        """
        unavailable = []
        
        for part in self.parts.filter(status__in=['draft', 'pending', 'po_created', 'awaiting_stock', 'received']):
            unavailable.append({
                'part': part,
                'reason': f'Part {part.part_name} is {part.get_status_display()}'
            })
        
        return unavailable

    def _single_recommendation_part_is_startable(self, part_data):
        if not isinstance(part_data, dict):
            return True

        candidate_parts = self.parts.all()
        part_id = part_data.get('part_id')
        part_number = part_data.get('part_number')
        part_name = part_data.get('part_name')

        if part_id:
            candidate_parts = candidate_parts.filter(inventory_part_id=part_id)
        elif part_number:
            candidate_parts = candidate_parts.filter(part_number=part_number)
        elif part_name:
            candidate_parts = candidate_parts.filter(part_name__iexact=part_name)
        else:
            return False

        return candidate_parts.filter(status__in=['ready', 'installed']).exists()

    def _recommendation_parts_are_startable(self, parts_needed):
        """
        Determine whether every required part for a recommendation is ready
        enough for the linked repair task to begin.
        """
        if not parts_needed or not isinstance(parts_needed, list):
            return True

        for part_data in parts_needed:
            if not self._single_recommendation_part_is_startable(part_data):
                return False

        return True

    def has_startable_repair_work(self):
        """
        Return True when at least one repair path can genuinely begin now.
        This allows the work order to start even if some other parts are still
        pending, while task-level guards continue to block the affected tasks.
        """
        for task in self.tasks.filter(is_workflow_task=False).prefetch_related('parts'):
            task_parts = list(task.parts.all())
            if not task_parts:
                return True
            if all(part.status in ['ready', 'installed'] for part in task_parts):
                return True

        try:
            from apps.diagnosis.models import Diagnosis
            diagnosis = Diagnosis.objects.filter(work_order=self).first()
        except Exception:
            diagnosis = None

        if not diagnosis:
            return False

        recommendations = diagnosis.repair_recommendations.filter(
            Q(approval_status='approved') | Q(customer_approved=True),
            quotation_status='quoted',
            converted_to_task__isnull=True,
        )
        for recommendation in recommendations:
            parts_needed = recommendation.parts_needed if isinstance(recommendation.parts_needed, list) else []
            if not parts_needed:
                return True
            for part_data in parts_needed:
                if self._single_recommendation_part_is_startable(part_data):
                    return True

        return False

    def approve_pending_recommendations(self, user=None, method='', notes=''):
        """
        Mirror a customer work-order approval onto pending diagnosis recommendations.
        Returns the number of recommendations approved.
        """
        try:
            from apps.diagnosis.models import Diagnosis, RepairRecommendation
        except ImportError:
            return 0

        diagnosis = Diagnosis.objects.filter(work_order=self).first()
        if not diagnosis:
            return 0

        valid_methods = {choice[0] for choice in RepairRecommendation.DECISION_METHOD_CHOICES}
        decision_method = method if method in valid_methods else ''
        if method == 'digital':
            decision_method = 'portal'
        if not decision_method:
            decision_method = 'phone'

        decision_notes = notes or 'Approved with work order customer approval.'
        pending_recommendations = diagnosis.repair_recommendations.filter(
            approval_status='pending_approval'
        )

        approved_count = 0
        for recommendation in pending_recommendations:
            recommendation.set_decision(
                'approved',
                acted_by=user,
                method=decision_method,
                notes=decision_notes,
            )
            approved_count += 1

        return approved_count

    def approve_customer_work(self, user=None, method='phone', notes='', linked_estimate=None):
        """
        Record customer approval for the work order and keep the linked quote in sync.
        """
        self.approved_by_customer = True
        self.approved_at = timezone.now()
        self.approval_method = method
        self.approval_notes = notes

        self.transition_to('approved', user=user)

        try:
            diagnosis = self.diagnosis
        except Exception:
            diagnosis = None

        if (
            diagnosis
            and not diagnosis.is_completed
            and diagnosis.status == 'awaiting_approval'
        ):
            diagnosis.complete(requires_approval=True)
            self.refresh_from_db(fields=[
                'status',
                'approved_by_customer',
                'approved_at',
                'diagnosis_completed_at',
            ])

        try:
            Estimate = self._meta.apps.get_model('billing', 'Estimate')
        except LookupError:
            return None

        estimate = linked_estimate
        if estimate is None:
            estimate = getattr(self, 'estimate', None)

        if estimate is None:
            estimate = (
                Estimate.objects.filter(
                    reference_number=f"WO:{self.id}",
                    customer=self.customer,
                    vehicle=self.vehicle,
                )
                .exclude(status='converted')
                .order_by('-created_at')
                .first()
            )

        if estimate and estimate.status in {'draft', 'sent', 'viewed'}:
            estimate.status = 'approved'
            estimate.approved_date = timezone.now()
            estimate.approved_by = user
            estimate.save(update_fields=[
                'status',
                'approved_date',
                'approved_by',
                'updated_at',
            ])
            estimate.apply_quoted_prices_to_work_order()

        return estimate

    def pending_recommendation_approval_counts(self):
        """
        Return pending recommendation counts that must be resolved before a
        customer can approve the work order itself.
        """
        try:
            from apps.diagnosis.models import Diagnosis
        except ImportError:
            return {'waiting_for_estimate': 0, 'pending_decision': 0}

        diagnosis = Diagnosis.objects.filter(work_order=self).first()
        if not diagnosis:
            return {'waiting_for_estimate': 0, 'pending_decision': 0}

        active_recommendations = diagnosis.repair_recommendations.filter(
            approval_status='pending_approval',
            converted_to_task__isnull=True,
        )
        return {
            'waiting_for_estimate': active_recommendations.exclude(
                quotation_status='quoted',
            ).count(),
            'pending_decision': active_recommendations.filter(
                quotation_status='quoted',
            ).count(),
        }

    def get_current_quote_stage(self):
        """
        Return the live recommendations quotation stage for dashboard/list
        presentation while work is still in diagnosis/approval flow.
        """
        try:
            diagnosis = self.diagnosis
        except Exception:
            return None

        active_recommendations = diagnosis.repair_recommendations.filter(
            approval_status__in=['pending_approval', 'approved'],
            converted_to_task__isnull=True,
        )

        if active_recommendations.filter(quotation_status='requested').exists():
            return 'waiting_for_stores_quotation'

        if active_recommendations.filter(
            quotation_status='quoted',
            approval_status='pending_approval',
        ).exists():
            return 'waiting_for_customer_approval'

        if self.status == 'approved':
            if self.parts.exists():
                unresolved_parts = self.parts.exclude(status__in=['ready', 'installed', 'returned'])
                if unresolved_parts.exists():
                    return 'approved_waiting_for_parts'
                return 'parts_ready_waiting_for_repairs'

            if self.tasks.filter(is_workflow_task=False).exists() or active_recommendations.filter(
                approval_status='approved',
                quotation_status='quoted',
            ).exists():
                return 'approved_waiting_for_repairs'

        if active_recommendations.filter(
            approval_status='approved',
            quotation_status='quoted',
        ).exists():
            return 'quotation_ready'

        return None

    def get_current_quote_stage_display(self):
        stage = self.get_current_quote_stage()
        if stage == 'waiting_for_stores_quotation':
            return 'Waiting for Stores Quotation'
        if stage == 'waiting_for_customer_approval':
            return 'Waiting for Customer Approval'
        if stage == 'approved_waiting_for_parts':
            return 'Approved | Waiting for Parts Allocation'
        if stage == 'parts_ready_waiting_for_repairs':
            return 'Parts Ready | Waiting for Repairs'
        if stage == 'approved_waiting_for_repairs':
            return 'Approved | Ready for Repairs'
        if stage == 'quotation_ready':
            return 'Quotation Ready'
        return None
    
    def can_start_work(self):
        """
        Check if work can be started.
        Returns (can_start: bool, errors: list)
        """
        errors = []
        
        if not self.is_approved:
            errors.append("Work order not approved")
        
        if not self.primary_technician and not self.assigned_technicians.exists():
            errors.append("No technician assigned")
        
        # Check if there are any executable tasks or recommendations ready to convert.
        has_tasks = self.tasks.filter(is_workflow_task=False).exists()
        has_ready_recommendations = False
        recommendation_blockers = []
        try:
            from apps.diagnosis.models import Diagnosis
            diagnosis = Diagnosis.objects.filter(work_order=self).first()
            if diagnosis:
                recommendations = diagnosis.repair_recommendations.filter(
                    converted_to_task__isnull=True
                )
                has_ready_recommendations = recommendations.filter(
                    approval_status='approved',
                    quotation_status='quoted'
                ).exists()

                pending_approval_count = recommendations.filter(
                    approval_status='pending_approval'
                ).count()
                awaiting_quote_submission_count = recommendations.filter(
                    approval_status='approved',
                    quotation_status='not_requested'
                ).count()
                awaiting_quote_count = recommendations.filter(
                    approval_status='approved',
                    quotation_status='requested'
                ).count()

                if pending_approval_count:
                    recommendation_blockers.append(
                        f"{pending_approval_count} recommendation(s) still need customer approval"
                    )
                if awaiting_quote_submission_count:
                    recommendation_blockers.append(
                        f"{awaiting_quote_submission_count} approved recommendation(s) must be sent to stores for quotation"
                    )
                if awaiting_quote_count:
                    recommendation_blockers.append(
                        f"{awaiting_quote_count} quotation request(s) are still waiting for stores to mark quoted"
                    )
        except Exception:
            pass  # If diagnosis app not available, skip this check
        
        if not has_tasks and not has_ready_recommendations:
            if recommendation_blockers:
                errors.append(
                    "No repair work is ready to start. " + "; ".join(recommendation_blockers) + "."
                )
            else:
                errors.append(
                    "No tasks or approved, quoted repair recommendations found. Create a task or approve and quote a recommendation before starting work."
                )
        
        unavailable_parts = self.check_parts_availability()
        if unavailable_parts and not self.has_startable_repair_work():
            unresolved_names = [item['part'].part_name for item in unavailable_parts[:5]]
            unresolved_summary = ', '.join(unresolved_names)
            if len(unavailable_parts) > 5:
                unresolved_summary += f", +{len(unavailable_parts) - 5} more"
            errors.append(
                f"{len(unavailable_parts)} required part(s) are not ready. "
                "No repair task can start yet because the first required parts are still pending. "
                f"Waiting parts: {unresolved_summary}. Allocate or receive at least the parts needed for the first repair tasks."
            )

        return len(errors) == 0, errors
    
    def convert_recommendations_to_tasks(self, user=None, recommendation_ids=None, assign_to_technician=True):
        """
        Convert approved RepairRecommendations to ServiceTasks.
        Also links parts from recommendations to the created tasks.
        Returns (tasks_created: int, parts_linked: int)
        """
        try:
            from apps.diagnosis.models import Diagnosis, RepairRecommendation
        except ImportError:
            return 0, 0
        
        try:
            diagnosis = Diagnosis.objects.filter(work_order=self).first()
            if not diagnosis:
                return 0, 0
            
            recommendations = diagnosis.repair_recommendations.filter(
                Q(approval_status='approved') | Q(customer_approved=True),
                quotation_status='quoted',
                converted_to_task__isnull=True
            )

            if recommendation_ids:
                recommendations = recommendations.filter(id__in=recommendation_ids)
            
            if not recommendations.exists():
                return 0, 0
            
            tasks_created = 0
            parts_linked = 0
            
            # Get max sequence order for non-workflow tasks
            max_sequence = self.tasks.filter(is_workflow_task=False).aggregate(
                max_seq=Max('sequence_order')
            )['max_seq'] or 0
            
            # Get primary technician or first assigned technician
            assigned_user = None
            if assign_to_technician:
                assigned_user = self.primary_technician
                if not assigned_user:
                    assigned_user = self.assigned_technicians.first()
                if not assigned_user and diagnosis.technician:
                    assigned_user = diagnosis.technician
            
            InventoryPart = self._meta.apps.get_model('inventory', 'Part')
            PartCategory = self._meta.apps.get_model('inventory', 'PartCategory')
            WorkOrderPart = self._meta.apps.get_model('workorders', 'WorkOrderPart')

            def resolve_default_labor_rate():
                if assigned_user:
                    user_rate = getattr(assigned_user, 'hourly_rate', None)
                    if user_rate:
                        return Decimal(str(user_rate))

                try:
                    Estimate = self._meta.apps.get_model('billing', 'Estimate')
                except LookupError:
                    return Decimal('0')

                estimate = (
                    Estimate.objects.filter(work_order=self)
                    .exclude(status='void')
                    .order_by('-created_at')
                    .first()
                )

                if not estimate:
                    estimate = (
                        Estimate.objects.filter(
                            reference_number=f"WO:{self.id}",
                            customer=self.customer,
                            vehicle=self.vehicle,
                        )
                        .exclude(status='void')
                        .order_by('-created_at')
                        .first()
                    )

                if not estimate:
                    return Decimal('0')

                labor_lines = estimate.line_items.filter(item_type='labor')
                total_hours = Decimal('0')
                total_amount = Decimal('0')

                for line in labor_lines:
                    total_hours += line.labor_hours or Decimal('0')
                    total_amount += line.total or Decimal('0')

                if total_hours > 0 and total_amount > 0:
                    return (total_amount / total_hours).quantize(Decimal('0.01'))

                first_line = labor_lines.first()
                if first_line and first_line.quantity and first_line.total:
                    return (first_line.total / first_line.quantity).quantize(Decimal('0.01'))

                return Decimal('0')

            default_labor_rate = resolve_default_labor_rate()

            def build_task_description(base_description, part_data, total_groups):
                if total_groups <= 1 or not isinstance(part_data, dict):
                    return base_description
                suffix = (part_data.get('part_name') or part_data.get('part_number') or '').strip()
                return f"{base_description} - {suffix}" if suffix else base_description

            def ensure_catalog_part(part_data):
                inventory_part = None
                part_id = part_data.get('part_id') or part_data.get('inventory_part')
                part_name = (part_data.get('part_name') or '').strip()
                part_number = (part_data.get('part_number') or '').strip()

                if part_id:
                    inventory_part = InventoryPart.objects.filter(pk=part_id).first()
                    if inventory_part:
                        return inventory_part

                if part_number:
                    inventory_part = InventoryPart.objects.filter(part_number__iexact=part_number).first()
                    if inventory_part:
                        return inventory_part

                if part_name:
                    part_by_name = InventoryPart.objects.filter(name__iexact=part_name)
                    if self.branch:
                        inventory_part = part_by_name.filter(branch=self.branch).first()
                        if inventory_part:
                            return inventory_part
                    inventory_part = part_by_name.filter(branch__isnull=True).first() or part_by_name.first()
                    if inventory_part:
                        return inventory_part

                if not part_name and not part_number:
                    return None

                category = (
                    PartCategory.objects.filter(name__iexact='Uncategorized').first()
                    or PartCategory.objects.first()
                    or PartCategory.objects.create(
                        name='Uncategorized',
                        description='Fallback category for parts created from diagnosis recommendations.',
                    )
                )

                generated_base = part_number or f"DIAG-{self.id}-{(slugify(part_name or 'part').upper()[:32] or 'PART')}"
                generated_part_number = generated_base
                suffix = 2
                while InventoryPart.objects.filter(part_number=generated_part_number).exists():
                    generated_part_number = f"{generated_base}-{suffix}"
                    suffix += 1

                return InventoryPart.objects.create(
                    part_number=generated_part_number,
                    name=part_name or generated_part_number,
                    description=f"Auto-created from diagnosis recommendation on {self.work_order_number}.",
                    category=category,
                    branch=self.branch,
                    unit='piece',
                    cost_price=Decimal('0.01'),
                    selling_price=Decimal('0.01'),
                    created_by=user,
                )

            for rec in recommendations:
                # Map recommendation type to task type
                task_type_map = {
                    'repair': 'repair',
                    'replace': 'replacement',
                    'service': 'maintenance',
                    'adjust': 'adjustment',
                    'clean': 'cleaning',
                    'inspect': 'inspection',
                }
                task_type = task_type_map.get(rec.recommendation_type, 'repair')
                part_groups = [part for part in (rec.parts_needed or []) if isinstance(part, dict)]
                if not part_groups:
                    part_groups = [None]

                split_count = len(part_groups)
                primary_task = None

                for part_data in part_groups:
                    estimated_hours = rec.estimated_labor_hours or Decimal('0')
                    if split_count > 1 and estimated_hours:
                        estimated_hours = (estimated_hours / Decimal(str(split_count))).quantize(Decimal('0.01'))

                    task = ServiceTask.objects.create(
                        work_order=self,
                        task_type=task_type,
                        description=build_task_description(rec.description, part_data, split_count),
                        detailed_notes=f"Converted from repair recommendation: {rec.description}",
                        status='pending',
                        sequence_order=max_sequence + tasks_created + 1,
                        assigned_to=assigned_user,
                        estimated_hours=estimated_hours,
                        labor_rate=default_labor_rate,
                        workflow_phase=None,
                        is_workflow_task=False,
                    )

                    if task.estimated_hours and task.labor_rate:
                        task.labor_cost = task.estimated_hours * task.labor_rate
                        task.save()

                    if primary_task is None:
                        primary_task = task

                    tasks_created += 1

                    if not isinstance(part_data, dict):
                        continue

                    try:
                        inventory_part = ensure_catalog_part(part_data)
                        part_name = part_data.get('part_name', '').strip()
                        part_number = part_data.get('part_number', '').strip()
                        if inventory_part:
                            part_name = inventory_part.name
                            part_number = inventory_part.part_number

                        try:
                            quantity = Decimal(str(part_data.get('quantity', 1)))
                        except (ValueError, TypeError, InvalidOperation):
                            quantity = Decimal('1')

                        try:
                            unit_cost = Decimal(str(part_data.get('unit_cost', 0)))
                        except (ValueError, TypeError, InvalidOperation):
                            unit_cost = Decimal('0')

                        if inventory_part and unit_cost <= 0:
                            unit_cost = inventory_part.cost_price or Decimal('0')

                        if not part_name and not inventory_part:
                            continue

                        existing_part = None
                        if inventory_part:
                            existing_part = self.parts.filter(
                                inventory_part=inventory_part,
                                task__isnull=True
                            ).first()

                        if not existing_part and part_number:
                            existing_part = self.parts.filter(
                                part_number=part_number,
                                task__isnull=True
                            ).first()

                        if not existing_part:
                            existing_part = self.parts.filter(
                                part_name=part_name,
                                task__isnull=True
                            ).first()

                        if existing_part:
                            existing_part.task = task
                            if inventory_part and not existing_part.inventory_part:
                                existing_part.inventory_part = inventory_part
                            if existing_part.status in ['draft', 'pending']:
                                existing_part.quantity = quantity
                                existing_part.unit_cost = unit_cost
                                if not existing_part.part_name:
                                    existing_part.part_name = part_name
                                if not existing_part.part_number:
                                    existing_part.part_number = part_number
                                if not existing_part.requested_by:
                                    existing_part.requested_by = user
                            existing_part.save()
                            parts_linked += 1
                        else:
                            new_part = WorkOrderPart.objects.create(
                                work_order=self,
                                task=task,
                                inventory_part=inventory_part,
                                part_name=part_name,
                                part_number=part_number,
                                quantity=quantity,
                                unit_cost=unit_cost,
                                status='pending',
                                requested_by=user,
                                description=f"Auto-created from recommendation: {rec.description}"
                            )
                            parts_linked += 1

                            try:
                                from apps.notifications_app.triggers import notification_triggers
                                notification_triggers.part_requisition_created(new_part)
                            except Exception:
                                pass
                    except Exception as e:
                        logger.warning(f"Failed to link part from recommendation {rec.id} to task: {e}")

                if primary_task:
                    rec.converted_to_task = primary_task
                    rec.save(update_fields=['converted_to_task'])
            
            # Recalculate totals after creating tasks and linking parts
            self.recalculate_totals()

            try:
                Estimate = self._meta.apps.get_model('billing', 'Estimate')
                estimate = (
                    Estimate.objects.filter(
                        work_order=self,
                        status__in=('approved', 'converted'),
                    )
                    .order_by('-approved_date', '-created_at')
                    .first()
                )
                if estimate:
                    estimate.apply_quoted_prices_to_work_order()
            except Exception:
                pass

            return tasks_created, parts_linked
            
        except Exception as e:
            logger.error(f"Error converting recommendations to tasks for WO {self.work_order_number}: {e}", exc_info=True)
            return 0, 0
    
    def check_auto_complete(self):
        """
        Check if work order should auto-advance based on conditions.
        Called after task completion or parts status changes.
        """
        # Auto-advance to quality_check when all tasks completed
        if self.status == 'in_progress':
            if self.tasks.exists():
                all_tasks_completed = self.tasks.exclude(status__in=['completed', 'skipped']).count() == 0
                if all_tasks_completed and not self.quality_check_completed:
                    try:
                        # Only auto-advance if quality check is required
                        if self.quality_check_required:
                            self.transition_to('quality_check', user=None, notify=True)
                    except Exception as e:
                        # Don't fail if auto-transition fails
                        logger.warning(f"Auto-transition to quality_check failed for WO {self.id}: {e}")
    
    def check_parts_ready(self):
        """
        Check if all required parts are allocated for workshop use.
        Returns True if all parts are ready, installed, or formally returned.
        """
        if not self.parts.exists():
            return True
        
        unresolved_parts = self.parts.exclude(status__in=['ready', 'installed', 'returned'])
        return unresolved_parts.count() == 0
    
    


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
        ('coordination', 'Coordination'),
        ('other', 'Other'),
    ]
    
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name='tasks')
    
    # Task Details
    task_type = models.CharField(max_length=50, default='repair')
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
        validators=[MinValueValidator(Decimal('0'))]
    )
    actual_hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal('0'))]
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
        validators=[MinValueValidator(Decimal('0'))]
    )
    
    # Workflow tracking
    workflow_phase = models.CharField(
        max_length=25,
        choices=[
            ('draft', 'Draft'),
            ('inspection', 'Initial Inspection'),
            ('intake', 'Intake'),
            ('assigned', 'Assigned'),
            ('diagnosis', 'Diagnosis'),
            ('awaiting_approval', 'Awaiting Customer Approval'),
            ('approved', 'Approved'),
            ('in_progress', 'In Progress'),
            ('additional_work_found', 'Additional Work Found'),
            ('paused', 'Paused'),
            ('quality_check', 'Quality Check'),
            ('completed', 'Completed'),
            ('invoiced', 'Invoiced'),
            ('closed', 'Closed'),
            ('discontinued_pending_bill', 'Discontinued — Pending Invoice'),
        ],
        null=True,
        blank=True,
        help_text="If set, this task is automatically created and completed based on workflow phase"
    )
    is_workflow_task = models.BooleanField(
        default=False,
        help_text="Indicates if this task was automatically created by the workflow system"
    )
    
    # Tracking
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['work_order', 'sequence_order', 'created_at']
        indexes = [
            models.Index(fields=['work_order', 'workflow_phase']),
            models.Index(fields=['is_workflow_task']),
        ]
    
    def __str__(self):
        return f"{self.work_order.work_order_number} - {self.description}"
    
    @property
    def calculated_actual_hours(self):
        """
        Calculate actual hours from multiple sources:
        1. actual_hours field if set (> 0)
        2. Sum of duration_hours from time_logs
        3. Duration from started_at to completed_at timestamps (for workflow tasks)
        """
        # If actual_hours is explicitly set, use it
        if self.actual_hours and self.actual_hours > 0:
            return self.actual_hours
        
        # Otherwise, calculate from time logs
        from django.db.models import Sum
        total = self.time_logs.aggregate(
            total_hours=Sum('duration_hours')
        )['total_hours']
        
        if total and total > 0:
            return total
        
        # If no time logs, calculate from timestamps (for workflow tasks or tasks without time logs)
        if self.started_at and self.completed_at:
            delta = self.completed_at - self.started_at
            hours = Decimal(str(delta.total_seconds() / 3600))
            if hours > 0:
                rounded_hours = hours.quantize(Decimal('0.01'))
                if self.status == 'completed' and rounded_hours <= 0:
                    return Decimal('0.01')
                return rounded_hours
        
        # If task is completed but started_at is missing, use created_at as fallback
        if self.status == 'completed' and self.completed_at:
            start_time = self.started_at if self.started_at else self.created_at
            if start_time:
                delta = self.completed_at - start_time
                hours = Decimal(str(delta.total_seconds() / 3600))
                if hours > 0:
                    return hours.quantize(Decimal('0.01'))
        
        # For workflow tasks that are completed, even if duration is 0, try to show something
        # This handles cases where tasks are auto-completed instantly
        if self.status == 'completed' and self.is_workflow_task and self.completed_at:
            # If it was completed, there was at least some time, even if very small
            # Use a minimum of 0.01 hours for completed workflow tasks
            start_time = self.started_at if self.started_at else self.created_at
            if start_time:
                delta = self.completed_at - start_time
                hours = Decimal(str(delta.total_seconds() / 3600))
                # For very short durations (< 1 minute), show 0.01 as minimum
                if hours < Decimal('0.02'):
                    return Decimal('0.01')
                return hours.quantize(Decimal('0.01'))
        
        return Decimal('0')
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Track original status to detect changes safely without triggering DB refresh for deferred fields
        if self.pk:
            # Use __dict__.get() to avoid triggering DeferredAttribute descriptors
            self._original_status = self.__dict__.get('status')
            self._original_labor_cost = self.__dict__.get('labor_cost')
            self._original_actual_hours = self.__dict__.get('actual_hours')
        else:
            self._original_status = None
            self._original_labor_cost = None
            self._original_actual_hours = None

    def save(self, *args, **kwargs):
        # Calculate labor cost from hours and rate
        if self.actual_hours and self.labor_rate:
            self.labor_cost = self.actual_hours * self.labor_rate
        
        # Track if status changed to completed (using tracked original, no extra query)
        status_changed = False
        if self._original_status is not None:
            status_changed = self._original_status != self.status and self.status == 'completed'
        else:
            status_changed = self.status == 'completed'
        
        is_new = self.pk is None
        cost_changed = is_new or (
            self._original_labor_cost != self.labor_cost or
            self._original_actual_hours != self.actual_hours
        )
        
        super().save(*args, **kwargs)
        
        # Update original status after save
        self._original_status = self.status
        self._original_labor_cost = self.labor_cost
        self._original_actual_hours = self.actual_hours
        
        # Update work order totals only if cost fields changed
        if cost_changed:
            self.update_work_order_totals()
        
        # Check for auto-complete if task was just completed
        if status_changed:
            self.work_order.check_auto_complete()
    
    def update_work_order_totals(self):
        """Update work order's actual labor hours and cost"""
        # Use centralized recalculation method
        self.work_order.recalculate_totals()


class ServiceTaskType(models.Model):
    """Configurable service task type used when creating service tasks."""

    code = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    default_labor_rate = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0'))],
    )
    is_billable = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'name']
        indexes = [
            models.Index(fields=['is_active', 'sort_order']),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.code and self.name:
            self.code = slugify(self.name)
        super().save(*args, **kwargs)


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
    
    # Inventory Link (Phase 4)
    inventory_part = models.ForeignKey(
        'inventory.Part',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='work_order_usages',
        help_text="Link to actual inventory part"
    )
    
    purchase_order_item = models.ForeignKey(
        'inventory.PurchaseOrderItem',
        null=True, 
        blank=True, 
        on_delete=models.SET_NULL, 
        related_name='work_order_parts', 
        help_text='Link to specific PO line item for ordering'
    )
    
    # Part Details
    part_number = models.CharField(max_length=100, blank=True)
    part_name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    
    # Quantity and Cost
    quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=1,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    unit_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal('0'))]
    )
    total_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal('0'))]
    )
    
    # Markup
    markup_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))]
    )
    selling_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal('0'))]
    )
    
    # Status
    STATUS_CHOICES = [
        ('draft', 'Draft (Not Submitted)'),
        ('pending', 'Pending Order'),
        ('po_created', 'PO Created'),
        ('awaiting_stock', 'Awaiting Stock'),
        ('received', 'Received'),
        ('ready', 'Allocated'),
        ('installed', 'Installed'),
        ('returned', 'Returned'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    # Warranty
    warranty_months = models.PositiveIntegerField(default=0, help_text="Warranty period in months")
    warranty_notes = models.TextField(blank=True)
    
    # Requisition Details
    requisition_number = models.CharField(max_length=20, unique=True, null=True, blank=True, editable=False)
    requested_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='requested_parts',
        help_text="User who requested this part"
    )
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_parts',
        help_text="User who approved the requisition"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    
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
    resolution_notes = models.TextField(
        blank=True,
        help_text="Reason when the part is returned or not used on the repair"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['work_order', 'created_at']
    
    def __str__(self):
        return f"{self.requisition_number or 'Draft'} - {self.part_number} - {self.part_name} (x{self.quantity})"
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._original_selling_price = self.selling_price if self.pk else None
    
    def save(self, *args, **kwargs):
        update_fields = kwargs.get('update_fields')
        if update_fields is not None:
            update_fields = set(update_fields)

        # Generate Requisition Number
        if not self.requisition_number:
            # Format: REQ-YYYY-XXXXX (e.g. REQ-2024-00001)
            # Use timestamp to ensure uniqueness and order
            from django.utils import timezone
            now = timezone.now()
            year = now.year
            
            # Get last requisition number for this year to increment
            last_req = WorkOrderPart.objects.filter(
                requisition_number__startswith=f"REQ-{year}-"
            ).order_by('requisition_number').last()
            
            if last_req and last_req.requisition_number:
                try:
                    last_seq = int(last_req.requisition_number.split('-')[-1])
                    new_seq = last_seq + 1
                except ValueError:
                    new_seq = 1
            else:
                new_seq = 1
                
            self.requisition_number = f"REQ-{year}-{new_seq:05d}"

        # Normalize numeric inputs because API/form payloads often send decimals as strings.
        self.quantity = Decimal(str(self.quantity or '0'))
        self.unit_cost = Decimal(str(self.unit_cost or '0'))
        self.markup_percentage = Decimal(str(self.markup_percentage or '0'))

        # Calculate total cost
        self.total_cost = self.quantity * self.unit_cost
        
        # Calculate selling price with markup
        if self.markup_percentage > 0:
            self.selling_price = self.total_cost * (1 + (self.markup_percentage / 100))
        else:
            self.selling_price = self.total_cost

        if update_fields is not None:
            update_fields.update({'total_cost', 'selling_price'})
            if not self.requisition_number:
                update_fields.add('requisition_number')
            kwargs['update_fields'] = list(update_fields)
            
        is_new = self.pk is None
        cost_changed = is_new or self._original_selling_price != self.selling_price
        
        super().save(*args, **kwargs)
        
        self._original_selling_price = self.selling_price
        
        # Update work order parts cost only if cost changed
        if cost_changed:
            self.update_work_order_parts_cost()
    
    def update_work_order_parts_cost(self):
        """Update work order's actual parts cost"""
        # Use centralized recalculation method
        self.work_order.recalculate_totals()

    def resolve_inventory_part(self):
        """Find the matching inventory part for this work-order part."""
        if self.inventory_part_id:
            return self.inventory_part
        if not self.part_number:
            return None

        from apps.inventory.models import Part

        queryset = Part.objects.filter(part_number__iexact=self.part_number)
        branch = getattr(self.work_order, 'branch', None)
        if branch:
            return (
                queryset.filter(branch=branch).first()
                or queryset.filter(branch__isnull=True).first()
                or queryset.first()
            )
        return queryset.first()

    def get_inventory_stock_item(self, part=None):
        """Return branch stock for the resolved part when it exists."""
        part = part or self.resolve_inventory_part()
        branch = getattr(self.work_order, 'branch', None)
        if not part or not branch:
            return None

        from apps.inventory.models import StockItem

        return StockItem.objects.filter(part=part, branch=branch).first()

    def get_inventory_status_payload(self):
        """Return branch-aware availability details for stores/fulfilment UI."""
        if not self.part_number:
            return None

        part = self.resolve_inventory_part()
        if not part:
            return {
                'available': False,
                'quantity': 0,
                'part_id': None,
                'message': 'Part not found in inventory',
            }

        branch = getattr(self.work_order, 'branch', None)
        stock_item = self.get_inventory_stock_item(part)
        if stock_item:
            available_quantity = stock_item.available_quantity
            is_available = Decimal(str(available_quantity)) >= self.quantity
            return {
                'available': is_available,
                'quantity': available_quantity,
                'part_id': part.id,
                'stock_item_id': stock_item.id,
                'message': 'In Stock' if is_available else 'Insufficient Stock',
            }

        if getattr(part, 'branch_id', None) and branch and part.branch_id != branch.id:
            return {
                'available': False,
                'quantity': 0,
                'part_id': part.id,
                'message': f'Part at {part.branch.name}',
            }

        available_quantity = getattr(part, 'available_quantity', 0) or 0
        is_available = Decimal(str(available_quantity)) >= self.quantity
        return {
            'available': is_available,
            'quantity': available_quantity,
            'part_id': part.id,
            'stock_item_id': None,
            'message': 'In Stock' if is_available else 'Insufficient Stock',
        }

    @property
    def supplier(self):
        """Supplier name for display (from PO or inventory part)"""
        if self.purchase_order_item and self.purchase_order_item.purchase_order:
            return getattr(
                self.purchase_order_item.purchase_order.supplier,
                'name',
                None,
            )
        if self.inventory_part:
            pref = getattr(self.inventory_part, 'preferred_supplier', None)
            if pref:
                return getattr(pref, 'name', None)
            # Fallback to first supplier in M2M
            first = getattr(self.inventory_part, 'suppliers', None)
            if first:
                first_sup = first.first()
                return getattr(first_sup, 'name', None) if first_sup else None
        return None

    @property
    def eta(self):
        """Expected delivery date for display (from PO or ordered_at)"""
        if self.purchase_order_item and self.purchase_order_item.purchase_order:
            edd = getattr(
                self.purchase_order_item.purchase_order,
                'expected_delivery_date',
                None,
            )
            if edd:
                return edd  # DateField works with |date template filter
        return self.ordered_at


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
        validators=[MinValueValidator(Decimal('0'))]
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
        validators=[MinValueValidator(Decimal('0'))]
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
        # Calculate duration and cost if clock_out is set
        if self.clock_out and self.clock_in:
            duration = self.clock_out - self.clock_in
            hours = Decimal(duration.total_seconds()) / Decimal(3600)
            self.duration_hours = round(hours, 2)
            
            # Calculate labor cost
            if self.hourly_rate:
                self.labor_cost = round(self.duration_hours * self.hourly_rate, 2)
        
        # Auto-set hourly rate from user profile if not set and available
        if not self.hourly_rate and self.technician:
            # Try to get rate from technician profile or user
            if hasattr(self.technician, 'technician_profile'):
                 # Assuming rate might be on profile in future, currently maybe on user? 
                 # The view used getattr(user, 'hourly_rate', 0).
                 # Let's stick to what the view did but also allow for profile expansion
                 pass
            
            rate = getattr(self.technician, 'hourly_rate', Decimal('0.00'))
            if rate:
                self.hourly_rate = rate

        super().save(*args, **kwargs)
        
        # Roll up actual hours to the related Service Task
        if self.task_id:
            from django.db.models import Sum
            total_hours = self.task.time_logs.filter(clock_out__isnull=False).aggregate(
                total=Sum('duration_hours')
            )['total'] or Decimal('0.00')
            self.task.actual_hours = total_hours
            self.task.save()
            
        # Update Technician Status
        self._update_technician_status()

    def _update_technician_status(self):
        """
        Update the associated technician's status based on clock in/out
        """
        if not self.technician:
            return
            
        try:
            # Access the reverse relation for Technician profile
            # defined in apps/technicians/models.py as related_name='technician_profile'
            tech_profile = getattr(self.technician, 'technician_profile', None)
            
            if tech_profile:
                if not self.clock_out:
                    # If clocked in and not clocked out, they are busy
                    if tech_profile.current_status != 'busy':
                        tech_profile.current_status = 'busy'
                        tech_profile.save(update_fields=['current_status'])
                else:
                    # If clocked out, check if they have any OTHER active logs
                    # If no other active logs, set to available
                    has_other_active = self.technician.time_logs.filter(
                        clock_out__isnull=True
                    ).exclude(id=self.id).exists()
                    
                    if not has_other_active:
                        if tech_profile.current_status == 'busy':
                            tech_profile.current_status = 'available'
                            tech_profile.save(update_fields=['current_status'])
                            
        except Exception as e:
            # Log error strictly, don't crash the save
            logger.error(f"Failed to update technician status for user {self.technician.id}: {e}")


class WorkOrderNote(models.Model):
    """
    Notes and communication log for work orders
    """
    
    NOTE_TYPE_CHOICES = [
        ('internal', 'Internal Note'),
        ('status', 'Stage / Status Note'),
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


class TriageForm(models.Model):
    """
    Structured triage form for initial vehicle assessment
    Completed by Service Coordinator during initial inspection
    """
    
    work_order = models.OneToOneField(
        WorkOrder,
        on_delete=models.CASCADE,
        related_name='triage_form',
        help_text="Work order this triage form is for"
    )
    
    # Performed by Service Coordinator
    performed_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='triage_forms',
        limit_choices_to={'role__in': ['service_coordinator', 'manager', 'receptionist']},
        help_text="Service Coordinator who performed the triage"
    )
    
    # Visual Inspection
    visual_inspection_notes = models.TextField(
        blank=True,
        help_text="Notes from visual inspection of the vehicle"
    )
    exterior_condition = models.CharField(
        max_length=20,
        choices=[
            ('excellent', 'Excellent'),
            ('good', 'Good'),
            ('fair', 'Fair'),
            ('poor', 'Poor'),
        ],
        blank=True,
        help_text="Overall exterior condition"
    )
    interior_condition = models.CharField(
        max_length=20,
        choices=[
            ('excellent', 'Excellent'),
            ('good', 'Good'),
            ('fair', 'Fair'),
            ('poor', 'Poor'),
        ],
        blank=True,
        help_text="Overall interior condition"
    )
    
    # Test Drive
    test_drive_performed = models.BooleanField(default=False)
    test_drive_notes = models.TextField(
        blank=True,
        help_text="Notes from test drive (if performed)"
    )
    test_drive_issues = models.TextField(
        blank=True,
        help_text="Issues observed during test drive"
    )
    
    # Initial Assessment
    initial_assessment = models.TextField(
        help_text="Service Coordinator's initial assessment of the problem"
    )
    priority_assessment = models.CharField(
        max_length=10,
        choices=WorkOrder.PRIORITY_CHOICES,
        default='normal',
        help_text="Initial priority assessment"
    )
    estimated_complexity = models.CharField(
        max_length=20,
        choices=[
            ('simple', 'Simple'),
            ('moderate', 'Moderate'),
            ('complex', 'Complex'),
            ('very_complex', 'Very Complex'),
        ],
        default='moderate',
        help_text="Estimated complexity of the repair"
    )
    
    # Recommended Next Steps
    recommended_next_steps = models.TextField(
        blank=True,
        help_text="Recommended next steps (e.g., 'Send to diagnosis', 'Check parts availability')"
    )
    requires_diagnosis = models.BooleanField(
        default=True,
        help_text="Whether diagnosis is required before proceeding"
    )
    customer_communication_notes = models.TextField(
        blank=True,
        help_text="Notes about customer communication during triage"
    )
    
    # Timestamps
    completed_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-completed_at']
        verbose_name = 'Triage Form'
        verbose_name_plural = 'Triage Forms'
    
    def __str__(self):
        return f"Triage for {self.work_order.work_order_number} - {self.completed_at.strftime('%Y-%m-%d')}"


class RepeatVisitAlert(models.Model):
    """
    Track repeat visits when a vehicle returns within 30 days for similar problems.
    Used for quality control and warranty tracking.
    """
    work_order = models.OneToOneField(
        WorkOrder,
        on_delete=models.CASCADE,
        related_name='repeat_visit_alert',
        help_text="The work order that triggered this repeat visit alert"
    )
    related_work_order = models.ForeignKey(
        WorkOrder,
        on_delete=models.CASCADE,
        related_name='triggered_alerts',
        help_text="The previous work order that this repeat visit relates to"
    )
    days_since_previous = models.IntegerField(
        help_text="Number of days between completion of previous work order and creation of this one"
    )
    similarity_score = models.DecimalField(
        max_digits=5,
        decimal_places=3,
        help_text="Text similarity score between customer concerns (0-1)"
    )
    detected_at = models.DateTimeField(auto_now_add=True)
    marked_as_warranty = models.BooleanField(
        default=False,
        help_text="Whether this repeat visit was marked as a warranty/rework case"
    )
    resolved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_repeat_visits',
        limit_choices_to={'role__in': ['manager', 'admin']}
    )
    
    class Meta:
        ordering = ['-detected_at']
        indexes = [
            models.Index(fields=['work_order']),
            models.Index(fields=['related_work_order']),
            models.Index(fields=['marked_as_warranty', 'detected_at']),
        ]
    
    def __str__(self):
        return f"Repeat visit alert: {self.work_order.work_order_number} -> {self.related_work_order.work_order_number} ({self.days_since_previous} days)"
