"""Terms & Conditions acceptance audit records."""
from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class TermsAcceptance(models.Model):
    """Immutable record that a customer (or staff on their behalf) accepted shop T&Cs."""

    DOCUMENT_ESTIMATE = 'estimate'
    DOCUMENT_WORK_ORDER = 'work_order'
    DOCUMENT_TYPE_CHOICES = (
        (DOCUMENT_ESTIMATE, _('Estimate')),
        (DOCUMENT_WORK_ORDER, _('Work order')),
    )

    CHANNEL_STAFF = 'staff'
    CHANNEL_PORTAL = 'portal'
    CHANNEL_PUBLIC = 'public_token'
    CHANNEL_PHONE = 'phone'
    CHANNEL_EMAIL = 'email'
    CHANNEL_IN_PERSON = 'in_person'
    CHANNEL_TEXT = 'text'
    CHANNEL_DIGITAL = 'digital'
    CHANNEL_CHOICES = (
        (CHANNEL_STAFF, _('Staff')),
        (CHANNEL_PORTAL, _('Customer portal')),
        (CHANNEL_PUBLIC, _('Public token link')),
        (CHANNEL_PHONE, _('Phone')),
        (CHANNEL_EMAIL, _('Email')),
        (CHANNEL_IN_PERSON, _('In person')),
        (CHANNEL_TEXT, _('Text/SMS')),
        (CHANNEL_DIGITAL, _('Digital')),
    )

    customer = models.ForeignKey(
        'customers.Customer',
        on_delete=models.CASCADE,
        related_name='terms_acceptances',
    )
    document_type = models.CharField(max_length=32, choices=DOCUMENT_TYPE_CHOICES)
    terms_key = models.CharField(
        max_length=100,
        help_text='SystemSettings key for the terms snapshot (e.g. estimate_terms_and_conditions)',
    )
    terms_text = models.TextField(
        help_text='Exact terms text shown/accepted at the time of approval',
    )
    accepted = models.BooleanField(default=True)
    accepted_at = models.DateTimeField(auto_now_add=True)
    acceptance_channel = models.CharField(max_length=32, choices=CHANNEL_CHOICES, default=CHANNEL_DIGITAL)
    accepted_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='terms_acceptances',
    )
    work_order = models.ForeignKey(
        'workorders.WorkOrder',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='terms_acceptances',
    )
    estimate = models.ForeignKey(
        'billing.Estimate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='terms_acceptances',
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    signature_data = models.TextField(
        blank=True,
        help_text='Optional base64/data-URL signature captured at acceptance',
    )
    notes = models.TextField(blank=True)

    class Meta:
        verbose_name = _('terms acceptance')
        verbose_name_plural = _('terms acceptances')
        ordering = ['-accepted_at']
        indexes = [
            models.Index(fields=['document_type', 'work_order']),
            models.Index(fields=['document_type', 'estimate']),
            models.Index(fields=['customer', 'accepted_at']),
        ]

    def __str__(self):
        return f'{self.document_type} acceptance #{self.pk} ({self.accepted_at})'
