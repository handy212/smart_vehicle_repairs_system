"""
Custom User model for Smart Vehicle Repairs System
"""
from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.utils.translation import gettext_lazy as _


class CustomUserManager(UserManager):
    """Custom manager for User model."""
    
    def create_superuser(self, username=None, email=None, password=None, **extra_fields):
        """Create and save a superuser with the given email and password."""
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'admin')  # Automatically set role to admin
        
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    """
    Custom user model extending Django's AbstractUser
    """
    ROLE_CHOICES = (
        ('admin', 'Admin'),
        ('manager', 'Manager'),
        ('service_coordinator', 'Service Coordinator'),
        ('receptionist', 'Receptionist'),
        ('technician', 'Technician'),
        ('parts_manager', 'Parts Manager'),
        ('accountant', 'Accountant'),
        ('customer', 'Customer'),
    )
    
    email = models.EmailField(_('email address'), unique=True)
    phone = models.CharField(_('phone number'), max_length=20, blank=True)
    role = models.CharField(_('role'), max_length=20, choices=ROLE_CHOICES, default='customer')
    profile_picture = models.ImageField(_('profile picture'), upload_to='profiles/', blank=True, null=True)
    date_of_birth = models.DateField(_('date of birth'), blank=True, null=True)
    address = models.TextField(_('address'), blank=True)
    city = models.CharField(_('city'), max_length=100, blank=True)
    state = models.CharField(_('state'), max_length=100, blank=True)
    zip_code = models.CharField(_('zip code'), max_length=20, blank=True)
    country = models.CharField(_('country'), max_length=100, default='USA')
    
    # Employment fields (for staff members)
    employee_id = models.CharField(_('employee ID'), max_length=50, blank=True, unique=True, null=True)
    hire_date = models.DateField(_('hire date'), blank=True, null=True)
    hourly_rate = models.DecimalField(_('hourly rate'), max_digits=10, decimal_places=2, blank=True, null=True)
    
    # Branch assignment
    # Staff members (non-managers) are assigned to a single branch
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='staff_members',
        verbose_name=_('assigned branch'),
        help_text="Primary branch for staff members (receptionist, technician, parts_manager)"
    )
    # Managers can have access to multiple branches
    managed_branches = models.ManyToManyField(
        'branches.Branch',
        related_name='managers',
        blank=True,
        verbose_name=_('managed branches'),
        help_text="Branches that this manager has access to"
    )
    
    # Preferences
    email_notifications = models.BooleanField(_('email notifications'), default=True)
    sms_notifications = models.BooleanField(_('SMS notifications'), default=False)
    
    # Metadata
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username', 'first_name', 'last_name']
    
    # Use custom manager
    objects = CustomUserManager()
    
    class Meta:
        verbose_name = _('user')
        verbose_name_plural = _('users')
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.get_full_name()} ({self.email})"
    
    def get_full_name(self):
        """Return the first_name plus the last_name, with a space in between."""
        full_name = f"{self.first_name} {self.last_name}"
        return full_name.strip() or self.email
    
    @property
    def is_staff_member(self):
        """Check if user is a staff member (not a customer)"""
        return self.role in ['admin', 'manager', 'receptionist', 'technician', 'parts_manager']
    
    @property
    def is_technician(self):
        """Check if user is a technician"""
        return self.role == 'technician'
    
    @property
    def is_manager_or_admin(self):
        """Check if user is manager or admin"""
        return self.role in ['admin', 'manager']
    
    def get_accessible_branches(self):
        """
        Get all branches this user has access to
        - Admins: all branches
        - Managers: their managed branches
        - Other staff: their assigned branch
        - Customers: None
        """
        from apps.branches.models import Branch
        
        if self.role == 'admin':
            return Branch.objects.filter(is_active=True)
        elif self.role == 'manager':
            return self.managed_branches.filter(is_active=True)
        elif self.role in ['receptionist', 'technician', 'parts_manager', 'service_coordinator', 'accountant']:
            if self.branch:
                return Branch.objects.filter(id=self.branch.id, is_active=True)
            return Branch.objects.none()
        return Branch.objects.none()
    
    def has_branch_access(self, branch):
        """Check if user has access to a specific branch"""
        if self.role == 'admin':
            return True
        elif self.role == 'manager':
            return self.managed_branches.filter(id=branch.id).exists()
        elif self.role in ['receptionist', 'technician', 'parts_manager', 'service_coordinator', 'accountant']:
            return self.branch and self.branch.id == branch.id
        return False
    
    @property
    def primary_branch(self):
        """Get the primary branch for this user"""
        if self.role == 'admin':
            from apps.branches.models import Branch
            return Branch.objects.filter(is_headquarters=True).first() or Branch.objects.filter(is_active=True).first()
        elif self.role == 'manager':
            return self.managed_branches.filter(is_active=True).first()
        elif self.role in ['receptionist', 'technician', 'parts_manager', 'service_coordinator', 'accountant']:
            return self.branch
        return None


# Import permission models
from .permission_models import Permission, Role, UserPermissionOverride


class RegistrationOTP(models.Model):
    """
    Temporary storage for 6-digit registration codes sent via email.
    """
    email = models.EmailField(db_index=True)
    otp_code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    is_verified = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Registration OTP'
        verbose_name_plural = 'Registration OTPs'

    def __str__(self):
        return f"OTP for {self.email} - {self.otp_code}"
