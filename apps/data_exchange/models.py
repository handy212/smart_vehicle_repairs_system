"""
Centralized import/export batch tracking for Data & Audit.
"""
from django.conf import settings
from django.db import models
from django.utils import timezone


class ImportBatch(models.Model):
    """One uploaded import job with preview, commit, and rollback lifecycle."""

    STATUS_UPLOADED = 'uploaded'
    STATUS_PREVIEWING = 'previewing'
    STATUS_PREVIEWED = 'previewed'
    STATUS_COMMITTING = 'committing'
    STATUS_COMPLETED = 'completed'
    STATUS_FAILED = 'failed'
    STATUS_ROLLED_BACK = 'rolled_back'

    STATUS_CHOICES = [
        (STATUS_UPLOADED, 'Uploaded'),
        (STATUS_PREVIEWING, 'Previewing'),
        (STATUS_PREVIEWED, 'Previewed'),
        (STATUS_COMMITTING, 'Committing'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_ROLLED_BACK, 'Rolled Back'),
    ]

    MODE_PREVIEW = 'preview'
    MODE_COMMIT = 'commit'

    uuid = models.UUIDField(unique=True, editable=False)
    module_key = models.CharField(max_length=64, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_UPLOADED, db_index=True)
    source_file = models.FileField(upload_to='imports/%Y/%m/')
    original_filename = models.CharField(max_length=255)
    options = models.JSONField(default=dict, blank=True)
    preview_report = models.JSONField(default=dict, blank=True)
    summary = models.JSONField(default=dict, blank=True)
    created_object_refs = models.JSONField(
        default=dict,
        blank=True,
        help_text='Map of entity_type -> list of created primary keys for rollback',
    )
    error_message = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='import_batches',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    previewed_at = models.DateTimeField(null=True, blank=True)
    committed_at = models.DateTimeField(null=True, blank=True)
    rolled_back_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['module_key', 'status']),
            models.Index(fields=['-created_at']),
        ]

    def __str__(self):
        return f'{self.module_key} import #{self.pk} ({self.status})'

    def mark_previewed(self, report: dict):
        self.preview_report = report
        self.summary = report.get('summary', {})
        self.status = self.STATUS_PREVIEWED
        self.previewed_at = timezone.now()
        self.save(update_fields=['preview_report', 'summary', 'status', 'previewed_at'])

    def mark_completed(self, summary: dict, created_refs: dict):
        self.summary = summary
        self.created_object_refs = created_refs
        self.status = self.STATUS_COMPLETED
        self.committed_at = timezone.now()
        self.error_message = ''
        self.save(update_fields=[
            'summary', 'created_object_refs', 'status', 'committed_at', 'error_message',
        ])

    def mark_failed(self, message: str, summary: dict | None = None):
        self.status = self.STATUS_FAILED
        self.error_message = message[:4000]
        if summary is not None:
            self.summary = summary
        self.save(update_fields=['status', 'error_message', 'summary'])

    def mark_rolled_back(self, summary: dict | None = None):
        self.status = self.STATUS_ROLLED_BACK
        self.rolled_back_at = timezone.now()
        if summary is not None:
            self.summary = summary
        self.save(update_fields=['status', 'rolled_back_at', 'summary'])


class ImportRowResult(models.Model):
    """Per-row audit trail for an import batch."""

    ACTION_CREATE = 'create'
    ACTION_UPDATE = 'update'
    ACTION_MATCH = 'match'
    ACTION_SKIP = 'skip'
    ACTION_FAIL = 'fail'

    ACTION_CHOICES = [
        (ACTION_CREATE, 'Create'),
        (ACTION_UPDATE, 'Update'),
        (ACTION_MATCH, 'Match Existing'),
        (ACTION_SKIP, 'Skip'),
        (ACTION_FAIL, 'Fail'),
    ]

    ENTITY_CUSTOMER = 'customer'
    ENTITY_VEHICLE = 'vehicle'
    ENTITY_PART = 'part'
    ENTITY_OTHER = 'other'

    ENTITY_CHOICES = [
        (ENTITY_CUSTOMER, 'Customer'),
        (ENTITY_VEHICLE, 'Vehicle'),
        (ENTITY_PART, 'Part'),
        (ENTITY_OTHER, 'Other'),
    ]

    batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name='row_results')
    row_number = models.PositiveIntegerField()
    entity_type = models.CharField(max_length=32, choices=ENTITY_CHOICES, default=ENTITY_OTHER)
    action = models.CharField(max_length=16, choices=ACTION_CHOICES)
    identifier = models.CharField(max_length=255, blank=True)
    message = models.TextField(blank=True)
    object_id = models.PositiveIntegerField(null=True, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['row_number', 'id']
        indexes = [
            models.Index(fields=['batch', 'action']),
            models.Index(fields=['batch', 'entity_type']),
        ]

    def __str__(self):
        return f'Row {self.row_number}: {self.action} {self.entity_type}'
