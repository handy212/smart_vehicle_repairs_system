"""
Role definitions for the system
"""
from rolepermissions.roles import AbstractUserRole


class Admin(AbstractUserRole):
    """Full system access"""
    available_permissions = {
        'manage_users': True,
        'manage_settings': True,
        'view_all_reports': True,
        'manage_branches': True,
        'manage_inventory': True,
        'manage_billing': True,
        'manage_appointments': True,
        'manage_workorders': True,
        'manage_customers': True,
        'manage_vehicles': True,
        'manage_inspections': True,
    }


class Manager(AbstractUserRole):
    """Workshop/Branch manager"""
    available_permissions = {
        'view_reports': True,
        'manage_inventory': True,
        'manage_appointments': True,
        'manage_workorders': True,
        'manage_billing': True,
        'manage_customers': True,
        'manage_vehicles': True,
        'manage_technicians': True,
        'approve_estimates': True,
    }


class Receptionist(AbstractUserRole):
    """Front desk staff"""
    available_permissions = {
        'create_appointments': True,
        'manage_customers': True,
        'manage_vehicles': True,
        'create_workorders': True,
        'view_workorders': True,
        'create_invoices': True,
        'process_payments': True,
    }


class Technician(AbstractUserRole):
    """Workshop mechanics/technicians"""
    available_permissions = {
        'view_workorders': True,
        'update_workorder_status': True,
        'add_workorder_notes': True,
        'create_inspections': True,
        'view_vehicle_history': True,
        'request_parts': True,
        'clock_work_time': True,
    }


class PartsManager(AbstractUserRole):
    """Inventory/Parts management"""
    available_permissions = {
        'manage_inventory': True,
        'manage_suppliers': True,
        'create_purchase_orders': True,
        'receive_parts': True,
        'approve_part_requests': True,
        'view_inventory_reports': True,
    }


class Customer(AbstractUserRole):
    """Customer portal access"""
    available_permissions = {
        'view_own_vehicles': True,
        'view_own_appointments': True,
        'create_appointments': True,
        'view_own_workorders': True,
        'view_own_invoices': True,
        'view_service_history': True,
        'edit_own_profile': True,
        'change_own_password': True,
    }
