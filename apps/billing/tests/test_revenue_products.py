"""Tests for owner-aligned revenue product resolution and billing."""

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounting.models import RevenueProduct
from apps.accounts.models import User
from apps.billing.models import Invoice
from apps.billing.revenue_resolution import (
    resolve_revenue_product_for_part,
    resolve_revenue_product_for_roadside,
    resolve_revenue_product_for_task,
)
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inventory.models import Part, PartCategory
from apps.vehicles.models import Vehicle
from apps.workorders.models import ServiceTask, ServiceTaskType, WorkOrder


class RevenueProductResolutionTests(TestCase):
    def setUp(self):
        self.mechanical = RevenueProduct.objects.create(
            code='labor_mechanical',
            name='Mechanical Work Labour',
            owner_account_code='658',
            revenue_class='labor',
            default_billing_line_type='labor',
            sort_order=1,
        )
        self.assessment = RevenueProduct.objects.create(
            code='service_vehicle_assessment',
            name='Vehicle Assessment',
            owner_account_code='680',
            revenue_class='service',
            default_billing_line_type='other',
            sort_order=2,
        )
        self.parts_general = RevenueProduct.objects.create(
            code='parts_general',
            name='Parts General',
            owner_account_code='661',
            revenue_class='part',
            default_billing_line_type='part',
            sort_order=3,
        )
        self.towing = RevenueProduct.objects.create(
            code='aa_towing',
            name='AA Towing',
            owner_account_code='653',
            revenue_class='aa_roadside',
            roadside_service_type='towing',
            sort_order=4,
        )

    def test_task_type_mapping(self):
        ServiceTaskType.objects.create(
            code='wheel_alignment',
            name='Wheel Alignment',
            revenue_product=self.assessment,
        )
        task = ServiceTask(task_type='wheel_alignment', description='Align wheels')
        self.assertEqual(resolve_revenue_product_for_task(task), self.assessment)

    def test_task_keyword_fallback(self):
        task = ServiceTask(task_type='repair', description='Vehicle assessment report')
        self.assertEqual(resolve_revenue_product_for_task(task).code, 'service_vehicle_assessment')

    def test_part_category_mapping(self):
        category = PartCategory.objects.create(name='Brakes', revenue_product=self.parts_general)
        part = Part(
            part_number='BP-1',
            name='Brake Pad',
            category=category,
        )
        self.assertEqual(resolve_revenue_product_for_part(part), self.parts_general)

    def test_roadside_towing(self):
        product = resolve_revenue_product_for_roadside('towing')
        self.assertEqual(product.code, 'aa_towing')


class WorkOrderRevenueProductBillingTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username='rev_prod_mgr',
            email='rev_prod_mgr@example.com',
            password='password',
            role='manager',
        )
        self.branch = Branch.objects.create(name='Main', code='REVPROD', created_by=self.manager)
        self.manager.managed_branches.add(self.branch)

        self.customer_user = User.objects.create_user(
            username='rev_prod_cust',
            email='rev_prod_cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            customer_number='CUST-REV-001',
            customer_type='individual',
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            vin='1HGBH41JXMN109188',
            year=2021,
            make='Toyota',
            model='Camry',
            license_plate='REV-1',
            current_mileage=40000,
        )

        self.mechanical = RevenueProduct.objects.create(
            code='labor_mechanical',
            name='Mechanical Work Labour',
            owner_account_code='658',
            revenue_class='labor',
            default_billing_line_type='labor',
        )
        ServiceTaskType.objects.create(
            code='repair',
            name='Repair',
            revenue_product=self.mechanical,
        )

        self.work_order = WorkOrder.objects.create(
            work_order_number='WO-REV-PROD',
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='completed',
            customer_concerns='Noise',
            created_by=self.manager,
            odometer_in=40000,
        )
        ServiceTask.objects.create(
            work_order=self.work_order,
            task_type='repair',
            description='Replace belt',
            labor_cost=Decimal('120.00'),
            actual_hours=Decimal('2.00'),
            labor_rate=Decimal('60.00'),
            status='completed',
        )

    def test_invoice_line_gets_revenue_product(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=self.work_order,
            branch=self.branch,
            status='draft',
            created_by=self.manager,
            invoice_date=timezone.now().date(),
        )
        invoice.populate_line_items_from_work_order()

        labor_lines = invoice.line_items.filter(item_type='labor')
        self.assertEqual(labor_lines.count(), 1)
        line = labor_lines.first()
        self.assertEqual(line.revenue_product_id, self.mechanical.id)
        self.assertEqual(line.revenue_product.owner_account_code, '658')

    def test_revenue_by_product_report(self):
        from apps.accounting.management_reports import ManagementReportingService

        invoice = Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=self.work_order,
            branch=self.branch,
            status='sent',
            created_by=self.manager,
            invoice_date=timezone.now().date(),
        )
        invoice.populate_line_items_from_work_order()

        today = timezone.now().date()
        report = ManagementReportingService.get_revenue_by_product(today, today, branch_id=self.branch.id)
        codes = [row['code'] for row in report['products']]
        self.assertIn('labor_mechanical', codes)
        mech_row = next(row for row in report['products'] if row['code'] == 'labor_mechanical')
        self.assertEqual(mech_row['owner_account_code'], '658')
        self.assertGreater(mech_row['invoiced'], 0)

    def test_work_order_line_preview_api(self):
        from rest_framework.test import APIClient

        from apps.workorders.models import ServiceTask

        ServiceTask.objects.create(
            work_order=self.work_order,
            task_type='repair',
            description='Oil change',
            labor_cost=Decimal('80.00'),
            actual_hours=Decimal('1.00'),
            labor_rate=Decimal('80.00'),
            status='completed',
        )
        client = APIClient()
        client.force_authenticate(user=self.manager)
        response = client.get(
            '/api/billing/invoices/work-order-line-preview/',
            {'work_order': self.work_order.id},
        )
        self.assertEqual(response.status_code, 200)
        lines = response.data['line_items']
        self.assertGreaterEqual(len(lines), 1)
        self.assertEqual(lines[0].get('revenue_product_code'), 'labor_mechanical')
