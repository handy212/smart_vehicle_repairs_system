"""
Configurable work order job types and workflow profiles.

Job types describe *what* work is being done (Brake Service, Warranty Repair, etc.).
Workflow profiles describe *how* the work order flows through the shop.
"""

from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils.text import slugify


class WorkflowProfile(models.Model):
    """Template controlling which work-order stages apply and default skip rules."""

    code = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    is_predefined = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)

    skip_inspection = models.BooleanField(default=False)
    skip_diagnosis = models.BooleanField(default=False)
    skip_customer_approval = models.BooleanField(default=False)
    skip_quality_check = models.BooleanField(default=False)
    auto_approve_on_create = models.BooleanField(default=False)
    apply_service_bundle_on_create = models.BooleanField(default=False)
    allows_fast_track_to_approved = models.BooleanField(
        default=False,
        help_text='Allow draft → approved when bundle/tasks are ready (routine fast-track).',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name = 'Workflow Profile'
        verbose_name_plural = 'Workflow Profiles'

    def __str__(self):
        return self.name


class JobType(models.Model):
    """Admin-manageable catalog of work order job types."""

    CATEGORY_CHOICES = [
        ('repair', 'Repair'),
        ('maintenance', 'Maintenance'),
        ('diagnostic', 'Diagnostic'),
        ('inspection', 'Inspection'),
        ('body', 'Body & Paint'),
        ('commercial', 'Warranty / Insurance'),
        ('installation', 'Installation'),
    ]

    code = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='repair')
    description = models.TextField(blank=True)
    workflow_profile = models.ForeignKey(
        WorkflowProfile,
        on_delete=models.PROTECT,
        related_name='job_types',
    )
    is_active = models.BooleanField(default=True)
    is_predefined = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)

    requires_inspection = models.BooleanField(default=True)
    requires_diagnosis = models.BooleanField(default=True)
    requires_approval = models.BooleanField(default=True)
    quality_check_required = models.BooleanField(default=True)
    allows_bundle = models.BooleanField(
        default=False,
        help_text='Whether a service bundle may be selected at check-in.',
    )

    default_service_type = models.ForeignKey(
        'vehicles.ServiceType',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='default_job_types',
    )
    default_service_bundle = models.ForeignKey(
        'inventory.ServiceBundle',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='default_job_types',
    )

    sets_warranty_flag = models.BooleanField(default=False)
    sets_insurance_flag = models.BooleanField(default=False)

    default_revenue_product = models.ForeignKey(
        'accounting.RevenueProduct',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='default_job_types',
        help_text='Default income category when invoicing this job type with no tasks/parts.',
    )
    default_service_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0'))],
        help_text='Optional flat fee override for this job type (otherwise uses income category default price).',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name = 'Job Type'
        verbose_name_plural = 'Job Types'
        indexes = [
            models.Index(fields=['is_active', 'category']),
            models.Index(fields=['code']),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.code and self.name:
            base = slugify(self.name) or 'job-type'
            code = base
            suffix = 2
            while JobType.objects.filter(code=code).exclude(pk=self.pk).exists():
                code = f'{base}-{suffix}'
                suffix += 1
            self.code = code
        super().save(*args, **kwargs)

    def apply_defaults_to_work_order(self, work_order, *, overwrite=False):
        """Apply job-type default flags onto a work order (typically at create)."""
        fields_to_update = []

        def _set(field_name, value):
            if overwrite or getattr(work_order, field_name) in (None, ''):
                setattr(work_order, field_name, value)
                fields_to_update.append(field_name)

        _set('requires_approval', self.requires_approval)
        _set('quality_check_required', self.quality_check_required)

        if self.sets_warranty_flag:
            work_order.is_warranty = True
            fields_to_update.append('is_warranty')
        if self.sets_insurance_flag:
            work_order.is_insurance_claim = True
            fields_to_update.append('is_insurance_claim')

        if self.default_service_type_id and (overwrite or not work_order.service_type_id):
            work_order.service_type = self.default_service_type
            fields_to_update.append('service_type')
        if self.default_service_bundle_id and (overwrite or not work_order.service_bundle_id):
            work_order.service_bundle = self.default_service_bundle
            fields_to_update.append('service_bundle')

        return fields_to_update
