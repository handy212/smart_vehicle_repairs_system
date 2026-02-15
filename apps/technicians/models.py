from django.db import models
from django.utils.translation import gettext_lazy as _
from datetime import timedelta
from django.conf import settings

class Skill(models.Model):
    """
    Represents a specific skill or certification a technician can have.
    e.g., 'Diesel Engine', 'Hybrid Systems', 'ASE Master Tech'
    """
    name = models.CharField(_('name'), max_length=100, unique=True)
    description = models.TextField(_('description'), blank=True)
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        verbose_name = _('skill')
        verbose_name_plural = _('skills')
        ordering = ['name']

    def __str__(self):
        return self.name


class Technician(models.Model):
    """
    Extended profile for users with role='technician'.
    """
    STATUS_CHOICES = (
        ('available', 'Available'),
        ('busy', 'On Job'),
        ('break', 'On Break'),
        ('offline', 'Offline'),
    )

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='technician_profile',
        verbose_name=_('user')
    )
    bio = models.TextField(_('bio'), blank=True)
    skills = models.ManyToManyField(
        Skill,
        related_name='technicians',
        blank=True,
        verbose_name=_('skills')
    )
    years_of_experience = models.PositiveIntegerField(_('years of experience'), default=0)
    
    # Status and Availability
    current_status = models.CharField(
        _('current status'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='offline'
    )
    
    # Location (Simple Lat/Lon for now, can be upgraded to GeoDjango later)
    last_latitude = models.DecimalField(
        _('last latitude'),
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True
    )
    last_longitude = models.DecimalField(
        _('last longitude'),
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True
    )
    last_location_update = models.DateTimeField(
        _('last location update'),
        null=True,
        blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('technician')
        verbose_name_plural = _('technicians')
        ordering = ['-created_at']

    def __str__(self):
        return f"Technician: {self.user.get_full_name()}"


class TimeOffRequest(models.Model):
    """
    Requests for time off by technicians.
    """
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    )

    technician = models.ForeignKey(
        Technician,
        on_delete=models.CASCADE,
        related_name='time_off_requests'
    )
    start_date = models.DateField(_('start date'))
    end_date = models.DateField(_('end date'))
    reason = models.TextField(_('reason'), blank=True)
    status = models.CharField(
        _('status'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_time_off_requests'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('time off request')
        verbose_name_plural = _('time off requests')
        ordering = ['-created_at']


class Shift(models.Model):
    """
    Represents a scheduled shift for a technician.
    """
    STATUS_CHOICES = (
        ('scheduled', 'Scheduled'),
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('absent', 'Absent'),
        ('cancelled', 'Cancelled'),
    )

    technician = models.ForeignKey(
        Technician,
        on_delete=models.CASCADE,
        related_name='shifts'
    )
    start_time = models.DateTimeField(_('start time'))
    end_time = models.DateTimeField(_('end time'))
    status = models.CharField(
        _('status'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='scheduled'
    )
    notes = models.TextField(_('notes'), blank=True)
    
    # Time tracking fields
    actual_start_time = models.DateTimeField(_('actual start time'), null=True, blank=True)
    actual_end_time = models.DateTimeField(_('actual end time'), null=True, blank=True)
    break_duration = models.DurationField(_('break duration'), default=timedelta(0), help_text="Total break time")
    actual_hours = models.DecimalField(_('actual hours'), max_digits=5, decimal_places=2, null=True, blank=True)
    overtime_hours = models.DecimalField(_('overtime hours'), max_digits=5, decimal_places=2, default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('shift')
        verbose_name_plural = _('shifts')
        ordering = ['-start_time']

    def __str__(self):
        return f"{self.technician.user.get_full_name()} - {self.start_time.date()}"
    
    @property
    def scheduled_hours(self):
        """Calculate scheduled hours from start_time to end_time"""
        duration = self.end_time - self.start_time
        return float(duration.total_seconds() / 3600)
    
    def calculate_actual_hours(self):
        """Calculate actual hours worked, minus breaks"""
        if not self.actual_start_time or not self.actual_end_time:
            return None
        
        duration = self.actual_end_time - self.actual_start_time
        total_seconds = duration.total_seconds()
        
        # Subtract break duration
        break_seconds = self.break_duration.total_seconds() if self.break_duration else 0
        work_seconds = total_seconds - break_seconds
        
        # Convert to hours
        hours = work_seconds / 3600
        return round(hours, 2)
    
    def calculate_overtime(self):
        """Calculate overtime hours (actual - scheduled)"""
        if self.actual_hours is None:
            return 0
        
        scheduled = self.scheduled_hours
        overtime = max(0, float(self.actual_hours) - scheduled)
        return round(overtime, 2)
    
    def save(self, *args, **kwargs):
        """Auto-calculate actual_hours and overtime on save"""
        if self.actual_start_time and self.actual_end_time:
            self.actual_hours = self.calculate_actual_hours()
            self.overtime_hours = self.calculate_overtime()
        super().save(*args, **kwargs)

class Certification(models.Model):
    """
    Model for tracking technician certifications, licenses, and professional credentials
    """
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('expired', 'Expired'),
        ('pending_renewal', 'Pending Renewal'),
        ('suspended', 'Suspended'),
    ]
    
    technician = models.ForeignKey(Technician, on_delete=models.CASCADE, related_name='certifications')
    name = models.CharField(max_length=200, help_text="e.g., ASE Master Technician")
    certification_number = models.CharField(max_length=100, blank=True)
    issuing_authority = models.CharField(max_length=200, help_text="e.g., ASE, State DMV")
    issue_date = models.DateField()
    expiry_date = models.DateField(null=True, blank=True, help_text="Leave blank if no expiry")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    document_file = models.FileField(upload_to='certifications/', null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-issue_date']
        indexes = [
            models.Index(fields=['technician', 'status']),
            models.Index(fields=['expiry_date']),
        ]
    
    def __str__(self):
        return f"{self.technician.user.get_full_name()} - {self.name}"
    
    @property
    def is_expiring_soon(self):
        """Returns True if certification expires within 30 days"""
        if not self.expiry_date:
            return False
        from django.utils import timezone
        days_until_expiry = (self.expiry_date - timezone.now().date()).days
        return 0 <= days_until_expiry <= 30
    
    @property
    def days_until_expiry(self):
        """Returns number of days until expiry, None if no expiry date"""
        if not self.expiry_date:
            return None
        from django.utils import timezone
        return (self.expiry_date - timezone.now().date()).days
    
    @property
    def is_expired(self):
        """Returns True if certification is expired"""
        if not self.expiry_date:
            return False
        from django.utils import timezone
        return self.expiry_date < timezone.now().date()
    
    def save(self, *args, **kwargs):
        """Auto-update status based on expiry date"""
        if self.is_expired and self.status == 'active':
            self.status = 'expired'
        super().save(*args, **kwargs)

