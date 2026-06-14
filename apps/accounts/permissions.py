"""
Custom permission classes for Django REST Framework
Integrates with the role-based permission system
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import permissions
from rest_framework.permissions import BasePermission

User = get_user_model()

# Permission code groups used across viewsets
WORKORDER_VIEW_PERMISSIONS = ('view_workorders', 'view_own_workorders')
WORKORDER_STATUS_PERMISSIONS = ('update_workorder_status', 'edit_workorders', 'manage_workorders')
REPORTS_VIEW_PERMISSIONS = ('view_reports', 'view_all_reports')


class HasPermission(BasePermission):
    """
    Custom permission class that checks if user's role has a specific permission
    Usage: permission_classes = [IsAuthenticated, HasPermission('view_customers')]
    """
    message = "You don't have permission to perform this action. Contact your administrator if you need access."

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
    message = "You don't have permission to perform this action. Contact your administrator if you need access."

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
    message = "You don't have permission to perform this action. Contact your administrator if you need access."

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
    """Staff with full user-management or settings access (respects overrides)."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.role == 'super-admin':
            return True
        return (
            user_has_permission(request.user, 'manage_users')
            or user_has_permission(request.user, 'manage_settings')
        )


class IsManager(permissions.BasePermission):
    """Managers and above with branch operations access."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.role == 'super-admin':
            return True
        return (
            user_has_permission(request.user, 'manage_branch_staff')
            or user_has_permission(request.user, 'manage_users')
            or user_has_permission(request.user, 'manage_settings')
            or request.user.role in ('manager', 'admin')
        )


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
        if getattr(settings, 'SKIP_MODULE_PERMISSION_CHECKS', False):
            return True

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
    
    # Super-admins and Django superusers have unrestricted system access.
    # Regular admins get their access from the dynamic Role model so explicit
    # user overrides can still revoke sensitive permissions.
    if user.role == 'super-admin' or getattr(user, 'is_superuser', False):
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
    
    # Check role permissions. The admin role normally carries all permissions,
    # but it is still resolved here so the override above can deny individual
    # permissions for a specific admin account.
    try:
        from apps.accounts.permission_models import Permission, Role
        role = Role.objects.get(code=user.role, is_active=True)
        return role.has_permission(permission_code)
    except (Role.DoesNotExist, AttributeError):
        if user.role == 'admin':
            return Permission.objects.filter(code=permission_code, is_active=True).exists()
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
    
    # Super-admins and Django superusers have all active permissions.
    if user.role == 'super-admin' or getattr(user, 'is_superuser', False):
        from apps.accounts.permission_models import Permission
        return list(Permission.objects.filter(is_active=True).values_list('code', flat=True))
    
    # Get role permissions
    try:
        from apps.accounts.permission_models import Permission, Role
        role = Role.objects.get(code=user.role, is_active=True)
        permissions = role.get_permission_codes()
        if user.role == 'admin' and not permissions:
            permissions = list(Permission.objects.filter(is_active=True).values_list('code', flat=True))
    except (Role.DoesNotExist, AttributeError):
        if user.role == 'admin':
            permissions = list(Permission.objects.filter(is_active=True).values_list('code', flat=True))
        else:
            return []

    try:
        
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
    except AttributeError:
        return []


def user_can_approve_purchase_orders(user):
    return user_has_permission(user, 'approve_purchase_orders') or user_has_permission(
        user, 'manage_inventory'
    )


def user_can_approve_transfers(user):
    return user_has_permission(user, 'transfer_inventory') or user_has_permission(
        user, 'manage_inventory'
    )


def user_can_manage_inventory(user):
    return user_has_permission(user, 'manage_inventory')


def user_can_approve_bills(user):
    return user_has_permission(user, 'edit_bills') or user_has_permission(user, 'manage_billing')


def user_can_manage_subscriptions(user):
    return user_has_permission(user, 'manage_subscriptions') or user_has_permission(
        user, 'view_subscriptions'
    )


def user_can_view_all_notifications(user):
    return user_has_permission(user, 'manage_notifications')


def user_can_access_all_branches(user):
    return user_has_permission(user, 'manage_branches') or user.role == 'super-admin' or getattr(
        user, 'is_superuser', False
    )


def user_can_manage_hr(user):
    return user_has_permission(user, 'manage_hr') or user_has_permission(user, 'view_hr')


def filter_workorders_for_user(queryset, user):
    """
    Scope work-order querysets: full branch access vs assigned-only.
    Call after branch filtering for staff users.
    """
    if not user or not user.is_authenticated:
        return queryset.none()

    if user_has_permission(user, 'view_workorders'):
        return queryset

    if user_has_permission(user, 'view_own_workorders'):
        return queryset.filter(
            Q(primary_technician=user)
            | Q(assigned_technicians=user)
            | Q(service_coordinator=user)
            | Q(created_by=user)
        ).distinct()

    return queryset.none()


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
