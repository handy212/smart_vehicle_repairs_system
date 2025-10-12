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
        ('receptionist', 'Receptionist'),
        ('technician', 'Technician'),
        ('parts_manager', 'Parts Manager'),
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


# Import permission models
from .permission_models import Permission, Role, UserPermissionOverride
