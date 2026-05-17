from datetime import date, time, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.appointments.models import Appointment
from apps.branches.models import Branch
from apps.billing.models import Invoice
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.reporting.models import ReportExportLog, ReportSchedule, SavedReport
from apps.workorders.models import WorkOrder, WorkOrderPart


class ReportingEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='reports-admin',
            email='reports-admin@example.com',
            password='password',
            role='admin',
            is_staff=True,
            is_superuser=True,
        )
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            phone='1234567890',
            address='Main Street',
            city='Accra',
            state='Greater Accra',
            zip_code='00000',
            created_by=self.user,
        )
        self.other_branch = Branch.objects.create(
            name='Other Branch',
            code='OTHR',
            phone='1234567890',
            address='Other Street',
            city='Kumasi',
            state='Ashanti',
            zip_code='00000',
            created_by=self.user,
        )
        self.user.branch = self.branch
        self.user.save(update_fields=['branch'])
        SystemModule.objects.get_or_create(
            slug='reports',
            defaults={'name': 'Reports', 'is_enabled': True},
        )
        self.client.force_authenticate(self.user)

    def _create_customer_vehicle(self, suffix):
        customer_user = User.objects.create_user(
            username=f'customer-{suffix}',
            email=f'customer-{suffix}@example.com',
            password='password',
            role='customer',
        )
        customer = Customer.objects.create(
            user=customer_user,
            customer_number=f'CUST-{suffix}',
        )
        vehicle = Vehicle.objects.create(
            owner=customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin=f'1HGBH41JXMN10{suffix:04d}',
            license_plate=f'CAR-{suffix}',
            current_mileage=10000,
        )
        return customer, vehicle

    def test_invalid_date_returns_400(self):
        response = self.client.get('/api/reporting/revenue-report/', {
            'start_date': 'bad-date',
            'end_date': date.today().isoformat(),
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', response.data)

    def test_appointment_statistics_are_branch_scoped(self):
        today = date.today()
        customer_one, vehicle_one = self._create_customer_vehicle(1)
        customer_two, vehicle_two = self._create_customer_vehicle(2)

        Appointment.objects.create(
            customer=customer_one,
            vehicle=vehicle_one,
            branch=self.branch,
            appointment_date=today,
            appointment_time=time(9, 0),
            service_type='maintenance',
            customer_concerns='Main branch appointment',
            created_by=self.user,
        )
        Appointment.objects.create(
            customer=customer_two,
            vehicle=vehicle_two,
            branch=self.other_branch,
            appointment_date=today,
            appointment_time=time(10, 0),
            service_type='maintenance',
            customer_concerns='Other branch appointment',
            created_by=self.user,
        )

        response = self.client.get('/api/reporting/appointment-statistics/', {
            'start_date': (today - timedelta(days=1)).isoformat(),
            'end_date': (today + timedelta(days=1)).isoformat(),
            'branch': self.branch.id,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['summary']['total_appointments'], 1)

    def test_profit_margin_report_uses_work_order_part_costs(self):
        today = date.today()
        customer, vehicle = self._create_customer_vehicle(3)
        work_order = WorkOrder.objects.create(
            customer=customer,
            vehicle=vehicle,
            branch=self.branch,
            status='draft',
            customer_concerns='Brake service',
            odometer_in=10000,
            created_by=self.user,
        )
        WorkOrderPart.objects.create(
            work_order=work_order,
            part_name='Brake pad set',
            quantity=Decimal('1.00'),
            unit_cost=Decimal('60.00'),
            markup_percentage=Decimal('66.67'),
        )
        Invoice.objects.create(
            customer=customer,
            vehicle=vehicle,
            work_order=work_order,
            branch=self.branch,
            status='paid',
            invoice_date=today,
            labor_subtotal=Decimal('0.00'),
            parts_subtotal=Decimal('100.00'),
            subtotal=Decimal('100.00'),
            total=Decimal('100.00'),
            amount_paid=Decimal('100.00'),
            created_by=self.user,
        )

        response = self.client.get('/api/reporting/profit-margin-report/', {
            'start_date': (today - timedelta(days=1)).isoformat(),
            'end_date': (today + timedelta(days=1)).isoformat(),
            'branch': self.branch.id,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['revenue']['parts'], 100.0)
        self.assertEqual(response.data['costs']['parts'], 60.0)
        self.assertEqual(response.data['profit']['gross_profit'], 40.0)

    def test_saved_report_api_creates_owned_report(self):
        response = self.client.post('/api/reporting/saved-reports/', {
            'name': 'Monthly Revenue',
            'report_type': 'revenue',
            'description': 'Management review',
            'parameters': {'start_date': date.today().isoformat()},
            'is_public': False,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        saved_report = SavedReport.objects.get(id=response.data['id'])
        self.assertEqual(saved_report.created_by, self.user)
        self.assertEqual(saved_report.report_type, 'revenue')

    def test_schedule_api_validates_email_recipients(self):
        response = self.client.post('/api/reporting/schedules/', {
            'name': 'Weekly Pack',
            'report_type': 'work_orders',
            'frequency': 'weekly',
            'email_recipients': 'bad-email',
            'parameters': {},
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email_recipients', response.data)

    def test_export_log_api_records_request_context(self):
        response = self.client.post('/api/reporting/export-logs/', {
            'report_type': 'revenue',
            'report_name': 'Revenue Summary',
            'export_format': 'pdf',
            'status': 'completed',
            'parameters': {'period': 'daily'},
            'file_name': 'revenue.pdf',
        }, format='json', HTTP_USER_AGENT='Reporting Test')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        log = ReportExportLog.objects.get(id=response.data['id'])
        self.assertEqual(log.created_by, self.user)
        self.assertEqual(log.user_agent, 'Reporting Test')

    def test_report_catalog_exposes_enterprise_controls(self):
        ReportSchedule.objects.create(
            name='Monthly Revenue',
            report_type='revenue',
            frequency='monthly',
            email_recipients='manager@example.com',
            next_run_date=timezone.now(),
            created_by=self.user,
        )

        response = self.client.get('/api/reporting/catalog/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['controls']['branch_scoped'])
        self.assertGreaterEqual(len(response.data['reports']), 10)
