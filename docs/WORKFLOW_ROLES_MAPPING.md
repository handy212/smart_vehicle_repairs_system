# Workflow Roles Mapping

This document maps the roles mentioned in the workflow (`frontend/workflow.md`) to the system roles defined in the application.

## Workflow Roles → System Roles

| Workflow Role | System Role Code | System Role Name | Status | Priority |
|--------------|------------------|------------------|--------|----------|
| 🚗 **Front Desk Supervisor** | `receptionist` | Receptionist | ✅ Created | 60 |
| 👨‍🔧 **Service Coordinator** | `service_coordinator` | ServiceCoordinator | ✅ Created | 70 |
| 🔧 **Mechanic** | `technician` | Technician | ✅ Created | 40 |
| 📦 **Parts / Stores** | `parts_manager` | PartsManager | ✅ Created | 50 |
| 💰 **Accountants** | `accountant` | Accountant | ✅ Created | 45 |

## Role Permissions Summary

### Receptionist (Front Desk Supervisor)
- Create appointments
- Manage customers
- Manage vehicles
- Create work orders
- View work orders
- Create invoices
- Process payments

### ServiceCoordinator
- Manage work orders (full access)
- Create work orders
- View work orders
- Update work order status
- Add work order notes
- Manage appointments
- Manage customers
- Manage vehicles
- View reports
- Approve estimates
- Create inspections
- View vehicle history
- Request parts

### Technician (Mechanic)
- View work orders
- Update work order status
- Add work order notes
- Create inspections
- View vehicle history
- Request parts
- Clock work time

### PartsManager (Parts / Stores)
- Manage inventory
- Manage suppliers
- Create purchase orders
- Receive parts
- Approve part requests
- View inventory reports

### Accountant
- Manage billing (full access)
- Create invoices
- Process payments
- View all reports
- View work orders (to review before invoicing)
- View reports

### Manager
- View reports and all reports
- View branch data (from assigned branches)
- Manage branch staff
- Manage appointments
- Manage customers
- Manage vehicles
- Manage work orders (full access)
- Create work orders
- Update work order status
- Add work order notes
- Approve estimates
- Manage inventory
- View inventory reports
- Manage billing
- Create invoices
- Process payments
- Manage technicians
- Create inspections
- View vehicle history

## Additional System Roles

The system also includes these roles that are not explicitly mentioned in the workflow:

| Role Code | Role Name | Priority | Description |
|-----------|-----------|----------|-------------|
| `admin` | Admin | 100 | Full system access |
| `manager` | Manager | 85 | Manager - manages branch operations, staff, and administration across assigned branches |
| `customer` | Customer | 10 | Customer portal access |

## Role Priority

Roles are ordered by priority (higher number = higher priority):
1. Admin (100)
2. Manager (85) - Manager (can manage multiple branches)
3. ServiceCoordinator (70)
4. Receptionist (60)
5. PartsManager (50)
6. Accountant (45)
7. Technician (40)
8. Customer (10)

## Verification

All workflow roles have been created and are available in the system. You can verify by running:

```bash
python manage.py shell -c "from apps.accounts.permission_models import Role; roles = Role.objects.all().order_by('-priority'); [print(f'{r.code}: {r.name} - {r.description}') for r in roles]"
```

## Notes

- The `service_coordinator` and `accountant` roles were added to match the workflow requirements
- **Manager** role: Consolidated role that combines operational and administrative management
  - Can be assigned to multiple branches via `managed_branches` relationship
  - Has full permissions for work orders, billing, staff management, and branch operations
  - Sees data from all assigned branches
- All roles are system roles (cannot be deleted)
- Permissions are assigned to roles and can be managed through the admin interface
- Users can be assigned roles through the User model's `role` field
- Managers can access multiple branches through the `managed_branches` relationship

