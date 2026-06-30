"""Regression tests for accounting audit remediation (Wave 4)."""
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounting.models import AccountingControl, JournalEntry
from apps.accounting.services import AccountingService
from apps.accounting.subledger_reconciliation import reconcile_subledgers
from apps.accounts.models import User
from apps.billing.models import (
    Bill,
    BillLineItem,
    VendorCredit,
    VendorCreditApplication,
    VendorCreditLineItem,
)
from apps.branches.models import Branch
from apps.fixed_assets.depreciation_service import DepreciationService
from apps.fixed_assets.models import AssetCategory, FixedAsset
from apps.inventory.models import Supplier


class Wave4RemediationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='wave4_admin',
            email='wave4@example.com',
            password='password',
            role='admin',
            first_name='Wave',
            last_name='Four',
        )
        self.branch = Branch.objects.create(
            name='Wave 4 Branch',
            code='HQ',
            phone='555-5000',
            address='5 Wave St',
            city='Wave',
            state='WV',
            zip_code='50005',
            created_by=self.user,
        )
        self.vendor = Supplier.objects.create(
            name='Wave Supplier',
            supplier_code='WAVE-SUP',
        )
        self.category = AssetCategory.objects.create(
            name='Equipment',
            gl_asset_account_code='1600',
            gl_depreciation_expense_account_code='5900',
            gl_accumulated_depreciation_account_code='1610',
        )
        self._wire_accounting_controls()

    def _wire_accounting_controls(self):
        controls = AccountingControl.get_settings()
        controls.accounts_receivable_account = AccountingService.get_or_create_account(
            '1200', 'Accounts Receivable', 'asset', 'debit'
        )
        controls.accounts_payable_account = AccountingService.get_or_create_account(
            '2000', 'Accounts Payable', 'liability', 'credit'
        )
        controls.sales_revenue_account = AccountingService.get_or_create_account(
            '4000', 'Sales Revenue', 'income', 'credit'
        )
        controls.sales_discount_account = AccountingService.get_or_create_account(
            '4100', 'Sales Returns', 'income', 'debit'
        )
        controls.sales_tax_payable_account = AccountingService.get_or_create_account(
            '2100', 'Sales Tax Payable', 'liability', 'credit'
        )
        controls.default_expense_account = AccountingService.get_or_create_account(
            '5000', 'Operating Expense', 'expense', 'debit'
        )
        controls.input_tax_account = AccountingService.get_or_create_account(
            '2200', 'Input Tax', 'asset', 'debit'
        )
        controls.inventory_asset_account = AccountingService.get_or_create_account(
            '1500', 'Inventory Asset', 'asset', 'debit'
        )
        bank = AccountingService.get_or_create_account('1100', 'Operating Bank', 'asset', 'debit')
        bank.account_subtype = 'bank'
        bank.save(update_fields=['account_subtype'])
        controls.default_bank_account = bank
        controls.shop_supplies_revenue_account = controls.sales_revenue_account
        controls.environmental_fee_revenue_account = controls.sales_revenue_account
        controls.cost_of_goods_sold_account = controls.default_expense_account
        controls.cash_over_short_account = controls.default_expense_account
        controls.till_counterparty_cash_account = bank
        controls.save()

    def _open_bill(self, total=Decimal('200.00')):
        bill = Bill.objects.create(
            vendor=self.vendor,
            branch=self.branch,
            due_date=timezone.now().date(),
            status='open',
            subtotal=total,
            tax_amount=Decimal('0.00'),
            total=total,
            amount_due=total,
            created_by=self.user,
        )
        BillLineItem.objects.create(
            bill=bill,
            description='Vendor service',
            quantity=Decimal('1'),
            unit_price=total,
            is_taxable=False,
        )
        return bill

    def test_vendor_credit_gl_posts_on_apply(self):
        bill = self._open_bill()
        vendor_credit = VendorCredit.objects.create(
            vendor=self.vendor,
            branch=self.branch,
            status='draft',
            created_by=self.user,
        )
        VendorCreditLineItem.objects.create(
            vendor_credit=vendor_credit,
            description='Returned supplies',
            quantity=Decimal('1'),
            unit_price=Decimal('50.00'),
            is_taxable=False,
        )
        vendor_credit.calculate_totals()
        vendor_credit.status = 'issued'
        vendor_credit.save()

        application = VendorCreditApplication.objects.create(
            vendor_credit=vendor_credit,
            bill=bill,
            amount=Decimal('50.00'),
            applied_by=self.user,
        )
        AccountingService.post_vendor_credit_application(application)

        app_type = ContentType.objects.get_for_model(application)
        entry = JournalEntry.objects.get(
            content_type=app_type,
            object_id=application.id,
            reference=f'VC-APP-{application.id}',
        )
        ap_debit = entry.transactions.get(transaction_type='debit')
        self.assertEqual(ap_debit.amount, Decimal('50.00'))

    def test_vendor_credit_apply_reduces_bill_balance(self):
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        bill = self._open_bill()
        vendor_credit = VendorCredit.objects.create(
            vendor=self.vendor,
            branch=self.branch,
            status='draft',
            created_by=self.user,
        )
        VendorCreditLineItem.objects.create(
            vendor_credit=vendor_credit,
            description='Credit line',
            quantity=Decimal('1'),
            unit_price=Decimal('80.00'),
            is_taxable=False,
        )
        vendor_credit.calculate_totals()
        vendor_credit.status = 'issued'
        vendor_credit.save()

        client = APIClient()
        client.force_authenticate(user=self.user)
        with override_settings(SKIP_MODULE_PERMISSION_CHECKS=True):
            response = client.post(
                f'/api/billing/vendor-credits/{vendor_credit.id}/apply/',
                {'bill': bill.id},
                format='json',
            )
        self.assertEqual(response.status_code, 200, response.data)
        bill.refresh_from_db()
        self.assertEqual(bill.amount_paid, Decimal('80.00'))
        self.assertEqual(bill.amount_due, Decimal('120.00'))

    def test_vendor_credit_numbering(self):
        vendor_credit = VendorCredit.objects.create(
            vendor=self.vendor,
            branch=self.branch,
            status='draft',
            created_by=self.user,
        )
        year = timezone.now().year
        self.assertTrue(vendor_credit.credit_number.startswith(f'VC-{year}-HQ-'))

    def test_fixed_asset_acquisition_posts_gl(self):
        asset = FixedAsset.objects.create(
            asset_number='FA-TEST-001',
            name='Lift Bay Equipment',
            category=self.category,
            branch=self.branch,
            acquisition_cost=Decimal('10000.00'),
            acquisition_date=timezone.now().date(),
            salvage_value=Decimal('1000.00'),
            useful_life_years=5,
            depreciation_start_date=timezone.now().date(),
            created_by=self.user,
        )
        entry = JournalEntry.objects.get(reference=f'FA-ACQ-{asset.asset_number}')
        self.assertTrue(entry.posted)
        self.assertEqual(entry.branch_id, self.branch.id)

    def test_fixed_asset_depreciation_posts_gl(self):
        asset = FixedAsset.objects.create(
            asset_number='FA-TEST-002',
            name='Compressor',
            category=self.category,
            branch=self.branch,
            acquisition_cost=Decimal('1200.00'),
            acquisition_date=timezone.now().date(),
            salvage_value=Decimal('0.00'),
            useful_life_years=4,
            depreciation_start_date=timezone.now().date(),
            created_by=self.user,
        )
        JournalEntry.objects.filter(reference__startswith='FA-ACQ-').delete()

        amount = DepreciationService.calculate_depreciation(asset, period_months=1)
        je_id = DepreciationService.post_depreciation_to_gl(
            asset,
            amount,
            timezone.now().date(),
            user=self.user,
        )
        self.assertIsNotNone(je_id)
        entry = JournalEntry.objects.get(pk=int(je_id))
        self.assertTrue(entry.posted)

    def test_fixed_asset_disposal_posts_gl(self):
        asset = FixedAsset.objects.create(
            asset_number='FA-TEST-003',
            name='Old Printer',
            category=self.category,
            branch=self.branch,
            acquisition_cost=Decimal('1000.00'),
            acquisition_date=timezone.now().date(),
            salvage_value=Decimal('0.00'),
            useful_life_years=3,
            depreciation_start_date=timezone.now().date(),
            accumulated_depreciation=Decimal('400.00'),
            created_by=self.user,
        )
        JournalEntry.objects.filter(reference__startswith='FA-ACQ-').delete()
        asset.net_book_value = Decimal('600.00')
        asset.status = 'disposed'
        asset.disposal_date = timezone.now().date()
        asset.disposal_proceeds = Decimal('500.00')
        asset.save()

        entry = JournalEntry.objects.get(reference=f'FA-DISP-{asset.asset_number}')
        self.assertTrue(entry.posted)

    def test_ap_subledger_includes_vendor_credits(self):
        bill = self._open_bill(total=Decimal('300.00'))
        AccountingService.post_bill(bill)

        vendor_credit = VendorCredit.objects.create(
            vendor=self.vendor,
            branch=self.branch,
            status='issued',
            subtotal=Decimal('50.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('50.00'),
            unused_amount=Decimal('50.00'),
            created_by=self.user,
        )

        report = reconcile_subledgers(branch_id=self.branch.id)
        self.assertEqual(report['accounts_payable']['unapplied_vendor_credits'], 50.0)
        self.assertIn('subledger_net_of_credits', report['accounts_payable'])

    def test_post_bill_balances_with_taxable_mixed_lines(self):
        bill = Bill.objects.create(
            vendor=self.vendor,
            branch=self.branch,
            due_date=timezone.now().date(),
            status='draft',
            created_by=self.user,
        )
        BillLineItem.objects.create(
            bill=bill,
            description='Fuel',
            quantity=Decimal('1'),
            unit_price=Decimal('33.33'),
            is_taxable=True,
        )
        BillLineItem.objects.create(
            bill=bill,
            description='Supplies',
            quantity=Decimal('1'),
            unit_price=Decimal('33.33'),
            is_taxable=True,
        )
        BillLineItem.objects.create(
            bill=bill,
            description='Non-taxable fee',
            quantity=Decimal('1'),
            unit_price=Decimal('33.34'),
            is_taxable=False,
        )
        bill.refresh_from_db()
        self.assertGreater(bill.tax_amount, Decimal('0'))
        self.assertGreater(bill.total, bill.subtotal)

        bill.status = 'open'
        bill.save(update_fields=['status'])

        bill_type = ContentType.objects.get_for_model(bill)
        entry = JournalEntry.objects.filter(content_type=bill_type, object_id=bill.id).first()
        if entry is None:
            entry = AccountingService.post_bill(bill)
        self.assertIsNotNone(entry)
        self.assertTrue(entry.validate_balanced())
        debits = sum(
            t.amount for t in entry.transactions.all() if t.transaction_type == 'debit'
        )
        credits = sum(
            t.amount for t in entry.transactions.all() if t.transaction_type == 'credit'
        )
        self.assertEqual(debits, credits)
        self.assertEqual(credits, bill.total)
