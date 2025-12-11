"""
Dynamic Role and Permission Models
"""
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.contrib.auth import get_user_model

User = get_user_model()


class Permission(models.Model):
    """
    System permissions that can be assigned to roles
    """
    CATEGORY_CHOICES = (
        ('users', 'User Management'),
        ('customers', 'Customer Management'),
        ('vehicles', 'Vehicle Management'),
        ('appointments', 'Appointments'),
        ('workorders', 'Work Orders'),
        ('inventory', 'Inventory'),
        ('billing', 'Billing & Payments'),
        ('reports', 'Reports'),
        ('settings', 'Settings'),
        ('system', 'System Administration'),
        ('documents', 'Documents'),
        ('diagnosis', 'Diagnosis'),
        ('inspections', 'Inspections'),
        ('notifications', 'Notifications'),
    )
    
    code = models.CharField(_('permission code'), max_length=100, unique=True, db_index=True)
    name = models.CharField(_('permission name'), max_length=200)
    description = models.TextField(_('description'), blank=True)
    category = models.CharField(_('category'), max_length=50, choices=CATEGORY_CHOICES)
    is_system = models.BooleanField(_('system permission'), default=False, 
                                    help_text='System permissions cannot be deleted')
    is_active = models.BooleanField(_('active'), default=True)
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)
    
    class Meta:
        verbose_name = _('permission')
        verbose_name_plural = _('permissions')
        ordering = ['category', 'name']
    
    def __str__(self):
        return f"{self.name} ({self.code})"


class Role(models.Model):
    """
    User roles with dynamic permissions
    """
    code = models.CharField(_('role code'), max_length=50, unique=True, db_index=True)
    name = models.CharField(_('role name'), max_length=100)
    description = models.TextField(_('description'), blank=True)
    permissions = models.ManyToManyField(Permission, related_name='roles', blank=True)
    is_system = models.BooleanField(_('system role'), default=False,
                                    help_text='System roles cannot be deleted')
    is_active = models.BooleanField(_('active'), default=True)
    priority = models.IntegerField(_('priority'), default=0,
                                   help_text='Higher priority roles have more access')
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)
    
    class Meta:
        verbose_name = _('role')
        verbose_name_plural = _('roles')
        ordering = ['-priority', 'name']
    
    def __str__(self):
        return self.name
    
    def get_permission_codes(self):
        """Get list of permission codes for this role"""
        return list(self.permissions.filter(is_active=True).values_list('code', flat=True))
    
    def has_permission(self, permission_code):
        """Check if role has specific permission"""
        return self.permissions.filter(code=permission_code, is_active=True).exists()
    
    def user_count(self):
        """Count users with this role"""
        return User.objects.filter(role=self.code).count()


class UserPermissionOverride(models.Model):
    """
    Individual permission overrides for specific users
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='permission_overrides')
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE)
    granted = models.BooleanField(_('granted'), default=True,
                                  help_text='True=grant, False=revoke')
    reason = models.CharField(_('reason'), max_length=500, blank=True)
    granted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, 
                                   related_name='granted_permissions')
    granted_at = models.DateTimeField(_('granted at'), auto_now_add=True)
    expires_at = models.DateTimeField(_('expires at'), null=True, blank=True)
    
    class Meta:
        verbose_name = _('user permission override')
        verbose_name_plural = _('user permission overrides')
        unique_together = ['user', 'permission']
        ordering = ['-granted_at']
    
    def __str__(self):
        action = 'Granted' if self.granted else 'Revoked'
        return f"{action} {self.permission.name} for {self.user.get_full_name()}"
    
    def is_expired(self):
        """Check if override has expired"""
        if not self.expires_at:
            return False
        from django.utils import timezone
        return timezone.now() > self.expires_at
