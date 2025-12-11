# Permissions System Guide

## Overview

The Smart Vehicle Repairs System uses a comprehensive role-based permission system with 150+ granular permissions across 14 categories. This guide explains how to use the permission system in your code.

## Permission Categories

1. **Users** - User management, roles, permissions, audit logs
2. **Customers** - Customer management and portal access
3. **Vehicles** - Vehicle registration and history
4. **Appointments** - Appointment scheduling and management
5. **Work Orders** - Work order creation and management
6. **Diagnosis** - Diagnostic tests and recommendations
7. **Inspections** - Vehicle inspections and templates
8. **Inventory** - Parts, suppliers, purchase orders
9. **Billing** - Invoices, estimates, payments
10. **Reports** - Various reporting capabilities
11. **Documents** - Document upload and sharing
12. **Notifications** - Notification and email template management
13. **Settings** - System configuration
14. **System** - Branches, backups, API keys

## Using Permissions in Views

### Django REST Framework Viewsets

#### Basic Permission Check

```python
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import HasPermission

class CustomerViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasPermission('view_customers')]
    
    def create(self, request, *args, **kwargs):
        # Automatically checked: user must have 'view_customers'
        return super().create(request, *args, **kwargs)
```

#### Different Permissions for Different Actions

```python
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import HasPermission

class WorkOrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), HasPermission('view_workorders')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('create_workorders')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('edit_workorders')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('delete_workorders')]
        return [IsAuthenticated()]
```

#### Multiple Permissions (Any)

```python
from apps.accounts.permissions import HasAnyPermission

class VehicleViewSet(viewsets.ModelViewSet):
    permission_classes = [
        IsAuthenticated, 
        HasAnyPermission(['view_vehicles', 'view_own_vehicles'])
    ]
```

#### Multiple Permissions (All)

```python
from apps.accounts.permissions import HasAllPermissions

class InvoiceViewSet(viewsets.ModelViewSet):
    permission_classes = [
        IsAuthenticated,
        HasAllPermissions(['view_billing', 'create_invoices'])
    ]
```

### Checking Permissions in Code

#### Using the Utility Function

```python
from apps.accounts.permissions import user_has_permission

def some_view(request):
    if user_has_permission(request.user, 'create_workorders'):
        # User can create work orders
        pass
    else:
        # User cannot create work orders
        return HttpResponseForbidden()
```

#### Getting All User Permissions

```python
from apps.accounts.permissions import get_user_permissions

def check_features(request):
    user_perms = get_user_permissions(request.user)
    
    if 'export_reports' in user_perms:
        # Show export button
        pass
    
    if 'delete_customers' in user_perms:
        # Show delete button
        pass
```

#### Checking Object-Level Permissions

```python
from apps.accounts.permissions import check_object_permission

def get_work_order(request, work_order_id):
    work_order = WorkOrder.objects.get(id=work_order_id)
    
    # Check if user can view this specific work order
    if check_object_permission(request.user, 'view_workorders', work_order):
        return render(request, 'workorder_detail.html', {'work_order': work_order})
    else:
        return HttpResponseForbidden()
```

### Custom Actions

```python
from rest_framework.decorators import action
from apps.accounts.permissions import HasPermission

class WorkOrderViewSet(viewsets.ModelViewSet):
    
    @action(detail=True, methods=['post'], permission_classes=[HasPermission('print_workorders')])
    def print(self, request, pk=None):
        """Print work order - requires print_workorders permission"""
        work_order = self.get_object()
        # Print logic here
        return Response({'status': 'printed'})
    
    @action(detail=True, methods=['post'], permission_classes=[HasPermission('approve_estimates')])
    def approve_estimate(self, request, pk=None):
        """Approve estimate - requires approve_estimates permission"""
        # Approval logic here
        return Response({'status': 'approved'})
```

## Permission Naming Convention

### Standard CRUD Permissions

- `view_<resource>` - View list/details (e.g., `view_customers`)
- `create_<resource>` - Create new (e.g., `create_customers`)
- `edit_<resource>` - Edit existing (e.g., `edit_customers`)
- `delete_<resource>` - Delete (e.g., `delete_customers`)
- `manage_<resource>` - Full management (includes all CRUD operations)

### Own vs All Permissions

- `view_own_<resource>` - View only own resources (e.g., `view_own_invoices`)
- `view_<resource>` - View all resources (e.g., `view_invoices`)

### Action-Specific Permissions

- `print_<resource>` - Print documents (e.g., `print_invoices`)
- `export_<resource>` - Export data (e.g., `export_customers`)
- `import_<resource>` - Import data (e.g., `import_vehicles`)
- `approve_<resource>` - Approve items (e.g., `approve_estimates`)
- `send_<resource>` - Send items (e.g., `send_invoices`)

## Common Permission Patterns

### Filtering Querysets

```python
def get_queryset(self):
    queryset = super().get_queryset()
    user = self.request.user
    
    # If user can only view own items
    if user_has_permission(user, 'view_own_invoices') and not user_has_permission(user, 'view_invoices'):
        if hasattr(user, 'customer_profile'):
            return queryset.filter(customer=user.customer_profile)
        return queryset.none()
    
    # If user can view all
    return queryset
```

### Conditionally Showing UI Elements

```python
# In Django templates
{% if request.user|has_permission:'create_customers' %}
    <a href="{% url 'customers:create' %}">Create Customer</a>
{% endif %}

{% if request.user|has_permission:'export_reports' %}
    <button onclick="exportReport()">Export</button>
{% endif %}
```

### Frontend Permission Checks

```typescript
// In React/Next.js
import { useAuth } from '@/lib/hooks/useAuth';

function CustomerList() {
  const { user } = useAuth();
  const canCreate = user?.permissions?.includes('create_customers');
  const canExport = user?.permissions?.includes('export_customers');
  
  return (
    <div>
      {canCreate && <Button>Create Customer</Button>}
      {canExport && <Button>Export CSV</Button>}
    </div>
  );
}
```

## Role-Based Access

### Admin
- All 142 permissions
- Full system access

### Manager
- 99 permissions
- Branch-level management
- Staff management
- Full operational access for assigned branches

### Service Coordinator
- 51 permissions
- Work order management
- Customer/vehicle management
- Appointment coordination

### Receptionist
- 29 permissions
- Appointment scheduling
- Customer registration
- Invoice creation
- Payment processing

### Technician
- 28 permissions
- View/edit assigned work orders
- Perform diagnostics
- Perform inspections
- Clock work time

### Parts Manager
- 23 permissions
- Full inventory management
- Supplier management
- Purchase order management

### Accountant
- 28 permissions
- Full billing management
- Financial reports
- Payment processing and refunds

### Customer
- 12 permissions
- View own data only
- Create appointments
- Edit own profile

## Testing Permissions

```python
from django.test import TestCase
from apps.accounts.permissions import user_has_permission
from apps.accounts.models import User

class PermissionTestCase(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username='manager',
            email='manager@test.com',
            role='manager'
        )
    
    def test_manager_can_view_workorders(self):
        self.assertTrue(user_has_permission(self.manager, 'view_workorders'))
    
    def test_manager_cannot_delete_users(self):
        self.assertFalse(user_has_permission(self.manager, 'delete_users'))
```

## Best Practices

1. **Always check permissions** - Don't assume users have access
2. **Use granular permissions** - Check specific actions, not just 'manage_*'
3. **Handle 'own' permissions** - Check both general and 'own' variants
4. **Filter querysets** - Respect permission boundaries in data access
5. **UI conditional rendering** - Hide/disable features users can't access
6. **Document permission requirements** - Comment code with required permissions

## Migration from Old System

If you're migrating from role-only checks:

**Before:**
```python
if user.role == 'admin':
    # Allow access
```

**After:**
```python
if user_has_permission(user, 'manage_users'):
    # Allow access
```

This allows:
- More granular control
- Easy permission changes without code changes
- Custom roles with specific permission sets
- User-specific permission overrides

## Troubleshooting

### Permission not working?
1. Check if permission exists: `Permission.objects.filter(code='permission_code')`
2. Check if role has permission: `role.has_permission('permission_code')`
3. Check user's role: `user.role`
4. Check for permission overrides: `UserPermissionOverride.objects.filter(user=user)`

### User has permission but still denied?
1. Verify `IsAuthenticated` is in permission_classes
2. Check if permission code matches exactly (case-sensitive)
3. Check if role is active: `role.is_active`
4. Check if permission is active: `permission.is_active`


