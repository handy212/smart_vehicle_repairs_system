"""
Tests for gatepass app.
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APITestCase

from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.branches.models import Branch
from apps.workorders.models import WorkOrder
from .models import GatePass

User = get_user_model()


class GatePassModelTest(TestCase):
    """Test cases for GatePass model."""

    def setUp(self):
        """Set up test data."""
        self.admin_user = User.objects.create_user(
            email='gpadmin@test.com', username='gpadmin', password='test123',
            first_name='GP', last_name='Admin', phone='1111111111', role='admin'
        )
        self.branch = Branch.objects.create(
            name='GP Branch', code='GPB', phone='1234567890',
            address='100 GP St', city='GP City', region='GP',
            zip_code='10000', created_by=self.admin_user
        )
        self.customer_user = User.objects.create_user(
            email='gpcust@test.com', username='gpcust', password='test123',
            first_name='GP', last_name='Customer', phone='2222222222', role='customer'
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer, make='BMW', model='X5', year=2023,
            vin='5UXCR6C56P9K12345', license_plate='GP001',
            exterior_color='White', current_mileage=10000,
            engine_type='gasoline', transmission_type='automatic'
        )
        # Create a closed work order for gate pass testing
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='closed',
            created_by=self.admin_user,
            odometer_in=0,
        )

    def _create_gate_pass(self, **kwargs):
        """Helper to create a gate pass with defaults."""
        defaults = {
            'work_order': self.work_order,
            'branch': self.branch,
            'vehicle': self.vehicle,
            'customer': self.customer,
            'issued_by': self.admin_user,
            'picked_up_by_customer': True,
        }
        defaults.update(kwargs)
        return GatePass.objects.create(**defaults)

    def test_create_gate_pass(self):
        """Test creating a gate pass generates a number."""
        gp = self._create_gate_pass()
        self.assertIsNotNone(gp.gate_pass_number)
        self.assertIn('GP', gp.gate_pass_number)
        self.assertEqual(gp.status, 'pending')

    def test_gate_pass_number_uses_branch_code(self):
        """Test that gate pass number contains the branch code."""
        gp = self._create_gate_pass()
        self.assertTrue(gp.gate_pass_number.startswith('GPB-GP'))

    def test_gate_pass_requires_closed_work_order(self):
        """Test that gate pass cannot be created for non-closed work order."""
        open_wo = WorkOrder.objects.create(
            customer=self.customer, vehicle=self.vehicle,
            branch=self.branch, status='in_progress',
            created_by=self.admin_user, odometer_in=0,
        )
        with self.assertRaises(ValidationError):
            self._create_gate_pass(work_order=open_wo)

    def test_pickup_person_required_when_not_customer(self):
        """Test that pickup person name is required when not customer."""
        with self.assertRaises(ValidationError):
            self._create_gate_pass(
                picked_up_by_customer=False,
                pickup_person_name='',
            )

    def test_pickup_person_allowed_when_provided(self):
        """Test gate pass creation with third-party pickup."""
        gp = self._create_gate_pass(
            picked_up_by_customer=False,
            pickup_person_name='Bob Smith',
            pickup_person_relationship='Brother',
            pickup_person_id_type='driver_license',
            pickup_person_id_number='DL123456',
        )
        self.assertFalse(gp.picked_up_by_customer)
        self.assertEqual(gp.pickup_person_name, 'Bob Smith')

    def test_issue_gate_pass(self):
        """Test issuing a pending gate pass."""
        gp = self._create_gate_pass()
        gp.issue(user=self.admin_user)
        gp.refresh_from_db()
        self.assertEqual(gp.status, 'issued')
        self.assertIsNotNone(gp.issued_at)
        self.assertEqual(gp.authorized_by, self.admin_user)

    def test_issue_non_pending_fails(self):
        """Test issuing a non-pending gate pass fails."""
        gp = self._create_gate_pass()
        gp.status = 'completed'
        gp.save(update_fields=['status'])
        with self.assertRaises(ValidationError):
            gp.issue(user=self.admin_user)

    def test_complete_gate_pass(self):
        """Test completing a gate pass."""
        gp = self._create_gate_pass()
        gp.issue(user=self.admin_user)
        gp.complete(user=self.admin_user)
        gp.refresh_from_db()
        self.assertEqual(gp.status, 'completed')
        self.assertIsNotNone(gp.completed_at)

    def test_complete_cancelled_fails(self):
        """Test completing a cancelled gate pass fails."""
        gp = self._create_gate_pass()
        gp.cancel(user=self.admin_user)
        with self.assertRaises(ValidationError):
            gp.complete(user=self.admin_user)

    def test_cancel_gate_pass(self):
        """Test cancelling a gate pass."""
        gp = self._create_gate_pass()
        gp.cancel(user=self.admin_user)
        gp.refresh_from_db()
        self.assertEqual(gp.status, 'cancelled')

    def test_cancel_completed_fails(self):
        """Test cancelling a completed gate pass fails."""
        gp = self._create_gate_pass()
        gp.complete(user=self.admin_user)
        with self.assertRaises(ValidationError):
            gp.cancel(user=self.admin_user)

    def test_pickup_person_display_customer(self):
        """Test pickup_person_display when customer picks up."""
        gp = self._create_gate_pass(picked_up_by_customer=True)
        self.assertEqual(gp.pickup_person_display, 'GP Customer')

    def test_pickup_person_display_third_party(self):
        """Test pickup_person_display for third-party pickup."""
        gp = self._create_gate_pass(
            picked_up_by_customer=False,
            pickup_person_name='Bob Smith',
        )
        self.assertEqual(gp.pickup_person_display, 'Bob Smith')

    def test_str_representation(self):
        """Test string representation."""
        gp = self._create_gate_pass()
        self.assertIn(gp.gate_pass_number, str(gp))
        self.assertIn(self.work_order.work_order_number, str(gp))


class GatePassAPITest(APITestCase):
    """Test cases for GatePass API endpoints."""

    def setUp(self):
        """Set up test data and authenticate."""
        self.admin = User.objects.create_user(
            email='gpapiadmin@test.com', username='gpapiadmin', password='test123',
            first_name='GPAPI', last_name='Admin', phone='3333333333', role='admin'
        )
        self.branch = Branch.objects.create(
            name='GPAPI Branch', code='GPA', phone='1234567890',
            address='200 API St', city='API City', region='AP',
            zip_code='20000', created_by=self.admin
        )
        self.cust_user = User.objects.create_user(
            email='gpapicust@test.com', username='gpapicust', password='test123',
            first_name='GPAPI', last_name='Customer', phone='4444444444', role='customer'
        )
        self.customer = Customer.objects.create(user=self.cust_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer, make='Mercedes', model='C300', year=2024,
            vin='WDDGF4HB0CA123456', license_plate='GPA001',
            exterior_color='Silver', current_mileage=5000,
            engine_type='gasoline', transmission_type='automatic'
        )
        self.work_order = WorkOrder.objects.create(
            customer=self.customer, vehicle=self.vehicle,
            branch=self.branch, status='closed',
            created_by=self.admin, odometer_in=0,
        )
        self.client.force_authenticate(user=self.admin)
        self.admin.branch = self.branch
        self.admin.save(update_fields=['branch'])

    def _create_gate_pass(self, **kwargs):
        """Helper to create a gate pass via model."""
        defaults = {
            'work_order': self.work_order,
            'branch': self.branch,
            'vehicle': self.vehicle,
            'customer': self.customer,
            'issued_by': self.admin,
            'picked_up_by_customer': True,
        }
        defaults.update(kwargs)
        return GatePass.objects.create(**defaults)

    def test_list_gate_passes(self):
        """Test listing gate passes."""
        self._create_gate_pass()
        response = self.client.get('/api/gatepass/gate-passes/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data['count'], 1)

    def test_retrieve_gate_pass(self):
        """Test retrieving a single gate pass."""
        gp = self._create_gate_pass()
        response = self.client.get(f'/api/gatepass/gate-passes/{gp.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['gate_pass_number'], gp.gate_pass_number)

    def test_create_gate_pass_api(self):
        """Test creating a gate pass via API."""
        response = self.client.post('/api/gatepass/gate-passes/', {
            'work_order': self.work_order.id,
            'branch': self.branch.id,
            'vehicle': self.vehicle.id,
            'customer': self.customer.id,
            'picked_up_by_customer': True,
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('work_order', response.data)

    def test_create_gate_pass_for_non_closed_wo_fails(self):
        """Test that creating gate pass for non-closed WO fails."""
        open_wo = WorkOrder.objects.create(
            customer=self.customer, vehicle=self.vehicle,
            branch=self.branch, status='in_progress',
            created_by=self.admin, odometer_in=0,
        )
        response = self.client.post('/api/gatepass/gate-passes/', {
            'work_order': open_wo.id,
            'branch': self.branch.id,
            'vehicle': self.vehicle.id,
            'customer': self.customer.id,
            'picked_up_by_customer': True,
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_issue_gate_pass_api(self):
        """Test issuing a gate pass via API."""
        gp = self._create_gate_pass()
        response = self.client.post(f'/api/gatepass/gate-passes/{gp.id}/issue/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'issued')

    def test_complete_gate_pass_api(self):
        """Test completing a gate pass via API."""
        gp = self._create_gate_pass()
        gp.issue(user=self.admin)
        response = self.client.post(f'/api/gatepass/gate-passes/{gp.id}/complete/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'completed')

    def test_cancel_gate_pass_api(self):
        """Test cancelling a gate pass via API."""
        gp = self._create_gate_pass()
        response = self.client.post(f'/api/gatepass/gate-passes/{gp.id}/cancel/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'cancelled')

    def test_from_workorder_endpoint(self):
        """Test getting gate pass by work order."""
        gp = self._create_gate_pass()
        response = self.client.get(
            f'/api/gatepass/gate-passes/from-workorder/{self.work_order.id}/'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['gate_pass_number'], gp.gate_pass_number)

    def test_from_workorder_not_found(self):
        """Test from-workorder returns 404 when no gate pass exists."""
        response = self.client.get(
            f'/api/gatepass/gate-passes/from-workorder/{self.work_order.id}/'
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
