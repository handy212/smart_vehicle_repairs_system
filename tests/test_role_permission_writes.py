"""
Write permission matrix — POST / PATCH / DELETE across all staff roles.
Denied roles must receive 403; allowed roles must not be blocked by permissions.
"""
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from decimal import Decimal
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.hr.models import Department
from apps.inventory.models import Part, PartCategory
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder
from apps.billing.models import Invoice

from tests.rbac_test_utils import (
    STAFF_ROLES,
    create_role_user,
    enable_system_modules,
    user_allowed,
)

_write_seq = 0


def _next_email(role: str, check_name: str) -> str:
    global _write_seq
    _write_seq += 1
    slug = check_name.replace(' ', '-').lower()
    return f'{role}_{slug}_{_write_seq}@writematrix.test'


class WriteMatrixFixtures:
    """Shared objects for PATCH/DELETE checks."""

    admin = None
    branch = None
    customer = None
    vehicle = None
    part_category = None
    part = None
    invoice = None
    work_order = None
    department = None


def _post_payload(check_name: str, role: str, fixtures: WriteMatrixFixtures) -> dict:
    email = _next_email(role, check_name)
    if check_name == 'create customer':
        return {
            'email': email,
            'first_name': 'Write',
            'last_name': 'Matrix',
            'customer_type': 'individual',
        }
    if check_name == 'create vehicle':
        return {
            'vin': f'1HGBH41JXMN{(_write_seq % 100000):05d}',
            'make': 'Toyota',
            'model': 'Camry',
            'year': 2020,
            'status': 'active',
            'owner': fixtures.customer.id,
            'current_mileage': 0,
            'auto_decode_vin': False,
        }
    if check_name == 'create work order':
        return {
            'customer': fixtures.customer.id,
            'vehicle': fixtures.vehicle.id,
            'status': 'draft',
            'priority': 'medium',
            'customer_concerns': 'Matrix write test',
            'odometer_in': fixtures.vehicle.current_mileage,
        }
    if check_name == 'create part':
        return {
            'part_number': f'WM-{_write_seq:04d}',
            'name': 'Write Matrix Part',
            'category': fixtures.part_category.id,
            'cost_price': '10.00',
            'selling_price': '20.00',
        }
    if check_name == 'create invoice':
        return {
            'customer': fixtures.customer.id,
            'vehicle': fixtures.vehicle.id,
            'status': 'draft',
            'due_date': timezone.now().date().isoformat(),
        }
    if check_name == 'create user':
        return {
            'email': email,
            'username': email.split('@')[0],
            'password': 'StrongPass123!',
            'password2': 'StrongPass123!',
            'first_name': 'New',
            'last_name': 'Staff',
            'role': 'technician',
            'is_active': True,
        }
    if check_name == 'create gate pass':
        return {
            'work_order': fixtures.work_order.id,
            'branch': fixtures.branch.id,
            'vehicle': fixtures.vehicle.id,
            'customer': fixtures.customer.id,
            'picked_up_by_customer': True,
        }
    if check_name == 'create diagnosis':
        return {
            'work_order': fixtures.work_order.id,
            'customer_complaint': 'Matrix complaint',
        }
    if check_name == 'create department':
        return {
            'name': f'Dept {_write_seq}',
            'branch': fixtures.branch.id,
            'description': 'Write matrix department',
        }
    if check_name == 'create journal entry':
        return {
            'date': timezone.now().date().isoformat(),
            'description': 'Write matrix journal entry',
            'lines': [],
        }
    return {}


API_WRITE_CHECKS = [
    {'name': 'create customer', 'method': 'post', 'url': '/api/customers/customers/', 'permission': 'create_customers'},
    {'name': 'create vehicle', 'method': 'post', 'url': '/api/vehicles/vehicles/', 'permission': 'create_vehicles'},
    {'name': 'create work order', 'method': 'post', 'url': '/api/workorders/work-orders/', 'permission': 'create_workorders'},
    {'name': 'create part', 'method': 'post', 'url': '/api/inventory/parts/', 'permission': 'create_parts'},
    {'name': 'create invoice', 'method': 'post', 'url': '/api/billing/invoices/', 'permission': 'create_invoices'},
    {'name': 'create user', 'method': 'post', 'url': '/api/auth/users/', 'permission': 'create_users'},
    {'name': 'create gate pass', 'method': 'post', 'url': '/api/gatepass/gate-passes/', 'permission': 'create_gatepass'},
    {'name': 'create diagnosis', 'method': 'post', 'url': '/api/diagnosis/diagnoses/', 'permission': 'create_diagnosis'},
    {'name': 'create department', 'method': 'post', 'url': '/api/hr/departments/', 'permission': 'manage_departments'},
    {
        'name': 'create journal entry',
        'method': 'post',
        'url': '/api/accounting/journal-entries/create/',
        'permission': 'create_journal_entries',
    },
    {
        'name': 'edit customer',
        'method': 'patch',
        'url': lambda f: f'/api/customers/customers/{f.customer.id}/',
        'permission': 'edit_customers',
        'payload': {'notes': 'Matrix patch'},
    },
    {
        'name': 'edit part',
        'method': 'patch',
        'url': lambda f: f'/api/inventory/parts/{f.part.id}/',
        'permission': 'edit_parts',
        'payload': {'name': 'Matrix Part Updated'},
    },
    {
        'name': 'edit invoice',
        'method': 'patch',
        'url': lambda f: f'/api/billing/invoices/{f.invoice.id}/',
        'permission': 'edit_invoices',
        'payload': {'notes': 'Matrix invoice patch'},
    },
    {
        'name': 'delete part',
        'method': 'delete',
        'url': lambda f: f'/api/inventory/parts/{f.part.id}/',
        'permission': 'delete_parts',
    },
    {
        'name': 'delete invoice',
        'method': 'delete',
        'url': lambda f: f'/api/billing/invoices/{f.invoice.id}/',
        'permission': 'delete_invoices',
    },
]


class RolePermissionWriteMatrixTests(TestCase):
    write_fixtures = WriteMatrixFixtures()

    @classmethod
    def setUpTestData(cls):
        call_command('init_permissions', verbosity=0)
        enable_system_modules()

        cls.write_fixtures.admin = create_role_user(
            'admin',
            email='admin_writematrix@test.com',
            username='admin_writematrix',
        )
        cls.write_fixtures.branch = Branch.objects.create(
            name='Write Matrix Branch',
            code='WMB',
            is_active=True,
            created_by=cls.write_fixtures.admin,
        )
        cls.users = {}
        for role in STAFF_ROLES:
            if role == 'admin':
                cls.users[role] = cls.write_fixtures.admin
                continue
            cls.users[role] = create_role_user(
                role,
                email=f'{role}_writematrix@test.com',
                username=f'{role}_writematrix',
                branch=cls.write_fixtures.branch,
            )

        customer_user = User.objects.create_user(
            username='writematrix_customer_user',
            email='writematrix_customer_user@test.com',
            password='password123',
            role='customer',
        )
        cls.write_fixtures.customer = Customer.objects.create(
            user=customer_user,
            billing_address='123 Matrix St',
            service_address='123 Matrix St',
        )
        cls.write_fixtures.vehicle = Vehicle.objects.create(
            owner=cls.write_fixtures.customer,
            year=2022,
            make='Toyota',
            model='Corolla',
            vin='1A8BFAFP5RT000099',
            license_plate='WM-001',
            current_mileage=10000,
        )
        cls.write_fixtures.part_category = PartCategory.objects.create(name='Write Matrix Category')
        cls.write_fixtures.part = Part.objects.create(
            part_number='WM-BASE-001',
            name='Base Part',
            category=cls.write_fixtures.part_category,
            branch=cls.write_fixtures.branch,
            cost_price=Decimal('5.00'),
            selling_price=Decimal('10.00'),
        )
        cls.write_fixtures.work_order = WorkOrder.objects.create(
            customer=cls.write_fixtures.customer,
            vehicle=cls.write_fixtures.vehicle,
            branch=cls.write_fixtures.branch,
            status='closed',
            created_by=cls.write_fixtures.admin,
            odometer_in=10000,
        )
        cls.write_fixtures.invoice = Invoice.objects.create(
            customer=cls.write_fixtures.customer,
            vehicle=cls.write_fixtures.vehicle,
            status='draft',
            due_date=timezone.now().date(),
            total=Decimal('50.00'),
            created_by=cls.write_fixtures.admin,
        )
        cls.write_fixtures.department = Department.objects.create(
            name='Write Matrix Dept',
            branch=cls.write_fixtures.branch,
        )

    def _perform(self, client, check, payload):
        method = check['method']
        if method == 'post':
            return client.post(check['url'], payload, format='json')
        if method == 'patch':
            return client.patch(check['url'](self.write_fixtures), payload, format='json')
        if method == 'delete':
            return client.delete(check['url'](self.write_fixtures))
        raise AssertionError(f'Unsupported method {method}')

    def test_write_matrix_matches_role_permissions(self):
        client = APIClient()

        for role, user in self.users.items():
            client.force_authenticate(user=user)
            for check in API_WRITE_CHECKS:
                allowed = user_allowed(user, permission=check['permission'])
                payload = check.get('payload') or _post_payload(check['name'], role, self.write_fixtures)
                response = self._perform(client, check, payload)
                with self.subTest(role=role, action=check['name'], method=check['method']):
                    if allowed:
                        self.assertNotEqual(
                            response.status_code,
                            status.HTTP_403_FORBIDDEN,
                            msg=f'{role} expected write access for {check["name"]}, got {response.status_code}: {getattr(response, "data", "")}',
                        )
                    else:
                        self.assertEqual(
                            response.status_code,
                            status.HTTP_403_FORBIDDEN,
                            msg=f'{role} should be denied for {check["name"]}, got {response.status_code}',
                        )

    def test_parts_manager_cannot_create_customers(self):
        client = APIClient()
        client.force_authenticate(user=self.users['parts_manager'])
        response = client.post('/api/customers/customers/', _post_payload('create customer', 'parts_manager', self.write_fixtures))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_hr_manager_cannot_create_invoices(self):
        client = APIClient()
        client.force_authenticate(user=self.users['hr_manager'])
        response = client.post('/api/billing/invoices/', _post_payload('create invoice', 'hr_manager', self.write_fixtures))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_technician_cannot_delete_parts(self):
        client = APIClient()
        client.force_authenticate(user=self.users['technician'])
        response = client.delete(f'/api/inventory/parts/{self.write_fixtures.part.id}/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
