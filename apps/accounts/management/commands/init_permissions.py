"""
Initialize permissions and roles from config/roles.py
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.accounts.permission_models import Permission, Role
from config import roles as config_roles


class Command(BaseCommand):
    help = 'Initialize permissions and roles from config/roles.py'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Initializing permissions and roles...'))
        
        with transaction.atomic():
            # Define all permissions across all roles
            all_permissions = {}
            
            # Collect all unique permissions from all role classes
            role_classes = [
                (config_roles.Admin, 'admin', 100, 'Full system access'),
                (config_roles.Manager, 'manager', 85, 'Manager - manages branch operations, staff, and administration across assigned branches'),
                (config_roles.ServiceCoordinator, 'service_coordinator', 70, 'Service Coordinator - manages work orders, coordinates between departments'),
                (config_roles.Receptionist, 'receptionist', 60, 'Front desk staff'),
                (config_roles.PartsManager, 'parts_manager', 50, 'Inventory/Parts management'),
                (config_roles.Accountant, 'accountant', 45, 'Accountant - handles billing, invoicing, and financial reconciliation'),
                (config_roles.Technician, 'technician', 40, 'Workshop mechanics/technicians'),
                (config_roles.Customer, 'customer', 10, 'Customer portal access'),
            ]
            
            # Categorize permissions
            permission_categories = {
                'manage_users': ('users', 'Manage Users', 'Create, edit, and delete user accounts'),
                'manage_settings': ('settings', 'Manage Settings', 'Configure system settings'),
                'view_all_reports': ('reports', 'View All Reports', 'Access all system reports'),
                'view_reports': ('reports', 'View Reports', 'View assigned reports'),
                'manage_branches': ('system', 'Manage Branches', 'Create and manage branches'),
                'manage_inventory': ('inventory', 'Manage Inventory', 'Full inventory management'),
                'manage_billing': ('billing', 'Manage Billing', 'Full billing and payment management'),
                'manage_appointments': ('appointments', 'Manage Appointments', 'Full appointment management'),
                'create_appointments': ('appointments', 'Create Appointments', 'Create new appointments'),
                'view_own_appointments': ('appointments', 'View Own Appointments', 'View own appointments only'),
                'manage_workorders': ('workorders', 'Manage Work Orders', 'Full work order management'),
                'create_workorders': ('workorders', 'Create Work Orders', 'Create new work orders'),
                'view_workorders': ('workorders', 'View Work Orders', 'View work orders'),
                'view_own_workorders': ('workorders', 'View Own Work Orders', 'View own work orders only'),
                'update_workorder_status': ('workorders', 'Update Work Order Status', 'Change work order status'),
                'add_workorder_notes': ('workorders', 'Add Work Order Notes', 'Add notes to work orders'),
                'manage_customers': ('customers', 'Manage Customers', 'Full customer management'),
                'manage_vehicles': ('vehicles', 'Manage Vehicles', 'Full vehicle management'),
                'view_own_vehicles': ('vehicles', 'View Own Vehicles', 'View own vehicles only'),
                'manage_inspections': ('vehicles', 'Manage Inspections', 'Full inspection management'),
                'create_inspections': ('vehicles', 'Create Inspections', 'Create vehicle inspections'),
                'view_vehicle_history': ('vehicles', 'View Vehicle History', 'View vehicle service history'),
                'manage_technicians': ('users', 'Manage Technicians', 'Manage technician assignments'),
                'approve_estimates': ('billing', 'Approve Estimates', 'Approve repair estimates'),
                'create_invoices': ('billing', 'Create Invoices', 'Create customer invoices'),
                'view_own_invoices': ('billing', 'View Own Invoices', 'View own invoices only'),
                'process_payments': ('billing', 'Process Payments', 'Process customer payments'),
                'request_parts': ('inventory', 'Request Parts', 'Request parts from inventory'),
                'clock_work_time': ('workorders', 'Clock Work Time', 'Track work hours'),
                'manage_suppliers': ('inventory', 'Manage Suppliers', 'Manage supplier relationships'),
                'create_purchase_orders': ('inventory', 'Create Purchase Orders', 'Create POs for parts'),
                'receive_parts': ('inventory', 'Receive Parts', 'Receive and stock parts'),
                'approve_part_requests': ('inventory', 'Approve Part Requests', 'Approve technician part requests'),
                'view_inventory_reports': ('reports', 'View Inventory Reports', 'View inventory reports'),
                'view_service_history': ('vehicles', 'View Service History', 'View vehicle service history'),
                'edit_own_profile': ('customers', 'Edit Own Profile', 'Edit own profile information'),
                'change_own_password': ('customers', 'Change Own Password', 'Change own password'),
                'view_branch_data': ('system', 'View Branch Data', 'View data from assigned branches'),
                'manage_branch_staff': ('users', 'Manage Branch Staff', 'Manage staff at assigned branches'),
            }
            
            # Create all permissions
            for code, (category, name, description) in permission_categories.items():
                permission, created = Permission.objects.update_or_create(
                    code=code,
                    defaults={
                        'name': name,
                        'description': description,
                        'category': category,
                        'is_system': True,
                        'is_active': True,
                    }
                )
                if created:
                    self.stdout.write(f'  ✅ Created permission: {name}')
                all_permissions[code] = permission
            
            # Create roles and assign permissions
            for role_class, code, priority, description in role_classes:
                role, created = Role.objects.update_or_create(
                    code=code,
                    defaults={
                        'name': role_class.__name__,
                        'description': description,
                        'is_system': True,
                        'is_active': True,
                        'priority': priority,
                    }
                )
                
                # Assign permissions to role
                role_permissions = []
                for perm_code in role_class.available_permissions.keys():
                    if perm_code in all_permissions:
                        role_permissions.append(all_permissions[perm_code])
                
                role.permissions.set(role_permissions)
                
                if created:
                    self.stdout.write(f'  ✅ Created role: {role.name} with {len(role_permissions)} permissions')
                else:
                    self.stdout.write(f'  ♻️  Updated role: {role.name} with {len(role_permissions)} permissions')
        
        self.stdout.write(self.style.SUCCESS(f'\n✅ Initialization complete!'))
        self.stdout.write(self.style.SUCCESS(f'   - Created {len(all_permissions)} permissions'))
        self.stdout.write(self.style.SUCCESS(f'   - Created/updated {len(role_classes)} roles'))
