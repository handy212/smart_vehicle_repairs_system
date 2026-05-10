"""
Roadside Assistance models
Handles breakdown requests, dispatch, and on-site services
"""
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from decimal import Decimal
from apps.accounts.models import User
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.branches.models import Branch


class RoadsideRequest(models.Model):
    """
    Roadside assistance request - breakdown service request
    """
    
    STATUS_CHOICES = [
        ('requested', 'Requested'),
        ('dispatched', 'Dispatched'),
        ('en_route', 'En Route'),
        ('on_site', 'On Site'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('failed', 'Failed'),
    ]
    
    SERVICE_TYPE_CHOICES = [
        ('towing', 'Towing Service'),
        ('battery_boost', 'Battery Boost'),
        ('flat_tyre', 'Flat Tyre Service'),
        ('key_lockout', 'Key Lock Out'),
        ('emergency_fuel', 'Emergency Fuel Delivery'),
        ('extrication', 'Extrication Service'),
        ('mechanical_first_aid', 'Mechanical & Electrical First Aid'),
        ('other', 'Other'),
    ]
    
    # Auto-generated request number
    request_number = models.CharField(
        _('request number'),
        max_length=50,
        unique=True,
        editable=False,
        help_text="Auto-generated request ID"
    )
    
    # References
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name='roadside_requests',
        help_text="Customer requesting service"
    )
    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.PROTECT,
        related_name='roadside_requests',
        help_text="Vehicle requiring service"
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name='roadside_requests',
        null=True,
        blank=True,
        help_text="Branch handling this request"
    )
    
    # Service details
    service_type = models.CharField(
        _('service type'),
        max_length=50,
        choices=SERVICE_TYPE_CHOICES,
        help_text="Type of roadside service requested"
    )
    status = models.CharField(
        _('status'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='requested',
        db_index=True,
        help_text="Current request status"
    )
    
    # Location details
    breakdown_location = models.TextField(
        _('breakdown location'),
        help_text="Location where vehicle broke down"
    )
    latitude = models.DecimalField(
        _('latitude'),
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="GPS latitude"
    )
    longitude = models.DecimalField(
        _('longitude'),
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="GPS longitude"
    )
    
    # Service details
    description = models.TextField(
        _('description'),
        blank=True,
        help_text="Description of the breakdown/problem"
    )
    customer_phone = models.CharField(
        _('customer phone'),
        max_length=20,
        help_text="Contact phone number at breakdown location"
    )
    
    # Towing specific
    tow_distance_km = models.DecimalField(
        _('tow distance km'),
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Distance to tow (for towing service)"
    )
    destination = models.TextField(
        _('destination'),
        blank=True,
        help_text="Destination for towing (if applicable)"
    )
    
    # Assignment
    assigned_technician = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_roadside_requests',
        help_text="Technician/service provider assigned"
    )
    dispatched_at = models.DateTimeField(
        _('dispatched at'),
        null=True,
        blank=True,
        help_text="When service was dispatched"
    )
    arrived_at = models.DateTimeField(
        _('arrived at'),
        null=True,
        blank=True,
        help_text="When service provider arrived on site"
    )
    completed_at = models.DateTimeField(
        _('completed at'),
        null=True,
        blank=True,
        help_text="When service was completed"
    )
    
    # Subscription integration
    subscription_used = models.ForeignKey(
        'subscriptions.Subscription',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='roadside_services',
        help_text="Subscription used for this service"
    )
    subscription_allowance_deducted = models.BooleanField(
        _('subscription allowance deducted'),
        default=False,
        help_text="Whether subscription allowance was deducted"
    )
    subscription_usage_record = models.ForeignKey(
        'subscriptions.SubscriptionUsage',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='roadside_requests',
        help_text="Subscription usage record created"
    )
    
    # Billing integration
    invoice = models.ForeignKey(
        'billing.Invoice',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='roadside_requests',
        help_text="Invoice generated for this service"
    )
    
    # Billing
    is_covered_by_subscription = models.BooleanField(
        _('covered by subscription'),
        default=False,
        help_text="Whether service is covered by subscription"
    )
    charge_amount = models.DecimalField(
        _('charge amount'),
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
        help_text="Amount charged if not covered by subscription"
    )
    
    # Metadata
    notes = models.TextField(
        _('notes'),
        blank=True,
        help_text="Internal notes"
    )
    customer_feedback = models.TextField(
        _('customer feedback'),
        blank=True,
        help_text="Customer feedback after service"
    )
    rating = models.PositiveSmallIntegerField(
        _('rating'),
        null=True,
        blank=True,
        help_text="Customer rating (1-5)"
    )
    
    # Timestamps
    requested_at = models.DateTimeField(
        _('requested at'),
        auto_now_add=True,
        help_text="When request was created"
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='roadside_requests_created',
        help_text="User who created the request"
    )
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)
    
    class Meta:
        ordering = ['-requested_at']
        verbose_name = _('roadside request')
        verbose_name_plural = _('roadside requests')
        indexes = [
            models.Index(fields=['status', 'requested_at']),
            models.Index(fields=['customer', 'status']),
            models.Index(fields=['vehicle', 'status']),
            models.Index(fields=['service_type', 'status']),
        ]
    
    def __str__(self):
        return f"{self.request_number} - {self.customer} - {self.get_service_type_display()}"
    
    def save(self, *args, **kwargs):
        from django.db import transaction
        
        # Auto-generate request number
        if not self.request_number:
            with transaction.atomic():
                last_request = RoadsideRequest.objects.select_for_update().order_by('-id').first()
                if last_request and last_request.request_number:
                    try:
                        number_part = last_request.request_number.replace('RSA-', '')
                        next_num = int(number_part) + 1
                        self.request_number = f"RSA-{next_num:06d}"
                    except (ValueError, AttributeError):
                        next_num = RoadsideRequest.objects.count() + 1
                        self.request_number = f"RSA-{next_num:06d}"
                else:
                    self.request_number = "RSA-000001"
        
        super().save(*args, **kwargs)
    
    def is_active(self):
        """Check if request is still active (not completed/cancelled/failed)"""
        return self.status not in ['completed', 'cancelled', 'failed']
    
    def can_be_cancelled(self):
        """Check if request can be cancelled"""
        return self.status in ['requested', 'dispatched', 'en_route']
    
    def mark_dispatched(self, technician=None):
        """Mark request as dispatched"""
        if self.status != 'requested':
            raise ValueError(f"Cannot dispatch request in status: {self.status}")
        self.status = 'dispatched'
        self.dispatched_at = timezone.now()
        if technician:
            self.assigned_technician = technician
        self.save()
    
    def mark_en_route(self):
        """Mark that service provider is en route"""
        if self.status not in ['dispatched', 'requested']:
            raise ValueError(f"Cannot mark en route in status: {self.status}")
        self.status = 'en_route'
        self.save()
    
    def mark_arrived(self):
        """Mark that service provider has arrived on site"""
        if self.status not in ['dispatched', 'en_route']:
            raise ValueError(f"Cannot mark arrived in status: {self.status}")
        self.status = 'on_site'
        self.arrived_at = timezone.now()
        self.save()
    
    def mark_in_progress(self):
        """Mark that service is in progress"""
        if self.status not in ['on_site', 'en_route']:
            raise ValueError(f"Cannot mark in progress in status: {self.status}")
        self.status = 'in_progress'
        self.save()
    
    def mark_completed(self):
        """Mark request as completed"""
        if self.status in ['completed', 'cancelled', 'failed']:
            raise ValueError(f"Cannot complete request in status: {self.status}")
        self.status = 'completed'
        if not self.completed_at:
            self.completed_at = timezone.now()
        self.save()
    
    def mark_cancelled(self):
        """Mark request as cancelled"""
        if not self.can_be_cancelled():
            raise ValueError(f"Cannot cancel request in status: {self.status}")
        self.status = 'cancelled'
        self.save()
    
    def mark_failed(self, reason=None):
        """Mark request as failed"""
        self.status = 'failed'
        if reason:
            self.notes = f"{self.notes}\nFailed: {reason}" if self.notes else f"Failed: {reason}"
        self.save()

    def get_all_technicians(self):
        """Return all dispatched technicians (primary + additional)"""
        dispatches = self.dispatches.select_related('technician').order_by('dispatched_at')
        return [d.technician for d in dispatches]


class RoadsideDispatch(models.Model):
    """
    Tracks each technician dispatched to a roadside request.
    Allows multiple technicians per request.
    """
    request = models.ForeignKey(
        RoadsideRequest,
        on_delete=models.CASCADE,
        related_name='dispatches',
        help_text="Roadside request this dispatch belongs to"
    )
    technician = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='roadside_dispatches',
        help_text="Dispatched technician"
    )
    dispatched_at = models.DateTimeField(
        _('dispatched at'),
        default=timezone.now,
        help_text="When this technician was dispatched"
    )
    dispatched_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='dispatches_created',
        help_text="Staff member who dispatched this technician"
    )
    notes = models.TextField(
        _('notes'),
        blank=True,
        help_text="Optional notes for this dispatch assignment"
    )

    class Meta:
        ordering = ['dispatched_at']
        verbose_name = _('roadside dispatch')
        verbose_name_plural = _('roadside dispatches')
        unique_together = [('request', 'technician')]

    def __str__(self):
        return f"{self.request.request_number} → {self.technician}"
