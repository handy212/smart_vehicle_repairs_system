from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.branches.models import Branch
from apps.workorders.job_type_seed import seed_workflow_profiles_and_job_types
from apps.workorders.job_types import JobType, WorkflowProfile
from apps.workorders.models import WorkOrder

User = get_user_model()


class JobTypeAPITests(TestCase):
    def setUp(self):
        seed_workflow_profiles_and_job_types(overwrite=True)
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='wo_admin',
            email='wo_admin@example.com',
            password='password',
            role='manager',
        )
        self.client.force_authenticate(user=self.user)

    def test_list_job_types_returns_seeded_catalog(self):
        response = self.client.get('/api/workorders/job-types/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        codes = {item['code'] for item in results}
        self.assertIn('brake_service', codes)
        self.assertIn('routine_maintenance', codes)

    def test_list_workflow_profiles(self):
        response = self.client.get('/api/workorders/workflow-profiles/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        profiles = data if isinstance(data, list) else data.get('results', [])
        codes = {item['code'] for item in profiles}
        self.assertIn('full_repair', codes)
        self.assertIn('inspection_only', codes)

    def test_filter_job_types_by_workflow_profile(self):
        response = self.client.get(
            '/api/workorders/job-types/',
            {'workflow_profile': WorkflowProfile.objects.get(code='inspection_only').pk},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        self.assertTrue(all(
            jt['workflow_profile']['code'] == 'inspection_only'
            for jt in results
        ))


class WorkOrderJobTypeUpdateGuardTests(TestCase):
    def setUp(self):
        seed_workflow_profiles_and_job_types(overwrite=True)
        self.user = User.objects.create_user(
            username='advisor2',
            email='advisor2@example.com',
            password='password',
            role='service_coordinator',
        )
        self.branch = Branch.objects.create(name='Main', code='MAINJT', created_by=self.user)
        from apps.customers.models import Customer
        from apps.vehicles.models import Vehicle

        customer_user = User.objects.create_user(
            username='custjt',
            email='custjt@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2021,
            vin='JTJOBTYPE12345678',
            current_mileage=15000,
        )
        self.brake_type = JobType.objects.get(code='brake_service')
        self.general_type = JobType.objects.get(code='general_repairs')

    def test_cannot_change_job_type_after_work_starts(self):
        wo = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            job_type=self.brake_type,
            customer_concerns='Brake noise',
            odometer_in=15000,
            status='in_progress',
            created_by=self.user,
        )
        from apps.workorders.serializers import WorkOrderUpdateSerializer
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.patch('/api/workorders/work-orders/')
        request.user = self.user
        serializer = WorkOrderUpdateSerializer(
            instance=wo,
            data={'job_type_code': 'general_repairs'},
            partial=True,
            context={'request': request},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('job_type_code', serializer.errors)
