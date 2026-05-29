"""
Appointment models for scheduling and managing appointments
"""
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle


class ServiceBay(models.Model):
    """
    Service bay/location where work is performed
    """
    
    BAY_TYPE_CHOICES = [
        ('general', 'General Service'),
        ('specialty', 'Specialty'),
        ('diagnostic', 'Diagnostic'),
        ('quick_service', 'Quick Service'),
        ('body_shop', 'Body Shop'),
    ]
    
    STATUS_CHOICES = [
        ('available', 'Available'),
        ('occupied', 'Occupied'),
        ('maintenance', 'Under Maintenance'),
        ('closed', 'Closed'),
    ]
    
    name = models.CharField(
        max_length=100,
        unique=True,
        help_text="Bay name or number (e.g., Bay 1, Bay A)"
    )
    bay_type = models.CharField(
        max_length=20,
        choices=BAY_TYPE_CHOICES,
        default='general',
        help_text="Type of service bay"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='available',
        help_text="Current bay status"
    )
    equipment_available = models.TextField(
        blank=True,
        help_text="Equipment and tools available in this bay"
    )
    capacity = models.IntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        help_text="Number of vehicles that can be serviced simultaneously"
    )
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this bay is in use"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Service Bay'
        verbose_name_plural = 'Service Bays'
        ordering = ['name']
    
    def __str__(self):
        return f"{self.name} ({self.get_bay_type_display()})"
    
    @property
    def is_available(self):
        """Check if bay is available for scheduling"""
        return self.status == 'available' and self.is_active


class Appointment(models.Model):
    """
    Appointment model for scheduling customer vehicle services
    """
    
    SERVICE_TYPE_CHOICES = [
        ('inspection', 'Inspection'),
        ('repair', 'Repair'),
        ('maintenance', 'Maintenance'),
        ('diagnostic', 'Diagnostic'),
        ('tire_service', 'Tire Service'),
        ('oil_change', 'Oil Change'),
        ('brake_service', 'Brake Service'),
        ('other', 'Other'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('no_show', 'No Show'),
        ('rescheduled', 'Rescheduled'),
    ]
    
    CONFIRMATION_METHOD_CHOICES = [
        ('phone', 'Phone'),
        ('email', 'Email'),
        ('sms', 'SMS'),
        ('online', 'Online'),
    ]
    
    # Auto-generated appointment number
    appointment_number = models.CharField(
        max_length=20,
        unique=True,
        help_text="Unique appointment number"
    )
    
    # Branch assignment
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='appointments',
        null=True,  # Allow null for migration
        blank=True,
        help_text="Branch where this appointment is scheduled"
    )
    
    # References
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='appointments',
        help_text="Customer booking the appointment"
    )
    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.CASCADE,
        related_name='appointments',
        help_text="Vehicle being serviced"
    )
    
    # Scheduling
    appointment_date = models.DateField(
        db_index=True,
        help_text="Date of appointment"
    )
    appointment_time = models.TimeField(
        help_text="Start time of appointment"
    )
    estimated_duration = models.IntegerField(
        default=60,
        validators=[MinValueValidator(15)],
        help_text="Estimated duration in minutes"
    )
    
    # Service details
    service_type = models.CharField(
        max_length=20,
        choices=SERVICE_TYPE_CHOICES,
        default='maintenance',
        help_text="Type of service requested"
    )
    service_bundle = models.ForeignKey(
        'inventory.ServiceBundle',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='appointments',
        help_text="Service bundle requested"
    )
    priority = models.CharField(
        max_length=10,
        choices=PRIORITY_CHOICES,
        default='normal',
        help_text="Appointment priority"
    )
    
    # Staff assignment
    assigned_technicians = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        limit_choices_to={'role__in': ['technician', 'manager', 'admin']},
        related_name='assigned_appointments',
        blank=True,
        help_text="Technicians assigned to this appointment"
    )
    service_bay = models.ForeignKey(
        ServiceBay,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='appointments',
        help_text="Service bay allocated for this appointment"
    )
    
    # Status tracking
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        db_index=True,
        help_text="Current appointment status"
    )
    
    # Customer information
    customer_concerns = models.TextField(
        help_text="Customer's concerns or service requests"
    )
    customer_rating = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Customer satisfaction rating (1-5) after appointment completion"
    )
    customer_feedback = models.TextField(
        blank=True,
        help_text="Optional customer feedback after appointment completion"
    )
    special_instructions = models.TextField(
        blank=True,
        help_text="Special instructions or notes"
    )
    
    # Cost estimate
    estimated_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Estimated cost for the service"
    )
    
    # Confirmation tracking
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='confirmed_appointments',
        help_text="Staff member who confirmed the appointment"
    )
    confirmed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When appointment was confirmed"
    )
    confirmation_method = models.CharField(
        max_length=20,
        choices=CONFIRMATION_METHOD_CHOICES,
        blank=True,
        help_text="How appointment was confirmed"
    )
    
    # Reminder tracking
    reminder_sent = models.BooleanField(
        default=False,
        help_text="Whether reminder has been sent"
    )
    reminder_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When reminder was sent"
    )
    
    # Check-in
    checked_in = models.BooleanField(
        default=False,
        help_text="Whether customer has checked in"
    )
    check_in_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Actual check-in time"
    )
    
    # Cancellation
    cancellation_reason = models.TextField(
        blank=True,
        help_text="Reason for cancellation"
    )
    cancelled_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When appointment was cancelled"
    )
    
    # Creation tracking
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='appointments_created',
        help_text="Staff member who created the appointment"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['appointment_date', 'appointment_time']
        verbose_name = 'Appointment'
        verbose_name_plural = 'Appointments'
        indexes = [
            models.Index(fields=['appointment_date', 'appointment_time']),
            models.Index(fields=['status', 'appointment_date']),
            models.Index(fields=['customer', 'appointment_date']),
        ]
        # Prevent double-booking of service bays
        constraints = [
            models.UniqueConstraint(
                fields=['service_bay', 'appointment_date', 'appointment_time'],
                condition=models.Q(status__in=['pending', 'confirmed', 'in_progress']),
                name='unique_bay_appointment'
            )
        ]
    
    def __str__(self):
        return f"{self.appointment_number} - {self.customer} - {self.appointment_date}"
    
    def save(self, *args, **kwargs):
        # Auto-generate appointment number if not set
        if not self.appointment_number:
            from django.db import transaction
            with transaction.atomic():
                last_appointment = (
                    Appointment.objects
                    .select_for_update()
                    .order_by('-id')
                    .first()
                )
                if last_appointment and last_appointment.appointment_number.startswith('APT'):
                    try:
                        last_number = int(last_appointment.appointment_number.replace('APT', ''))
                        self.appointment_number = f"APT{last_number + 1:06d}"
                    except ValueError:
                        next_id = Appointment.objects.count() + 1
                        self.appointment_number = f"APT{next_id:06d}"
                else:
                    self.appointment_number = "APT000001"
        super().save(*args, **kwargs)
    
    @property
    def end_time(self):
        """Calculate appointment end time"""
        if not self.appointment_date or not self.appointment_time:
            return None
        from datetime import datetime, timedelta
        dt = datetime.combine(self.appointment_date, self.appointment_time)
        end_dt = dt + timedelta(minutes=self.estimated_duration)
        return end_dt.time()
    
    @property
    def is_past(self):
        """Check if appointment is in the past"""
        if not self.appointment_date or not self.appointment_time:
            return False
        from datetime import datetime
        appointment_datetime = datetime.combine(self.appointment_date, self.appointment_time)
        # Make the datetime timezone-aware for comparison
        appointment_datetime = timezone.make_aware(appointment_datetime)
        return appointment_datetime < timezone.now()
    
    @property
    def is_today(self):
        """Check if appointment is today"""
        if not self.appointment_date:
            return False
        return self.appointment_date == timezone.now().date()
    
    @property
    def is_overdue(self):
        """Check if customer is overdue (no show)"""
        if self.status in ['pending', 'confirmed'] and self.is_past:
            return True
        return False
    
    @property
    def technician_names(self):
        """Get comma-separated list of technician names"""
        return ", ".join([tech.get_full_name() or tech.username 
                         for tech in self.assigned_technicians.all()])


class AppointmentReminder(models.Model):
    """
    Track appointment reminders sent to customers
    """
    
    REMINDER_TYPE_CHOICES = [
        ('email', 'Email'),
        ('sms', 'SMS'),
        ('push', 'Push Notification'),
        ('phone', 'Phone Call'),
    ]
    
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('sent', 'Sent'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]
    
    appointment = models.ForeignKey(
        Appointment,
        on_delete=models.CASCADE,
        related_name='reminders'
    )
    reminder_type = models.CharField(
        max_length=20,
        choices=REMINDER_TYPE_CHOICES,
        help_text="Type of reminder"
    )
    scheduled_send_time = models.DateTimeField(
        help_text="When reminder should be sent"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='scheduled'
    )
    sent_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When reminder was actually sent"
    )
    error_message = models.TextField(
        blank=True,
        help_text="Error message if sending failed"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['scheduled_send_time']
        verbose_name = 'Appointment Reminder'
        verbose_name_plural = 'Appointment Reminders'
    
    def __str__(self):
        return f"{self.appointment.appointment_number} - {self.get_reminder_type_display()}"

