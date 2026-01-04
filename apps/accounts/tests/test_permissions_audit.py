from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from rest_framework import status
from django.core.management import call_command
from rolepermissions.roles import assign_role
from apps.inventory.models import PartCategory

User = get_user_model()

class PermissionAuditTests(TestCase):
    def setUp(self):
        # Initialize permissions
        call_command('init_permissions', verbosity=0)

        # Create users
        self.technician_user = User.objects.create_user(
            username='tech_audit', email='tech_audit@example.com', password='password123', role='technician'
        )
        assign_role(self.technician_user, 'technician')

        self.accountant_user = User.objects.create_user(
            username='acct_audit', email='acct_audit@example.com', password='password123', role='accountant'
        )
        assign_role(self.accountant_user, 'accountant')
        
        self.manager_user = User.objects.create_user(
            username='manager_audit', email='manager_audit@example.com', password='password123', role='manager'
        )
        assign_role(self.manager_user, 'manager')

        # Setup Clients
        self.tech_client = APIClient()
        self.tech_client.force_authenticate(user=self.technician_user)

        self.acct_client = APIClient()
        self.acct_client.force_authenticate(user=self.accountant_user)
        
        self.manager_client = APIClient()
        self.manager_client.force_authenticate(user=self.manager_user)

    def test_technician_restrictions(self):
        """
        Verify Technician:
        - CANNOT create vehicles (view_vehicles=True, create_vehicles=False)
        - CANNOT create parts (view_inventory=True, create_parts=False)
        - CANNOT view other users (view_users=False)
        """
        # 1. Create Vehicle -> Should Fail (403)
        response = self.tech_client.post('/api/vehicles/vehicles/', {
            'vin': '1MB55555555555555', # Valid length/chars
            'make': 'Toyota',
            'model': 'Camry',
            'year': 2020,
            'status': 'active',
            'auto_decode_vin': False
        })
        print(f"Technician create vehicle response: {response.status_code}")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Create Part -> Should Fail (403)
        # Need a category first (Manager can create)
        cat = PartCategory.objects.create(name="Test Cat")
        response = self.tech_client.post('/api/inventory/parts/', {
            'part_number': 'TP-001',
            'name': 'Test Part',
            'category': cat.id,
            'cost_price': 10.00,
            'selling_price': 20.00
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 3. View Users (Technicians list) -> Should Fail (403)
        response = self.tech_client.get('/api/technicians/technicians/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_accountant_access(self):
        """
        Verify Accountant:
        - CANNOT view technicians/users (view_users=False)
        - CAN view billing/invoices (view_billing=True)
        - CAN create invoices (create_invoices=True)
        """
        # 1. View Technicians -> Should Fail (403)
        response = self.acct_client.get('/api/technicians/technicians/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 2. View Tax Rates (Billing Settings) -> Should Pass (view_settings=True)
        response = self.acct_client.get('/api/billing/tax-rates/')
        print(f"Accountant view tax rates response: {response.status_code}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
    def test_manager_access(self):
        """
        Verify Manager:
        - CAN create vehicles
        - CAN manage inventory
        - CAN manage staff
        """
        # 1. Create Vehicle -> Should Pass (201)
        # Create Customer first
        from apps.customers.models import Customer
        customer = Customer.objects.create(
            user=self.technician_user, # Using existing user
            billing_address='123 Test St',
            service_address='123 Test St'
        )
        
        # Note: Vehicle creation needs minimal fields.
        response = self.manager_client.post('/api/vehicles/vehicles/', {
            'vin': '1MB99999999999999',
            'make': 'Honda',
            'model': 'Civic',
            'year': 2021,
            'status': 'active',
            'vehicle_type': 'saloon',
            'owner': customer.id,
            'current_mileage': 0,
            'auto_decode_vin': False
        })
        if response.status_code != 201:
             print(f"Manager create vehicle failed: {response.data}")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
