from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from decimal import Decimal
from apps.accounts.models import User
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder
from apps.inventory.models import Part


# ... (existing models remain unchanged) ...


class CashierTill(models.Model):
    """Cash register/till tracking for cashiers"""
    
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('closed', 'Closed'),
    ]
    
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='tills'
    )
    cashier = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='tills'
    )
    
    # Till times
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    
    # Balances
    opening_balance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
        validators=[MinValueValidator(Decimal('0'))]
    )
    closing_balance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )
    expected_balance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )
    variance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Difference between expected and actual closing balance"
    )
    
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='open')
    notes = models.TextField(blank=True)
    
    # Tracking
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-opened_at']
        indexes = [
            models.Index(fields=['branch', 'status']),
            models.Index(fields=['cashier', 'opened_at']),
            models.Index(fields=['status', 'opened_at']),
        ]
    
    def __str__(self):
        return f"Till {self.id} - {self.cashier.get_full_name()} ({self.status})"
    
    @property
    def duration(self):
        """Calculate how long till has been open"""
        if self.closed_at:
            return self.closed_at - self.opened_at
        return timezone.now() - self.opened_at
    
    @property
    def is_balanced(self):
        """Check if till is balanced (variance within acceptable range)"""
        if self.variance is None:
            return None
        return abs(self.variance) < Decimal('0.01')


class CashCount(models.Model):
    """Cash denomination breakdown for till opening/closing"""
    
    COUNT_TYPE_CHOICES = [
        ('opening', 'Opening Count'),
        ('closing', 'Closing Count'),
    ]
    
    till = models.ForeignKey(
        CashierTill,
        on_delete=models.CASCADE,
        related_name='cash_counts'
    )
    
    count_type = models.CharField(max_length=10, choices=COUNT_TYPE_CHOICES)
    
    # Denomination (e.g., 100, 50, 20, 10, 5, 1, 0.50, 0.25, 0.10, 0.05)
    denomination = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    quantity = models.IntegerField(
        validators=[MinValueValidator(0)]
    )
    total = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        editable=False
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-denomination']
        indexes = [
            models.Index(fields=['till', 'count_type']),
        ]
    
    def __str__(self):
        return f"{self.count_type} - ${self.denomination} x {self.quantity} = ${self.total}"
    
    def save(self, *args, **kwargs):
        # Auto-calculate total
        self.total = (self.denomination * self.quantity).quantize(Decimal('0.01'))
        super().save(*args, **kwargs)


class PaymentAllocation(models.Model):
    """Track payment allocation to multiple invoices"""
    
    payment = models.ForeignKey(
        'Payment',
        on_delete=models.CASCADE,
        related_name='allocations'
    )
    invoice = models.ForeignKey(
        'Invoice',
        on_delete=models.CASCADE,
        related_name='payment_allocations'
    )
    
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    
    allocated_at = models.DateTimeField(auto_now_add=True)
    allocated_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='payment_allocations_made'
    )
    
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-allocated_at']
        indexes = [
            models.Index(fields=['payment', 'invoice']),
            models.Index(fields=['invoice', 'allocated_at']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['payment', 'invoice'],
                name='unique_payment_invoice_allocation'
            )
        ]
    
    def __str__(self):
        return f"{self.payment.payment_number} -> {self.invoice.invoice_number}: ${self.amount}"


class Refund(models.Model):
    """Refund tracking and processing"""
    
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('completed', 'Completed'),
        ('rejected', 'Rejected'),
        ('cancelled', 'Cancelled'),
    ]
    
    REFUND_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('cheque', 'Cheque'),
        ('bank_transfer', 'Bank Transfer'),
        ('pos', 'POS/Card'),
        ('mobile_money', 'Mobile Money'),
        ('original_method', 'Original Payment Method'),
    ]
    
    # Reference
    refund_number = models.CharField(max_length=20, unique=True, editable=False)
    
    original_payment = models.ForeignKey(
        'Payment',
        on_delete=models.PROTECT,
        related_name='refunds'
    )
    invoice = models.ForeignKey(
        'Invoice',
        on_delete=models.PROTECT,
        related_name='refunds'
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name='refunds'
    )
    
    # Refund details
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    reason = models.TextField()
    refund_method = models.CharField(max_length=20, choices=REFUND_METHOD_CHOICES)
    reference_number = models.CharField(max_length=100, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Tracking
    requested_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='refunds_requested'
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='refunds_approved'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    
    processed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='refunds_processed'
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    
    # Till reference if refunded via till
    till = models.ForeignKey(
        CashierTill,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='refunds'
    )
    
    notes = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-requested_at']
        indexes = [
            models.Index(fields=['status', 'requested_at']),
            models.Index(fields=['customer', 'status']),
            models.Index(fields=['invoice', 'status']),
        ]
    
    def __str__(self):
        return f"{self.refund_number} - ${self.amount} ({self.status})"
    
    def save(self, *args, **kwargs):
        # Auto-generate refund number
        if not self.refund_number:
            from datetime import datetime
            today = datetime.now()
            prefix = f"RF{today.strftime('%Y%m%d')}"
            
            # Get last refund number for today
            last_refund = Refund.objects.filter(
                refund_number__startswith=prefix
            ).order_by('-refund_number').first()
            
            if last_refund:
                # Extract sequence and increment
                last_seq = int(last_refund.refund_number[-4:])
                new_seq = last_seq + 1
            else:
                new_seq = 1
            
            self.refund_number = f"{prefix}{new_seq:04d}"
        
        super().save(*args, **kwargs)
