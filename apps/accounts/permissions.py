"""
Custom permission classes for Django REST Framework
Integrates with the role-based permission system
"""
from rest_framework import permissions
from rest_framework.permissions import BasePermission
from django.contrib.auth import get_user_model

User = get_user_model()


class HasPermission(BasePermission):
    """
    Custom permission class that checks if user's role has a specific permission
    Usage: permission_classes = [IsAuthenticated, HasPermission('view_customers')]
    """
    def __init__(self, permission_code):
        self.permission_code = permission_code
        super().__init__()

    def has_permission(self, request, view):
        """Check if user has the required permission"""
        if not request.user or not request.user.is_authenticated:
            return False
        
        return user_has_permission(request.user, self.permission_code)

    def __call__(self):
        """Allow using the class as a decorator"""
        return self


class HasAnyPermission(BasePermission):
    """
    Custom permission class that checks if user has ANY of the specified permissions
    Usage: permission_classes = [IsAuthenticated, HasAnyPermission(['view_customers', 'manage_customers'])]
    """
    def __init__(self, permission_codes):
        self.permission_codes = permission_codes if isinstance(permission_codes, list) else [permission_codes]
        super().__init__()

    def has_permission(self, request, view):
        """Check if user has any of the required permissions"""
        if not request.user or not request.user.is_authenticated:
            return False
        
        for permission_code in self.permission_codes:
            if user_has_permission(request.user, permission_code):
                return True
        return False
    
    def __call__(self):
        return self


class HasAllPermissions(BasePermission):
    """
    Custom permission class that checks if user has ALL of the specified permissions
    Usage: permission_classes = [IsAuthenticated, HasAllPermissions(['view_customers', 'edit_customers'])]
    """
    def __init__(self, permission_codes):
        self.permission_codes = permission_codes if isinstance(permission_codes, list) else [permission_codes]
        super().__init__()

    def has_permission(self, request, view):
        """Check if user has all of the required permissions"""
        if not request.user or not request.user.is_authenticated:
            return False
        
        for permission_code in self.permission_codes:
            if not user_has_permission(request.user, permission_code):
                return False
        return True
    
    def __call__(self):
        return self


class IsAdmin(permissions.BasePermission):
    """Permission check for admin users"""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        # Role-based check
        return request.user.role in ('admin', 'super-admin')


class IsManager(permissions.BasePermission):
    """Permission check for manager users (also grants access to admins)"""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        # Role-based check
        return request.user.role in ('manager', 'admin', 'super-admin')


class IsStaff(permissions.BasePermission):
    """Permission check for staff users (non-customers)"""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role != 'customer'


class IsCustomer(permissions.BasePermission):
    """Permission check for customer users"""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role == 'customer'


class IsSuperAdmin(permissions.BasePermission):
    """Permission check for super-admin users (owner/system admins)"""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        # Strictly require the 'super-admin' role for this permission
        return request.user.role == 'super-admin'


class IsModuleEnabled(permissions.BasePermission):
    """
    Permission check that ensures a module is active.
    Usage: permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
    """
    def __init__(self, module_slug=None):
        self.module_slug = module_slug
        super().__init__()

    def has_permission(self, request, view):
        # Allow only the 'super-admin' role to bypass module status checks
        if request.user and request.user.role == 'super-admin':
            return True
        # Note: We even block superusers if they don't have the 'super-admin' role 
        # to ensure strict role-based access control per user requirements.
            
        # If no slug provided, attempt to get it from view if it exists
        module_slug = self.module_slug
        if not module_slug and hasattr(view, 'module_slug'):
            module_slug = view.module_slug
            
        if not module_slug:
            return True
            
        from apps.accounts.admin_models import SystemModule
        try:
            module = SystemModule.objects.get(slug=module_slug)
            return module.is_enabled
        except SystemModule.DoesNotExist:
            return False

    def __call__(self):
        """Allow using the class as a decorator or standalone in list"""
        return self


def user_has_permission(user, permission_code):
    """
    Check if a user has a specific permission through their role
    
    Args:
        user: User instance
        permission_code: Permission code string (e.g., 'view_customers')
    
    Returns:
        bool: True if user has permission, False otherwise
    """
    if not user or not user.is_authenticated:
        return False
    
    # Admins and superusers have all permissions
    if user.role in ('admin', 'super-admin') or getattr(user, 'is_superuser', False):
        return True
    
    # Check user-specific permission overrides first
    from apps.accounts.permission_models import UserPermissionOverride
    override = UserPermissionOverride.objects.filter(
        user=user,
        permission__code=permission_code
    ).first()
    
    if override:
        # Check if override is expired
        if override.is_expired():
            # Override expired, check role
            pass
        else:
            # Override takes precedence
            return override.granted
    
    # Check role permissions
    try:
        from apps.accounts.permission_models import Role
        role = Role.objects.get(code=user.role, is_active=True)
        return role.has_permission(permission_code)
    except (Role.DoesNotExist, AttributeError):
        # Role not found or user has no role - deny access
        return False


def get_user_permissions(user):
    """
    Get all permission codes for a user
    
    Args:
        user: User instance
    
    Returns:
        list: List of permission code strings
    """
    if not user or not user.is_authenticated:
        return []
    
    # Admins and superusers have all permissions
    if user.role in ('admin', 'super-admin') or getattr(user, 'is_superuser', False):
        from apps.accounts.permission_models import Role, Permission
        try:
            # Try to get permissions from admin role
            admin_role = Role.objects.get(code='admin', is_active=True)
            role_permissions = admin_role.get_permission_codes()
            # If admin role has permissions, return them
            if role_permissions:
                return role_permissions
        except Role.DoesNotExist:
            pass
        
        # Fallback: If admin role doesn't exist or has no permissions,
        # return all active permissions
        return list(Permission.objects.filter(is_active=True).values_list('code', flat=True))
    
    # Get role permissions
    try:
        from apps.accounts.permission_models import Role
        role = Role.objects.get(code=user.role, is_active=True)
        permissions = role.get_permission_codes()
        
        # Apply user-specific overrides
        from apps.accounts.permission_models import UserPermissionOverride
        overrides = UserPermissionOverride.objects.filter(
            user=user
        ).select_related('permission')
        
        for override in overrides:
            if override.is_expired():
                continue
            perm_code = override.permission.code
            if override.granted:
                # Grant permission (add if not present)
                if perm_code not in permissions:
                    permissions.append(perm_code)
            else:
                # Revoke permission (remove if present)
                if perm_code in permissions:
                    permissions.remove(perm_code)
        
        return permissions
    except (Role.DoesNotExist, AttributeError):
        return []


def check_object_permission(user, permission_code, obj):
    """
    Check if user has permission for a specific object
    Useful for checking 'own' vs 'all' permissions
    
    Args:
        user: User instance
        permission_code: Base permission code (e.g., 'view_customers')
        obj: Object to check ownership/permission for
    
    Returns:
        bool: True if user has permission
    """
    # First check if user has the general permission
    if user_has_permission(user, permission_code):
        return True
    
    # Check for 'own' version of permission
    own_permission = permission_code.replace('view_', 'view_own_').replace('edit_', 'edit_own_').replace('manage_', 'manage_own_')
    
    if own_permission == permission_code:
        # No 'own' variant exists
        return False
    
    if not user_has_permission(user, own_permission):
        return False
    
    # Check object ownership
    if hasattr(obj, 'owner') and obj.owner == user:
        return True
    if hasattr(obj, 'user') and obj.user == user:
        return True
    if hasattr(obj, 'customer') and hasattr(obj.customer, 'user') and obj.customer.user == user:
        return True
    if hasattr(obj, 'created_by') and obj.created_by == user:
        return True
    
    return False
