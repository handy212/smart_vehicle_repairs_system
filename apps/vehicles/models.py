"""
Vehicle models for managing vehicle information and history
"""
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator
from django.utils.translation import gettext_lazy as _
from apps.customers.models import Customer


class Vehicle(models.Model):
    """
    Vehicle model - stores all vehicle information
    """
    
    ENGINE_TYPE_CHOICES = [
        ('gasoline', 'Gasoline'),
        ('diesel', 'Diesel'),
        ('electric', 'Electric'),
        ('hybrid', 'Hybrid'),
        ('plug_in_hybrid', 'Plug-in Hybrid'),
    ]
    
    TRANSMISSION_TYPE_CHOICES = [
        ('automatic', 'Automatic'),
        ('manual', 'Manual'),
        ('cvt', 'CVT'),
        ('dual_clutch', 'Dual Clutch'),
    ]
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('sold', 'Sold'),
        ('totaled', 'Totaled'),
        ('in_service', 'In Service'),
        ('inactive', 'Inactive'),
    ]
    
    CONDITION_RATING_CHOICES = [
        (1, 'Poor'),
        (2, 'Fair'),
        (3, 'Good'),
        (4, 'Very Good'),
        (5, 'Excellent'),
    ]
    
    # Ownership
    owner = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='vehicles',
        help_text="Vehicle owner"
    )
    
    # Vehicle Identification
    vin = models.CharField(
        max_length=17,
        unique=True,
        db_index=True,
        validators=[
            RegexValidator(
                regex=r'^[A-HJ-NPR-Z0-9]{17}$',
                message='VIN must be 17 characters (excluding I, O, Q)'
            )
        ],
        verbose_name="VIN",
        help_text="Vehicle Identification Number"
    )
    
    # Vehicle Details
    year = models.IntegerField(
        validators=[MinValueValidator(1900), MaxValueValidator(2100)],
        help_text="Manufacturing year"
    )
    make = models.CharField(max_length=100, help_text="Vehicle make (e.g., Toyota, Ford)")
    model = models.CharField(max_length=100, help_text="Vehicle model")
    trim = models.CharField(max_length=100, blank=True, help_text="Trim level")
    
    # Appearance
    exterior_color = models.CharField(max_length=50, blank=True)
    interior_color = models.CharField(max_length=50, blank=True)
    
    # License & Registration
    license_plate = models.CharField(
        max_length=20,
        db_index=True,
        help_text="License plate number"
    )
    license_plate_state = models.CharField(
        max_length=50,
        blank=True,
        help_text="State/Province of registration"
    )
    
    # Mileage
    current_mileage = models.IntegerField(
        validators=[MinValueValidator(0)],
        help_text="Current odometer reading"
    )
    mileage_unit = models.CharField(
        max_length=10,
        choices=[('miles', 'Miles'), ('km', 'Kilometers')],
        default='miles'
    )
    
    # Engine & Transmission
    engine_type = models.CharField(
        max_length=20,
        choices=ENGINE_TYPE_CHOICES,
        default='gasoline'
    )
    engine_size = models.CharField(
        max_length=50,
        blank=True,
        help_text="Engine size (e.g., 2.0L, 3.5L V6)"
    )
    transmission_type = models.CharField(
        max_length=20,
        choices=TRANSMISSION_TYPE_CHOICES,
        default='automatic'
    )
    
    # Specifications
    fuel_tank_capacity = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Fuel tank capacity in gallons or liters"
    )
    tire_size = models.CharField(
        max_length=50,
        blank=True,
        help_text="Tire size specification (e.g., 225/45R17)"
    )
    
    # Condition
    condition_rating = models.IntegerField(
        choices=CONDITION_RATING_CHOICES,
        null=True,
        blank=True,
        help_text="Overall vehicle condition rating"
    )
    
    # Purchase & Warranty
    purchase_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date vehicle was purchased"
    )
    warranty_expiry_date = models.DateField(
        null=True,
        blank=True,
        help_text="Warranty expiration date"
    )
    warranty_type = models.CharField(
        max_length=100,
        blank=True,
        help_text="Type of warranty (e.g., Bumper-to-bumper, Powertrain)"
    )
    warranty_coverage = models.TextField(
        blank=True,
        help_text="Warranty coverage details"
    )
    
    # Service History
    last_service_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date of last service"
    )
    next_service_due_date = models.DateField(
        null=True,
        blank=True,
        help_text="Next recommended service date"
    )
    next_service_due_mileage = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Next recommended service mileage"
    )
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active',
        db_index=True
    )
    
    # Vehicle Image
    image = models.ImageField(
        upload_to='vehicles/images/%Y/%m/',
        blank=True,
        null=True,
        help_text="Main vehicle image"
    )
    
    # Additional Information
    notes = models.TextField(
        blank=True,
        help_text="Internal notes about this vehicle"
    )
    tags = models.CharField(
        max_length=255,
        blank=True,
        help_text="Comma-separated tags"
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Vehicle'
        verbose_name_plural = 'Vehicles'
        indexes = [
            models.Index(fields=['vin']),
            models.Index(fields=['license_plate']),
            models.Index(fields=['owner', 'status']),
            models.Index(fields=['make', 'model', 'year']),
        ]
    
    def __str__(self):
        return f"{self.year} {self.make} {self.model} ({self.license_plate})"
    
    @property
    def display_name(self):
        """Display name for vehicle"""
        parts = [str(self.year), self.make, self.model]
        if self.trim:
            parts.append(self.trim)
        return " ".join(parts)
    
    @property
    def is_due_for_service(self):
        """Check if vehicle is due for service"""
        from django.utils import timezone
        
        if self.next_service_due_date and self.next_service_due_date <= timezone.now().date():
            return True
        if self.next_service_due_mileage and self.current_mileage >= self.next_service_due_mileage:
            return True
        return False
    
    @property
    def warranty_active(self):
        """Check if warranty is still active"""
        if not self.warranty_expiry_date:
            return False
        from django.utils import timezone
        return self.warranty_expiry_date > timezone.now().date()


class VehicleMileageHistory(models.Model):
    """
    Track mileage readings over time
    """
    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.CASCADE,
        related_name='mileage_history'
    )
    mileage = models.IntegerField(
        validators=[MinValueValidator(0)],
        help_text="Odometer reading"
    )
    recorded_date = models.DateField(
        help_text="Date mileage was recorded"
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='mileage_records'
    )
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-recorded_date']
        verbose_name = 'Mileage History'
        verbose_name_plural = 'Mileage Histories'
        indexes = [
            models.Index(fields=['vehicle', '-recorded_date']),
        ]
    
    def __str__(self):
        return f"{self.vehicle} - {self.mileage} {self.vehicle.mileage_unit} on {self.recorded_date}"


class VehicleDocument(models.Model):
    """
    Store vehicle-related documents
    """
    
    DOCUMENT_TYPE_CHOICES = [
        ('registration', 'Registration'),
        ('insurance', 'Insurance'),
        ('warranty', 'Warranty'),
        ('inspection', 'Inspection Report'),
        ('title', 'Title'),
        ('other', 'Other'),
    ]
    
    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.CASCADE,
        related_name='documents'
    )
    document_type = models.CharField(
        max_length=20,
        choices=DOCUMENT_TYPE_CHOICES
    )
    title = models.CharField(
        max_length=255,
        help_text="Document title"
    )
    file = models.FileField(
        upload_to='vehicles/documents/%Y/%m/',
        help_text="Upload document file"
    )
    expiry_date = models.DateField(
        null=True,
        blank=True,
        help_text="Document expiry date (if applicable)"
    )
    notes = models.TextField(blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='vehicle_documents_uploaded'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-uploaded_at']
        verbose_name = 'Vehicle Document'
        verbose_name_plural = 'Vehicle Documents'
    
    def __str__(self):
        return f"{self.vehicle} - {self.title}"
    
    @property
    def is_expired(self):
        """Check if document is expired"""
        if not self.expiry_date:
            return False
        from django.utils import timezone
        return self.expiry_date < timezone.now().date()


class VehiclePhoto(models.Model):
    """
    Store vehicle photos
    """
    
    PHOTO_TYPE_CHOICES = [
        ('exterior', 'Exterior'),
        ('interior', 'Interior'),
        ('engine', 'Engine'),
        ('damage', 'Damage'),
        ('repair', 'Repair'),
        ('other', 'Other'),
    ]
    
    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.CASCADE,
        related_name='photos'
    )
    photo_type = models.CharField(
        max_length=20,
        choices=PHOTO_TYPE_CHOICES,
        default='exterior'
    )
    image = models.ImageField(
        upload_to='vehicles/photos/%Y/%m/',
        help_text="Vehicle photo"
    )
    caption = models.CharField(max_length=255, blank=True)
    taken_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date photo was taken"
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='vehicle_photos_uploaded'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-uploaded_at']
        verbose_name = 'Vehicle Photo'
        verbose_name_plural = 'Vehicle Photos'
    
    def __str__(self):
        return f"{self.vehicle} - {self.photo_type} photo"

