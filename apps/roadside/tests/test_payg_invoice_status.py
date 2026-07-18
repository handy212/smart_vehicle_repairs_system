"""Pay As You Go invoice payment fields on roadside detail serializer."""
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.billing.models import Invoice
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.roadside.models import RoadsideRequest
from apps.roadside.serializers import RoadsideRequestSerializer
from apps.vehicles.models import Vehicle


class PayAsYouGoInvoiceStatusTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username='payg_mgr',
            email='payg_mgr@example.com',
            password='password',
            role='manager',
        )
        self.branch = Branch.objects.create(
            name='PAYG Branch',
            code='PAYG1',
            created_by=self.manager,
        )
        cust_user = User.objects.create_user(
            username='payg_cust',
            email='payg_cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer(user=cust_user)
        self.customer._numbering_branch = self.branch
        self.customer.save()
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Honda',
            model='Civic',
            year=2018,
            vin='PAYGTESTVIN000001',
            license_plate='PAYG1',
            current_mileage=40000,
        )

    def _make_request(self, **kwargs):
        defaults = dict(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            service_type='jump_start',
            status='completed',
            breakdown_location='Main St',
            customer_phone='555-0100',
            description='Battery dead',
            is_covered_by_subscription=False,
            charge_amount=Decimal('150.00'),
            created_by=self.manager,
            completed_at=timezone.now(),
        )
        defaults.update(kwargs)
        return RoadsideRequest.objects.create(**defaults)

    def test_payg_unpaid_invoice_fields(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            invoice_date=timezone.now().date(),
            status='sent',
            subtotal=Decimal('150.00'),
            total=Decimal('150.00'),
            amount_paid=Decimal('0.00'),
            amount_due=Decimal('150.00'),
            created_by=self.manager,
        )
        req = self._make_request(invoice=invoice)
        data = RoadsideRequestSerializer(req).data

        self.assertTrue(data['is_pay_as_you_go'])
        self.assertEqual(data['invoice_status'], 'sent')
        self.assertEqual(data['invoice_total'], '150.00')
        self.assertEqual(data['invoice_amount_paid'], '0.00')
        self.assertEqual(data['invoice_amount_due'], '150.00')
        self.assertFalse(data['invoice_is_paid'])
        self.assertEqual(data['invoice_number'], invoice.invoice_number)

    def test_payg_paid_invoice_fields(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            invoice_date=timezone.now().date(),
            status='paid',
            subtotal=Decimal('150.00'),
            total=Decimal('150.00'),
            amount_paid=Decimal('150.00'),
            amount_due=Decimal('0.00'),
            created_by=self.manager,
        )
        req = self._make_request(invoice=invoice)
        data = RoadsideRequestSerializer(req).data

        self.assertTrue(data['is_pay_as_you_go'])
        self.assertTrue(data['invoice_is_paid'])
        self.assertEqual(data['invoice_status'], 'paid')

    def test_subscription_covered_not_payg(self):
        req = self._make_request(
            is_covered_by_subscription=True,
            charge_amount=Decimal('0.00'),
            invoice=None,
        )
        data = RoadsideRequestSerializer(req).data
        self.assertFalse(data['is_pay_as_you_go'])
        self.assertIsNone(data['invoice_is_paid'])
