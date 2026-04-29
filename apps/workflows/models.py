from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils.text import slugify


class WorkflowDefinition(models.Model):
    """Versioned workflow definition for a business object type."""

    MODEL_CHOICES = [
        ('workorders.WorkOrder', 'Work Order'),
        ('diagnosis.RepairRecommendation', 'Diagnosis Recommendation'),
        ('workorders.WorkOrderPart', 'Work Order Part'),
        ('diagnosis.Diagnosis', 'Diagnosis'),
        ('inspections.VehicleInspection', 'Vehicle Inspection'),
        ('billing.Invoice', 'Invoice'),
        ('inventory.PurchaseOrder', 'Purchase Order'),
        ('roadside.RoadsideRequest', 'Roadside Request'),
    ]

    name = models.CharField(max_length=120)
    code = models.SlugField(max_length=80, unique=True)
    description = models.TextField(blank=True)
    model_path = models.CharField(max_length=120, choices=MODEL_CHOICES)
    version = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workflow_definitions_created',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workflow_definitions_updated',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['model_path', '-is_default', 'name', '-version']
        indexes = [
            models.Index(fields=['model_path', 'is_active']),
            models.Index(fields=['code']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['model_path'],
                condition=models.Q(is_default=True, is_active=True),
                name='one_active_default_workflow_per_model',
            )
        ]

    def __str__(self):
        return f'{self.name} v{self.version}'

    def save(self, *args, **kwargs):
        if not self.code:
            base = slugify(self.name) or 'workflow'
            code = base
            suffix = 2
            while WorkflowDefinition.objects.filter(code=code).exclude(pk=self.pk).exists():
                code = f'{base}-{suffix}'
                suffix += 1
            self.code = code
        super().save(*args, **kwargs)


class WorkflowState(models.Model):
    """A state/status in a workflow."""

    workflow = models.ForeignKey(
        WorkflowDefinition,
        on_delete=models.CASCADE,
        related_name='states',
    )
    key = models.SlugField(max_length=80)
    label = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=30, blank=True)
    icon = models.CharField(max_length=60, blank=True)
    order = models.PositiveIntegerField(default=0)
    is_initial = models.BooleanField(default=False)
    is_terminal = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['workflow', 'order', 'label']
        unique_together = [('workflow', 'key')]
        indexes = [
            models.Index(fields=['workflow', 'key']),
            models.Index(fields=['workflow', 'is_active']),
        ]

    def __str__(self):
        return f'{self.workflow.code}: {self.label}'


class WorkflowTransition(models.Model):
    """Allowed transition between two states."""

    workflow = models.ForeignKey(
        WorkflowDefinition,
        on_delete=models.CASCADE,
        related_name='transitions',
    )
    from_state = models.ForeignKey(
        WorkflowState,
        on_delete=models.CASCADE,
        related_name='outgoing_transitions',
    )
    to_state = models.ForeignKey(
        WorkflowState,
        on_delete=models.CASCADE,
        related_name='incoming_transitions',
    )
    label = models.CharField(max_length=120)
    button_label = models.CharField(max_length=120, blank=True)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)
    allowed_roles = models.JSONField(default=list, blank=True)
    required_permission = models.CharField(max_length=120, blank=True)
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['workflow', 'from_state__order', 'order', 'label']
        unique_together = [('workflow', 'from_state', 'to_state')]
        indexes = [
            models.Index(fields=['workflow', 'is_active']),
            models.Index(fields=['from_state', 'is_active']),
        ]

    def __str__(self):
        return f'{self.from_state.key} -> {self.to_state.key}'

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.from_state_id and self.to_state_id:
            if self.from_state.workflow_id != self.workflow_id:
                raise ValidationError('From state must belong to this workflow.')
            if self.to_state.workflow_id != self.workflow_id:
                raise ValidationError('To state must belong to this workflow.')


class WorkflowGuard(models.Model):
    """Validation rule that must pass before a transition can run."""

    GUARD_TYPE_CHOICES = [
        ('required_field', 'Required Field'),
        ('required_relation', 'Required Relation'),
        ('min_count', 'Minimum Related Count'),
        ('custom', 'Custom Validator'),
    ]

    transition = models.ForeignKey(
        WorkflowTransition,
        on_delete=models.CASCADE,
        related_name='guards',
    )
    guard_type = models.CharField(max_length=30, choices=GUARD_TYPE_CHOICES)
    field_path = models.CharField(max_length=160, blank=True)
    expected_value = models.JSONField(null=True, blank=True)
    message = models.CharField(max_length=255)
    config = models.JSONField(default=dict, blank=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['transition', 'order', 'id']

    def __str__(self):
        return f'{self.transition}: {self.get_guard_type_display()}'


class WorkflowAction(models.Model):
    """Automation triggered around a workflow transition."""

    ACTION_TYPE_CHOICES = [
        ('create_note', 'Create Note'),
        ('create_task', 'Create Task'),
        ('send_notification', 'Send Notification'),
        ('approve_recommendations', 'Approve Recommendations'),
        ('convert_recommendations', 'Convert Recommendations'),
        ('reserve_parts', 'Reserve Parts'),
        ('custom', 'Custom Action'),
    ]

    TIMING_CHOICES = [
        ('before', 'Before Transition'),
        ('after', 'After Transition'),
    ]

    transition = models.ForeignKey(
        WorkflowTransition,
        on_delete=models.CASCADE,
        related_name='actions',
    )
    action_type = models.CharField(max_length=40, choices=ACTION_TYPE_CHOICES)
    timing = models.CharField(max_length=10, choices=TIMING_CHOICES, default='after')
    label = models.CharField(max_length=120)
    config = models.JSONField(default=dict, blank=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['transition', 'timing', 'order', 'id']

    def __str__(self):
        return f'{self.transition}: {self.label}'


class WorkflowInstance(models.Model):
    """Runtime workflow state for one business object."""

    workflow = models.ForeignKey(
        WorkflowDefinition,
        on_delete=models.PROTECT,
        related_name='instances',
    )
    current_state = models.ForeignKey(
        WorkflowState,
        on_delete=models.PROTECT,
        related_name='instances',
    )
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey('content_type', 'object_id')
    status_field = models.CharField(max_length=80, default='status')
    is_active = models.BooleanField(default=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['content_type', 'object_id', 'is_active']),
            models.Index(fields=['workflow', 'current_state']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['content_type', 'object_id', 'workflow'],
                condition=models.Q(is_active=True),
                name='one_active_workflow_instance_per_object',
            )
        ]

    def __str__(self):
        return f'{self.workflow.code}: {self.content_type_id}:{self.object_id} @ {self.current_state.key}'


class WorkflowTransitionLog(models.Model):
    """Audit event for a workflow transition attempt."""

    RESULT_CHOICES = [
        ('success', 'Success'),
        ('blocked', 'Blocked'),
        ('failed', 'Failed'),
    ]

    instance = models.ForeignKey(
        WorkflowInstance,
        on_delete=models.CASCADE,
        related_name='transition_logs',
    )
    transition = models.ForeignKey(
        WorkflowTransition,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='logs',
    )
    from_state = models.CharField(max_length=80)
    to_state = models.CharField(max_length=80)
    result = models.CharField(max_length=20, choices=RESULT_CHOICES)
    message = models.TextField(blank=True)
    guard_results = models.JSONField(default=list, blank=True)
    action_results = models.JSONField(default=list, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workflow_transition_logs',
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['instance', 'created_at']),
            models.Index(fields=['result', 'created_at']),
        ]

    def __str__(self):
        return f'{self.from_state} -> {self.to_state}: {self.result}'
