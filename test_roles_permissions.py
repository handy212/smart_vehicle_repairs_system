#!/usr/bin/env python
"""
Test script for roles and permissions implementation
"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.accounts.models import User
from apps.accounts.permission_models import Role, Permission
from apps.branches.models import Branch
from apps.workorders.models import WorkOrder
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

def print_header(text):
    print(f"\n{'='*60}")
    print(f"  {text}")
    print(f"{'='*60}\n")

def print_success(text):
    print(f"✅ {text}")

def print_error(text):
    print(f"❌ {text}")

def print_warning(text):
    print(f"⚠️  {text}")

def test_roles_exist():
    """Test that all required roles exist"""
    print_header("Testing Role Existence")
    
    required_roles = [
        'admin', 'manager', 'service_coordinator',
        'receptionist', 'parts_manager', 'accountant', 'technician', 'customer'
    ]
    
    all_passed = True
    for role_code in required_roles:
        try:
            role = Role.objects.get(code=role_code)
            perm_count = role.permissions.count()
            print_success(f"Role '{role_code}' exists with {perm_count} permissions")
        except Role.DoesNotExist:
            print_error(f"Role '{role_code}' does NOT exist")
            all_passed = False
    
    return all_passed

def test_permissions_exist():
    """Test that all required permissions exist"""
    print_header("Testing Permission Existence")
    
    required_permissions = [
        'view_branch_data', 'manage_branch_staff', 'manage_workorders',
        'create_workorders', 'view_workorders', 'manage_billing',
        'manage_inventory', 'view_inventory_reports'
    ]
    
    all_passed = True
    for perm_code in required_permissions:
        try:
            perm = Permission.objects.get(code=perm_code)
            print_success(f"Permission '{perm_code}' exists: {perm.name}")
        except Permission.DoesNotExist:
            print_error(f"Permission '{perm_code}' does NOT exist")
            all_passed = False
    
    return all_passed

def test_role_permissions():
    """Test that roles have correct permissions"""
    print_header("Testing Role Permissions")
    
    role_permission_map = {
        'manager': ['view_branch_data', 'manage_branch_staff', 'manage_workorders', 'view_all_reports'],
        'service_coordinator': ['manage_workorders', 'create_workorders', 'view_inventory_reports'],
        'accountant': ['manage_billing', 'view_workorders'],
        'technician': ['view_workorders', 'update_workorder_status'],
    }
    
    all_passed = True
    for role_code, expected_perms in role_permission_map.items():
        try:
            role = Role.objects.get(code=role_code)
            role_perms = set(role.permissions.values_list('code', flat=True))
            
            missing = set(expected_perms) - role_perms
            if missing:
                print_error(f"Role '{role_code}' missing permissions: {missing}")
                all_passed = False
            else:
                print_success(f"Role '{role_code}' has all required permissions")
        except Role.DoesNotExist:
            print_error(f"Role '{role_code}' does not exist")
            all_passed = False
    
    return all_passed

def test_branch_access():
    """Test branch access for different roles"""
    print_header("Testing Branch Access Logic")
    
    # Get or create an admin user for branch creation
    admin_user, _ = User.objects.get_or_create(
        username='test_admin_branch',
        defaults={
            'email': 'test_admin_branch@test.com',
            'role': 'admin',
            'first_name': 'Test',
            'last_name': 'Admin',
        }
    )
    if not admin_user.password:
        admin_user.set_password('testpass123')
        admin_user.save()
    
    # Get or create a test branch
    branch, _ = Branch.objects.get_or_create(
        code='TEST',
        defaults={
            'name': 'Test Branch',
            'phone': '555-0100',
            'address': '123 Test St',
            'city': 'Test City',
            'state': 'TS',
            'zip_code': '12345',
            'created_by': admin_user,
        }
    )
    
    # Create test users for each role
    test_users = {}
    roles_to_test = ['manager', 'receptionist', 'technician']
    
    for role_code in roles_to_test:
        username = f'test_{role_code}'
        email = f'{username}@test.com'
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                'email': email,
                'role': role_code,
                'first_name': f'Test {role_code.title()}',
                'last_name': 'User',
            }
        )
        if created:
            user.set_password('testpass123')
            user.save()
        test_users[role_code] = user
    
    # Test branch access
    all_passed = True
    
    # Manager should access via managed_branches
    for role_code in ['manager']:
        user = test_users[role_code]
        user.managed_branches.add(branch)
        accessible = user.get_accessible_branches()
        if branch in accessible:
            print_success(f"{role_code} can access branch via managed_branches")
        else:
            print_error(f"{role_code} CANNOT access branch")
            all_passed = False
    
    # Receptionist and Technician should access via branch field
    for role_code in ['receptionist', 'technician']:
        user = test_users[role_code]
        user.branch = branch
        user.save()
        accessible = user.get_accessible_branches()
        if branch in accessible:
            print_success(f"{role_code} can access branch via branch field")
        else:
            print_error(f"{role_code} CANNOT access branch")
            all_passed = False
    
    # Test has_branch_access method
    manager = test_users['manager']
    if manager.has_branch_access(branch):
        print_success("has_branch_access() works for manager")
    else:
        print_error("has_branch_access() failed for manager")
        all_passed = False
    
    return all_passed

def test_workorder_creation():
    """Test work order creation permissions"""
    print_header("Testing Work Order Creation")
    
    # Get or create test customer and vehicle
    from apps.customers.models import Customer
    from apps.vehicles.models import Vehicle
    
    # Create a user for the customer
    customer_user, _ = User.objects.get_or_create(
        username='test_customer_user',
        defaults={
            'email': 'test_customer@test.com',
            'role': 'customer',
            'first_name': 'Test',
            'last_name': 'Customer',
        }
    )
    
    # Create customer linked to user
    customer, _ = Customer.objects.get_or_create(
        user=customer_user,
        defaults={
            'customer_number': 'TEST-CUST-001',
            'status': 'active',
        }
    )
    
    vehicle, _ = Vehicle.objects.get_or_create(
        vin='TEST123456789',
        defaults={
            'owner': customer,
            'year': 2020,
            'make': 'Test',
            'model': 'Vehicle',
            'license_plate': 'TEST123',
            'current_mileage': 50000,
        }
    )
    
    # Get or create service coordinator
    sc_user, _ = User.objects.get_or_create(
        username='test_service_coordinator',
        defaults={
            'email': 'test_sc@test.com',
            'role': 'service_coordinator',
            'first_name': 'Test',
            'last_name': 'Service Coordinator',
        }
    )
    if not sc_user.password:
        sc_user.set_password('testpass123')
        sc_user.save()
    
    # Test that service coordinator can be set as created_by
    try:
        wo = WorkOrder.objects.create(
            customer=customer,
            vehicle=vehicle,
            work_order_number='TEST-WO001',
            customer_concerns='Test concerns',
            created_by=sc_user,
            status='draft',
            odometer_in=50000,  # Required field
        )
        print_success(f"Service Coordinator can create work orders (WO: {wo.work_order_number})")
        wo.delete()  # Cleanup
        return True
    except ValidationError as e:
        print_error(f"Service Coordinator CANNOT create work orders: {e}")
        return False
    except Exception as e:
        print_error(f"Error creating work order: {e}")
        return False

def test_role_priority():
    """Test role priority ordering"""
    print_header("Testing Role Priority")
    
    expected_order = [
        ('admin', 100),
        ('manager', 85),
        ('service_coordinator', 70),
        ('receptionist', 60),
        ('parts_manager', 50),
        ('accountant', 45),
        ('technician', 40),
        ('customer', 10),
    ]
    
    all_passed = True
    for role_code, expected_priority in expected_order:
        try:
            role = Role.objects.get(code=role_code)
            if role.priority == expected_priority:
                print_success(f"Role '{role_code}' has correct priority: {role.priority}")
            else:
                print_error(f"Role '{role_code}' has wrong priority: {role.priority} (expected {expected_priority})")
                all_passed = False
        except Role.DoesNotExist:
            print_error(f"Role '{role_code}' does not exist")
            all_passed = False
    
    return all_passed

def cleanup_test_data():
    """Clean up test data"""
    print_header("Cleaning Up Test Data")
    
    # Delete test branch first (before users due to foreign key)
    Branch.objects.filter(code='TEST').delete()
    print_success("Test branch cleaned up")
    
    # Delete test users
    test_usernames = [
        'test_manager', 'test_receptionist',
        'test_technician', 'test_service_coordinator', 'test_admin_branch',
        'test_customer_user'
    ]
    User.objects.filter(username__in=test_usernames).delete()
    print_success("Test users cleaned up")
    
    # Clean up test customer and vehicle
    from apps.customers.models import Customer
    from apps.vehicles.models import Vehicle
    Vehicle.objects.filter(vin='TEST123456789').delete()
    Customer.objects.filter(customer_number='TEST-CUST-001').delete()
    print_success("Test customer and vehicle cleaned up")

def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("  ROLES AND PERMISSIONS TEST SUITE")
    print("="*60)
    
    results = {}
    
    # Run tests
    results['roles_exist'] = test_roles_exist()
    results['permissions_exist'] = test_permissions_exist()
    results['role_permissions'] = test_role_permissions()
    results['branch_access'] = test_branch_access()
    results['workorder_creation'] = test_workorder_creation()
    results['role_priority'] = test_role_priority()
    
    # Cleanup
    cleanup_test_data()
    
    # Summary
    print_header("Test Summary")
    
    total_tests = len(results)
    passed_tests = sum(1 for v in results.values() if v)
    failed_tests = total_tests - passed_tests
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name.replace('_', ' ').title()}")
    
    print(f"\n{'='*60}")
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {failed_tests}")
    print(f"{'='*60}\n")
    
    if failed_tests == 0:
        print_success("All tests passed! 🎉")
        return 0
    else:
        print_error(f"{failed_tests} test(s) failed")
        return 1

if __name__ == '__main__':
    sys.exit(main())

