from decimal import Decimal

from django.core.management import call_command
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.permission_models import Permission, Role
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inventory.models import Part, PartCategory, ServiceBundle, ServiceBundleItem, StockItem
from apps.vehicles.models import ServiceType, Vehicle
from apps.workorders.models import WorkOrder, WorkOrderPart
from apps.workorders.serializers import WorkOrderCreateSerializer
from tests.rbac_test_utils import enable_system_modules
from unittest import mock

User = get_user_model()


class WorkOrderAssignmentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.coordinator = User.objects.create_user(
            username='coordinator',
            email='coordinator@example.com',
            password='password',
            role='service_coordinator',
        )
        self.technician = User.objects.create_user(
            username='tech1',
            email='tech1@example.com',
            password='password',
            role='technician',
        )
        self.other_technician = User.objects.create_user(
            username='tech2',
            email='tech2@example.com',
            password='password',
            role='technician',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN', created_by=self.coordinator)
        self.coordinator.branch = self.branch
        self.coordinator.save(update_fields=['branch'])
        self.technician.branch = self.branch
        self.technician.save(update_fields=['branch'])
        self.other_technician.branch = self.branch
        self.other_technician.save(update_fields=['branch'])

        customer_user = User.objects.create_user(
            username='cust',
            email='cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Corolla',
            year=2020,
            vin='1234567890ABCDEF1',
            current_mileage=10000,
        )
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='assigned',
            service_coordinator=self.coordinator,
            primary_technician=self.technician,
            customer_concerns='Noise from brakes',
            odometer_in=10000,
        )
        self.work_order.mark_technician_assignment_pending()
        self.work_order.save()

    def test_technician_can_accept_assignment(self):
        self.client.force_authenticate(user=self.technician)
        response = self.client.post(
            f'/api/workorders/work-orders/{self.work_order.id}/accept-assignment/',
            {'note': 'Ready to start'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.work_order.refresh_from_db()
        self.assertEqual(self.work_order.technician_assignment_status, 'accepted')
        self.assertEqual(self.work_order.technician_assignment_note, 'Ready to start')

    def test_reject_requires_reason(self):
        self.client.force_authenticate(user=self.technician)
        response = self.client.post(
            f'/api/workorders/work-orders/{self.work_order.id}/reject-assignment/',
            {},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_technician_can_reject_assignment(self):
        self.client.force_authenticate(user=self.technician)
        response = self.client.post(
            f'/api/workorders/work-orders/{self.work_order.id}/reject-assignment/',
            {'reason': 'Already booked on another bay'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.work_order.refresh_from_db()
        self.assertEqual(self.work_order.technician_assignment_status, 'rejected')
        self.assertIsNone(self.work_order.primary_technician_id)

    def test_coordinator_can_release_assignment(self):
        self.work_order.accept_technician_assignment(self.technician)
        self.client.force_authenticate(user=self.coordinator)
        response = self.client.post(
            f'/api/workorders/work-orders/{self.work_order.id}/release-assignment/',
            {'note': 'Need different skill set'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.work_order.refresh_from_db()
        self.assertEqual(self.work_order.technician_assignment_status, 'released')
        self.assertIsNone(self.work_order.primary_technician_id)

    def test_coordinator_reject_clears_technician_assignment(self):
        self.client.force_authenticate(user=self.coordinator)
        response = self.client.post(
            f'/api/workorders/work-orders/{self.work_order.id}/reject-assignment/',
            {'reason': 'Wrong technician assigned'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.work_order.refresh_from_db()
        self.assertEqual(self.work_order.technician_assignment_status, 'rejected')
        self.assertIsNone(self.work_order.primary_technician_id)

    def test_rejected_assignment_blocks_start_work(self):
        self.work_order.status = 'approved'
        self.work_order.approved_by_customer = True
        self.work_order.primary_technician = self.technician
        self.work_order.technician_assignment_status = 'rejected'
        self.work_order.save()
        can_start, errors = self.work_order.can_start_work()
        self.assertFalse(can_start)
        self.assertTrue(any('rejected' in err.lower() for err in errors))

    def test_start_work_blocked_until_assignment_accepted(self):
        self.work_order.status = 'approved'
        self.work_order.approved_by_customer = True
        self.work_order.primary_technician = self.technician
        self.work_order.mark_technician_assignment_pending()
        self.work_order.save()
        self.client.force_authenticate(user=self.technician)
        blocked = self.client.post(f'/api/workorders/work-orders/{self.work_order.id}/start_work/')
        self.assertEqual(blocked.status_code, 400)
        self.work_order.accept_technician_assignment(self.technician)


class WorkOrderObjectScopeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('init_permissions', verbosity=0)
        enable_system_modules()
        cls.coordinator = User.objects.create_user(
            username='scope_coordinator',
            email='scope_coordinator@example.com',
            password='password',
            role='service_coordinator',
            is_staff=True,
            is_active=True,
        )
        own_workorder_role = Role.objects.create(
            code='own_workorder_viewer',
            name='Own Workorder Viewer',
            is_active=True,
            priority=20,
        )
        own_workorder_role.permissions.set([Permission.objects.get(code='view_own_workorders')])
        cls.technician = User.objects.create_user(
            username='scope_tech',
            email='scope_tech@example.com',
            password='password',
            role='own_workorder_viewer',
            is_staff=True,
            is_active=True,
        )
        cls.branch = Branch.objects.create(name='Scope Branch', code='SCOPE', created_by=cls.coordinator)
        cls.coordinator.branch = cls.branch
        cls.coordinator.save(update_fields=['branch'])
        cls.technician.branch = cls.branch
        cls.technician.save(update_fields=['branch'])

        customer_user = User.objects.create_user(
            username='scope_customer',
            email='scope_customer@example.com',
            password='password',
            role='customer',
        )
        cls.customer = Customer.objects.create(user=customer_user)
        cls.vehicle = Vehicle.objects.create(
            owner=cls.customer,
            make='Toyota',
            model='Camry',
            year=2021,
            vin='SCOPE123456789012',
            current_mileage=12000,
        )
        cls.unassigned_work_order = WorkOrder.objects.create(
            customer=cls.customer,
            vehicle=cls.vehicle,
            branch=cls.branch,
            status='draft',
            service_coordinator=cls.coordinator,
            customer_concerns='Unassigned job',
            odometer_in=12000,
        )
        cls.assigned_work_order = WorkOrder.objects.create(
            customer=cls.customer,
            vehicle=cls.vehicle,
            branch=cls.branch,
            status='assigned',
            service_coordinator=cls.coordinator,
            primary_technician=cls.technician,
            customer_concerns='Assigned job',
            odometer_in=12000,
        )

    def test_view_own_workorders_cannot_retrieve_unassigned_same_branch_workorder(self):
        client = APIClient()
        client.force_authenticate(user=self.technician)

        response = client.get(f'/api/workorders/work-orders/{self.unassigned_work_order.id}/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_view_own_workorders_can_retrieve_assigned_workorder(self):
        client = APIClient()
        client.force_authenticate(user=self.technician)

        response = client.get(f'/api/workorders/work-orders/{self.assigned_work_order.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)


class RoutineInventoryValidationTests(TestCase):
    def setUp(self):
        from apps.workorders.job_types import JobType

        call_command('seed_job_types', verbosity=0)
        self.routine_job_type = JobType.objects.get(code='routine_maintenance')

        self.user = User.objects.create_user(
            username='tech',
            email='tech@example.com',
            password='password',
            role='technician',
        )
        self.branch = Branch.objects.create(name='Test Branch', code='TB', created_by=self.user)
        self.user.branch = self.branch
        self.user.save(update_fields=['branch'])
        customer_user = User.objects.create_user(
            username='customer',
            email='customer@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Corolla',
            year=2020,
            vin='1234567890ABCDEFG',
            current_mileage=10000,
        )
        self.service_type = ServiceType.objects.create(name='Minor Service')
        self.category = PartCategory.objects.create(name='Fluids')
        self.oil_filter = Part.objects.create(
            part_number='OF123',
            name='Oil Filter',
            category=self.category,
            cost_price=Decimal('10.00'),
            selling_price=Decimal('15.00'),
            quantity_in_stock=0,
        )
        StockItem.objects.create(
            part=self.oil_filter,
            branch=self.branch,
            quantity_in_stock=0,
            quantity_reserved=0,
        )
        self.bundle = ServiceBundle.objects.create(
            name='Minor Service Bundle',
            service_type=self.service_type,
            is_active=True,
        )
        ServiceBundleItem.objects.create(bundle=self.bundle, part=self.oil_filter, quantity=1)

    def test_routine_flags_insufficient_stock_on_create(self):
        data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'branch': self.branch.id,
            'status': 'draft',
            'priority': 'normal',
            'maintenance_type': 'routine',
            'job_type': self.routine_job_type.id,
            'service_type': self.service_type.id,
            'service_bundle': self.bundle.id,
            'estimated_completion': timezone.now() + timezone.timedelta(days=1),
            'customer_concerns': 'Oil change service',
            'odometer_in': 10000,
        }
        request = mock.Mock()
        request.user = self.user
        request.data = data
        request.GET = {}
        request.headers = {}
        request.META = {}
        request.session = {}

        serializer = WorkOrderCreateSerializer(data=data, context={'request': request})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        work_order = serializer.save()
        work_order.refresh_from_db()

        summary = work_order.get_inventory_availability_summary()
        self.assertGreater(summary['stock_unavailable_count'], 0)
        self.assertFalse(summary['is_ready_for_service'])

    def test_routine_start_work_blocked_without_allocated_parts(self):
        work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='approved',
            maintenance_type='routine',
            service_bundle=self.bundle,
            service_type=self.service_type,
            approved_by_customer=True,
            primary_technician=self.user,
            customer_concerns='Routine',
            odometer_in=10000,
        )
        work_order.accept_technician_assignment(self.user)
        WorkOrderPart.objects.create(
            work_order=work_order,
            part_number=self.oil_filter.part_number,
            part_name=self.oil_filter.name,
            quantity=Decimal('1'),
            unit_cost=self.oil_filter.cost_price,
            inventory_part=self.oil_filter,
            status='pending',
        )
        can_start, errors = work_order.can_start_work()
        self.assertFalse(can_start)
        self.assertTrue(any('routine service part' in err.lower() for err in errors))
