from datetime import date

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from apps.accounts.models import User
from apps.billing.serializers import InvoiceCreateSerializer
from apps.branches.models import Branch
from apps.customers.models import Customer


class StandaloneInvoiceCreateTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            username='standalone-inv-staff',
            email='standalone-inv-staff@example.com',
            password='testpass',
            role='admin',
            is_staff=True,
        )
        self.customer_user = User.objects.create_user(
            username='standalone-inv-customer',
            email='standalone-inv-customer@example.com',
            password='testpass',
            role='customer',
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            payment_terms='net_15',
        )
        self.branch = Branch.objects.create(
            name='Standalone Invoice Branch',
            code='SIB',
            created_by=self.staff,
        )
        self.factory = APIRequestFactory()
        self.request = self.factory.post('/')
        self.request.user = self.staff
        self.request.branch = self.branch
        self.request.active_branch = self.branch

    def _line_items(self):
        return [
            {
                'item_type': 'labor',
                'description': 'Shop labor',
                'quantity': '1',
                'unit_price': '100.00',
                'is_taxable': True,
            }
        ]

    def test_standalone_invoice_does_not_require_vehicle(self):
        serializer = InvoiceCreateSerializer(
            data={
                'customer': self.customer.pk,
                'invoice_date': timezone.now().date().isoformat(),
                'due_date': (timezone.now().date()).isoformat(),
                'line_items': self._line_items(),
            },
            context={'request': self.request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        invoice = serializer.save()
        self.assertIsNone(invoice.vehicle_id)
        self.assertEqual(invoice.customer_id, self.customer.pk)

    def test_standalone_invoice_defaults_terms_from_customer_payment_terms(self):
        serializer = InvoiceCreateSerializer(
            data={
                'customer': self.customer.pk,
                'invoice_date': timezone.now().date().isoformat(),
                'due_date': date.today().isoformat(),
                'line_items': self._line_items(),
            },
            context={'request': self.request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        invoice = serializer.save()
        self.assertEqual(invoice.terms, 'Net 15')

    def test_explicit_terms_are_not_overwritten_by_customer_defaults(self):
        serializer = InvoiceCreateSerializer(
            data={
                'customer': self.customer.pk,
                'invoice_date': timezone.now().date().isoformat(),
                'due_date': date.today().isoformat(),
                'terms': 'Net 60',
                'line_items': self._line_items(),
            },
            context={'request': self.request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        invoice = serializer.save()
        self.assertEqual(invoice.terms, 'Net 60')
