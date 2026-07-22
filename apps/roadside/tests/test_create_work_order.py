"""Tests for roadside → work order handoff."""
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.accounts.permission_models import Permission, Role
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.roadside.models import RoadsideRequest
from apps.workorders.job_type_seed import seed_workflow_profiles_and_job_types
from apps.workorders.models import WorkOrder


class RoadsideCreateWorkOrderTests(TestCase):
    def setUp(self):
        seed_workflow_profiles_and_job_types(overwrite=True)
        SystemModule.objects.update_or_create(
            slug='roadside',
            defaults={'name': 'Roadside', 'is_enabled': True},
        )
        SystemModule.objects.update_or_create(
            slug='workorders',
            defaults={'name': 'Work Orders', 'is_enabled': True},
        )

        self.client = APIClient()
        self.manager = User.objects.create_user(
            username='rsa_mgr',
            email='rsa_mgr@example.com',
            password='password',
            role='manager',
        )
        self.branch = Branch.objects.create(
            name='RSA Handoff Branch',
            code='RSAWO',
            created_by=self.manager,
        )
        self.manager.managed_branches.add(self.branch)

        perms = []
        for code, category in (
            ('view_roadside', 'roadside'),
            ('manage_roadside', 'roadside'),
            ('create_workorders', 'workorders'),
            ('view_workorders', 'workorders'),
        ):
            perm, _ = Permission.objects.update_or_create(
                code=code,
                defaults={'name': code, 'category': category, 'is_active': True},
            )
            perms.append(perm)

        role, _ = Role.objects.update_or_create(
            code='manager',
            defaults={'name': 'Manager', 'is_active': True},
        )
        role.permissions.add(*perms)

        cust_user = User.objects.create_user(
            username='rsa_cust',
            email='rsa_cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer(user=cust_user)
        self.customer._numbering_branch = self.branch
        self.customer.save()
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Corolla',
            year=2019,
            vin='RSAWOTESTVIN00001',
            license_plate='RSAWO1',
            current_mileage=72000,
        )
        self.request = RoadsideRequest.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            service_type='towing',
            status='on_site',
            breakdown_location='Highway N1 km 12',
            customer_phone='0240000000',
            description='Engine overheating; towed to branch.',
            destination=self.branch.name,
            tow_distance_km='18.5',
            created_by=self.manager,
        )
        self.client.force_authenticate(user=self.manager)

    def test_model_create_work_order_links_and_is_idempotent(self):
        wo = self.request.create_work_order(user=self.manager)
        self.assertIsInstance(wo, WorkOrder)
        self.assertEqual(wo.status, 'draft')
        self.assertEqual(wo.customer_id, self.customer.id)
        self.assertEqual(wo.vehicle_id, self.vehicle.id)
        self.assertEqual(wo.branch_id, self.branch.id)
        self.assertEqual(wo.odometer_in, 72000)
        self.assertIn(self.request.request_number, wo.customer_concerns)

        self.request.refresh_from_db()
        self.assertEqual(self.request.work_order_id, wo.id)

        again = self.request.create_work_order(user=self.manager)
        self.assertEqual(again.id, wo.id)
        self.assertEqual(WorkOrder.objects.filter(customer=self.customer).count(), 1)

    def test_stale_request_instance_returns_existing_work_order(self):
        first = RoadsideRequest.objects.get(pk=self.request.pk)
        stale = RoadsideRequest.objects.get(pk=self.request.pk)

        wo = first.create_work_order(user=self.manager)
        again = stale.create_work_order(user=self.manager)

        self.assertEqual(again.id, wo.id)
        self.assertEqual(
            WorkOrder.objects.filter(customer=self.customer, vehicle=self.vehicle).count(),
            1,
        )

    def test_api_create_work_order(self):
        url = f'/api/roadside/requests/{self.request.id}/create_work_order/'
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, getattr(response, 'data', response.content))
        self.assertIn('work_order_id', response.data)
        self.assertEqual(response.data['work_order'], response.data['work_order_id'])
        self.assertTrue(response.data['work_order_number'])

        response2 = self.client.post(url, {}, format='json')
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        self.assertEqual(response2.data['work_order_id'], response.data['work_order_id'])

    def test_cannot_create_from_cancelled(self):
        self.request.status = 'cancelled'
        self.request.save(update_fields=['status'])
        with self.assertRaises(ValueError):
            self.request.create_work_order(user=self.manager)
