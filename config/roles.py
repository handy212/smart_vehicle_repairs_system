"""
Role definitions for the system
Comprehensive permission system covering all modules
"""
from rolepermissions.roles import AbstractUserRole


class Admin(AbstractUserRole):
    """Full system access - all permissions"""
    available_permissions = {
        # User Management
        'view_users': True,
        'create_users': True,
        'edit_users': True,
        'delete_users': True,
        'manage_users': True,
        'manage_roles': True,
        'manage_permissions': True,
        'manage_technicians': True,
        'manage_branch_staff': True,
        'reset_user_passwords': True,
        'view_audit_logs': True,
        'view_technicians': True,
        'manage_technician_schedules': True,
        'manage_technician_skills': True,
        'approve_time_off': True,
        'view_technician_performance': True,
        
        # Fixed Assets
        'view_assets': True,
        'create_assets': True,
        'edit_assets': True,
        'delete_assets': True,
        'manage_assets': True,
        'run_depreciation': True,
        'view_asset_maintenance': True,
        'create_asset_maintenance': True,
        
        # Customer Management
        'view_customers': True,
        'create_customers': True,
        'edit_customers': True,
        'delete_customers': True,
        'manage_customers': True,
        'grant_customer_portal_access': True,
        'revoke_customer_portal_access': True,
        
        # Vehicle Management
        'view_vehicles': True,
        'create_vehicles': True,
        'edit_vehicles': True,
        'delete_vehicles': True,
        'manage_vehicles': True,
        'view_vehicle_history': True,
        'view_service_history': True,
        'export_vehicles': True,
        'import_vehicles': True,
        
        # Roadside Assistance
        'view_roadside': True,
        'create_roadside': True,
        'edit_roadside': True,
        'manage_roadside': True,
        'dispatch_roadside': True,
        'export_roadside': True,
        
        # Appointments
        'view_appointments': True,
        'create_appointments': True,
        'edit_appointments': True,
        'delete_appointments': True,
        'manage_appointments': True,
        'confirm_appointments': True,
        'reschedule_appointments': True,
        'send_appointment_reminders': True,
        'view_appointment_calendar': True,
        'export_appointments': True,
        
        # Work Orders
        'view_workorders': True,
        'create_workorders': True,
        'edit_workorders': True,
        'delete_workorders': True,
        'manage_workorders': True,
        'update_workorder_status': True,
        'assign_workorders': True,
        'add_workorder_notes': True,
        'edit_workorder_notes': True,
        'view_workorder_history': True,
        'clock_work_time': True,
        'print_workorders': True,
        'export_workorders': True,
        
        # Gate Passes
        'view_gatepass': True,
        'create_gatepass': True,
        'change_gatepass': True,
        'delete_gatepass': True,
        'issue_gatepass': True,
        'complete_gatepass': True,
        
        # Diagnosis
        'view_diagnosis': True,
        'create_diagnosis': True,
        'edit_diagnosis': True,
        'delete_diagnosis': True,
        'manage_diagnosis': True,
        'perform_diagnostic_tests': True,
        'add_diagnostic_findings': True,
        'add_repair_recommendations': True,
        'view_diagnostic_codes': True,
        'manage_diagnostic_codes': True,
        'export_diagnosis': True,
        
        # Inspections
        'view_inspections': True,
        'create_inspections': True,
        'edit_inspections': True,
        'delete_inspections': True,
        'manage_inspections': True,
        'perform_inspections': True,
        'approve_inspections': True,
        'view_inspection_templates': True,
        'manage_inspection_templates': True,
        'export_inspections': True,
        'print_inspection_reports': True,
        
        # Inventory
        'view_inventory': True,
        'create_parts': True,
        'edit_parts': True,
        'delete_parts': True,
        'manage_inventory': True,
        'view_inventory_reports': True,
        'adjust_inventory': True,
        'transfer_inventory': True,
        'view_low_stock_alerts': True,
        'manage_categories': True,
        'manage_suppliers': True,
        'view_suppliers': True,
        'create_purchase_orders': True,
        'edit_purchase_orders': True,
        'approve_purchase_orders': True,
        'receive_parts': True,
        'request_parts': True,
        'approve_part_requests': True,
        'export_inventory': True,
        'import_inventory': True,
        
        # Billing
        'view_billing': True,
        'create_invoices': True,
        'edit_invoices': True,
        'delete_invoices': True,
        'manage_billing': True,
        'process_payments': True,
        'refund_payments': True,
        'create_estimates': True,
        'edit_estimates': True,
        'approve_estimates': True,
        'reject_estimates': True,
        'convert_estimate_to_invoice': True,
        'print_invoices': True,
        'print_estimates': True,
        'send_invoices': True,
        'send_estimates': True,
        'view_payment_history': True,
        'export_billing': True,
        'delete_estimates': True,
        'view_bills': True,
        'create_bills': True,
        'edit_bills': True,
        'delete_bills': True,
        
        # Reports
        'view_reports': True,
        'view_all_reports': True,
        'generate_reports': True,
        'export_reports': True,
        'view_sales_reports': True,
        'view_service_reports': True,
        'view_technician_reports': True,
        'view_customer_reports': True,
        'view_financial_reports': True,
        
        # Documents
        'view_documents': True,
        'upload_documents': True,
        'edit_documents': True,
        'delete_documents': True,
        'manage_documents': True,
        'download_documents': True,
        'share_documents': True,
        'manage_document_categories': True,  # Document categories
        
        # Notifications
        'view_notifications': True,
        'manage_notifications': True,
        'send_notifications': True,
        'manage_notification_templates': True,
        'manage_email_templates': True,
        
        # Settings
        'view_settings': True,
        'manage_settings': True,
        'manage_email_settings': True,
        'manage_integrations': True,
        
        # System
        'manage_branches': True,
        'view_branches': True,
        'view_branch_data': True,
        'manage_backups': True,
        'view_system_status': True,
        'manage_api_keys': True,
        
        # Accounting
        'view_accounting': True,
        'manage_chart_of_accounts': True,
        'view_journal_entries': True,
        'create_journal_entries': True,
        'manage_accounting_periods': True,
        'view_bank_statements': True,
        'reconcile_bank_statements': True,
        'view_budgets': True,
        'manage_budgets': True,
        'approve_budgets': True,
        'view_transfer_requests': True,
        'manage_transfers': True,
        
        # HR Management
        'view_hr': True,
        'manage_hr': True,
        'view_staff': True,
        'manage_staff': True,
        'view_employees': True,
        'manage_employees': True,
        'view_departments': True,
        'manage_departments': True,
        'view_leave': True,
        'manage_leave': True,
        'approve_leave': True,
        'view_attendance': True,
        'manage_attendance': True,
        'view_payroll': True,
        'manage_payroll': True,
        'process_payroll': True,
        'view_recruitment': True,
        'manage_recruitment': True,
        'view_performance': True,
        'manage_performance': True,
        'view_compliance': True,
        'manage_compliance': True,
        'view_training': True,
        'manage_training': True,
    }


class Manager(AbstractUserRole):
    """Manager - manages branch operations, staff, and administration across assigned branches"""
    available_permissions = {
        # User Management (branch-level)
        'view_users': True,
        'edit_users': True,
        'manage_branch_staff': True,
        'reset_user_passwords': True,
        'view_technicians': True,
        'manage_technician_schedules': True,
        'manage_technician_skills': True,
        'approve_time_off': True,
        'view_technician_performance': True,
        
        # Fixed Assets
        'view_assets': True,
        'create_assets': True,
        'edit_assets': True,
        'view_asset_maintenance': True,
        'create_asset_maintenance': True,
        
        # Customer Management
        'view_customers': True,
        'create_customers': True,
        'edit_customers': True,
        'manage_customers': True,
        'grant_customer_portal_access': True,
        'revoke_customer_portal_access': True,
        
        # Vehicle Management
        'view_vehicles': True,
        'create_vehicles': True,
        'edit_vehicles': True,
        'view_vehicle_history': True,
        'view_service_history': True,
        'export_vehicles': True,
        
        # Roadside Assistance
        'view_roadside': True,
        'create_roadside': True,
        'edit_roadside': True,
        'manage_roadside': True,
        'dispatch_roadside': True,
        'export_roadside': True,
        
        # Appointments
        'view_appointments': True,
        'create_appointments': True,
        'edit_appointments': True,
        'delete_appointments': True,
        'manage_appointments': True,
        'confirm_appointments': True,
        'reschedule_appointments': True,
        'send_appointment_reminders': True,
        'view_appointment_calendar': True,
        'export_appointments': True,
        
        # Work Orders
        'view_workorders': True,
        'create_workorders': True,
        'edit_workorders': True,
        'manage_workorders': True,
        'update_workorder_status': True,
        'assign_workorders': True,
        'add_workorder_notes': True,
        'edit_workorder_notes': True,
        'view_workorder_history': True,
        'print_workorders': True,
        'export_workorders': True,
        
        # Diagnosis
        'view_diagnosis': True,
        'create_diagnosis': True,
        'edit_diagnosis': True,
        'manage_diagnosis': True,
        'view_diagnostic_codes': True,
        'export_diagnosis': True,
        
        # Inspections
        'view_inspections': True,
        'create_inspections': True,
        'edit_inspections': True,
        'manage_inspections': True,
        'approve_inspections': True,
        'view_inspection_templates': True,
        'export_inspections': True,
        'print_inspection_reports': True,
        
        # Inventory
        'view_inventory': True,
        'create_parts': True,
        'edit_parts': True,
        'manage_inventory': True,
        'view_inventory_reports': True,
        'adjust_inventory': True,
        'manage_suppliers': True,
        'view_suppliers': True,
        'create_purchase_orders': True,
        'edit_purchase_orders': True,
        'approve_purchase_orders': True,
        'receive_parts': True,
        'approve_part_requests': True,
        'export_inventory': True,
        
        # Billing
        'view_billing': True,
        'create_invoices': True,
        'edit_invoices': True,
        'manage_billing': True,
        'process_payments': True,
        'create_estimates': True,
        'edit_estimates': True,
        'approve_estimates': True,
        'reject_estimates': True,
        'convert_estimate_to_invoice': True,
        'print_invoices': True,
        'print_estimates': True,
        'send_invoices': True,
        'send_estimates': True,
        'view_payment_history': True,
        'export_billing': True,
        'delete_estimates': True,
        'view_bills': True,
        'create_bills': True,
        'edit_bills': True,
        'delete_bills': True,
        
        # Subscriptions
        'view_subscriptions': True,
        'manage_subscriptions': True,
        'create_subscriptions': True,
        'cancel_subscriptions': True,
        'record_usage': True,
        
        # Reports
        'view_reports': True,
        'view_all_reports': True,
        'generate_reports': True,
        'export_reports': True,
        'view_sales_reports': True,
        'view_service_reports': True,
        'view_technician_reports': True,
        'view_customer_reports': True,
        'view_inventory_reports': True,
        
        # Documents
        'view_documents': True,
        'upload_documents': True,
        'edit_documents': True,
        'download_documents': True,
        'share_documents': True,
        
        # Notifications
        'view_notifications': True,
        'send_notifications': True,
        
        # Settings
        'view_settings': True,
        
        # System
        'view_branches': True,
        'view_branch_data': True,
        
        # Accounting (Branch Manager View)
        'view_budgets': True,
        
        # HR Management (Branch Level)
        'view_hr': True,
        'view_staff': True,
        'manage_staff': True,
        'view_employees': True,
        'manage_employees': True,
        'view_departments': True,
        'view_leave': True,
        'approve_leave': True,
        'view_attendance': True,
        'manage_attendance': True,
        'view_performance': True,
        'manage_performance': True,
        'view_compliance': True,
        'view_training': True,
    }


class ServiceCoordinator(AbstractUserRole):
    """Service Coordinator - manages work orders, coordinates between departments"""
    available_permissions = {
        # Customer Management
        'view_customers': True,
        'create_customers': True,
        'edit_customers': True,
        'manage_customers': True,
        
        # Vehicle Management
        'view_vehicles': True,
        'create_vehicles': True,
        'edit_vehicles': True,
        'view_vehicle_history': True,
        'view_service_history': True,
        
        # Appointments
        'view_appointments': True,
        'create_appointments': True,
        'edit_appointments': True,
        'manage_appointments': True,
        'confirm_appointments': True,
        'reschedule_appointments': True,
        'send_appointment_reminders': True,
        'view_appointment_calendar': True,
        
        # Work Orders
        'view_workorders': True,
        'create_workorders': True,
        'edit_workorders': True,
        'manage_workorders': True,
        'update_workorder_status': True,
        'assign_workorders': True,
        'add_workorder_notes': True,
        'edit_workorder_notes': True,
        'view_workorder_history': True,
        'print_workorders': True,
        'export_workorders': True,
        
        # Diagnosis
        'view_diagnosis': True,
        'create_diagnosis': True,
        'edit_diagnosis': True,
        'view_diagnostic_codes': True,
        
        # Inspections
        'view_inspections': True,
        'create_inspections': True,
        'edit_inspections': True,
        'perform_inspections': True,
        'view_inspection_templates': True,
        
        # Inventory
        'view_inventory': True,
        'view_inventory_reports': True,
        'request_parts': True,
        
        # Billing
        'view_billing': True,
        'create_estimates': True,
        'edit_estimates': True,
        'approve_estimates': True,
        'view_payment_history': True,
        
        # Reports
        'view_reports': True,
        'view_service_reports': True,
        'view_technician_reports': True,
        
        # Technician Management
        'view_technicians': True,
        'manage_technician_schedules': True,
        
        # Documents
        'view_documents': True,
        'upload_documents': True,
        'download_documents': True,
    }


class Receptionist(AbstractUserRole):
    """Front desk staff"""
    available_permissions = {
        # Customer Management
        'view_customers': True,
        'create_customers': True,
        'edit_customers': True,
        
        # Vehicle Management
        'view_vehicles': True,
        'create_vehicles': True,
        'edit_vehicles': True,
        
        # Appointments
        'view_appointments': True,
        'create_appointments': True,
        'edit_appointments': True,
        'delete_appointments': True,
        'confirm_appointments': True,
        'reschedule_appointments': True,
        'send_appointment_reminders': True,
        'view_appointment_calendar': True,
        
        # Work Orders
        'view_workorders': True,
        'create_workorders': True,
        'add_workorder_notes': True,
        'print_workorders': True,
        
        # Gate Passes
        'view_gatepass': True,
        'create_gatepass': True,
        'change_gatepass': True,
        'issue_gatepass': True,
        'complete_gatepass': True,
        
        # Billing
        'view_billing': True,
        'create_invoices': True,
        'process_payments': True,
        'create_estimates': True,
        'print_invoices': True,
        'print_estimates': True,
        'send_invoices': True,
        'send_estimates': True,
        
        # Documents
        'view_documents': True,
        'upload_documents': True,
        'download_documents': True,
    }


class Technician(AbstractUserRole):
    """Workshop mechanics/technicians"""
    available_permissions = {
        # Vehicle Management
        'view_vehicles': True,
        'view_vehicle_history': True,
        'view_service_history': True,
        
        # Roadside Assistance
        'view_roadside': True,
        
        # Work Orders
        'view_workorders': True,
        'view_own_workorders': True,
        'update_workorder_status': True,
        'add_workorder_notes': True,
        'view_workorder_history': True,
        'clock_work_time': True,
        'print_workorders': True,
        
        # Diagnosis
        'view_diagnosis': True,
        'create_diagnosis': True,
        'edit_diagnosis': True,
        'perform_diagnostic_tests': True,
        'add_diagnostic_findings': True,
        'add_repair_recommendations': True,
        'view_diagnostic_codes': True,
        
        # Inspections
        'view_inspections': True,
        'create_inspections': True,
        'edit_inspections': True,
        'perform_inspections': True,
        'view_inspection_templates': True,
        'print_inspection_reports': True,
        
        # Inventory
        'view_inventory': True,
        'request_parts': True,
        
        # Documents
        'view_documents': True,
        'upload_documents': True,
        'download_documents': True,
    }


class PartsManager(AbstractUserRole):
    """Inventory/Parts management"""
    available_permissions = {
        # Inventory
        'view_inventory': True,
        'create_parts': True,
        'edit_parts': True,
        'delete_parts': True,
        'manage_inventory': True,
        'view_inventory_reports': True,
        'adjust_inventory': True,
        'transfer_inventory': True,
        'view_low_stock_alerts': True,
        'manage_categories': True,
        'manage_suppliers': True,
        'view_suppliers': True,
        'create_purchase_orders': True,
        'edit_purchase_orders': True,
        'approve_purchase_orders': True,
        'receive_parts': True,
        'approve_part_requests': True,
        'export_inventory': True,
        'import_inventory': True,
        
        # Work Orders (to see part requests)
        'view_workorders': True,
        
        # Documents
        'view_documents': True,
        'upload_documents': True,
        'download_documents': True,
    }


class Accountant(AbstractUserRole):
    """Accountant - handles billing, invoicing, and financial reconciliation"""
    available_permissions = {
        # Customer Management (view only)
        'view_customers': True,
        
        # Vehicle Management (view only)
        'view_vehicles': True,
        
        # Work Orders (view for invoicing)
        'view_workorders': True,
        
        # Billing
        'view_billing': True,
        'create_invoices': True,
        'edit_invoices': True,
        'delete_invoices': True,
        'manage_billing': True,
        'process_payments': True,
        'refund_payments': True,
        'create_estimates': True,
        'edit_estimates': True,
        'approve_estimates': True,
        'reject_estimates': True,
        'convert_estimate_to_invoice': True,
        'print_invoices': True,
        'print_estimates': True,
        'send_invoices': True,
        'send_estimates': True,
        'view_payment_history': True,
        'export_billing': True,
        'delete_estimates': True,
        'view_bills': True,
        'create_bills': True,
        'edit_bills': True,
        'delete_bills': True,
        
        # Reports
        'view_reports': True,
        'view_all_reports': True,
        'view_sales_reports': True,
        'view_financial_reports': True,
        'export_reports': True,
        
        # Documents
        'view_documents': True,
        'download_documents': True,
        
        # Settings
        'view_settings': True,
        
        # Accounting (Core Role)
        'view_accounting': True,
        'manage_chart_of_accounts': True,
        'view_journal_entries': True,
        'create_journal_entries': True,
        'view_bank_statements': True,
        'reconcile_bank_statements': True,
        'view_budgets': True,
        'manage_budgets': True,
        'view_transfer_requests': True,
        'manage_transfers': True,
        
        # Fixed Assets
        'view_assets': True,
        'run_depreciation': True,
        'view_asset_maintenance': True,
    }


class Customer(AbstractUserRole):
    """Customer portal access"""
    available_permissions = {
        # Customer Management (own profile)
        'view_own_profile': True,
        'edit_own_profile': True,
        'change_own_password': True,
        
        # Vehicle Management (own vehicles)
        'view_own_vehicles': True,
        'view_service_history': True,
        
        # Appointments (own appointments)
        'view_own_appointments': True,
        'create_appointments': True,
        
        # Work Orders (own work orders)
        'view_own_workorders': True,
        
        # Billing (own invoices)
        'view_own_invoices': True,
        'view_payment_history': True,
        
        # Documents (own documents)
        'view_own_documents': True,
        'download_documents': True,
    }


class HRManager(AbstractUserRole):
    """HR Manager - manages all HR functions across the organization"""
    available_permissions = {
        # HR Management (Full Access)
        'view_hr': True,
        'manage_hr': True,
        'view_staff': True,
        'manage_staff': True,
        'view_employees': True,
        'manage_employees': True,
        'view_departments': True,
        'manage_departments': True,
        'view_leave': True,
        'manage_leave': True,
        'approve_leave': True,
        'view_attendance': True,
        'manage_attendance': True,
        'view_payroll': True,
        'manage_payroll': True,
        'process_payroll': True,
        'view_recruitment': True,
        'manage_recruitment': True,
        'view_performance': True,
        'manage_performance': True,
        'view_compliance': True,
        'manage_compliance': True,
        'view_training': True,
        'manage_training': True,

        # User Management (view-only for staff context)
        'view_users': True,
        'view_technicians': True,

        # Branch awareness
        'view_branches': True,
        'view_branch_data': True,

        # Dashboard access
        'view_dashboard': True,

        # Reports (HR-related)
        'view_reports': True,

        # Documents
        'view_documents': True,
        'upload_documents': True,
        'download_documents': True,

        # Notifications
        'view_notifications': True,
        'send_notifications': True,
    }
