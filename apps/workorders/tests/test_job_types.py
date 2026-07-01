from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inventory.models import Part, PartCategory, ServiceBundle, ServiceBundleItem
from apps.vehicles.models import ServiceType, Vehicle
from apps.workorders.job_type_seed import seed_workflow_profiles_and_job_types
from apps.workorders.job_types import JobType, WorkflowProfile
from apps.workorders.models import WorkOrder
from apps.workorders.serializers import WorkOrderCreateSerializer

User = get_user_model()


class JobTypeSeedTests(TestCase):
    def test_seed_creates_profiles_and_job_types(self):
        result = seed_workflow_profiles_and_job_types(overwrite=True)
        self.assertGreaterEqual(result['profiles'], 6)
        self.assertTrue(JobType.objects.filter(code='brake_service').exists())
        self.assertTrue(JobType.objects.filter(code='routine_maintenance').exists())
        self.assertTrue(WorkflowProfile.objects.filter(code='routine_fast_track').exists())


class JobTypeCreateWorkOrderTests(TestCase):
    def setUp(self):
        seed_workflow_profiles_and_job_types(overwrite=True)
        self.user = User.objects.create_user(
            username='advisor',
            email='advisor@example.com',
            password='password',
            role='service_coordinator',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN', created_by=self.user)
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
            vin='1234567890ABCDEF0',
            current_mileage=10000,
        )
        self.service_type = ServiceType.objects.create(name='Minor Service')
        category = PartCategory.objects.create(name='Fluids')
        self.part = Part.objects.create(
            part_number='OF123',
            name='Oil Filter',
            category=category,
            cost_price=Decimal('10.00'),
            selling_price=Decimal('15.00'),
            quantity_in_stock=100,
        )
        self.bundle = ServiceBundle.objects.create(
            name='Minor Service Bundle',
            service_type=self.service_type,
            total_price=Decimal('99.00'),
        )
        ServiceBundleItem.objects.create(bundle=self.bundle, part=self.part, quantity=1)
        self.factory = APIRequestFactory()

    def _create(self, payload):
        request = self.factory.post('/api/workorders/work-orders/')
        request.user = self.user
        serializer = WorkOrderCreateSerializer(data=payload, context={'request': request})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        return serializer.save()

    def test_general_repair_job_type_assigned(self):
        wo = self._create({
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'branch': self.branch.id,
            'customer_concerns': 'Noise when braking',
            'odometer_in': 12000,
            'job_type_code': 'brake_service',
        })
        self.assertEqual(wo.job_type.code, 'brake_service')
        from apps.workorders.workflow_profile_service import get_workflow_profile
        self.assertEqual(get_workflow_profile(wo).code, 'full_repair')

    def test_routine_job_type_fast_tracks_to_approved(self):
        wo = self._create({
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'branch': self.branch.id,
            'customer_concerns': 'Perform Minor Service Bundle',
            'odometer_in': 12000,
            'job_type_code': 'routine_maintenance',
            'service_bundle': self.bundle.id,
        })
        self.assertEqual(wo.job_type.code, 'routine_maintenance')
        self.assertEqual(wo.status, 'approved')
        self.assertTrue(wo.parts.exists())
        self.assertTrue(wo.tasks.filter(is_workflow_task=False).exists())

    def test_legacy_maintenance_type_maps_to_job_type(self):
        wo = self._create({
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'branch': self.branch.id,
            'customer_concerns': 'General issue',
            'odometer_in': 12000,
            'maintenance_type': 'general',
        })
        self.assertEqual(wo.job_type.code, 'general_repairs')
