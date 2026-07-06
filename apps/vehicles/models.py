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
    
    VEHICLE_TYPE_CHOICES = [
        ('saloon', 'Saloon'),
        ('suv', 'SUV'),
        ('pickup', 'Pick-Up'),
        ('minivan', 'Mini van'),
        ('motorcycle', 'Motorcycle'),
        ('truck', 'Truck'),
        ('other', 'Other'),
    ]
    
    # Ownership
    owner = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='vehicles',
        help_text="Vehicle owner"
    )
    
    # Relationship
    RELATIONSHIP_CHOICES = [
        ('owner', 'Owner'),
        ('driver', 'Driver'),
        ('fleet_manager', 'Fleet Manager'),
        ('other', 'Other'),
    ]
    relationship = models.CharField(
        max_length=20,
        choices=RELATIONSHIP_CHOICES,
        default='owner',
        help_text="Primary relationship between the customer and this vehicle"
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
    vehicle_type = models.CharField(
        max_length=20,
        choices=VEHICLE_TYPE_CHOICES,
        default='saloon',
        help_text="Type of vehicle (e.g., Saloon, SUV)"
    )
    
    # Appearance
    exterior_color = models.CharField(max_length=50, blank=True)
    interior_color = models.CharField(max_length=50, blank=True)
    
    # License & Registration
    license_plate = models.CharField(
        max_length=20,
        unique=True,
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
    vin_decoded_data = models.JSONField(
        null=True,
        blank=True,
        help_text="Raw VIN-decoded data (NHTSA VPIC / internal decoder output)"
    )
    vin_decoded_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When VIN was last decoded and stored"
    )
    notes = models.TextField(
        blank=True,
        help_text="Internal notes about this vehicle"
    )
    tags = models.CharField(
        max_length=255,
        blank=True,
        help_text="Comma-separated tags"
    )
    
    # Predictive Analytics
    health_score = models.IntegerField(
        default=100,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Calculated health score (0-100) based on recent repair history"
    )
    is_high_risk = models.BooleanField(
        default=False,
        help_text="Flagged if vehicle has had excessive repairs recently"
    )
    average_daily_mileage = models.FloatField(
        default=0.0,
        help_text="Calculated Average Daily Mileage (ADM) based on history"
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

    @property
    def total_maintenance_cost(self):
        """Calculate total historical spending on completed work orders"""
        completed_wos = self.work_orders.filter(status='completed')
        return sum(wo.actual_total or 0 for wo in completed_wos)

    def update_health_score(self, months_back=3, risk_threshold=3):
        """
        Dynamically calculate the health score based on frequency of recent repairs.
        A vehicle starts at 100. Each completed repair in the last X months drops the score.
        If repairs > threshold, it is flagged as high risk.
        """
        from django.utils import timezone
        from dateutil.relativedelta import relativedelta
        import logging
        
        logger = logging.getLogger(__name__)
        
        try:
            cutoff_date = timezone.now() - relativedelta(months=months_back)
            
            # Count completed work orders in the timeframe
            recent_repairs_count = self.work_orders.filter(
                status='completed',
                completed_at__gte=cutoff_date
            ).count()
            
            # Base logic: start at 100, drop 15 points per recent repair (minimum 0)
            new_score = max(0, 100 - (recent_repairs_count * 15))
            
            # High risk flag
            is_risk = recent_repairs_count >= risk_threshold
            
            # Only save if changed to avoid unnecessary DB writes
            if self.health_score != new_score or self.is_high_risk != is_risk:
                self.health_score = new_score
                self.is_high_risk = is_risk
                self.save(update_fields=['health_score', 'is_high_risk'])
                logger.info(f"Updated health score for Vehicle {self.id}: Score={new_score}, Risk={is_risk}")
                
            return new_score, is_risk
        except Exception as e:
            logger.error(f"Error calculating health score for Vehicle {self.id}: {str(e)}")
            return self.health_score, self.is_high_risk

    def update_mileage(self, mileage, user=None, notes=""):
        """Update vehicle mileage, create history record, and check service schedules"""
        if mileage is None:
            return False
            
        old_mileage = self.current_mileage or 0
        
        # Prevent decreasing mileage
        if mileage < old_mileage:
            raise ValueError(f"New mileage ({mileage}) cannot be less than current mileage ({old_mileage})")
            
        # Only update if mileage actually changed
        if old_mileage != mileage:
            self.current_mileage = mileage
            self.save(update_fields=['current_mileage'])
            
            from django.utils import timezone
            # Create history record
            self.mileage_history.create(
                mileage=mileage,
                recorded_date=timezone.now().date(),
                recorded_by=user,
                notes=notes
            )
            
            # Update ADM
            try:
                # Use the oldest history record to find long-term average
                first_record = self.mileage_history.order_by('recorded_date').first()
                if first_record and first_record.recorded_date < timezone.now().date():
                    days_passed = (timezone.now().date() - first_record.recorded_date).days
                    if days_passed > 0:
                        self.average_daily_mileage = (mileage - first_record.mileage) / days_passed
                        self.save(update_fields=['average_daily_mileage'])
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Failed to calculate ADM for {self.id}: {e}")
            
            # Check for due services
            self.check_service_schedules_due()
            return True
            
        return False
        
    def check_service_schedules_due(self):
        """Check all active schedules and trigger notifications if they are due"""
        try:
            from apps.notifications_app.triggers import NotificationTriggers
            triggers = NotificationTriggers()
            
            for schedule in self.service_schedules.filter(is_active=True):
                if schedule.is_due:
                    triggers.service_due(schedule)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to check service schedules due for vehicle {self.id}: {str(e)}")


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


class VehicleOwnershipHistory(models.Model):
    """
    Track vehicle ownership changes over time
    """
    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.CASCADE,
        related_name='ownership_history',
        help_text="The vehicle whose ownership changed"
    )
    previous_owner = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        related_name='previous_vehicle_ownerships',
        help_text="Previous owner of the vehicle"
    )
    new_owner = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name='vehicle_ownership_transfers',
        help_text="New owner of the vehicle"
    )
    transfer_date = models.DateField(
        help_text="Date when ownership was transferred"
    )
    transferred_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='vehicle_ownership_transfers',
        help_text="User who performed the transfer"
    )
    notes = models.TextField(
        blank=True,
        help_text="Additional notes about the ownership transfer"
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp when this record was created"
    )
    
    class Meta:
        ordering = ['-transfer_date', '-created_at']
        verbose_name = 'Ownership History'
        verbose_name_plural = 'Ownership Histories'
        indexes = [
            models.Index(fields=['vehicle', '-transfer_date']),
            models.Index(fields=['new_owner', '-transfer_date']),
            models.Index(fields=['previous_owner', '-transfer_date']),
        ]
    
    def __str__(self):
        prev_owner = self.previous_owner.user.get_full_name() if self.previous_owner and self.previous_owner.user else f"Customer #{self.previous_owner.id}" if self.previous_owner else "Unknown"
        new_owner = self.new_owner.user.get_full_name() if self.new_owner.user else f"Customer #{self.new_owner.id}"
        return f"{self.vehicle} - {prev_owner} → {new_owner} on {self.transfer_date}"


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


class ServiceType(models.Model):
    """
    Service type definitions (e.g., Oil Change, Tire Rotation)
    Can be predefined system types or custom types created by users
    """
    name = models.CharField(
        max_length=100,
        help_text="Service type name (e.g., Oil Change, Tire Rotation)"
    )
    description = models.TextField(
        blank=True,
        help_text="Service description"
    )
    default_interval_months = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Default months between services (null if not time-based)"
    )
    default_interval_miles = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Default miles between services (null if not mileage-based)"
    )
    is_predefined = models.BooleanField(
        default=False,
        help_text="True for system defaults, False for custom types"
    )
    progression_order = models.IntegerField(
        default=0,
        help_text="Order in which services should be performed (1=Minor, 2=Medium, 3=Major, etc.)"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this service type is active"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='service_types_created',
        help_text="User who created this service type"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['name']
        verbose_name = 'Service Type'
        verbose_name_plural = 'Service Types'
        indexes = [
            models.Index(fields=['is_active', 'is_predefined']),
        ]
    
    def __str__(self):
        return self.name


class VehicleServiceSchedule(models.Model):
    """
    Track individual service schedules per vehicle
    Links a vehicle to a service type with last service and next due dates
    """
    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.CASCADE,
        related_name='service_schedules',
        help_text="Vehicle this schedule applies to"
    )
    service_type = models.ForeignKey(
        ServiceType,
        on_delete=models.PROTECT,
        related_name='vehicle_schedules',
        help_text="Type of service"
    )
    last_service_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date when this service was last performed"
    )
    last_service_mileage = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Vehicle mileage when service was last performed"
    )
    next_service_due_date = models.DateField(
        null=True,
        blank=True,
        help_text="Next service due date (calculated or manually set)"
    )
    next_service_due_mileage = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Next service due mileage (calculated or manually set)"
    )
    interval_months = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Override default interval months for this vehicle (null uses service type default)"
    )
    interval_miles = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Override default interval miles for this vehicle (null uses service type default)"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this service schedule is active"
    )
    notes = models.TextField(
        blank=True,
        help_text="Additional notes about this service schedule"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['next_service_due_date', 'next_service_due_mileage']
        verbose_name = 'Vehicle Service Schedule'
        verbose_name_plural = 'Vehicle Service Schedules'
        unique_together = [['vehicle', 'service_type']]
        indexes = [
            models.Index(fields=['vehicle', 'is_active']),
            models.Index(fields=['next_service_due_date']),
            models.Index(fields=['next_service_due_mileage']),
            models.Index(fields=['is_active', 'next_service_due_date']),
        ]
    
    def __str__(self):
        return f"{self.vehicle} - {self.service_type.name}"
    
    def calculate_next_service_due(self):
        """
        Calculate next service due date and mileage based on last service and intervals
        """
        from django.utils import timezone
        from dateutil.relativedelta import relativedelta
        
        # Get intervals (use override if set, otherwise use service type default)
        interval_months = self.interval_months if self.interval_months is not None else self.service_type.default_interval_months
        interval_miles = self.interval_miles if self.interval_miles is not None else self.service_type.default_interval_miles
        
        # Calculate next due date
        if self.last_service_date and interval_months:
            self.next_service_due_date = self.last_service_date + relativedelta(months=interval_months)
        
        # Calculate next due mileage
        if self.last_service_mileage is not None and interval_miles:
            self.next_service_due_mileage = self.last_service_mileage + interval_miles
        
        self.save(update_fields=['next_service_due_date', 'next_service_due_mileage'])
    
    @property
    def is_due(self):
        """Check if service is currently due"""
        from django.utils import timezone
        
        today = timezone.now().date()
        current_mileage = self.vehicle.current_mileage or 0
        
        # Check date-based due
        if self.next_service_due_date and self.next_service_due_date <= today:
            return True
        
        # Check mileage-based due
        if self.next_service_due_mileage and current_mileage >= self.next_service_due_mileage:
            return True
        
        return False
    
    @property
    def is_due_soon(self):
        """Check if service is due within 14 days or 500 miles, but not yet due"""
        if self.is_due:
            return False
            
        from django.utils import timezone
        today = timezone.now().date()
        current_mileage = self.vehicle.current_mileage or 0
        
        # Check date-based (within 14 days)
        if self.next_service_due_date:
            days_left = (self.next_service_due_date - today).days
            if 0 < days_left <= 14:
                return True
                
        # Check mileage-based (within 500 miles)
        if self.next_service_due_mileage:
            miles_left = self.next_service_due_mileage - current_mileage
            if 0 < miles_left <= 500:
                return True
                
        return False

    @property
    def estimated_due_date(self):
        """Return the next service due date or an estimated date based on mileage (if possible)"""
        # For now, return the explicitly set/calculated next due date
        return self.next_service_due_date

    @property
    def days_until_due(self):
        """Calculate days until service is due (returns negative if overdue)"""
        from django.utils import timezone
        
        if not self.next_service_due_date:
            return None
        
        today = timezone.now().date()
        delta = (self.next_service_due_date - today).days
        return delta
    
    @property
    def miles_until_due(self):
        """Calculate miles until service is due (returns negative if overdue)"""
        if not self.next_service_due_mileage:
            return None
        
        current_mileage = self.vehicle.current_mileage or 0
        return self.next_service_due_mileage - current_mileage

