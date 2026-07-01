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
        request = self.factory.post('/api/workorders/work-orders/', payload, format='json')
        request.user = self.user
        request.data = payload
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


class ProfileTransitionTests(TestCase):
    def setUp(self):
        seed_workflow_profiles_and_job_types(overwrite=True)
        self.user = User.objects.create_user(
            username='tech',
            email='tech@example.com',
            password='password',
            role='service_coordinator',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN2', created_by=self.user)
        customer_user = User.objects.create_user(
            username='cust2',
            email='cust2@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Honda',
            model='Civic',
            year=2019,
            vin='ABCDEF12345678901',
            current_mileage=5000,
        )
        self.inspection_job_type = JobType.objects.get(code='vehicle_inspection')
        self.diagnostic_job_type = JobType.objects.get(code='diagnostic_inspection')

    def test_inspection_only_can_complete_from_inspection(self):
        from apps.inspections.models import InspectionTemplate, VehicleInspection

        technician = User.objects.create_user(
            username='tech_insp',
            email='tech_insp@example.com',
            password='password',
            role='technician',
        )
        template = InspectionTemplate.objects.create(
            name='Inspection Only Template',
            created_by=self.user,
        )
        wo = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            job_type=self.inspection_job_type,
            customer_concerns='Annual inspection',
            odometer_in=5000,
            status='inspection',
            created_by=self.user,
        )
        VehicleInspection.objects.create(
            work_order=wo,
            vehicle=self.vehicle,
            branch=self.branch,
            template=template,
            performed_by=technician,
            status='completed',
        )
        can_transition, error = wo.can_transition_to('completed')
        self.assertTrue(can_transition, error)

    def test_inspection_only_blocks_intake_from_inspection(self):
        wo = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            job_type=self.inspection_job_type,
            customer_concerns='Annual inspection',
            odometer_in=5000,
            status='inspection',
            created_by=self.user,
        )
        can_transition, _ = wo.can_transition_to('intake')
        self.assertFalse(can_transition)

    def test_diagnostic_only_can_complete_from_awaiting_approval(self):
        wo = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            job_type=self.diagnostic_job_type,
            customer_concerns='Check engine light',
            odometer_in=5000,
            status='awaiting_approval',
            diagnosis_notes='Faulty sensor detected.',
            service_coordinator=self.user,
            created_by=self.user,
        )
        can_transition, error = wo.can_transition_to('completed')
        self.assertTrue(can_transition, error)

    def test_inspection_only_transition_to_completed(self):
        from apps.inspections.models import InspectionTemplate, VehicleInspection

        technician = User.objects.create_user(
            username='tech_trans',
            email='tech_trans@example.com',
            password='password',
            role='technician',
        )
        template = InspectionTemplate.objects.create(
            name='Transition Template',
            created_by=self.user,
        )
        wo = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            job_type=self.inspection_job_type,
            customer_concerns='Annual inspection',
            odometer_in=5000,
            status='inspection',
            created_by=self.user,
        )
        VehicleInspection.objects.create(
            work_order=wo,
            vehicle=self.vehicle,
            branch=self.branch,
            template=template,
            performed_by=technician,
            status='completed',
        )
        wo.transition_to('completed', user=self.user)
        wo.refresh_from_db()
        self.assertEqual(wo.status, 'completed')

    def test_diagnostic_only_transition_to_completed_from_awaiting_approval(self):
        wo = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            job_type=self.diagnostic_job_type,
            customer_concerns='Check engine light',
            odometer_in=5000,
            status='awaiting_approval',
            diagnosis_notes='Sensor fault identified.',
            service_coordinator=self.user,
            created_by=self.user,
        )
        wo.transition_to('completed', user=self.user)
        wo.refresh_from_db()
        self.assertEqual(wo.status, 'completed')

    def test_diagnostic_only_blocks_in_progress_from_approved(self):
        wo = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            job_type=self.diagnostic_job_type,
            customer_concerns='Check engine light',
            odometer_in=5000,
            status='approved',
            diagnosis_notes='Faulty sensor detected.',
            service_coordinator=self.user,
            approved_by_customer=True,
            created_by=self.user,
        )
        can_transition, _ = wo.can_transition_to('in_progress')
        self.assertFalse(can_transition)


class AppointmentJobTypeTests(TestCase):
    def setUp(self):
        seed_workflow_profiles_and_job_types(overwrite=True)
        self.user = User.objects.create_user(
            username='appt_user',
            email='appt@example.com',
            password='password',
            role='service_coordinator',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN3', created_by=self.user)
        customer_user = User.objects.create_user(
            username='cust3',
            email='cust3@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Ford',
            model='Focus',
            year=2018,
            vin='FORD1234567890123',
            current_mileage=8000,
        )
        self.factory = APIRequestFactory()

    def _create_appointment(self, payload):
        from apps.appointments.serializers import AppointmentCreateSerializer
        from datetime import date, time, timedelta

        tomorrow = date.today() + timedelta(days=1)
        data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'branch': self.branch.id,
            'appointment_date': tomorrow.isoformat(),
            'appointment_time': '10:00:00',
            'priority': 'normal',
            **payload,
        }
        request = self.factory.post('/api/appointments/')
        request.user = self.user
        serializer = AppointmentCreateSerializer(data=data, context={'request': request})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        return serializer.save()

    def test_legacy_service_type_maps_to_job_type(self):
        appt = self._create_appointment({'service_type': 'maintenance'})
        self.assertEqual(appt.job_type.code, 'routine_maintenance')

    def test_job_type_code_on_appointment_create(self):
        appt = self._create_appointment({'job_type_code': 'brake_service'})
        self.assertEqual(appt.job_type.code, 'brake_service')
