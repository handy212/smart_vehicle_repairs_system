"""Cross-customer isolation tests for the customer portal API."""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.appointments.models import Appointment
from apps.billing.models import Estimate, Invoice
from apps.customers.models import Customer
from apps.inspections.models import InspectionCategory, InspectionItem, InspectionTemplate, VehicleInspection
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder


class PortalCustomerIsolationTests(APITestCase):
    def setUp(self):
        for slug, name in (
            ('customers', 'Customers'),
            ('vehicles', 'Vehicles'),
            ('billing', 'Billing'),
            ('workorders', 'Work Orders'),
            ('appointments', 'Appointments'),
            ('inspections', 'Inspections'),
        ):
            SystemModule.objects.update_or_create(
                slug=slug,
                defaults={'name': name, 'is_enabled': True},
            )

        self.staff = User.objects.create_user(
            username='portal-staff',
            email='portal-staff@example.com',
            password='testpass',
            role='admin',
            is_staff=True,
        )

        self.user_a = User.objects.create_user(
            username='customer-a',
            email='customer-a@example.com',
            password='testpass',
            role='customer',
        )
        self.user_b = User.objects.create_user(
            username='customer-b',
            email='customer-b@example.com',
            password='testpass',
            role='customer',
        )
        self.customer_a = Customer.objects.create(user=self.user_a)
        self.customer_b = Customer.objects.create(user=self.user_b)

        self.vehicle_a = Vehicle.objects.create(
            owner=self.customer_a,
            year=2022,
            make='Toyota',
            model='Corolla',
            vin='1A8BFAFP5RT000001',
            license_plate='A-001',
            current_mileage=10000,
        )
        self.vehicle_b = Vehicle.objects.create(
            owner=self.customer_b,
            year=2021,
            make='Honda',
            model='Fit',
            vin='1A8BFAFP5RT000002',
            license_plate='B-001',
            current_mileage=20000,
        )

        self.work_order_a = WorkOrder.objects.create(
            work_order_number='WO-A-001',
            customer=self.customer_a,
            vehicle=self.vehicle_a,
            status='completed',
            odometer_in=10000,
        )
        self.work_order_b = WorkOrder.objects.create(
            work_order_number='WO-B-001',
            customer=self.customer_b,
            vehicle=self.vehicle_b,
            status='in_progress',
            odometer_in=20000,
        )

        self.invoice_a = Invoice.objects.create(
            customer=self.customer_a,
            vehicle=self.vehicle_a,
            work_order=self.work_order_a,
            invoice_number='INV-A-001',
            status='sent',
            due_date=timezone.now().date(),
            total=Decimal('100.00'),
            created_by=self.staff,
        )
        self.invoice_b = Invoice.objects.create(
            customer=self.customer_b,
            vehicle=self.vehicle_b,
            invoice_number='INV-B-001',
            status='sent',
            due_date=timezone.now().date(),
            total=Decimal('200.00'),
            created_by=self.staff,
        )

        self.estimate_a = Estimate.objects.create(
            customer=self.customer_a,
            vehicle=self.vehicle_a,
            work_order=self.work_order_a,
            estimate_number='EST-A-001',
            status='sent',
            valid_until=timezone.now().date() + timedelta(days=14),
            total=Decimal('100.00'),
            created_by=self.staff,
        )
        self.estimate_b = Estimate.objects.create(
            customer=self.customer_b,
            vehicle=self.vehicle_b,
            estimate_number='EST-B-001',
            status='sent',
            valid_until=timezone.now().date() + timedelta(days=14),
            total=Decimal('200.00'),
            created_by=self.staff,
        )

        self.appointment_a = Appointment.objects.create(
            customer=self.customer_a,
            vehicle=self.vehicle_a,
            appointment_date=timezone.now().date() + timedelta(days=3),
            appointment_time=timezone.now().time().replace(hour=10, minute=0, second=0, microsecond=0),
            status='confirmed',
        )
        self.appointment_b = Appointment.objects.create(
            customer=self.customer_b,
            vehicle=self.vehicle_b,
            appointment_date=timezone.now().date() + timedelta(days=4),
            appointment_time=timezone.now().time().replace(hour=11, minute=0, second=0, microsecond=0),
            status='confirmed',
        )

        template = InspectionTemplate.objects.create(
            name='Portal IDOR Template',
            created_by=self.staff,
        )
        category = InspectionCategory.objects.create(template=template, name='Safety', order=1)
        InspectionItem.objects.create(category=category, name='Brakes', item_type='pass_fail', order=1)
        self.inspection_a = VehicleInspection.objects.create(
            vehicle=self.vehicle_a,
            template=template,
            performed_by=self.staff,
            inspection_number='INSP-A-001',
            odometer_reading=10000,
            status='completed',
        )
        self.inspection_b = VehicleInspection.objects.create(
            vehicle=self.vehicle_b,
            template=template,
            performed_by=self.staff,
            inspection_number='INSP-B-001',
            odometer_reading=20000,
            status='completed',
        )

    def test_portal_vehicles_only_returns_own(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get('/api/portal/vehicles/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item['id'] for item in response.data}
        self.assertEqual(ids, {self.vehicle_a.id})

    def test_portal_invoices_only_returns_own(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get('/api/portal/invoices/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item['id'] for item in response.data}
        self.assertEqual(ids, {self.invoice_a.id})

    def test_portal_history_only_returns_own_work_orders(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get('/api/portal/history/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item['id'] for item in response.data}
        self.assertEqual(ids, {self.work_order_a.id})

    def test_portal_inspections_only_returns_own(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get('/api/portal/inspections/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item['id'] for item in response.data}
        self.assertEqual(ids, {self.inspection_a.id})

    def test_portal_dashboard_stats_scoped_to_own_customer(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get('/api/portal/dashboard/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        stats = response.data['stats']
        self.assertEqual(stats['total_vehicles'], 1)
        recent_invoice_ids = {row['id'] for row in response.data['recent_invoices']}
        self.assertEqual(recent_invoice_ids, {self.invoice_a.id})
        self.assertNotIn(self.invoice_b.id, recent_invoice_ids)

    def test_portal_booking_rejects_other_customers_vehicle(self):
        self.client.force_authenticate(self.user_a)
        future = timezone.now().date() + timedelta(days=5)
        response = self.client.post('/api/portal/bookings/', {
            'vehicle_id': self.vehicle_b.id,
            'appointment_date': future.isoformat(),
            'appointment_time': '10:00:00',
            'service_type': 'maintenance',
            'customer_concerns': 'Should fail',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('vehicle_id', response.data)

    def test_customer_cannot_list_other_customer_via_billing_api(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get('/api/billing/invoices/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        ids = {row['id'] for row in results}
        self.assertNotIn(self.invoice_b.id, ids)

    def test_customer_cannot_fetch_other_invoice_detail(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get(f'/api/billing/invoices/{self.invoice_b.id}/')
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_customer_cannot_fetch_other_estimate_detail(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get(f'/api/billing/estimates/{self.estimate_b.id}/')
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_customer_cannot_fetch_other_vehicle(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get(f'/api/vehicles/vehicles/{self.vehicle_b.id}/')
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_customer_cannot_fetch_other_work_order_detail(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get(f'/api/workorders/work-orders/{self.work_order_b.id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_appointments_list_excludes_other_customer(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get('/api/appointments/appointments/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        ids = {row['id'] for row in results}
        self.assertIn(self.appointment_a.id, ids)
        self.assertNotIn(self.appointment_b.id, ids)

    def test_customer_cannot_fetch_other_appointment_detail(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get(f'/api/appointments/appointments/{self.appointment_b.id}/')
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))
