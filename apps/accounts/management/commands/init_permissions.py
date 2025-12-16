"""
Initialize permissions and roles from config/roles.py
Comprehensive permission system covering all modules and operations
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.accounts.permission_models import Permission, Role
from config import roles as config_roles


class Command(BaseCommand):
    help = 'Initialize permissions and roles from config/roles.py'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Initializing comprehensive permissions and roles...'))
        
        with transaction.atomic():
            # Comprehensive permission definitions covering all modules and operations
            # Format: 'code': ('category', 'Display Name', 'Description')
            permission_categories = {
                # ==================== USER MANAGEMENT ====================
                'view_users': ('users', 'View Users', 'View user accounts'),
                'create_users': ('users', 'Create Users', 'Create new user accounts'),
                'edit_users': ('users', 'Edit Users', 'Edit existing user accounts'),
                'delete_users': ('users', 'Delete Users', 'Delete user accounts'),
                'manage_users': ('users', 'Manage Users', 'Full user management (create, edit, delete)'),
                'manage_roles': ('users', 'Manage Roles', 'Create, edit, and assign roles'),
                'manage_permissions': ('users', 'Manage Permissions', 'Manage system permissions'),
                'manage_technicians': ('users', 'Manage Technicians', 'Manage technician assignments and schedules'),
                'manage_branch_staff': ('users', 'Manage Branch Staff', 'Manage staff at assigned branches'),
                'reset_user_passwords': ('users', 'Reset User Passwords', 'Reset passwords for user accounts'),
                'view_audit_logs': ('users', 'View Audit Logs', 'View system audit logs and activity history'),
                
                # ==================== CUSTOMER MANAGEMENT ====================
                'view_customers': ('customers', 'View Customers', 'View customer information'),
                'create_customers': ('customers', 'Create Customers', 'Create new customer accounts'),
                'edit_customers': ('customers', 'Edit Customers', 'Edit customer information'),
                'delete_customers': ('customers', 'Delete Customers', 'Delete customer accounts'),
                'manage_customers': ('customers', 'Manage Customers', 'Full customer management'),
                'grant_customer_portal_access': ('customers', 'Grant Portal Access', 'Grant customer portal access'),
                'revoke_customer_portal_access': ('customers', 'Revoke Portal Access', 'Revoke customer portal access'),
                'view_own_profile': ('customers', 'View Own Profile', 'View own profile information'),
                'edit_own_profile': ('customers', 'Edit Own Profile', 'Edit own profile information'),
                'change_own_password': ('customers', 'Change Own Password', 'Change own password'),
                
                # ==================== VEHICLE MANAGEMENT ====================
                'view_vehicles': ('vehicles', 'View Vehicles', 'View vehicle information'),
                'create_vehicles': ('vehicles', 'Create Vehicles', 'Register new vehicles'),
                'edit_vehicles': ('vehicles', 'Edit Vehicles', 'Edit vehicle information'),
                'delete_vehicles': ('vehicles', 'Delete Vehicles', 'Delete vehicle records'),
                'manage_vehicles': ('vehicles', 'Manage Vehicles', 'Full vehicle management'),
                'view_own_vehicles': ('vehicles', 'View Own Vehicles', 'View own vehicles only'),
                'view_vehicle_history': ('vehicles', 'View Vehicle History', 'View vehicle service history'),
                'view_service_history': ('vehicles', 'View Service History', 'View complete service history'),
                'export_vehicles': ('vehicles', 'Export Vehicles', 'Export vehicle data to CSV/Excel'),
                'import_vehicles': ('vehicles', 'Import Vehicles', 'Import vehicles from CSV/Excel'),
                
                # ==================== APPOINTMENTS ====================
                'view_appointments': ('appointments', 'View Appointments', 'View appointment schedules'),
                'create_appointments': ('appointments', 'Create Appointments', 'Create new appointments'),
                'edit_appointments': ('appointments', 'Edit Appointments', 'Edit appointment details'),
                'delete_appointments': ('appointments', 'Delete Appointments', 'Cancel/delete appointments'),
                'manage_appointments': ('appointments', 'Manage Appointments', 'Full appointment management'),
                'view_own_appointments': ('appointments', 'View Own Appointments', 'View own appointments only'),
                'confirm_appointments': ('appointments', 'Confirm Appointments', 'Confirm appointment bookings'),
                'reschedule_appointments': ('appointments', 'Reschedule Appointments', 'Reschedule appointments'),
                'send_appointment_reminders': ('appointments', 'Send Reminders', 'Send appointment reminders to customers'),
                'view_appointment_calendar': ('appointments', 'View Calendar', 'View appointment calendar view'),
                'export_appointments': ('appointments', 'Export Appointments', 'Export appointment data'),
                
                # ==================== WORK ORDERS ====================
                'view_workorders': ('workorders', 'View Work Orders', 'View work order information'),
                'create_workorders': ('workorders', 'Create Work Orders', 'Create new work orders'),
                'edit_workorders': ('workorders', 'Edit Work Orders', 'Edit work order details'),
                'delete_workorders': ('workorders', 'Delete Work Orders', 'Delete work orders'),
                'manage_workorders': ('workorders', 'Manage Work Orders', 'Full work order management'),
                'view_own_workorders': ('workorders', 'View Own Work Orders', 'View own assigned work orders'),
                'update_workorder_status': ('workorders', 'Update Status', 'Change work order status'),
                'assign_workorders': ('workorders', 'Assign Work Orders', 'Assign work orders to technicians'),
                'add_workorder_notes': ('workorders', 'Add Notes', 'Add notes and comments to work orders'),
                'edit_workorder_notes': ('workorders', 'Edit Notes', 'Edit work order notes'),
                'view_workorder_history': ('workorders', 'View History', 'View work order history and changes'),
                'clock_work_time': ('workorders', 'Clock Work Time', 'Track and log work hours on work orders'),
                'print_workorders': ('workorders', 'Print Work Orders', 'Print work order job cards'),
                'export_workorders': ('workorders', 'Export Work Orders', 'Export work order data'),
                
                # ==================== DIAGNOSIS ====================
                'view_diagnosis': ('diagnosis', 'View Diagnosis', 'View diagnostic records'),
                'create_diagnosis': ('diagnosis', 'Create Diagnosis', 'Create new diagnostic records'),
                'edit_diagnosis': ('diagnosis', 'Edit Diagnosis', 'Edit diagnostic information'),
                'delete_diagnosis': ('diagnosis', 'Delete Diagnosis', 'Delete diagnostic records'),
                'manage_diagnosis': ('diagnosis', 'Manage Diagnosis', 'Full diagnosis management'),
                'perform_diagnostic_tests': ('diagnosis', 'Perform Tests', 'Perform diagnostic tests'),
                'add_diagnostic_findings': ('diagnosis', 'Add Findings', 'Add diagnostic findings'),
                'add_repair_recommendations': ('diagnosis', 'Add Recommendations', 'Add repair recommendations'),
                'view_diagnostic_codes': ('diagnosis', 'View Codes', 'View diagnostic code library'),
                'manage_diagnostic_codes': ('diagnosis', 'Manage Codes', 'Manage diagnostic code library'),
                'export_diagnosis': ('diagnosis', 'Export Diagnosis', 'Export diagnosis data'),
                
                # ==================== INSPECTIONS ====================
                'view_inspections': ('inspections', 'View Inspections', 'View vehicle inspection records'),
                'create_inspections': ('inspections', 'Create Inspections', 'Create new vehicle inspections'),
                'edit_inspections': ('inspections', 'Edit Inspections', 'Edit inspection records'),
                'delete_inspections': ('inspections', 'Delete Inspections', 'Delete inspection records'),
                'manage_inspections': ('inspections', 'Manage Inspections', 'Full inspection management'),
                'perform_inspections': ('inspections', 'Perform Inspections', 'Perform vehicle inspections'),
                'approve_inspections': ('inspections', 'Approve Inspections', 'Approve inspection results'),
                'view_inspection_templates': ('inspections', 'View Templates', 'View inspection templates'),
                'manage_inspection_templates': ('inspections', 'Manage Templates', 'Create and manage inspection templates'),
                'export_inspections': ('inspections', 'Export Inspections', 'Export inspection data'),
                'print_inspection_reports': ('inspections', 'Print Reports', 'Print inspection reports'),
                
                # ==================== INVENTORY ====================
                'view_inventory': ('inventory', 'View Inventory', 'View inventory and parts'),
                'create_parts': ('inventory', 'Create Parts', 'Add new parts to inventory'),
                'edit_parts': ('inventory', 'Edit Parts', 'Edit part information'),
                'delete_parts': ('inventory', 'Delete Parts', 'Remove parts from inventory'),
                'manage_inventory': ('inventory', 'Manage Inventory', 'Full inventory management'),
                'view_inventory_reports': ('reports', 'View Inventory Reports', 'View inventory reports and analytics'),
                'adjust_inventory': ('inventory', 'Adjust Inventory', 'Adjust inventory quantities'),
                'transfer_inventory': ('inventory', 'Transfer Inventory', 'Transfer parts between locations'),
                'view_low_stock_alerts': ('inventory', 'View Low Stock', 'View low stock alerts'),
                'manage_categories': ('inventory', 'Manage Categories', 'Manage part categories'),
                'manage_suppliers': ('inventory', 'Manage Suppliers', 'Manage supplier information'),
                'view_suppliers': ('inventory', 'View Suppliers', 'View supplier information'),
                'create_purchase_orders': ('inventory', 'Create Purchase Orders', 'Create purchase orders'),
                'edit_purchase_orders': ('inventory', 'Edit Purchase Orders', 'Edit purchase orders'),
                'approve_purchase_orders': ('inventory', 'Approve Purchase Orders', 'Approve purchase orders'),
                'receive_parts': ('inventory', 'Receive Parts', 'Receive and stock parts from suppliers'),
                'request_parts': ('inventory', 'Request Parts', 'Request parts from inventory'),
                'approve_part_requests': ('inventory', 'Approve Part Requests', 'Approve technician part requests'),
                'export_inventory': ('inventory', 'Export Inventory', 'Export inventory data'),
                'import_inventory': ('inventory', 'Import Inventory', 'Import inventory from CSV/Excel'),
                
                # ==================== BILLING & PAYMENTS ====================
                'view_billing': ('billing', 'View Billing', 'View billing and invoice information'),
                'view_subscriptions': ('subscriptions', 'View Subscriptions', 'View customer subscriptions'),
                'manage_subscriptions': ('subscriptions', 'Manage Subscriptions', 'Create, edit, and manage subscription packages'),
                'create_subscriptions': ('subscriptions', 'Create Subscriptions', 'Create new subscriptions for customers'),
                'cancel_subscriptions': ('subscriptions', 'Cancel Subscriptions', 'Cancel customer subscriptions'),
                'record_usage': ('subscriptions', 'Record Usage', 'Record subscription usage/consumption'),
                'create_invoices': ('billing', 'Create Invoices', 'Create customer invoices'),
                'edit_invoices': ('billing', 'Edit Invoices', 'Edit invoice details'),
                'delete_invoices': ('billing', 'Delete Invoices', 'Delete or void invoices'),
                'manage_billing': ('billing', 'Manage Billing', 'Full billing management'),
                'view_own_invoices': ('billing', 'View Own Invoices', 'View own invoices only'),
                'process_payments': ('billing', 'Process Payments', 'Process customer payments'),
                'refund_payments': ('billing', 'Refund Payments', 'Process payment refunds'),
                'create_estimates': ('billing', 'Create Estimates', 'Create repair estimates'),
                'edit_estimates': ('billing', 'Edit Estimates', 'Edit estimate details'),
                'approve_estimates': ('billing', 'Approve Estimates', 'Approve repair estimates'),
                'reject_estimates': ('billing', 'Reject Estimates', 'Reject estimates'),
                'convert_estimate_to_invoice': ('billing', 'Convert to Invoice', 'Convert estimate to invoice'),
                'print_invoices': ('billing', 'Print Invoices', 'Print invoice documents'),
                'print_estimates': ('billing', 'Print Estimates', 'Print estimate documents'),
                'send_invoices': ('billing', 'Send Invoices', 'Send invoices to customers via email'),
                'send_estimates': ('billing', 'Send Estimates', 'Send estimates to customers'),
                'view_payment_history': ('billing', 'View Payment History', 'View payment transaction history'),
                'export_billing': ('billing', 'Export Billing', 'Export billing and invoice data'),
                
                # ==================== REPORTS ====================
                'view_reports': ('reports', 'View Reports', 'View assigned reports'),
                'view_all_reports': ('reports', 'View All Reports', 'Access all system reports'),
                'generate_reports': ('reports', 'Generate Reports', 'Generate custom reports'),
                'export_reports': ('reports', 'Export Reports', 'Export reports to various formats'),
                'view_sales_reports': ('reports', 'View Sales Reports', 'View sales and revenue reports'),
                'view_service_reports': ('reports', 'View Service Reports', 'View service performance reports'),
                'view_technician_reports': ('reports', 'View Technician Reports', 'View technician performance reports'),
                'view_customer_reports': ('reports', 'View Customer Reports', 'View customer analytics reports'),
                'view_financial_reports': ('reports', 'View Financial Reports', 'View financial reports and statements'),
                
                # ==================== DOCUMENTS ====================
                'view_documents': ('documents', 'View Documents', 'View document files'),
                'upload_documents': ('documents', 'Upload Documents', 'Upload document files'),
                'edit_documents': ('documents', 'Edit Documents', 'Edit document information'),
                'delete_documents': ('documents', 'Delete Documents', 'Delete document files'),
                'manage_documents': ('documents', 'Manage Documents', 'Full document management'),
                'download_documents': ('documents', 'Download Documents', 'Download document files'),
                'share_documents': ('documents', 'Share Documents', 'Share documents with others'),
                'manage_document_categories': ('documents', 'Manage Document Categories', 'Manage document categories'),
                'view_own_documents': ('documents', 'View Own Documents', 'View own uploaded documents'),
                
                # ==================== NOTIFICATIONS ====================
                'view_notifications': ('notifications', 'View Notifications', 'View notifications'),
                'manage_notifications': ('notifications', 'Manage Notifications', 'Full notification management'),
                'send_notifications': ('notifications', 'Send Notifications', 'Send notifications to users'),
                'manage_notification_templates': ('notifications', 'Manage Templates', 'Manage notification templates'),
                'manage_email_templates': ('notifications', 'Manage Email Templates', 'Manage email notification templates'),
                
                # ==================== SETTINGS ====================
                'view_settings': ('settings', 'View Settings', 'View system settings'),
                'manage_settings': ('settings', 'Manage Settings', 'Configure system settings'),
                'manage_email_settings': ('settings', 'Manage Email Settings', 'Configure email server settings'),
                'manage_integrations': ('settings', 'Manage Integrations', 'Manage third-party integrations'),
                
                # ==================== SYSTEM ADMINISTRATION ====================
                'manage_branches': ('system', 'Manage Branches', 'Create and manage branches'),
                'view_branches': ('system', 'View Branches', 'View branch information'),
                'view_branch_data': ('system', 'View Branch Data', 'View data from assigned branches'),
                'manage_backups': ('system', 'Manage Backups', 'Create and restore system backups'),
                'view_system_status': ('system', 'View System Status', 'View system health and status'),
                'manage_api_keys': ('system', 'Manage API Keys', 'Manage API keys and integrations'),
            }
            
            # Create all permissions
            created_count = 0
            updated_count = 0
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
                    created_count += 1
                else:
                    updated_count += 1
            
            self.stdout.write(f'\n📊 Permission Summary: {created_count} created, {updated_count} updated\n')
            
            # Collect all permissions into a dictionary for role assignment
            all_permissions = {
                code: Permission.objects.get(code=code)
                for code in permission_categories.keys()
            }
            
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
        self.stdout.write(self.style.SUCCESS(f'   - Total permissions: {len(permission_categories)}'))
        self.stdout.write(self.style.SUCCESS(f'   - Created/updated {len(role_classes)} roles'))
