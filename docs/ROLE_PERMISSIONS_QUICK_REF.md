# 🎯 Role & Permissions Quick Reference

## Access
**URL**: `http://localhost:8000/admin-panel/roles/`  
**Required**: Admin role

---

## Quick Actions

### Create a New Role (30 seconds)
```
1. Click "Create Role"
2. Name: "Your Role Name"
3. Code: "your_role_code"
4. Priority: 50 (0-100, higher = more access)
5. Check desired permissions
6. Click "Create Role"
```

### Edit Role Permissions (15 seconds)
```
1. Find role card
2. Click "Edit"
3. Check/uncheck permissions
4. Click "Save Changes"
```

### Delete Custom Role (10 seconds)
```
1. Find role (not marked with 🔒)
2. Click "Delete"
3. Confirm
```

### Create Custom Permission (20 seconds)
```
1. Click "Create Permission"
2. Name: "Permission Name"
3. Code: "permission_code"
4. Category: Select from dropdown
5. Click "Create Permission"
```

---

## Current System State

**Total Roles**: 6
- Admin (100) - 11 permissions
- Manager (80) - 9 permissions
- Receptionist (60) - 7 permissions
- Parts Manager (50) - 6 permissions
- Technician (40) - 7 permissions
- Customer (10) - 6 permissions

**Total Permissions**: 35  
**Categories**: 10

---

## Permission Categories

1. **User Management** (2)
   - Manage Users
   - Manage Technicians

2. **Customer Management** (1)
   - Manage Customers

3. **Vehicle Management** (6)
   - Manage Vehicles
   - Manage Inspections
   - Create Inspections
   - View Own Vehicles
   - View Vehicle History
   - View Service History

4. **Appointments** (3)
   - Manage Appointments
   - Create Appointments
   - View Own Appointments

5. **Work Orders** (7)
   - Manage Work Orders
   - Create Work Orders
   - View Work Orders
   - View Own Work Orders
   - Update Work Order Status
   - Add Work Order Notes
   - Clock Work Time

6. **Inventory** (6)
   - Manage Inventory
   - Manage Suppliers
   - Create Purchase Orders
   - Receive Parts
   - Approve Part Requests
   - Request Parts

7. **Billing & Payments** (5)
   - Manage Billing
   - Create Invoices
   - View Own Invoices
   - Process Payments
   - Approve Estimates

8. **Reports** (3)
   - View All Reports
   - View Reports
   - View Inventory Reports

9. **Settings** (1)
   - Manage Settings

10. **System Administration** (1)
    - Manage Branches

---

## UI Tabs

### 1. Roles Tab
- Card view of all roles
- Edit/Delete buttons
- Permission counts
- User counts
- System role indicator (🔒)

### 2. Permissions Tab
- Grouped by category
- Shows code and description
- Delete button for custom permissions
- System permission indicator (🔒)

### 3. Permission Matrix
- Table: Permissions × Roles
- ✓ = Has permission
- ✗ = No permission
- Easy visual comparison

---

## Common Tasks

### Give All Managers Report Access
```
1. Go to Roles tab
2. Click "Edit" on Manager role
3. Scroll to Reports category
4. Check "View All Reports"
5. Save
```

### Create New Department Role
```
Example: "Service Advisor"

1. Create Role:
   - Name: Service Advisor
   - Code: service_advisor
   - Priority: 65
   
2. Assign Permissions:
   ☑ Create Appointments
   ☑ Manage Customers
   ☑ View Work Orders
   ☑ Create Invoices
   ☑ Manage Vehicles
   
3. Assign users to this role in User Management
```

### Remove Permission from Role
```
1. Edit role
2. Uncheck unwanted permission
3. Save
4. All users with that role lose the permission
```

---

## Rules & Restrictions

### Cannot Delete:
- ❌ System roles (marked with 🔒)
- ❌ System permissions (marked with 🔒)
- ❌ Roles with assigned users
  - Solution: Reassign users first

### Can Delete:
- ✅ Custom roles (no 🔒 icon)
- ✅ Custom permissions (no 🔒 icon)
- ✅ Unused roles

### Can Edit:
- ✅ All roles (including system)
- ✅ Role name, priority, status
- ✅ Permission assignments

---

## Priority Guidelines

| Priority | Use For | Example |
|----------|---------|---------|
| 90-100 | System administrators | Admin |
| 70-89 | Management | Manager, Fleet Manager |
| 50-69 | Supervisors/leads | Receptionist Lead, Shop Foreman |
| 30-49 | Staff members | Technician, Parts Manager |
| 10-29 | Limited access | Customer, Vendor |

---

## Testing Checklist

After creating/editing a role:

- [ ] Role appears in Roles tab
- [ ] Permission count is correct
- [ ] User count shows assigned users
- [ ] Can assign role to user
- [ ] Permission matrix shows checkmarks correctly
- [ ] Audit log records the change

---

## Keyboard Shortcuts

None currently - all actions via clicks

---

## Tips & Tricks

💡 **Tip 1**: Use descriptive role codes  
Good: `service_advisor`  
Bad: `sa1`

💡 **Tip 2**: Set appropriate priorities  
Higher priority = more important role

💡 **Tip 3**: Group related permissions  
Don't scatter permissions across categories

💡 **Tip 4**: Document custom roles  
Use the description field!

💡 **Tip 5**: Test in development first  
Don't experiment with permissions in production

💡 **Tip 6**: Check audit log  
All changes are tracked

---

## Emergency Procedures

### Locked Out of Admin
```bash
# Via Django shell
./venv/bin/python manage.py shell

from apps.accounts.models import User
user = User.objects.get(email='your@email.com')
user.role = 'admin'
user.is_superuser = True
user.save()
```

### Reset All Permissions
```bash
# Re-run initialization
./venv/bin/python manage.py init_permissions
```

### Backup Roles/Permissions
```bash
./venv/bin/python manage.py dumpdata accounts.Permission accounts.Role > backup.json
```

### Restore from Backup
```bash
./venv/bin/python manage.py loaddata backup.json
```

---

## Related Pages

- **User Management**: Assign roles to users
- **Audit Log**: See all permission changes
- **System Settings**: Configure system-wide settings

---

## Support Commands

```bash
# Test roles/permissions
./venv/bin/python test_role_permissions.py

# Initialize permissions
./venv/bin/python manage.py init_permissions

# View all roles
./venv/bin/python manage.py shell
>>> from apps.accounts.permission_models import Role
>>> for r in Role.objects.all():
...     print(f"{r.name}: {r.permissions.count()} permissions")
```

---

## Quick Stats

Run this to see current state:
```bash
./venv/bin/python test_role_permissions.py
```

Shows:
- Total permissions
- Total roles
- Permissions by category
- Users per role
- Permission matrix sample
- URL verification

---

That's it! You now have full control over roles and permissions! 🎉
