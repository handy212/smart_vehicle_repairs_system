"""Tests for branch-scoped revenue products and COGS unit_cost posting."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.accounting.models import RevenueProduct
from apps.accounting.services import AccountingService
from apps.billing.models import Invoice
from apps.billing.revenue_resolution import (
    resolve_revenue_product_by_code,
    resolve_revenue_product_for_part,
    scope_revenue_products_for_branch,
)
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inventory.models import InventoryTransaction, Part, PartCategory
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder

User = get_user_model()


class BranchRevenueProductTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='branch_rev',
            email='branch_rev@example.com',
            password='password',
            role='manager',
        )
        self.branch_a = Branch.objects.create(name='Kumasi', code='KSI', created_by=self.user)
        self.branch_b = Branch.objects.create(name='Accra', code='ACC', created_by=self.user)
        self.company_product = RevenueProduct.objects.create(
            code='labor_mechanical',
            name='Mechanical Labour',
            owner_account_code='658',
            revenue_class='labor',
            default_billing_line_type='labor',
        )
        self.branch_product = RevenueProduct.objects.create(
            code='labor_mechanical',
            name='Mechanical Labour (Kumasi)',
            owner_account_code='658K',
            revenue_class='labor',
            default_billing_line_type='labor',
            branch=self.branch_a,
        )

    def test_branch_override_wins_over_company_default(self):
        product = resolve_revenue_product_by_code('labor_mechanical', branch=self.branch_a)
        self.assertEqual(product.pk, self.branch_product.pk)

    def test_company_default_when_no_branch_override(self):
        product = resolve_revenue_product_by_code('labor_mechanical', branch=self.branch_b)
        self.assertEqual(product.pk, self.company_product.pk)

    def test_scope_includes_branch_and_company_rows(self):
        qs = scope_revenue_products_for_branch(RevenueProduct.objects.all(), self.branch_a.id)
        codes = set(qs.values_list('code', flat=True))
        self.assertIn('labor_mechanical', codes)
        self.assertEqual(qs.filter(branch=self.branch_a).count(), 1)
        self.assertEqual(qs.filter(branch__isnull=True).count(), 1)


class CogsUnitCostTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='cogs_user',
            email='cogs@example.com',
            password='password',
            role='manager',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN', created_by=self.user)
        customer_user = User.objects.create_user(
            username='cust_cogs',
            email='cust_cogs@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-COGS')
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Corolla',
            year=2020,
            vin='COGS1234567890123',
            current_mileage=1000,
        )
        category = PartCategory.objects.create(name='Filters')
        self.part = Part.objects.create(
            part_number='FIL-COGS',
            name='Oil Filter',
            category=category,
            item_type='inventory',
            cost_price=Decimal('10.00'),
            selling_price=Decimal('20.00'),
        )
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='completed',
            work_order_number='WO-COGS',
            odometer_in=1000,
            created_by=self.user,
        )
        InventoryTransaction.objects.create(
            part=self.part,
            branch=self.branch,
            transaction_type='sale',
            quantity=-2,
            unit_cost=Decimal('12.50'),
            balance_after=8,
            work_order=self.work_order,
            created_by=self.user,
        )
        self.invoice = Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=self.work_order,
            branch=self.branch,
            status='sent',
            subtotal=Decimal('100.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('100.00'),
            invoice_date=timezone.now().date(),
            created_by=self.user,
        )
        from apps.billing.models import InvoiceLineItem

        InvoiceLineItem.objects.create(
            invoice=self.invoice,
            item_type='part',
            description='Oil Filter',
            part=self.part,
            quantity=Decimal('2'),
            unit_price=Decimal('20.00'),
            is_taxable=False,
        )

    def test_post_cogs_uses_sale_unit_cost_not_catalog_cost(self):
        je = AccountingService.post_cogs(self.invoice)
        self.assertIsNotNone(je)
        cogs_debit = je.transactions.filter(transaction_type='debit').first()
        self.assertEqual(cogs_debit.amount, Decimal('25.00'))
