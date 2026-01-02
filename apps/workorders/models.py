import uuid
from django.db import models
from django.db.models import Max
from django.core.exceptions import FieldDoesNotExist
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from decimal import Decimal
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
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='normal')
    
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
            self._handle_workflow_tasks('draft', self.status, None)
    
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

    @property
    def lead_technician(self):
        """Return primary technician or fall back to the first assigned technician"""
        if self.primary_technician:
            return self.primary_technician
        return self.assigned_technicians.first()
    
    def can_transition_to(self, new_status):
        """
        Validate if status transition is allowed.
        Returns (can_transition: bool, error_message: str or None)
        """
        VALID_TRANSITIONS = {
            'draft': ['inspection', 'intake'],
            'inspection': ['intake', 'draft'],
            'intake': ['assigned', 'draft'],
            'assigned': ['diagnosis', 'intake'],
            'diagnosis': ['awaiting_approval', 'approved', 'in_progress'],
            'awaiting_approval': ['approved', 'diagnosis'],
            'approved': ['in_progress', 'awaiting_approval'],
            'in_progress': ['paused', 'quality_check', 'completed', 'additional_work_found'],
            'additional_work_found': ['awaiting_approval', 'in_progress'],
            'paused': ['in_progress'],
            'quality_check': ['completed', 'in_progress'],
            'completed': ['invoiced', 'closed'],
            'invoiced': ['closed'],
            'closed': ['invoiced', 'completed', 'in_progress'],  # Allow reopen transitions
        }
        
        # Check if transition is in valid transitions list
        valid_next_statuses = VALID_TRANSITIONS.get(self.status, [])
        if new_status not in valid_next_statuses:
            return False, f"Cannot transition from {self.get_status_display()} to {new_status}"
        
        # Validate Service Coordinator is assigned before diagnosis
        if new_status == 'diagnosis' and not self.service_coordinator:
            return (False, 'A Service Coordinator must be assigned before diagnosis can be carried out.')
        
        # Validate Service Coordinator is assigned when transitioning to assigned status
        if new_status == 'assigned' and not self.service_coordinator:
            return (False, 'A Service Coordinator must be assigned when moving to assigned status.')
        
        # Check prerequisites
        if new_status == 'awaiting_approval':
            if not self.diagnosis_notes:
                return False, "Diagnosis notes are required before requesting approval"
            if self.estimated_total <= 0:
                return False, "Estimated total must be greater than 0 before requesting approval"
        
        if new_status == 'approved':
            if not self.requires_approval:
                return False, "Work order does not require approval"
        
        if new_status == 'in_progress':
            # Special case: If transitioning from quality_check, this means QC failed
            # Work order should already be approved and have technicians, so bypass strict checks
            current_status = self.status  # Current status before transition (old_status)
            if current_status != 'quality_check':
                # Only check approval for new transitions to in_progress (not returning from QC)
                if not self.is_approved:
                    return False, "Work order must be approved before starting work"
                if not self.primary_technician and not self.assigned_technicians.exists():
                    return False, "At least one technician must be assigned before starting work"
        
        if new_status == 'quality_check':
            if not self.tasks.exists():
                return False, "At least one task must exist before quality check"
            completed_tasks = self.tasks.filter(status='completed').count()
            if completed_tasks == 0:
                return False, "At least one task must be completed before quality check"
        
        if new_status == 'completed':
            if not self.tasks.exists():
                return False, "At least one task must exist before completing"
            if self.quality_check_required and not self.quality_check_completed:
                return False, "Quality check must be completed first"
            # Check if all parts are installed or returned
            pending_parts = self.parts.exclude(status__in=['installed', 'returned'])
            if pending_parts.exists():
                return False, f"{pending_parts.count()} part(s) are not installed or returned"
        
        if new_status == 'invoiced':
            if not self.odometer_out:
                return False, "Odometer out is required before invoicing"
        
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
            if self.estimated_total <= 0:
                errors.append("Estimated total must be greater than 0")
        
        if new_status == 'in_progress':
            if not self.primary_technician and not self.assigned_technicians.exists():
                errors.append("At least one technician must be assigned")
            if not self.is_approved:
                errors.append("Work order must be approved")
        
        if new_status == 'completed':
            pending_parts = self.parts.exclude(status__in=['installed', 'returned'])
            if pending_parts.exists():
                errors.append(f"{pending_parts.count()} part(s) are not installed or returned")
        
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
        
        # Validate required fields
        field_errors = self.validate_before_status_change(new_status)
        if field_errors:
            raise ValidationError('; '.join(field_errors))
        
        old_status = self.status
        self.status = new_status
        
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
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Inventory integration failed for WO {self.work_order_number}: {e}")
        
        # Convert repair recommendations to tasks when starting work
        if new_status == 'in_progress' and old_status != 'in_progress':
            # This will be called from start_work endpoint, but also handle here as backup
            # Only convert if no tasks exist yet (to avoid duplicates)
            if not self.tasks.filter(is_workflow_task=False).exists():
                self.convert_recommendations_to_tasks(user=user)
        
        # Handle workflow task creation and completion
        self._handle_workflow_tasks(old_status, new_status, user)
        
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
        
        # Post accounting entries when work order is completed
        # if new_status == 'completed':
        #     try:
        #         from apps.billing.accounting_service import AccountingService
        #         # Post parts cost (COGS)
        #         AccountingService.post_parts_cost(self)
        #         # Post labor cost (COGS)
        #         AccountingService.post_labor_cost(self)
        #     except Exception as e:
        #         # Log error but don't fail the transition
        #         import logging
        #         logger = logging.getLogger(__name__)
        #         logger.error(
        #             f"Failed to post accounting entries for WO {self.work_order_number}: {e}",
        #             exc_info=True
        #         )
        
        return True
    
    def _send_status_notification(self, new_status, old_status):
        """Send appropriate notification based on status change"""
        try:
            from apps.notifications_app.triggers import notification_triggers
            
            if new_status == 'in_progress' and old_status != 'in_progress':
                notification_triggers.work_order_started(self)
            elif new_status == 'paused':
                notification_triggers.work_order_paused(self)
            elif new_status == 'quality_check':
                # Quality check notification will be sent when QC is performed
                pass
            elif new_status == 'completed' and old_status != 'completed':
                notification_triggers.work_order_completed(self)
            elif new_status == 'invoiced':
                notification_triggers.work_order_invoiced(self)
        except Exception as e:
            # Don't fail the transition if notification fails
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send notification for work order {self.id}: {e}")
    
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
        
        for part in self.parts.filter(status__in=['pending', 'ordered']):
            # If part is linked to inventory, check availability
            # This assumes future integration with inventory system
            # For now, just check if parts are in pending/ordered status
            if part.status in ['pending', 'ordered']:
                unavailable.append({
                    'part': part,
                    'reason': f'Part {part.part_name} is {part.get_status_display()}'
                })
        
        return unavailable
    
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
        
        # Check if there are any tasks (either existing or recommendations to convert)
        has_tasks = self.tasks.filter(is_workflow_task=False).exists()
        has_recommendations = False
        try:
            from apps.diagnosis.models import Diagnosis
            diagnosis = Diagnosis.objects.filter(work_order=self).first()
            if diagnosis:
                # If work order is approved, allow converting any recommendations (approved or not)
                # Otherwise, only allow approved recommendations
                if self.status == 'approved':
                    has_recommendations = diagnosis.repair_recommendations.filter(
                        converted_to_task__isnull=True
                    ).exists()
                else:
                    has_recommendations = diagnosis.repair_recommendations.filter(
                        customer_approved=True,
                        converted_to_task__isnull=True
                    ).exists()
        except Exception:
            pass  # If diagnosis app not available, skip this check
        
        if not has_tasks and not has_recommendations:
            errors.append("No tasks or repair recommendations found. Please create tasks or add recommendations before starting work.")
        
        unavailable_parts = self.check_parts_availability()
        critical_parts = [p for p in unavailable_parts if p['part'].task is not None]
        if critical_parts:
            errors.append(f"{len(critical_parts)} required part(s) not available")
        
        return len(errors) == 0, errors
    
    def convert_recommendations_to_tasks(self, user=None):
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
            
            # Get recommendations that haven't been converted yet
            # If work order is approved, convert all recommendations (not just customer_approved ones)
            # Otherwise, only convert approved recommendations
            if self.status == 'approved':
                recommendations = diagnosis.repair_recommendations.filter(
                    converted_to_task__isnull=True
                )
            else:
                recommendations = diagnosis.repair_recommendations.filter(
                    customer_approved=True,
                    converted_to_task__isnull=True
                )
            
            if not recommendations.exists():
                return 0, 0
            
            tasks_created = 0
            parts_linked = 0
            
            # Get max sequence order for non-workflow tasks
            max_sequence = self.tasks.filter(is_workflow_task=False).aggregate(
                max_seq=Max('sequence_order')
            )['max_seq'] or 0
            
            # Get primary technician or first assigned technician
            assigned_user = self.primary_technician
            if not assigned_user:
                assigned_user = self.assigned_technicians.first()
            
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
                
                # Create ServiceTask from recommendation
                task = ServiceTask.objects.create(
                    work_order=self,
                    task_type=task_type,
                    description=rec.description,
                    detailed_notes=f"Converted from repair recommendation: {rec.description}",
                    status='pending',  # Tasks start as pending, technician will start them
                    sequence_order=max_sequence + tasks_created + 1,
                    assigned_to=assigned_user,
                    estimated_hours=rec.estimated_labor_hours or Decimal('0'),
                    labor_rate=getattr(self.primary_technician, 'hourly_rate', Decimal('0')) if self.primary_technician else Decimal('0'),
                    workflow_phase=None,
                    is_workflow_task=False,
                )
                
                # Calculate labor cost
                if task.estimated_hours and task.labor_rate:
                    task.labor_cost = task.estimated_hours * task.labor_rate
                    task.save()
                
                # Link recommendation to task
                rec.converted_to_task = task
                rec.save()
                
                tasks_created += 1
                
                # Link parts from recommendation to task
                if rec.parts_needed and isinstance(rec.parts_needed, list):
                    for part_data in rec.parts_needed:
                        try:
                            part_name = part_data.get('part_name', '').strip()
                            part_number = part_data.get('part_number', '').strip()
                            
                            if not part_name:
                                continue
                            
                            # Try to find existing WorkOrderPart by part_name or part_number
                            existing_part = None
                            if part_number:
                                existing_part = self.parts.filter(
                                    part_number=part_number
                                ).first()
                            
                            if not existing_part:
                                existing_part = self.parts.filter(
                                    part_name=part_name
                                ).first()
                            
                            if existing_part:
                                # Link existing part to task if not already linked
                                if not existing_part.task:
                                    existing_part.task = task
                                    existing_part.save()
                                    parts_linked += 1
                                elif existing_part.task != task:
                                    # Part is linked to different task - create a note but don't change
                                    import logging
                                    logger = logging.getLogger(__name__)
                                    logger.info(f"Part {part_name} already linked to task {existing_part.task.id}, skipping link to task {task.id}")
                        except Exception as e:
                            # Log error but continue with other parts
                            import logging
                            logger = logging.getLogger(__name__)
                            logger.warning(f"Failed to link part from recommendation {rec.id} to task: {e}")
            
            # Recalculate totals after creating tasks and linking parts
            self.recalculate_totals()
            
            return tasks_created, parts_linked
            
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
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
                        import logging
                        logger = logging.getLogger(__name__)
                        logger.warning(f"Auto-transition to quality_check failed for WO {self.id}: {e}")
    
    def check_parts_ready(self):
        """
        Check if all required parts are ready for installation.
        Returns True if all parts are received or installed.
        """
        if not self.parts.exists():
            return True
        
        # Check if any parts are still pending or ordered
        pending_parts = self.parts.filter(status__in=['pending', 'ordered'])
        return pending_parts.count() == 0
    
    def _get_workflow_task_config(self, status):
        """
        Get configuration for workflow task based on status.
        Returns dict with task_type, description, and sequence_order, or None if no task needed.
        """
        WORKFLOW_TASK_CONFIG = {
            'inspection': {
                'task_type': 'inspection',
                'description': 'Initial Inspection',
                'sequence_order': 1,
            },
            'intake': {
                'task_type': 'inspection',
                'description': 'Customer Intake',
                'sequence_order': 2,
            },
            'assigned': {
                'task_type': 'coordination',
                'description': 'Service Coordinator Assigned - Ready for Diagnosis',
                'sequence_order': 3,
            },
            'diagnosis': {
                'task_type': 'diagnostic',
                'description': 'Perform Diagnosis',
                'sequence_order': 4,
            },
            'awaiting_approval': {
                'task_type': 'other',
                'description': 'Await Customer Approval',
                'sequence_order': 5,
            },
            'approved': {
                'task_type': 'other',
                'description': 'Customer Approval Received',
                'sequence_order': 6,
            },
            'in_progress': {
                'task_type': 'repair',
                'description': 'Repair Work',
                'sequence_order': 7,
            },
            'quality_check': {
                'task_type': 'inspection',
                'description': 'Perform Quality Check',
                'sequence_order': 8,
            },
            'completed': {
                'task_type': 'other',
                'description': 'Finalize Work Order',
                'sequence_order': 9,
            },
            'invoiced': {
                'task_type': 'other',
                'description': 'Generate Invoice',
                'sequence_order': 10,
            },
            'closed': {
                'task_type': 'other',
                'description': 'Close Work Order',
                'sequence_order': 11,
            },
        }
        return WORKFLOW_TASK_CONFIG.get(status)
    
    def _handle_workflow_tasks(self, old_status, new_status, user=None):
        """
        Automatically create and complete workflow tasks based on status transitions.
        """
        try:
            from django.utils import timezone
            from django.db import DatabaseError
            
            # Check if workflow task fields exist in the database
            # If migration hasn't been run, fields won't exist and queries will fail
            try:
                # Test if the fields exist by checking the model's meta
                from django.db import connection
                fields = [f.name for f in self.tasks.model._meta.get_fields()]
                workflow_fields_exist = 'is_workflow_task' in fields and 'workflow_phase' in fields
            except (AttributeError, FieldDoesNotExist, Exception):
                # Fields don't exist yet - migration not run, or error checking
                workflow_fields_exist = False
            
            if not workflow_fields_exist:
                # Migration hasn't been run yet - skip workflow task creation
                return
            
            # Complete the task for the old status if it exists
            # BUT: Don't complete if transitioning to/from paused - just pause/resume the task
            if old_status:
                # Special handling for paused status - don't complete tasks when pausing/resuming
                if new_status == 'paused' or old_status == 'paused':
                    # When pausing: just pause the workflow task, don't complete it
                    if new_status == 'paused' and old_status in ['in_progress']:
                        try:
                            old_task = self.tasks.filter(
                                workflow_phase=old_status,
                                is_workflow_task=True
                            ).first()
                            
                            if old_task and old_task.status == 'in_progress':
                                # Pause the task instead of completing it
                                ServiceTask.objects.filter(pk=old_task.pk).update(
                                    status='pending',  # Set back to pending when paused
                                )
                        except (DatabaseError, AttributeError) as e:
                            import logging
                            logger = logging.getLogger(__name__)
                            logger.warning(f"Failed to pause workflow task for phase {old_status}: {e}")
                    # When resuming: reactivate the existing workflow task
                    elif old_status == 'paused' and new_status == 'in_progress':
                        try:
                            # Find existing workflow task for in_progress
                            existing_task = self.tasks.filter(
                                workflow_phase='in_progress',
                                is_workflow_task=True
                            ).first()
                            
                            if existing_task:
                                # Reactivate the task
                                ServiceTask.objects.filter(pk=existing_task.pk).update(
                                    status='in_progress',
                                    started_at=timezone.now()
                                )
                                # Don't create a new task - we'll return early
                                return
                        except (DatabaseError, AttributeError) as e:
                            import logging
                            logger = logging.getLogger(__name__)
                            logger.warning(f"Failed to resume workflow task: {e}")
                else:
                    # Normal transition - complete the old task
                    try:
                        old_task = self.tasks.filter(
                            workflow_phase=old_status,
                            is_workflow_task=True
                        ).first()
                        
                        if old_task and old_task.status != 'completed':
                            old_task.status = 'completed'
                            old_task.completed_at = timezone.now()
                            # Bypass save() recursion by using update()
                            ServiceTask.objects.filter(pk=old_task.pk).update(
                                status='completed',
                                completed_at=timezone.now()
                            )
                            # Update totals after completion
                            self.recalculate_totals()
                    except (DatabaseError, AttributeError) as e:
                        # Log error but don't fail the status transition
                        import logging
                        logger = logging.getLogger(__name__)
                        logger.warning(f"Failed to complete workflow task for phase {old_status}: {e}")
            
            # Create task for new status if config exists and task doesn't already exist
            # Skip creating workflow task for paused status (no config exists anyway)
            if new_status == 'paused':
                return  # Don't create a workflow task for paused status
            
            task_config = self._get_workflow_task_config(new_status)
            if task_config:
                try:
                    existing_task = self.tasks.filter(
                        workflow_phase=new_status,
                        is_workflow_task=True
                    ).first()
                    
                    # If resuming from paused, we already reactivated the task above, so skip creating new one
                    if old_status == 'paused' and new_status == 'in_progress' and existing_task:
                        return
                    
                    if not existing_task:
                        # Get max sequence order for non-workflow tasks to place workflow tasks appropriately
                        max_manual_seq = self.tasks.filter(is_workflow_task=False).aggregate(
                            max_seq=Max('sequence_order')
                        )['max_seq'] or 0
                        
                        # Auto-start workflow tasks for certain phases
                        auto_start_phases = ['inspection', 'intake', 'assigned', 'diagnosis', 'in_progress', 'quality_check']
                        initial_status = 'in_progress' if new_status in auto_start_phases else 'pending'
                        
                        # Assign task based on phase
                        # For "assigned" phase, assign to Service Coordinator
                        # For other phases, assign to primary technician or keep unassigned
                        assigned_user = None
                        if new_status == 'assigned' and self.service_coordinator:
                            assigned_user = self.service_coordinator
                        elif self.primary_technician:
                            assigned_user = self.primary_technician
                        
                        workflow_task = ServiceTask.objects.create(
                            work_order=self,
                            workflow_phase=new_status,
                            is_workflow_task=True,
                            task_type=task_config['task_type'],
                            description=task_config['description'],
                            sequence_order=task_config['sequence_order'] + max_manual_seq,
                            status=initial_status,
                            assigned_to=assigned_user,
                        )
                        
                        # Set started_at if auto-started
                        if initial_status == 'in_progress':
                            ServiceTask.objects.filter(pk=workflow_task.pk).update(
                                started_at=timezone.now()
                            )
                except (DatabaseError, AttributeError) as e:
                    # Log error but don't fail the status transition
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Failed to create workflow task for phase {new_status}: {e}")
        except Exception as e:
            # Catch any other errors and log them without failing the transition
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error in _handle_workflow_tasks: {e}", exc_info=True)


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
                return hours.quantize(Decimal('0.01'))
        
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
    
    def save(self, *args, **kwargs):
        # Calculate labor cost from hours and rate
        if self.actual_hours and self.labor_rate:
            self.labor_cost = self.actual_hours * self.labor_rate
        
        # Track if status changed to completed
        status_changed = False
        if self.pk:
            try:
                old_task = ServiceTask.objects.get(pk=self.pk)
                status_changed = old_task.status != self.status and self.status == 'completed'
            except ServiceTask.DoesNotExist:
                status_changed = self.status == 'completed'
        else:
            status_changed = self.status == 'completed'
        
        super().save(*args, **kwargs)
        
        # Update work order totals
        self.update_work_order_totals()
        
        # Check for auto-complete if task was just completed
        if status_changed:
            self.work_order.check_auto_complete()
    
    def update_work_order_totals(self):
        """Update work order's actual labor hours and cost"""
        # Use centralized recalculation method
        self.work_order.recalculate_totals()


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
        ('draft', 'Draft (Not Submitted)'),
        ('pending', 'Pending Order'),
        ('ordered', 'Ordered'),
        ('ready', 'Ready for Install'),
        ('received', 'Received'),
        ('installed', 'Installed'),
        ('returned', 'Returned'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
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
        # Use centralized recalculation method
        self.work_order.recalculate_totals()


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
