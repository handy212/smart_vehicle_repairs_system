from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Estimate, EstimateLineItem, Invoice
from apps.billing.serializers import InvoiceCreateSerializer
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder, WorkOrderPart, ServiceTask


class InvoiceFromApprovedEstimateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username='invoice-est-staff',
            email='invoice-est-staff@example.com',
            password='testpass',
            role='admin',
            is_staff=True,
        )
        self.customer_user = User.objects.create_user(
            username='invoice-est-customer',
            email='invoice-est-customer@example.com',
            password='testpass',
            role='customer',
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.branch = Branch.objects.create(
            name='Invoice Estimate Branch',
            code='IEB',
            created_by=self.staff,
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            year=2020,
            make='Toyota',
            model='Camry',
            vin='1HGBH41JXMN109187',
            license_plate='INV-EST-1',
            current_mileage=50000,
        )
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='completed',
            odometer_in=50000,
            customer_concerns='Battery and labor',
        )
        WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name='Battery 12V',
            part_number='BAT-12V',
            quantity=Decimal('2.00'),
            unit_cost=Decimal('79.00'),
            status='installed',
        )
        ServiceTask.objects.create(
            work_order=self.work_order,
            description='Replace battery',
            status='completed',
            is_workflow_task=False,
            actual_hours=Decimal('0.01'),
            labor_rate=Decimal('200.00'),
            labor_cost=Decimal('2.00'),
        )
        self.estimate = Estimate.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=self.work_order,
            branch=self.branch,
            status='approved',
            valid_until=timezone.now().date() + timedelta(days=14),
            created_by=self.staff,
            approved_date=timezone.now(),
            approved_by=self.staff,
        )
        EstimateLineItem.objects.create(
            estimate=self.estimate,
            item_type='part',
            description='Battery 12V',
            part_number='BAT-12V',
            quantity=Decimal('2.00'),
            unit_price=Decimal('129.99'),
            notes='[DIAG-REC:1] Recommendation: battery',
        )
        EstimateLineItem.objects.create(
            estimate=self.estimate,
            item_type='labor',
            description='diagnosis',
            quantity=Decimal('2.00'),
            unit_price=Decimal('150.00'),
            labor_hours=Decimal('2.00'),
            labor_rate=Decimal('150.00'),
        )
        EstimateLineItem.objects.create(
            estimate=self.estimate,
            item_type='labor',
            description='fixing',
            quantity=Decimal('1.00'),
            unit_price=Decimal('300.00'),
            labor_hours=Decimal('1.00'),
            labor_rate=Decimal('300.00'),
        )
        self.estimate.calculate_totals()
        self.estimate.refresh_from_db()

    def test_invoice_create_serializer_uses_approved_estimate_not_wo_actuals(self):
        serializer = InvoiceCreateSerializer(
            data={'work_order': self.work_order.id},
            context={'request': type('Req', (), {'user': self.staff})()},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        invoice = serializer.save()

        self.assertEqual(invoice.estimate_id, self.estimate.id)
        self.assertEqual(invoice.total, self.estimate.total)
        self.assertNotEqual(invoice.total, Decimal('192.00'))
        self.assertEqual(invoice.line_items.count(), 3)

        part = self.work_order.parts.get()
        part.refresh_from_db()
        self.assertEqual(part.unit_cost, Decimal('129.99'))
        self.assertEqual(part.selling_price, Decimal('259.98'))

        task = self.work_order.tasks.filter(is_workflow_task=False).get()
        task.refresh_from_db()
        self.assertEqual(task.labor_cost, Decimal('600.00'))

    def test_api_invoice_create_from_work_order_matches_estimate(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(
            '/api/billing/invoices/',
            {'work_order': self.work_order.id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        invoice = Invoice.objects.get(pk=response.data['id'])
        self.assertEqual(invoice.total, self.estimate.total)
        self.assertEqual(invoice.estimate_id, self.estimate.id)
        self.assertEqual(invoice.line_items.count(), 3)
