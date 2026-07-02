"""
Tests for repeat issue detection functionality.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.job_type_seed import seed_workflow_profiles_and_job_types
from apps.workorders.models import WorkOrder
from apps.workorders.utils import find_repeat_workorders

User = get_user_model()


def _create_branch(name: str, code: str, created_by: User) -> Branch:
    return Branch.objects.create(
        name=name,
        code=code,
        phone='123-456-7890',
        address='123 Main St',
        city='Sample City',
        state='CA',
        zip_code='90001',
        country='USA',
        created_by=created_by,
    )


def _create_customer(email: str) -> tuple[User, Customer]:
    user = User.objects.create_user(
        username=email,
        email=email,
        password='password123',
        role='customer',
    )
    customer = Customer.objects.create(user=user)
    return user, customer


def _create_vehicle(customer: Customer, vin_suffix: str) -> Vehicle:
    return Vehicle.objects.create(
        owner=customer,
        make='Toyota',
        model='Camry',
        year=2020,
        vin=f'1HGBH41JXMN{vin_suffix}',
        license_plate=f'TST{vin_suffix[-3:]}',
        current_mileage=50000,
    )


class RepeatIssueDetectionTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='adminpass',
            role='admin',
            is_staff=True,
        )
        _, self.customer = _create_customer('customer@example.com')
        self.vehicle = _create_vehicle(self.customer, '109186')
        self.branch = _create_branch('Main Branch', 'MB01', self.admin)

    def test_find_repeat_workorders_detects_similar_issue(self):
        existing = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns='Engine knocking noise while accelerating',
            odometer_in=52000,
            status='draft',
            priority='normal',
        )

        matches = find_repeat_workorders(
            self.vehicle,
            'Engine knocking noise while accelerating',
            exclude_ids=[],
            lookback_days=None,
            similarity_threshold=0.5,  # Lower threshold for test
        )

        self.assertTrue(matches, f"Expected matches but got: {matches}")
        self.assertIn(existing.id, [match['id'] for match in matches])


class RepeatIssueAPITests(TestCase):
    def setUp(self):
        seed_workflow_profiles_and_job_types(overwrite=True)
        self.admin = User.objects.create_user(
            username='admin2',
            email='admin2@example.com',
            password='adminpass',
            role='admin',
            is_staff=True,
        )
        _, self.customer = _create_customer('customer2@example.com')
        self.vehicle = _create_vehicle(self.customer, '209187')
        self.branch = _create_branch('Secondary Branch', 'SB01', self.admin)

    def test_api_create_returns_repeat_issue_summary(self):
        from rest_framework import status
        from rest_framework.test import APIClient

        # Create a historical work order with the same concern text
        historical = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns='Battery drains overnight when vehicle is parked',
            odometer_in=60000,
            status='completed',
            completed_at=timezone.now(),
            priority='normal',
        )

        client = APIClient()
        client.force_authenticate(user=self.admin)

        # Create a new work order with very similar text
        payload = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'branch': self.branch.id,
            'customer_concerns': 'Battery drains overnight when vehicle is parked',
            'special_instructions': '',
            'odometer_in': 60500,
            'priority': 'normal',
        }

        response = client.post('/api/workorders/work-orders/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, 
                        f"Response: {response.data}")
        repeat_matches = response.data.get('repeat_issue_matches')
        self.assertIsNotNone(repeat_matches, 
                            f"Expected repeat_issue_matches in response. Got: {response.data.keys()}")
        self.assertGreaterEqual(len(repeat_matches), 1, 
                               f"Expected at least 1 match. Got: {repeat_matches}")
        self.assertEqual(repeat_matches[0]['work_order_id'], historical.id)

    def test_api_create_warranty_rework_accepts_related_work_order_id(self):
        from rest_framework import status
        from rest_framework.test import APIClient

        historical = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns='Transmission slips between second and third gear',
            odometer_in=61000,
            status='completed',
            completed_at=timezone.now(),
            priority='normal',
        )

        client = APIClient()
        client.force_authenticate(user=self.admin)

        payload = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'branch': self.branch.id,
            'customer_concerns': 'Transmission slips between second and third gear again',
            'odometer_in': 61200,
            'priority': 'normal',
            'is_warranty_rework': True,
            'related_work_order': historical.id,
            'warranty_reason': 'Repeat issue under warranty.',
        }

        response = client.post('/api/workorders/work-orders/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, f"Response: {response.data}")
        work_order = WorkOrder.objects.get(id=response.data['id'])
        self.assertTrue(work_order.is_warranty_rework)
        self.assertEqual(work_order.related_work_order_id, historical.id)
