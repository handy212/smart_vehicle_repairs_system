# Roles and Permissions Implementation - Review and Fixes

## Issues Found and Fixed

### 1. ✅ Missing Permissions
**Issue**: `view_branch_data` and `manage_branch_staff` were referenced in role definitions but not defined in `init_permissions.py`, so they were never created in the database.

**Fix**: Added both permissions to `permission_categories` in `apps/accounts/management/commands/init_permissions.py`:
- `view_branch_data`: View data from assigned branches
- `manage_branch_staff`: Manage staff at assigned branches

### 2. ✅ Branch Views Missing branch_manager Role
**Issue**: Branch views only checked for `manager` role, not `branch_manager`, causing branch managers to be excluded from branch operations.

**Fixes in `apps/branches/views.py`**:
- Updated `get_queryset()` to include `branch_manager` in role checks
- Updated `managers` action to filter for both `manager` and `branch_manager`
- Updated `assign_manager` to allow both `manager` and `branch_manager` roles
- Updated `remove_manager` to handle both `manager` and `branch_manager` roles
- Added `service_coordinator` and `accountant` to single-branch staff list

### 3. ✅ WorkOrder Model Updates
**Issue**: `created_by` field didn't allow `service_coordinator` role, even though service coordinators create work orders.

**Fix**: Updated `apps/workorders/models.py`:
- Added `service_coordinator` to `created_by` field's `limit_choices_to`

### 4. ✅ ServiceCoordinator Missing Permission
**Issue**: Service coordinators coordinate with parts department but didn't have permission to view inventory reports.

**Fix**: Added `view_inventory_reports` permission to `ServiceCoordinator` role in `config/roles.py`

### 5. ✅ Frontend Views Updates
**Issue**: Frontend views filtering technicians didn't include `service_coordinator`.

**Fixes**:
- Updated `apps/workorders/frontend_views.py` to include `service_coordinator` in technician filters
- Updated `apps/accounts/views.py` `staff_list` to include all staff roles: `branch_manager`, `service_coordinator`, `accountant`

## Summary of Changes

### Files Modified:
1. `apps/accounts/management/commands/init_permissions.py`
   - Added `view_branch_data` and `manage_branch_staff` permissions

2. `apps/branches/views.py`
   - Updated all role checks to include `branch_manager`
   - Updated manager assignment/removal to handle both manager types

3. `apps/workorders/models.py`
   - Added `service_coordinator` to `created_by` field

4. `config/roles.py`
   - Added `view_inventory_reports` to `ServiceCoordinator`

5. `apps/workorders/frontend_views.py`
   - Updated technician filters to include `service_coordinator`

6. `apps/accounts/views.py`
   - Updated staff list to include all roles

### Migrations Created:
- `apps/workorders/migrations/0007_add_service_coordinator_to_created_by.py`

### Permissions Created:
- `view_branch_data` - View data from assigned branches
- `manage_branch_staff` - Manage staff at assigned branches

## Verification

All permissions are now properly created and assigned:
- ✅ `view_branch_data` and `manage_branch_staff` exist in database
- ✅ Both `Manager` and `BranchManager` roles have these permissions
- ✅ All role checks updated to include `branch_manager` where appropriate
- ✅ Service coordinators can now create work orders and view inventory reports

## Role Hierarchy (Updated)

1. Admin (100) - Full system access
2. Manager (85) - Workshop manager (operational)
3. BranchManager (82) - Branch manager (administration) ✅ Now properly integrated
4. ServiceCoordinator (70) - Work order coordination ✅ Now has inventory reports
5. Receptionist (60) - Front desk staff
6. PartsManager (50) - Inventory management
7. Accountant (45) - Billing and finance
8. Technician (40) - Workshop mechanics
9. Customer (10) - Customer portal

## Next Steps

1. Run migrations: `python manage.py migrate`
2. Verify permissions: `python manage.py init_permissions` (already run)
3. Test branch access with `branch_manager` role
4. Test work order creation with `service_coordinator` role

