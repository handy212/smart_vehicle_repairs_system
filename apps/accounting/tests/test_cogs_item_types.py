"""COGS posting respects catalog item types."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from django.utils import timezone

from apps.accounting.models import JournalEntry
from apps.accounting.services import AccountingService
from apps.billing.models import Invoice, InvoiceLineItem
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inventory.models import Part, PartCategory

User = get_user_model()


class CogsItemTypeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='cogs-type-admin',
            email='cogs-type@example.com',
            password='password',
            role='admin',
            is_staff=True,
        )
        self.branch = Branch.objects.create(name='Main', code='COGS', created_by=self.user)
        customer_user = User.objects.create_user(
            username='cogs-cust',
            email='cogs-cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user)
        self.category = PartCategory.objects.create(name='Shop')

    def test_post_cogs_skips_service_catalog_lines(self):
        service_part = Part.objects.create(
            part_number='SVC-001',
            name='Shop supplies fee',
            category=self.category,
            branch=self.branch,
            item_type='service',
            cost_price=Decimal('5.00'),
            selling_price=Decimal('15.00'),
        )
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            subtotal=Decimal('15.00'),
            tax_amount=Decimal('0'),
            total=Decimal('15.00'),
            invoice_date=timezone.now().date(),
            created_by=self.user,
        )
        InvoiceLineItem.objects.create(
            invoice=invoice,
            item_type='other',
            description='Shop supplies',
            part=service_part,
            quantity=Decimal('1'),
            unit_price=Decimal('15.00'),
        )

        cogs_entry = AccountingService.post_cogs(invoice)

        self.assertIsNone(cogs_entry)
        invoice_type = ContentType.objects.get_for_model(invoice)
        self.assertFalse(
            JournalEntry.objects.filter(
                content_type=invoice_type,
                object_id=invoice.id,
                reference=f'{invoice.invoice_number}-COGS',
            ).exists()
        )
