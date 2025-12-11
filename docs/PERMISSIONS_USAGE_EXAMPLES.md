# Permission System Usage Examples

## Backend Examples

### Basic ViewSet with Permissions

```python
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import HasPermission, user_has_permission

class CustomerViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), HasPermission('view_customers')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('create_customers')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('edit_customers')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('delete_customers')]
        return [IsAuthenticated()]
    
    def get_queryset(self):
        """Filter queryset based on permissions"""
        queryset = super().get_queryset()
        user = self.request.user
        
        # If user can only view own, filter accordingly
        if user_has_permission(user, 'view_own_customers') and \
           not user_has_permission(user, 'view_customers'):
            if hasattr(user, 'customer_profile'):
                queryset = queryset.filter(id=user.customer_profile.id)
            else:
                queryset = queryset.none()
        
        return queryset
```

### Custom Action with Permission

```python
@action(detail=True, methods=['post'], 
        permission_classes=[HasPermission('print_workorders')])
def print(self, request, pk=None):
    """Print work order - requires print_workorders permission"""
    work_order = self.get_object()
    # Print logic here
    return Response({'status': 'printed'})
```

### Permission Check in Code

```python
from apps.accounts.permissions import user_has_permission

def some_view_function(request):
    if user_has_permission(request.user, 'export_reports'):
        # Allow export
        return export_data()
    else:
        return Response({'error': 'Permission denied'}, status=403)
```

## Frontend Examples

### Using the usePermissions Hook

```tsx
import { usePermissions } from "@/lib/hooks/usePermissions";

function CustomerList() {
  const { hasPermission, can } = usePermissions();
  
  return (
    <div>
      {hasPermission("create_customers") && (
        <Button onClick={handleCreate}>Create Customer</Button>
      )}
      
      {can("edit", "customers") && (
        <Button onClick={handleEdit}>Edit</Button>
      )}
    </div>
  );
}
```

### Using PermissionGuard Component

```tsx
import { PermissionGuard } from "@/components/auth/PermissionGuard";

function CustomerActions() {
  return (
    <div>
      <PermissionGuard permission="create_customers">
        <Button onClick={handleCreate}>Create Customer</Button>
      </PermissionGuard>
      
      <PermissionGuard permission="export_customers">
        <Button onClick={handleExport}>Export CSV</Button>
      </PermissionGuard>
      
      <PermissionGuard 
        permissions={["delete_customers"]}
        fallback={<p>No permission to delete</p>}
      >
        <Button onClick={handleDelete}>Delete</Button>
      </PermissionGuard>
    </div>
  );
}
```

### Using PermissionButton Component

```tsx
import { PermissionButton } from "@/components/auth/PermissionButton";

function ActionButtons() {
  return (
    <div>
      <PermissionButton 
        permission="create_customers"
        onClick={handleCreate}
        hideIfNoPermission
      >
        Create Customer
      </PermissionButton>
      
      <PermissionButton 
        permission="export_customers"
        onClick={handleExport}
        variant="outline"
      >
        Export (Disabled if no permission)
      </PermissionButton>
    </div>
  );
}
```

### Conditional Rendering Based on Multiple Permissions

```tsx
import { usePermissions } from "@/lib/hooks/usePermissions";

function ReportsPage() {
  const { hasAnyPermission, hasAllPermissions } = usePermissions();
  
  const canViewReports = hasAnyPermission([
    "view_reports",
    "view_all_reports"
  ]);
  
  const canGenerateAndExport = hasAllPermissions([
    "generate_reports",
    "export_reports"
  ]);
  
  return (
    <div>
      {canViewReports && (
        <ReportsList />
      )}
      
      {canGenerateAndExport && (
        <Button onClick={generateAndExport}>
          Generate & Export
        </Button>
      )}
    </div>
  );
}
```

### Route Protection with Permissions

```tsx
// In your page component
"use client";

import { usePermissions } from "@/lib/hooks/usePermissions";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminPage() {
  const { hasPermission } = usePermissions();
  const router = useRouter();
  
  useEffect(() => {
    if (!hasPermission("manage_settings")) {
      router.push("/dashboard");
    }
  }, [hasPermission, router]);
  
  if (!hasPermission("manage_settings")) {
    return <div>Access Denied</div>;
  }
  
  return <div>Admin Settings</div>;
}
```

### Table Actions with Permissions

```tsx
import { PermissionButton } from "@/components/auth/PermissionButton";

function CustomerTableRow({ customer }) {
  return (
    <tr>
      <td>{customer.name}</td>
      <td>
        <div className="flex gap-2">
          <PermissionButton
            permission="view_customers"
            size="sm"
            variant="outline"
            onClick={() => viewCustomer(customer.id)}
          >
            View
          </PermissionButton>
          
          <PermissionButton
            permission="edit_customers"
            size="sm"
            variant="outline"
            onClick={() => editCustomer(customer.id)}
            hideIfNoPermission
          >
            Edit
          </PermissionButton>
          
          <PermissionButton
            permission="delete_customers"
            size="sm"
            variant="destructive"
            onClick={() => deleteCustomer(customer.id)}
            hideIfNoPermission
          >
            Delete
          </PermissionButton>
        </div>
      </td>
    </tr>
  );
}
```

### Using Permission Constants

```tsx
import { PERMISSIONS } from "@/lib/utils/permissions";
import { usePermissions } from "@/lib/hooks/usePermissions";

function MyComponent() {
  const { hasPermission } = usePermissions();
  
  return (
    <div>
      {hasPermission(PERMISSIONS.CREATE_CUSTOMERS) && (
        <Button>Create</Button>
      )}
      
      {hasPermission(PERMISSIONS.EXPORT_CUSTOMERS) && (
        <Button>Export</Button>
      )}
    </div>
  );
}
```

### Checking Permissions from API Response

```tsx
import { authApi } from "@/lib/api/auth";
import { useEffect, useState } from "react";

function MyComponent() {
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    authApi.getCurrentUser().then(setUser);
  }, []);
  
  const canCreate = user?.permissions?.includes("create_customers");
  
  return (
    <div>
      {canCreate && <Button>Create</Button>}
    </div>
  );
}
```

## Common Patterns

### Hide/Show Entire Sections

```tsx
<PermissionGuard permission="view_reports">
  <div className="reports-section">
    <ReportsList />
    <ReportsFilters />
  </div>
</PermissionGuard>
```

### Disable vs Hide

```tsx
// Hide button completely
<PermissionButton 
  permission="export_data"
  hideIfNoPermission
>
  Export
</PermissionButton>

// Show but disable button
<PermissionButton permission="export_data">
  Export
</PermissionButton>
```

### Multiple Permission Requirements

```tsx
// User needs ANY of these permissions
<PermissionGuard 
  permissions={["view_reports", "view_all_reports"]}
>
  <Reports />
</PermissionGuard>

// User needs ALL of these permissions
<PermissionGuard 
  permissions={["generate_reports", "export_reports"]}
  requireAll
>
  <GenerateAndExportButton />
</PermissionGuard>
```

## Best Practices

1. **Always check permissions server-side** - Frontend checks are for UX only
2. **Use PermissionGuard for entire sections** - More readable than multiple conditionals
3. **Use PermissionButton for action buttons** - Consistent UX
4. **Prefer permission constants** - Avoid typos, easier refactoring
5. **Use "can" helper for common patterns** - e.g., `can("view", "customers")`
6. **Hide vs Disable** - Hide for actions users shouldn't know exist, disable for visible but unavailable actions


