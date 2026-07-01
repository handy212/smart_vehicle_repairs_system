"""Billing integration tests for inspection/diagnostic workflow profiles."""

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.billing.models import Estimate, Invoice
from apps.billing.work_order_line_preview import build_work_order_invoice_line_payloads
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inspections.models import InspectionTemplate, VehicleInspection
from apps.inventory.models import Part
from apps.vehicles.models import Vehicle
from apps.workorders.job_type_seed import seed_workflow_profiles_and_job_types
from apps.workorders.job_types import JobType
from apps.workorders.models import WorkOrder


class ProfileBillingIntegrationTests(TestCase):
    def setUp(self):
        seed_workflow_profiles_and_job_types(overwrite=True)
        self.manager = User.objects.create_user(
            username='profile_bill_mgr',
            email='profile_bill_mgr@example.com',
            password='password',
            role='manager',
        )
        self.branch = Branch.objects.create(name='Main', code='PROFBILL', created_by=self.manager)
        self.manager.managed_branches.add(self.branch)

        self.customer_user = User.objects.create_user(
            username='profile_bill_cust',
            email='profile_bill_cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            customer_number='CUST-PROFBILL-001',
            customer_type='individual',
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            vin='1HGBH41JXMN109188',
            year=2021,
            make='Honda',
            model='Civic',
            license_plate='PROF-1',
            current_mileage=12000,
        )
        self.inspection_job_type = JobType.objects.get(code='vehicle_inspection')
        self.diagnostic_job_type = JobType.objects.get(code='diagnostic_inspection')

    def _completed_inspection_work_order(self, *, estimated_total=Decimal('75.00')) -> WorkOrder:
        template = InspectionTemplate.objects.create(
            name='Profile Billing Inspection',
            created_by=self.manager,
        )
        wo = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            job_type=self.inspection_job_type,
            customer_concerns='Annual inspection',
            odometer_in=12000,
            odometer_out=12050,
            estimated_labor_cost=estimated_total,
            status='completed',
            created_by=self.manager,
        )
        VehicleInspection.objects.create(
            work_order=wo,
            vehicle=self.vehicle,
            branch=self.branch,
            template=template,
            performed_by=self.manager,
            status='completed',
        )
        return wo

    def test_inspection_only_invoice_preview_uses_profile_service_fee(self):
        wo = self._completed_inspection_work_order(estimated_total=Decimal('85.00'))
        payloads = build_work_order_invoice_line_payloads(wo)

        self.assertEqual(len(payloads), 1)
        self.assertEqual(payloads[0]['unit_price'], Decimal('85.00'))
        self.assertIn('Vehicle Inspection', payloads[0]['description'])

    def test_inspection_only_invoice_preview_prefers_catalog_part_price(self):
        from apps.accounting.models import RevenueProduct

        product, _ = RevenueProduct.objects.get_or_create(
            code='service_vehicle_assessment',
            defaults={
                'name': 'Vehicle Assessment',
                'owner_account_code': '680',
                'owner_account_label': 'Vehicle Assessment Sales',
                'revenue_class': 'service',
                'default_billing_line_type': 'other',
                'is_active': True,
            },
        )
        from apps.inventory.models import PartCategory

        category = PartCategory.objects.create(name='Assessment Services')
        part = Part.objects.create(
            name='Vehicle Assessment',
            part_number='REV-SVC-ASSESS-TEST',
            category=category,
            cost_price=Decimal('10.00'),
            selling_price=Decimal('120.00'),
        )
        product.catalog_part = part
        product.save(update_fields=['catalog_part', 'updated_at'])

        wo = self._completed_inspection_work_order(estimated_total=Decimal('85.00'))
        payloads = build_work_order_invoice_line_payloads(wo)

        self.assertEqual(payloads[0]['unit_price'], Decimal('120.00'))

    def _issued_invoice(self, wo, *, total=Decimal('85.00')) -> Invoice:
        invoice = Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=wo,
            branch=self.branch,
            status='draft',
            subtotal=total,
            total=total,
            created_by=self.manager,
            invoice_date=timezone.now().date(),
        )
        Invoice.objects.filter(pk=invoice.pk).update(status='sent')
        invoice.refresh_from_db()
        return invoice

    def test_completed_cannot_close_without_invoiced_status(self):
        wo = self._completed_inspection_work_order()
        self._issued_invoice(wo)

        can_close, error = wo.can_transition_to('closed')
        self.assertFalse(can_close)

    def test_mark_invoiced_requires_issued_invoice(self):
        wo = self._completed_inspection_work_order()
        Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=wo,
            branch=self.branch,
            status='draft',
            subtotal=Decimal('85.00'),
            total=Decimal('85.00'),
            created_by=self.manager,
            invoice_date=timezone.now().date(),
        )

        can_invoice, error = wo.can_transition_to('invoiced')
        self.assertFalse(can_invoice)
        self.assertIn('draft', (error or '').lower())

    def test_diagnostic_only_blocks_direct_invoice_when_estimate_is_billable(self):
        from apps.billing.serializers import InvoiceCreateSerializer
        from rest_framework.test import APIRequestFactory

        wo = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            job_type=self.diagnostic_job_type,
            customer_concerns='Check engine light',
            odometer_in=12000,
            diagnosis_notes='Sensor fault identified.',
            status='completed',
            created_by=self.manager,
        )
        estimate = Estimate.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=wo,
            branch=self.branch,
            status='approved',
            subtotal=Decimal('150.00'),
            total=Decimal('150.00'),
            created_by=self.manager,
            estimate_date=timezone.now().date(),
            valid_until=timezone.now().date(),
        )
        estimate.line_items.create(
            description='Diagnostic labor',
            item_type='labor',
            quantity=Decimal('1'),
            unit_price=Decimal('150.00'),
            total=Decimal('150.00'),
            order=0,
        )

        factory = APIRequestFactory()
        request = factory.post('/')
        request.user = self.manager
        serializer = InvoiceCreateSerializer(
            data={
                'work_order': wo.pk,
                'line_items': [
                    {
                        'description': 'Bypass attempt',
                        'item_type': 'labor',
                        'quantity': '1',
                        'unit_price': '50.00',
                    }
                ],
            },
            context={'request': request},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('line_items', serializer.errors)

    def test_invoiced_can_close_with_issued_invoice(self):
        wo = self._completed_inspection_work_order()
        self._issued_invoice(wo)
        wo.status = 'invoiced'
        wo.save(update_fields=['status', 'updated_at'])

        can_close, error = wo.can_transition_to('closed')
        self.assertTrue(can_close, error)
