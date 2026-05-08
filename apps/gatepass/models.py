"""
Gate Pass models for tracking vehicle pickup
"""
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError
from apps.accounts.models import User
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder
from apps.branches.models import Branch


class GatePass(models.Model):
    """
    Gate Pass - Authorization document for vehicle pickup
    Created when a customer or representative picks up a vehicle after work order completion
    """
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('issued', 'Issued'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    ID_TYPE_CHOICES = [
        ('driver_license', 'Driver License'),
        ('national_id', 'National ID'),
        ('passport', 'Passport'),
        ('other', 'Other'),
    ]
    
    # Auto-generated gate pass number (branch-based)
    gate_pass_number = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
        help_text="Auto-generated gate pass number"
    )
    
    # Reference to closed work order
    work_order = models.ForeignKey(
        WorkOrder,
        on_delete=models.PROTECT,
        related_name='gate_passes',
        help_text="Work order this gate pass is for"
    )
    
    # Branch assignment
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name='gate_passes',
        help_text="Branch where gate pass was issued"
    )
    
    # Vehicle and Customer (denormalized for quick access)
    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.PROTECT,
        related_name='gate_passes',
        help_text="Vehicle being picked up"
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name='gate_passes',
        help_text="Customer who owns the vehicle"
    )
    
    # Pickup Information
    picked_up_by_customer = models.BooleanField(
        default=True,
        help_text="True if customer is picking up, False if someone else"
    )
    pickup_person_name = models.CharField(
        max_length=200,
        blank=True,
        help_text="Name of person picking up (required if not customer)"
    )
    pickup_person_relationship = models.CharField(
        max_length=100,
        blank=True,
        help_text="Relationship to customer (e.g., 'Brother', 'Employee', 'Friend')"
    )
    pickup_person_id_type = models.CharField(
        max_length=50,
        choices=ID_TYPE_CHOICES,
        blank=True,
        help_text="Type of ID provided"
    )
    pickup_person_id_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="ID number of pickup person"
    )
    pickup_person_phone = models.CharField(
        max_length=20,
        blank=True,
        help_text="Phone number of pickup person"
    )
    pickup_notes = models.TextField(
        blank=True,
        help_text="Additional notes about pickup"
    )
    
    # Status and Dates
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        db_index=True,
        help_text="Current status of gate pass"
    )
    issued_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When gate pass was issued"
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When vehicle was actually picked up"
    )
    
    # Authorization
    issued_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='gate_passes_issued',
        help_text="User who created/issued the gate pass"
    )
    authorized_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gate_passes_authorized',
        help_text="User who authorized the gate pass (if different from issuer)"
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Gate Pass'
        verbose_name_plural = 'Gate Passes'
        indexes = [
            models.Index(fields=['work_order', 'status']),
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['branch', 'status']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['work_order'],
                condition=~models.Q(status='cancelled'),
                name='unique_active_gatepass_per_work_order',
            ),
        ]
    
    def __str__(self):
        return f"{self.gate_pass_number} - {self.work_order.work_order_number}"
    
    def save(self, *args, **kwargs):
        # Auto-generate gate pass number using branch sequence
        if not self.gate_pass_number:
            if self.branch:
                self.gate_pass_number = self.branch.get_next_gatepass_number()
            else:
                # Fallback: use timestamp-based number if branch is not set
                from datetime import datetime
                timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
                self.gate_pass_number = f"GP-{timestamp}"
        
        # Validate that work order is closed
        if self.work_order and self.work_order.status != 'closed':
            raise ValidationError("Gate pass can only be created for closed work orders.")

        if self.work_order_id and self.status != 'cancelled':
            existing = GatePass.objects.filter(work_order_id=self.work_order_id).exclude(status='cancelled')
            if self.pk:
                existing = existing.exclude(pk=self.pk)
            if existing.exists():
                raise ValidationError("A gate pass already exists for this work order.")
        
        # Validate pickup person name if not customer
        if not self.picked_up_by_customer and not self.pickup_person_name:
            raise ValidationError("Pickup person name is required when customer is not picking up.")
        
        super().save(*args, **kwargs)
    

    def issue(self, user=None):
        """Issue the gate pass"""
        if self.status != 'pending':
            raise ValidationError(f"Cannot issue gate pass in {self.status} status.")
        
        self.status = 'issued'
        self.issued_at = timezone.now()
        self.updated_at = timezone.now()
        if user:
            self.authorized_by = user
        self.save(update_fields=['status', 'issued_at', 'authorized_by', 'updated_at'])
    
    def complete(self, user=None):
        """Mark gate pass as completed (vehicle picked up)"""
        if self.status not in ['pending', 'issued']:
            raise ValidationError(f"Cannot complete gate pass in {self.status} status.")
        
        self.status = 'completed'
        self.completed_at = timezone.now()
        self.updated_at = timezone.now()
        if user:
            self.authorized_by = user
        self.save(update_fields=['status', 'completed_at', 'authorized_by', 'updated_at'])
    
    def cancel(self, user=None):
        """Cancel the gate pass"""
        if self.status in ['completed', 'cancelled']:
            raise ValidationError(f"Cannot cancel gate pass in {self.status} status.")
        
        self.status = 'cancelled'
        self.updated_at = timezone.now()
        if user:
            self.authorized_by = user
        self.save(update_fields=['status', 'authorized_by', 'updated_at'])
    
    @property
    def pickup_person_display(self):
        """Get display name for pickup person"""
        if self.picked_up_by_customer:
            if self.customer and self.customer.user:
                return self.customer.user.get_full_name() or self.customer.user.username
            return "Customer"
        return self.pickup_person_name or "Unknown"
