from django.db import models
from django.core.validators import MinValueValidator
from django.utils import timezone
from decimal import Decimal
from collections import Counter
from apps.accounts.models import User
from apps.workorders.models import WorkOrder


class Diagnosis(models.Model):
    """
    Diagnosis Record - One per work order
    Tracks the entire diagnostic session
    """
    
    STATUS_CHOICES = [
        ('not_started', 'Not Started'),
        ('in_progress', 'In Progress'),
        ('paused', 'Paused'),
        ('awaiting_approval', 'Awaiting Customer Approval'),
        ('completed', 'Completed'),
        ('on_hold', 'On Hold'),  # Keep for backward compatibility
    ]
    
    # One diagnosis per work order
    work_order = models.OneToOneField(
        WorkOrder,
        on_delete=models.CASCADE,
        related_name='diagnosis',
        help_text="Work order this diagnosis belongs to"
    )
    
    # Technician assignment
    technician = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='diagnoses_performed',
        limit_choices_to={'role__in': ['technician', 'manager']},
        help_text="Technician performing the diagnosis"
    )
    
    # Timing
    started_at = models.DateTimeField(null=True, blank=True, help_text="When diagnosis began")
    paused_at = models.DateTimeField(null=True, blank=True, help_text="When diagnosis was paused")
    resumed_at = models.DateTimeField(null=True, blank=True, help_text="When diagnosis was resumed")
    completed_at = models.DateTimeField(null=True, blank=True, help_text="When diagnosis finished")
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='not_started',
        db_index=True
    )
    
    # Customer Information
    customer_complaint = models.TextField(
        help_text="What the customer reported (in their words)"
    )
    initial_observations = models.TextField(
        blank=True,
        help_text="Initial visual observations during intake"
    )
    
    # Diagnostic Process
    diagnostic_notes = models.TextField(
        blank=True,
        help_text="Technician's notes during diagnosis process"
    )
    diagnostic_time_hours = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Actual time spent on diagnosis"
    )
    diagnostic_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Charge for diagnostic work"
    )
    
    # Findings Summary
    root_cause = models.TextField(
        blank=True,
        help_text="Confirmed root cause of the problem"
    )
    root_cause_explanation = models.TextField(
        blank=True,
        help_text="Explanation in customer-friendly terms - why this happened"
    )
    
    # Flags
    is_completed = models.BooleanField(default=False)
    requires_approval = models.BooleanField(
        default=True,
        help_text="Whether customer approval is required before proceeding"
    )
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-started_at']
        verbose_name = 'Diagnosis'
        verbose_name_plural = 'Diagnoses'
        indexes = [
            models.Index(fields=['work_order', 'status']),
            models.Index(fields=['technician', 'status']),
            models.Index(fields=['status', 'started_at']),
        ]
    
    def __str__(self):
        return f"Diagnosis for {self.work_order.work_order_number}"
    
    def start(self, user=None):
        """Start the diagnosis"""
        from django.db import transaction
        # Import here to avoid circular import
        DiagnosisTimeLog = self._meta.apps.get_model('diagnosis', 'DiagnosisTimeLog')
        
        if self.status == 'not_started':
            with transaction.atomic():
                self.status = 'in_progress'
                self.started_at = timezone.now()
                if user and not self.technician:
                    self.technician = user
                self.save(update_fields=['status', 'started_at', 'technician'])
                
                # Create time log entry
                DiagnosisTimeLog.objects.create(
                    diagnosis=self,
                    stage='started',
                    started_at=self.started_at,
                    technician=user or self.technician
                )
                return True
        return False
    
    def pause(self, user=None, reason=None):
        """Pause the diagnosis"""
        from django.db import transaction
        # Import here to avoid circular import
        DiagnosisTimeLog = self._meta.apps.get_model('diagnosis', 'DiagnosisTimeLog')
        
        if self.status == 'in_progress':
            with transaction.atomic():
                # Calculate time spent in current session
                last_resume = self.resumed_at or self.started_at
                if last_resume:
                    time_spent = timezone.now() - last_resume
                    hours_spent = Decimal(str(time_spent.total_seconds() / 3600))
                    self.diagnostic_time_hours += hours_spent
                
                self.status = 'paused'
                self.paused_at = timezone.now()
                self.save(update_fields=['status', 'paused_at', 'diagnostic_time_hours'])
                
                # Update last time log entry or create new one
                last_log = DiagnosisTimeLog.objects.filter(
                    diagnosis=self,
                    stage='resumed'
                ).order_by('-started_at').first()
                
                if last_log and not last_log.ended_at:
                    last_log.ended_at = self.paused_at
                    last_log.save(update_fields=['ended_at'])
                
                # Create pause log entry
                DiagnosisTimeLog.objects.create(
                    diagnosis=self,
                    stage='paused',
                    started_at=self.paused_at,
                    technician=user or self.technician,
                    notes=reason
                )
                return True
        return False
    
    def resume(self, user=None):
        """Resume the diagnosis"""
        from django.db import transaction
        # Import here to avoid circular import
        DiagnosisTimeLog = self._meta.apps.get_model('diagnosis', 'DiagnosisTimeLog')
        
        if self.status == 'paused':
            with transaction.atomic():
                self.status = 'in_progress'
                self.resumed_at = timezone.now()
                self.save(update_fields=['status', 'resumed_at'])
                
                # Update last pause log entry
                last_pause_log = DiagnosisTimeLog.objects.filter(
                    diagnosis=self,
                    stage='paused'
                ).order_by('-started_at').first()
                
                if last_pause_log and not last_pause_log.ended_at:
                    last_pause_log.ended_at = self.resumed_at
                    last_pause_log.save(update_fields=['ended_at'])
                
                # Create resume log entry
                DiagnosisTimeLog.objects.create(
                    diagnosis=self,
                    stage='resumed',
                    started_at=self.resumed_at,
                    technician=user or self.technician
                )
                return True
        return False

    def submit_for_approval(self, user=None):
        """
        Send the diagnosis to the customer approval stage without finalizing it.
        The diagnostic record remains editable through reopen/resume until approval.
        """
        from django.db import transaction

        DiagnosisTimeLog = self._meta.apps.get_model('diagnosis', 'DiagnosisTimeLog')

        if self.status not in ['in_progress', 'paused']:
            raise ValueError(f'Cannot send diagnosis for approval from {self.get_status_display()}.')

        if not (
            (self.diagnostic_notes and self.diagnostic_notes.strip())
            or (self.root_cause and self.root_cause.strip())
            or self.repair_recommendations.exists()
        ):
            raise ValueError('Add diagnosis notes, a root cause, or at least one recommendation before requesting approval.')

        with transaction.atomic():
            now = timezone.now()

            if self.status == 'in_progress':
                last_resume = self.resumed_at or self.started_at
                if last_resume:
                    time_spent = now - last_resume
                    hours_spent = Decimal(str(time_spent.total_seconds() / 3600))
                    self.diagnostic_time_hours += hours_spent

                last_log = DiagnosisTimeLog.objects.filter(
                    diagnosis=self,
                    stage__in=['started', 'resumed']
                ).order_by('-started_at').first()

                if last_log and not last_log.ended_at:
                    last_log.ended_at = now
                    last_log.save(update_fields=['ended_at'])

            self.status = 'awaiting_approval'
            self.paused_at = now
            self.requires_approval = True
            self.save(update_fields=[
                'status',
                'paused_at',
                'requires_approval',
                'diagnostic_time_hours',
            ])

            work_order = self.work_order
            work_order.refresh_from_db()
            work_order.requires_approval = True
            work_order.approval_requested_at = now
            if self.technician:
                work_order.diagnosis_by = self.technician
            if self.root_cause:
                work_order.diagnosis_notes = self.root_cause
            elif self.diagnostic_notes:
                work_order.diagnosis_notes = self.diagnostic_notes
            elif self.customer_complaint and not work_order.diagnosis_notes:
                work_order.diagnosis_notes = self.customer_complaint
            work_order.save(update_fields=[
                'requires_approval',
                'approval_requested_at',
                'diagnosis_by',
                'diagnosis_notes',
            ])

            if work_order.status == 'diagnosis':
                work_order.transition_to('awaiting_approval', user=user)
    
    def complete(self, requires_approval=None):
        """
        Mark diagnosis as completed and sync with WorkOrder
        
        Args:
            requires_approval: Whether customer approval is required. If None, uses self.requires_approval
        """
        from django.db import transaction
        
        # Import here to avoid circular import
        DiagnosisTimeLog = self._meta.apps.get_model('diagnosis', 'DiagnosisTimeLog')
        
        effective_requires_approval = self.requires_approval if requires_approval is None else requires_approval
        if effective_requires_approval and self.work_order and not self.work_order.approved_by_customer:
            raise ValueError('Send the diagnosis for approval and wait for customer approval before final completion.')

        if not self.is_completed:
            with transaction.atomic():
                # Calculate final time spent if currently in progress
                if self.status == 'in_progress':
                    last_resume = self.resumed_at or self.started_at
                    if last_resume:
                        time_spent = timezone.now() - last_resume
                        hours_spent = Decimal(str(time_spent.total_seconds() / 3600))
                        self.diagnostic_time_hours += hours_spent
                
                self.is_completed = True
                self.status = 'completed'
                self.completed_at = timezone.now()
                
                # Update requires_approval if provided
                if requires_approval is not None:
                    self.requires_approval = requires_approval
                
                self.save(update_fields=['is_completed', 'status', 'completed_at', 'requires_approval', 'diagnostic_time_hours'])
                
                # Update last time log entry
                last_log = DiagnosisTimeLog.objects.filter(
                    diagnosis=self,
                    stage__in=['started', 'resumed']
                ).order_by('-started_at').first()
                
                if last_log and not last_log.ended_at:
                    last_log.ended_at = self.completed_at
                    last_log.save(update_fields=['ended_at'])
                
                # Create completion log entry
                DiagnosisTimeLog.objects.create(
                    diagnosis=self,
                    stage='completed',
                    started_at=self.completed_at,
                    technician=self.technician
                )
                
                # Sync with WorkOrder
                work_order = self.work_order
                if work_order:
                    # Refresh work_order to ensure we have latest data (e.g. from Estimate sync)
                    work_order.refresh_from_db()
                    
                    # Update diagnosis completion fields
                    work_order.diagnosis_completed_at = self.completed_at
                    
                    # Set diagnosis_by from diagnosis technician
                    if self.technician:
                        work_order.diagnosis_by = self.technician
                    
                    # Update diagnosis_notes from root_cause or customer_complaint
                    if self.root_cause:
                        work_order.diagnosis_notes = self.root_cause
                    elif self.customer_complaint and not work_order.diagnosis_notes:
                        work_order.diagnosis_notes = self.customer_complaint
                    
                    # Update requires_approval flag
                    work_order.requires_approval = self.requires_approval
                    
                    # COST CALCULATION LOGIC
                    # Check if there is an existing Estimate linked to the Work Order
                    # If an estimate exists and has a total, we use that as the source of truth
                    # and skip overwriting with recommendation calculations
                    
                    estimate_used = False
                    if hasattr(work_order, 'estimate') and work_order.estimate:
                        try:
                            # Accessing estimate might trigger DB lookup
                            if work_order.estimate.total > 0:
                                estimate_used = True
                        except Exception:
                            pass

                    if not estimate_used:
                        # Calculate estimated totals from recommendations only if no valid estimate
                        total_parts_cost = Decimal('0')
                        total_labor_cost = Decimal('0')
                        total_labor_hours = Decimal('0')
                        
                        for rec in self.repair_recommendations.all():
                            if rec.estimated_parts_cost:
                                total_parts_cost += Decimal(str(rec.estimated_parts_cost))
                            if rec.estimated_labor_cost:
                                total_labor_cost += Decimal(str(rec.estimated_labor_cost))
                            if rec.estimated_labor_hours:
                                total_labor_hours += Decimal(str(rec.estimated_labor_hours))
                        
                        # Update work order estimated costs
                        if total_parts_cost > 0:
                            work_order.estimated_parts_cost = total_parts_cost
                        if total_labor_cost > 0:
                            work_order.estimated_labor_cost = total_labor_cost
                        if total_labor_hours > 0:
                            work_order.estimated_labor_hours = total_labor_hours
                        
                        # Recalculate estimated_total
                        work_order.estimated_total = work_order.estimated_labor_cost + work_order.estimated_parts_cost
                    
                    # Determine next status based on approval requirement
                    # Only update status if currently in 'diagnosis' status
                    if work_order.status == 'diagnosis':
                        if self.requires_approval:
                            # Transition to awaiting_approval
                            can_transition, error_msg = work_order.can_transition_to('awaiting_approval')
                            if can_transition:
                                work_order.transition_to('awaiting_approval', user=self.technician)
                            else:
                                # If can't transition (e.g., missing estimate), keep in diagnosis but mark completed
                                import logging
                                logger = logging.getLogger(__name__)
                                logger.warning(f"Cannot transition work order {work_order.id} to awaiting_approval: {error_msg}")
                        else:
                            # No approval needed - can transition directly to in_progress or approved
                            # Check prerequisites for in_progress first
                            can_transition, error_msg = work_order.can_transition_to('in_progress')
                            if can_transition:
                                work_order.status = 'in_progress'
                            else:
                                # If can't go to in_progress (e.g., no technician assigned), 
                                # try approved status (which bypasses approval requirement)
                                # Since requires_approval is False, we can skip the approval check
                                # Just ensure we have basic prerequisites
                                if work_order.primary_technician or work_order.assigned_technicians.exists():
                                    # Technicians assigned, can go to approved
                                    work_order.status = 'approved'
                                else:
                                    # Keep in diagnosis status - technician assignment needed
                                    import logging
                                    logger = logging.getLogger(__name__)
                                    logger.warning(f"Cannot transition work order {work_order.id} from diagnosis: {error_msg}")
                    
                    # Save work order updates
                    work_order.save(update_fields=[
                        'diagnosis_completed_at',
                        'diagnosis_by',
                        'diagnosis_notes',
                        'requires_approval',
                        'estimated_parts_cost',
                        'estimated_labor_cost',
                        'estimated_labor_hours',
                        'estimated_total',
                        'status'
                    ])

    def reopen_for_revision(self, user=None, reason=''):
        """
        Reopen a completed diagnosis when the customer rejects/defer requests
        or staff need to revise it before approval is granted.
        """
        from django.db import transaction

        DiagnosisTimeLog = self._meta.apps.get_model('diagnosis', 'DiagnosisTimeLog')
        WorkOrderNote = self._meta.apps.get_model('workorders', 'WorkOrderNote')

        work_order = self.work_order
        locked_statuses = {
            'approved',
            'in_progress',
            'paused',
            'quality_check',
            'completed',
            'invoiced',
            'closed',
        }

        if not self.is_completed and self.status != 'awaiting_approval':
            raise ValueError('Diagnosis is already open for editing.')

        if work_order.approved_by_customer or work_order.status in locked_statuses:
            raise ValueError(
                'This diagnosis cannot be revised after customer approval or after repair work has started.'
            )

        with transaction.atomic():
            reopened_at = timezone.now()
            self.is_completed = False
            self.status = 'in_progress'
            self.completed_at = None
            self.resumed_at = reopened_at
            self.paused_at = None
            if user and not self.technician:
                self.technician = user
            self.save(update_fields=[
                'is_completed',
                'status',
                'completed_at',
                'resumed_at',
                'paused_at',
                'technician',
            ])

            work_order.status = 'diagnosis'
            work_order.diagnosis_completed_at = None
            work_order.approved_by_customer = False
            work_order.approved_at = None
            work_order.save(update_fields=[
                'status',
                'diagnosis_completed_at',
                'approved_by_customer',
                'approved_at',
            ])

            DiagnosisTimeLog.objects.create(
                diagnosis=self,
                stage='resumed',
                started_at=reopened_at,
                technician=user or self.technician,
                notes=reason or 'Diagnosis reopened for revision.',
            )

            WorkOrderNote.objects.create(
                work_order=work_order,
                note_type='internal',
                note=reason or 'Diagnosis reopened for revision before customer approval.',
                created_by=user if getattr(user, 'is_authenticated', False) else None,
                is_important=True,
            )
    
    @property
    def diagnostic_time_formatted(self):
        """Format diagnostic time as hours:minutes"""
        if self.diagnostic_time_hours:
            hours = int(self.diagnostic_time_hours)
            minutes = int((self.diagnostic_time_hours - hours) * 60)
            return f"{hours}h {minutes}m"
        return "0h 0m"


class DiagnosisTimeLog(models.Model):
    """
    Timesheet tracking for diagnosis stages
    Tracks time spent in each stage: started, paused, resumed, completed
    """
    
    STAGE_CHOICES = [
        ('started', 'Started'),
        ('paused', 'Paused'),
        ('resumed', 'Resumed'),
        ('completed', 'Completed'),
    ]
    
    diagnosis = models.ForeignKey(
        Diagnosis,
        on_delete=models.CASCADE,
        related_name='time_logs',
        help_text="Diagnosis this time log belongs to"
    )
    
    stage = models.CharField(
        max_length=20,
        choices=STAGE_CHOICES,
        help_text="Stage of diagnosis"
    )
    
    started_at = models.DateTimeField(
        default=timezone.now,
        help_text="When this stage started"
    )
    ended_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this stage ended (for active/resumed stages)"
    )
    
    technician = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='diagnosis_time_logs',
        help_text="Technician who performed this action"
    )
    
    notes = models.TextField(
        blank=True,
        help_text="Optional notes (e.g., pause reason)"
    )
    
    # Calculated duration (cached for performance)
    duration_hours = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Duration in hours (calculated from started_at and ended_at)"
    )
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['started_at']
        verbose_name = 'Diagnosis Time Log'
        verbose_name_plural = 'Diagnosis Time Logs'
        indexes = [
            models.Index(fields=['diagnosis', 'stage']),
            models.Index(fields=['technician', 'started_at']),
        ]
    
    def __str__(self):
        return f"{self.get_stage_display()} - {self.diagnosis.work_order.work_order_number} at {self.started_at}"
    
    def save(self, *args, **kwargs):
        """Calculate duration when ended_at is set"""
        if self.ended_at and self.started_at:
            duration = self.ended_at - self.started_at
            self.duration_hours = Decimal(str(duration.total_seconds() / 3600))
        super().save(*args, **kwargs)
    
    @property
    def duration_formatted(self):
        """Format duration as hours:minutes"""
        if self.duration_hours:
            hours = int(self.duration_hours)
            minutes = int((self.duration_hours - hours) * 60)
            return f"{hours}h {minutes}m"
        return "In progress"


class RepairRecommendation(models.Model):
    """
    Repair Recommendations - What needs to be fixed
    Created during diagnosis phase, reviewed for approval, sent to stores for
    quotation, and only then converted to executable service tasks.
    """
    
    RECOMMENDATION_TYPE_CHOICES = [
        ('repair', 'Repair'),
        ('replace', 'Replace'),
        ('service', 'Service'),
        ('adjust', 'Adjust'),
        ('clean', 'Clean'),
        ('inspect', 'Inspect'),
    ]
    
    PRIORITY_CHOICES = [
        ('critical', 'Critical'),
        ('necessary', 'Necessary'),
        ('recommended', 'Recommended'),
        ('advisory', 'Advisory'),
    ]

    APPROVAL_STATUS_CHOICES = [
        ('pending_approval', 'Pending Approval'),
        ('approved', 'Approved'),
        ('deferred', 'Deferred'),
        ('declined', 'Declined'),
    ]

    DECISION_METHOD_CHOICES = [
        ('phone', 'Phone'),
        ('email', 'Email'),
        ('in_person', 'In Person'),
        ('text', 'Text Message'),
        ('portal', 'Customer Portal'),
        ('supervisor_instruction', 'Supervisor on Customer Instruction'),
    ]

    QUOTATION_STATUS_CHOICES = [
        ('not_requested', 'Not Requested'),
        ('requested', 'Requested From Stores'),
        ('quoted', 'Quotation Ready'),
    ]
    
    # Link to diagnosis
    diagnosis = models.ForeignKey(
        Diagnosis,
        on_delete=models.CASCADE,
        related_name='repair_recommendations',
        help_text="Diagnosis this recommendation belongs to"
    )
    
    # Recommendation details
    recommendation_type = models.CharField(
        max_length=20,
        choices=RECOMMENDATION_TYPE_CHOICES,
        default='repair',
        help_text="Type of work recommended"
    )
    description = models.TextField(
        help_text="Detailed description of what needs to be done"
    )
    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_CHOICES,
        default='necessary',
        help_text="Priority level of this repair"
    )
    
    # Parts
    parts_needed = models.JSONField(
        default=list,
        blank=True,
        help_text="List of parts with quantities: [{'part_id': 1, 'part_name': 'Brake Pad', 'quantity': 2, 'unit_cost': 25.00}]"
    )
    findings = models.ManyToManyField(
        'DiagnosisFinding',
        related_name='recommendations',
        blank=True,
        help_text="Findings that support why this recommendation was made"
    )
    estimated_parts_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Stores quotation amount for parts, when available"
    )
    
    # Labor
    estimated_labor_hours = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Estimated labor hours required"
    )
    estimated_labor_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Stores quotation amount for labor, when available"
    )
    
    # Total
    estimated_total_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Estimated total cost (parts + labor)"
    )
    
    # Recommendation decision and quotation flow
    approval_status = models.CharField(
        max_length=30,
        choices=APPROVAL_STATUS_CHOICES,
        default='pending_approval',
        db_index=True,
        help_text="Customer decision status for this recommendation"
    )
    decision_method = models.CharField(
        max_length=30,
        choices=DECISION_METHOD_CHOICES,
        blank=True,
        help_text="How the approval or deferral decision was recorded"
    )
    decision_notes = models.TextField(
        blank=True,
        help_text="Notes captured when the approval decision was recorded"
    )
    decision_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the recommendation decision was recorded"
    )
    decision_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='diagnosis_recommendation_decisions',
        help_text="Staff user who recorded the decision"
    )
    customer_approved = models.BooleanField(
        default=False,
        help_text="Legacy flag mirrored from approval_status for compatibility"
    )
    quotation_status = models.CharField(
        max_length=20,
        choices=QUOTATION_STATUS_CHOICES,
        default='not_requested',
        db_index=True,
        help_text="Stores quotation progress for this recommendation"
    )
    quotation_requested_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the recommendation was submitted to stores for quotation"
    )
    quotation_requested_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='diagnosis_recommendation_quote_requests',
        help_text="User who submitted the recommendation to stores"
    )
    quoted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When stores marked the quotation as ready"
    )
    quoted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='diagnosis_recommendation_quotes_completed',
        help_text="User who marked the quotation as ready"
    )
    quotation_estimate_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Billing estimate document created by stores for this recommendation"
    )
    quotation_estimate_number = models.CharField(
        max_length=40,
        blank=True,
        help_text="Human-readable estimate number for the quotation document"
    )
    converted_to_task = models.ForeignKey(
        'workorders.ServiceTask',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='diagnosis_recommendation',
        help_text="Link to ServiceTask if recommendation was converted"
    )
    
    # Ordering
    order = models.PositiveIntegerField(
        default=0,
        help_text="Display order"
    )
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['priority', 'order', 'created_at']
        verbose_name = 'Repair Recommendation'
        verbose_name_plural = 'Repair Recommendations'
        indexes = [
            models.Index(fields=['diagnosis', 'priority']),
            models.Index(fields=['customer_approved']),
            models.Index(fields=['approval_status']),
            models.Index(fields=['quotation_status']),
        ]
    
    def __str__(self):
        return f"{self.get_recommendation_type_display()} - {self.description[:50]}"
    
    def save(self, *args, **kwargs):
        """Auto-calculate total cost"""
        self.customer_approved = self.approval_status == 'approved'

        if self.approval_status in {'deferred', 'declined'}:
            self.quotation_status = 'not_requested'
            self.quotation_requested_at = None
            self.quotation_requested_by = None
            self.quoted_at = None
            self.quoted_by = None

        self.estimated_total_cost = self.estimated_parts_cost + self.estimated_labor_cost
        super().save(*args, **kwargs)
    
    def approve(self):
        """Mark recommendation as approved by customer"""
        self.set_decision('approved')

    def set_decision(self, approval_status, acted_by=None, method='', notes=''):
        """Record approval, deferral, or decline for this recommendation."""
        self.approval_status = approval_status
        self.decision_method = method or ''
        self.decision_notes = notes or ''
        self.decision_at = timezone.now()
        self.decision_by = acted_by
        self.save(update_fields=[
            'approval_status',
            'decision_method',
            'decision_notes',
            'decision_at',
            'decision_by',
            'customer_approved',
            'quotation_status',
            'quotation_requested_at',
            'quotation_requested_by',
            'quoted_at',
            'quoted_by',
            'estimated_total_cost',
            'updated_at',
        ])

    def request_quotation(self, requested_by=None):
        """Submit a recommendation to stores for quotation before or after customer approval."""
        if self.approval_status not in {'pending_approval', 'approved'}:
            raise ValueError('Only active recommendations can be submitted for quotation.')

        self.quotation_status = 'requested'
        self.quotation_requested_at = timezone.now()
        self.quotation_requested_by = requested_by
        self.quoted_at = None
        self.quoted_by = None
        self.save(update_fields=[
            'quotation_status',
            'quotation_requested_at',
            'quotation_requested_by',
            'quoted_at',
            'quoted_by',
            'updated_at',
        ])

    def mark_quoted(self, quoted_by=None):
        """Mark the recommendation quotation as ready."""
        if self.approval_status not in {'pending_approval', 'approved'}:
            raise ValueError('Only active recommendations can be marked as quoted.')

        self.quotation_status = 'quoted'
        self.quoted_at = timezone.now()
        self.quoted_by = quoted_by
        self.save(update_fields=[
            'quotation_status',
            'quoted_at',
            'quoted_by',
            'updated_at',
        ])


class DiagnosticCode(models.Model):
    """
    Diagnostic Trouble Codes (DTCs) - OBD codes and other diagnostic codes
    """
    
    CODE_TYPE_CHOICES = [
        ('obd_ii', 'OBD-II'),
        ('manufacturer', 'Manufacturer'),
        ('abs', 'ABS'),
        ('airbag', 'Airbag'),
        ('transmission', 'Transmission'),
        ('body', 'Body'),
        ('chassis', 'Chassis'),
        ('other', 'Other'),
    ]
    
    SEVERITY_CHOICES = [
        ('critical', 'Critical'),
        ('warning', 'Warning'),
        ('info', 'Information'),
    ]
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('pending', 'Pending'),
        ('resolved', 'Resolved'),
    ]
    
    diagnosis = models.ForeignKey(
        Diagnosis,
        on_delete=models.CASCADE,
        related_name='diagnostic_codes',
        help_text="Diagnosis this code belongs to"
    )
    
    code_number = models.CharField(
        max_length=20,
        help_text="Code number, e.g., P0301, B1234"
    )
    code_type = models.CharField(
        max_length=20,
        choices=CODE_TYPE_CHOICES,
        default='obd_ii',
        help_text="Type of diagnostic code"
    )
    description = models.TextField(
        help_text="What the code means"
    )
    severity = models.CharField(
        max_length=20,
        choices=SEVERITY_CHOICES,
        default='warning',
        help_text="Severity level"
    )
    
    # Freeze frame data - snapshot when code occurred
    freeze_frame_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Freeze frame data: RPM, speed, load, etc."
    )
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active',
        db_index=True,
        help_text="Current status of the code"
    )
    
    recorded_at = models.DateTimeField(
        default=timezone.now,
        help_text="When code was pulled/scanned"
    )
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-recorded_at', 'code_number']
        verbose_name = 'Diagnostic Code'
        verbose_name_plural = 'Diagnostic Codes'
        indexes = [
            models.Index(fields=['diagnosis', 'status']),
            models.Index(fields=['code_number', 'code_type']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['diagnosis', 'code_number', 'code_type'],
                name='unique_code_per_diagnosis',
                violation_error_message='This diagnostic code already exists for this diagnosis.'
            ),
        ]
    
    def __str__(self):
        return f"{self.code_number} - {self.diagnosis.work_order.work_order_number}"


class DiagnosticTest(models.Model):
    """
    Diagnostic Tests - Tests performed during diagnosis
    """
    
    CATEGORY_CHOICES = [
        ('electrical', 'Electrical'),
        ('mechanical', 'Mechanical'),
        ('performance', 'Performance'),
        ('fluid', 'Fluid Analysis'),
        ('pressure', 'Pressure Test'),
        ('temperature', 'Temperature Test'),
        ('visual', 'Visual Inspection'),
        ('road_test', 'Road Test'),
        ('other', 'Other'),
    ]
    
    STATUS_CHOICES = [
        ('pass', 'Pass'),
        ('fail', 'Fail'),
        ('inconclusive', 'Inconclusive'),
    ]
    
    diagnosis = models.ForeignKey(
        Diagnosis,
        on_delete=models.CASCADE,
        related_name='diagnostic_tests',
        help_text="Diagnosis this test belongs to"
    )
    
    test_name = models.CharField(
        max_length=200,
        help_text="Name of the test, e.g., 'Compression Test', 'Voltage Check'"
    )
    category = models.CharField(
        max_length=20,
        choices=CATEGORY_CHOICES,
        default='other',
        help_text="Category of test"
    )
    
    test_procedure = models.TextField(
        blank=True,
        help_text="How the test was performed"
    )
    expected_result = models.TextField(
        blank=True,
        help_text="What should happen (expected result)"
    )
    actual_result = models.TextField(
        blank=True,
        help_text="What actually happened (actual result)"
    )
    
    # Measurements - key/value pairs
    measurements = models.JSONField(
        default=dict,
        blank=True,
        help_text="Test measurements: {'voltage': 12.4, 'pressure': 45, etc.}"
    )
    
    tools_used = models.TextField(
        blank=True,
        help_text="What tools were needed for this test"
    )
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='inconclusive',
        help_text="Test result status"
    )
    
    performed_at = models.DateTimeField(
        default=timezone.now,
        help_text="When test was performed"
    )
    performed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='diagnostic_tests_performed',
        limit_choices_to={'role__in': ['technician', 'manager']},
        help_text="Technician who performed the test"
    )
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['performed_at']
        verbose_name = 'Diagnostic Test'
        verbose_name_plural = 'Diagnostic Tests'
        indexes = [
            models.Index(fields=['diagnosis', 'category']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.test_name} - {self.diagnosis.work_order.work_order_number}"


class DiagnosisFinding(models.Model):
    """
    Diagnosis Findings - Problems discovered during diagnosis
    Structured findings with evidence
    """
    
    CATEGORY_CHOICES = [
        ('engine', 'Engine'),
        ('transmission', 'Transmission'),
        ('electrical', 'Electrical'),
        ('brakes', 'Brakes'),
        ('suspension', 'Suspension'),
        ('steering', 'Steering'),
        ('exhaust', 'Exhaust'),
        ('cooling', 'Cooling System'),
        ('fuel', 'Fuel System'),
        ('ac', 'AC/Climate Control'),
        ('body', 'Body/Exterior'),
        ('interior', 'Interior'),
        ('other', 'Other'),
    ]
    
    SEVERITY_CHOICES = [
        ('critical', 'Critical'),
        ('major', 'Major'),
        ('minor', 'Minor'),
        ('advisory', 'Advisory'),
    ]
    
    STATUS_CHOICES = [
        ('identified', 'Identified'),
        ('confirmed', 'Confirmed'),
        ('fixed', 'Fixed'),
    ]
    
    diagnosis = models.ForeignKey(
        Diagnosis,
        on_delete=models.CASCADE,
        related_name='findings',
        help_text="Diagnosis this finding belongs to"
    )
    
    finding_title = models.CharField(
        max_length=200,
        help_text="Short summary of the finding"
    )
    category = models.CharField(
        max_length=20,
        choices=CATEGORY_CHOICES,
        default='other',
        help_text="Category of the finding"
    )
    description = models.TextField(
        help_text="Detailed description of the problem"
    )
    severity = models.CharField(
        max_length=20,
        choices=SEVERITY_CHOICES,
        default='major',
        help_text="Severity level"
    )
    
    # Evidence - Many-to-Many relationships
    diagnostic_codes = models.ManyToManyField(
        DiagnosticCode,
        related_name='findings',
        blank=True,
        help_text="Related diagnostic codes that support this finding"
    )
    diagnostic_tests = models.ManyToManyField(
        DiagnosticTest,
        related_name='findings',
        blank=True,
        help_text="Tests that support this finding"
    )
    
    # Analysis
    root_cause = models.TextField(
        blank=True,
        help_text="Why this happened"
    )
    contributing_factors = models.TextField(
        blank=True,
        help_text="Other factors involved"
    )
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='identified',
        db_index=True,
        help_text="Current status"
    )
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['severity', 'created_at']
        verbose_name = 'Diagnosis Finding'
        verbose_name_plural = 'Diagnosis Findings'
        indexes = [
            models.Index(fields=['diagnosis', 'severity']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.finding_title} - {self.diagnosis.work_order.work_order_number}"


class DiagnosisPhoto(models.Model):
    """
    Diagnosis Photos - Visual evidence for diagnosis
    """
    
    PHOTO_TYPE_CHOICES = [
        ('problem', 'Problem'),
        ('evidence', 'Evidence'),
        ('component', 'Component'),
        ('before', 'Before'),
        ('after', 'After'),
        ('damage', 'Damage'),
        ('test_result', 'Test Result'),
        ('other', 'Other'),
    ]
    
    diagnosis = models.ForeignKey(
        Diagnosis,
        on_delete=models.CASCADE,
        related_name='photos',
        help_text="Diagnosis this photo belongs to"
    )
    
    finding = models.ForeignKey(
        DiagnosisFinding,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='photos',
        help_text="Optional - link to specific finding if tied to one"
    )
    
    photo = models.ImageField(
        upload_to='diagnosis/photos/%Y/%m/',
        help_text="Photo image"
    )
    caption = models.CharField(
        max_length=255,
        blank=True,
        help_text="What the photo shows"
    )
    photo_type = models.CharField(
        max_length=20,
        choices=PHOTO_TYPE_CHOICES,
        default='evidence',
        help_text="Type of photo"
    )
    
    taken_at = models.DateTimeField(
        default=timezone.now,
        help_text="When photo was taken"
    )
    taken_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='diagnosis_photos',
        limit_choices_to={'role__in': ['technician', 'manager']},
        help_text="Who took the photo"
    )
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['taken_at', 'created_at']
        verbose_name = 'Diagnosis Photo'
        verbose_name_plural = 'Diagnosis Photos'
        indexes = [
            models.Index(fields=['diagnosis', 'photo_type']),
            models.Index(fields=['finding']),
        ]
    
    def __str__(self):
        return f"Photo for {self.diagnosis.work_order.work_order_number} - {self.caption}"


# ============================================================================
# Phase 3: Advanced Features - Libraries
# ============================================================================

class TestProcedureLibrary(models.Model):
    """
    Library of reusable diagnostic test procedures
    Phase 3: Test Procedures Library
    """
    
    CATEGORY_CHOICES = [
        ('electrical', 'Electrical'),
        ('mechanical', 'Mechanical'),
        ('performance', 'Performance'),
        ('fluid', 'Fluid Analysis'),
        ('pressure', 'Pressure Test'),
        ('temperature', 'Temperature Test'),
        ('visual', 'Visual Inspection'),
        ('road_test', 'Road Test'),
        ('other', 'Other'),
    ]
    
    name = models.CharField(
        max_length=200,
        unique=True,
        help_text="Test procedure name, e.g., 'Compression Test', 'Voltage Check'"
    )
    category = models.CharField(
        max_length=20,
        choices=CATEGORY_CHOICES,
        default='other',
        help_text="Category of test"
    )
    description = models.TextField(
        help_text="Description of what this test is for"
    )
    
    # Standard procedure details
    test_procedure = models.TextField(
        help_text="Step-by-step procedure for performing this test"
    )
    expected_result = models.TextField(
        blank=True,
        help_text="What should happen (expected result)"
    )
    
    # Tools and requirements
    tools_needed = models.TextField(
        blank=True,
        help_text="What tools are needed for this test"
    )
    measurement_fields = models.JSONField(
        default=list,
        blank=True,
        help_text="Standard measurement fields: [{'name': 'Voltage', 'unit': 'V', 'min': 12, 'max': 14}]"
    )
    
    # Metadata
    is_active = models.BooleanField(default=True)
    use_count = models.PositiveIntegerField(
        default=0,
        help_text="How many times this procedure has been used"
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='test_procedures_created',
        limit_choices_to={'role__in': ['technician', 'manager']}
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['category', 'name']
        verbose_name = 'Test Procedure'
        verbose_name_plural = 'Test Procedures'
        indexes = [
            models.Index(fields=['category', 'is_active']),
            models.Index(fields=['is_active', 'use_count']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"
    
    def increment_use_count(self):
        """Increment use count when procedure is used"""
        self.use_count += 1
        self.save(update_fields=['use_count'])


class DiagnosticCodeLibrary(models.Model):
    """
    Library of diagnostic codes (DTCs) with descriptions and common fixes
    Phase 3: Code Lookup Integration
    """
    
    CODE_TYPE_CHOICES = [
        ('obd_ii', 'OBD-II'),
        ('manufacturer', 'Manufacturer'),
        ('abs', 'ABS'),
        ('airbag', 'Airbag'),
        ('transmission', 'Transmission'),
        ('body', 'Body'),
        ('chassis', 'Chassis'),
        ('other', 'Other'),
    ]
    
    SEVERITY_CHOICES = [
        ('critical', 'Critical'),
        ('warning', 'Warning'),
        ('info', 'Information'),
    ]
    
    code_number = models.CharField(
        max_length=20,
        db_index=True,
        help_text="Code number, e.g., P0301, B1234"
    )
    code_type = models.CharField(
        max_length=20,
        choices=CODE_TYPE_CHOICES,
        default='obd_ii',
        db_index=True,
        help_text="Type of diagnostic code"
    )
    
    # Code information
    title = models.CharField(
        max_length=200,
        help_text="Short title/name of the code"
    )
    description = models.TextField(
        help_text="What the code means"
    )
    severity = models.CharField(
        max_length=20,
        choices=SEVERITY_CHOICES,
        default='warning',
        help_text="Typical severity level"
    )
    
    # Common fixes and information
    common_causes = models.JSONField(
        default=list,
        blank=True,
        help_text="Common causes: ['Faulty spark plug', 'Bad ignition coil']"
    )
    common_fixes = models.JSONField(
        default=list,
        blank=True,
        help_text="Common fixes: ['Replace spark plug', 'Test ignition system']"
    )
    
    # Additional information
    tsb_references = models.JSONField(
        default=list,
        blank=True,
        help_text="Technical Service Bulletin references"
    )
    notes = models.TextField(
        blank=True,
        help_text="Additional notes and information"
    )
    
    # Usage tracking
    use_count = models.PositiveIntegerField(
        default=0,
        help_text="How many times this code has been encountered"
    )
    
    # Metadata
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['code_type', 'code_number']
        verbose_name = 'Diagnostic Code Library Entry'
        verbose_name_plural = 'Diagnostic Code Library'
        unique_together = [['code_number', 'code_type']]
        indexes = [
            models.Index(fields=['code_number', 'code_type']),
            models.Index(fields=['code_type', 'is_active']),
        ]
    
    def __str__(self):
        return f"{self.code_number} - {self.title}"
    
    def increment_use_count(self):
        """Increment use count when code is looked up"""
        self.use_count += 1
        self.save(update_fields=['use_count'])


class DiagnosisHistory(models.Model):
    """
    Historical data and analytics for learning from past diagnoses
    Phase 3: Historical Data/Learning
    """
    
    # Aggregated data
    vehicle_make = models.CharField(max_length=50, db_index=True)
    vehicle_model = models.CharField(max_length=50, db_index=True)
    vehicle_year = models.IntegerField(null=True, blank=True, db_index=True)
    
    # Common issues pattern
    common_complaints = models.JSONField(
        default=list,
        blank=True,
        help_text="Common customer complaints for this vehicle"
    )
    common_root_causes = models.JSONField(
        default=list,
        blank=True,
        help_text="Common root causes found"
    )
    common_codes = models.JSONField(
        default=list,
        blank=True,
        help_text="Most frequently encountered codes"
    )
    
    # Cost and time averages
    avg_diagnostic_time = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Average diagnostic time in hours"
    )
    avg_repair_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Average repair cost"
    )
    
    # Statistics
    diagnosis_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of diagnoses for this vehicle type"
    )
    
    # Metadata
    last_updated = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-diagnosis_count']
        verbose_name = 'Diagnosis History'
        verbose_name_plural = 'Diagnosis History'
        unique_together = [['vehicle_make', 'vehicle_model', 'vehicle_year']]
        indexes = [
            models.Index(fields=['vehicle_make', 'vehicle_model', 'vehicle_year']),
            models.Index(fields=['-diagnosis_count']),
        ]
    
    def __str__(self):
        year_str = f" {self.vehicle_year}" if self.vehicle_year else ""
        return f"{self.vehicle_make} {self.vehicle_model}{year_str} ({self.diagnosis_count} diagnoses)"
    
    @classmethod
    def update_from_diagnosis(cls, diagnosis):
        """Update or create history entry from a completed diagnosis"""
        work_order = diagnosis.work_order
        vehicle = work_order.vehicle
        
        # Get or create history entry
        history, created = cls.objects.get_or_create(
            vehicle_make=vehicle.make,
            vehicle_model=vehicle.model,
            vehicle_year=vehicle.year,
            defaults={
                'diagnosis_count': 0,
                'common_complaints': [],
                'common_root_causes': [],
                'common_codes': [],
            }
        )
        
        # Update statistics
        history.diagnosis_count += 1
        
        # Update common complaints
        if diagnosis.customer_complaint:
            complaints = history.common_complaints or []
            complaints.append(diagnosis.customer_complaint[:100])  # First 100 chars
            history.common_complaints = complaints[-10:]  # Keep last 10
        
        # Update common root causes
        if diagnosis.root_cause:
            causes = history.common_root_causes or []
            causes.append(diagnosis.root_cause[:100])
            history.common_root_causes = causes[-10:]
        
        # Update common codes
        codes = diagnosis.diagnostic_codes.all()
        code_list = history.common_codes or []
        for code in codes:
            code_list.append(code.code_number)
        # Count frequencies and keep top 5
        code_counts = Counter(code_list)
        history.common_codes = [code for code, count in code_counts.most_common(5)]
        
        # Update averages
        if diagnosis.diagnostic_time_hours:
            if history.avg_diagnostic_time:
                # Moving average (simple)
                history.avg_diagnostic_time = (
                    history.avg_diagnostic_time * (history.diagnosis_count - 1) +
                    diagnosis.diagnostic_time_hours
                ) / history.diagnosis_count
            else:
                history.avg_diagnostic_time = diagnosis.diagnostic_time_hours
        
        total_cost = sum(
            rec.estimated_total_cost for rec in diagnosis.repair_recommendations.all()
        )
        if total_cost > 0:
            if history.avg_repair_cost:
                history.avg_repair_cost = (
                    history.avg_repair_cost * (history.diagnosis_count - 1) + total_cost
                ) / history.diagnosis_count
            else:
                history.avg_repair_cost = total_cost
        
        history.save()
        return history
