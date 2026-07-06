"""Regression tests for accounting audit remediation (Wave 1)."""
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounting.management_reports import ManagementReportingService
from apps.accounting.models import Account, BankStatement, BankStatementLine, AccountingControl
from apps.accounting.services import AccountingService, ReportingService
from apps.accounting.views import compute_bank_statement_reconciled_balance
from apps.accounts.models import User
from apps.branches.models import Branch
from apps.inventory.models import InventoryTransaction, Part, PartCategory
from apps.workorders.models import WorkOrder
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle


class Wave1RemediationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='wave1_admin',
            email='wave1@example.com',
            password='password',
            role='admin',
            first_name='Wave',
            last_name='One',
        )
        self.branch_a = Branch.objects.create(
            name='Branch Alpha',
            code='ALP',
            phone='555-1000',
            address='1 Alpha St',
            city='Alpha',
            state='AL',
            zip_code='10001',
            created_by=self.user,
        )
        self.branch_b = Branch.objects.create(
            name='Branch Beta',
            code='BET',
            phone='555-2000',
            address='2 Beta St',
            city='Beta',
            state='BE',
            zip_code='20002',
            created_by=self.user,
        )
        self.branch_user = User.objects.create_user(
            username='branch_accountant',
            email='acct@example.com',
            password='password',
            role='accountant',
            branch=self.branch_a,
        )
        self.revenue = AccountingService.get_or_create_account('4000', 'Sales Revenue', 'income', 'credit')
        self.expense = AccountingService.get_or_create_account('5000', 'Operating Expense', 'expense', 'debit')
        self.contra_revenue = AccountingService.get_or_create_account(
            '4100', 'Sales Returns', 'income', 'debit'
        )
        self.asset = AccountingService.get_or_create_account('1000', 'Cash Asset', 'asset', 'debit')
        AccountingService.get_or_create_account('3200', 'Retained Earnings', 'equity', 'credit')
        self._wire_accounting_controls()

    def _wire_accounting_controls(self):
        controls = AccountingControl.get_settings()
        controls.accounts_receivable_account = self.asset
        controls.sales_revenue_account = self.revenue
        controls.sales_discount_account = self.contra_revenue
        controls.sales_tax_payable_account = AccountingService.get_or_create_account(
            '2100', 'Sales Tax Payable', 'liability', 'credit'
        )
        controls.shop_supplies_revenue_account = self.revenue
        controls.environmental_fee_revenue_account = self.revenue
        controls.input_tax_account = self.asset
        controls.default_expense_account = self.expense
        controls.inventory_asset_account = self.asset
        controls.cost_of_goods_sold_account = self.expense
        controls.cash_over_short_account = self.expense
        controls.till_counterparty_cash_account = self.asset
        controls.default_bank_account = self.asset
        controls.save()

    @override_settings(SKIP_MODULE_PERMISSION_CHECKS=True)
    def test_bank_statement_retrieve_includes_nested_lines(self):
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        bank_account = AccountingService.get_or_create_account('1100', 'Operating Bank', 'asset', 'debit')

        statement = BankStatement.objects.create(
            bank_account=bank_account,
            statement_date=timezone.now().date(),
            opening_balance=Decimal('0.00'),
            closing_balance=Decimal('50.00'),
            created_by=self.user,
        )
        BankStatementLine.objects.create(
            bank_statement=statement,
            transaction_date=timezone.now().date(),
            description='Deposit',
            debit_amount=Decimal('50.00'),
            credit_amount=Decimal('0.00'),
            balance=Decimal('50.00'),
        )

        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get(f'/api/accounting/bank-statements/{statement.id}/')

        self.assertEqual(response.status_code, 200)
        self.assertIn('lines', response.data)
        self.assertEqual(len(response.data['lines']), 1)
        self.assertEqual(response.data['lines'][0]['description'], 'Deposit')

    @override_settings(SKIP_MODULE_PERMISSION_CHECKS=True)
    def test_bank_statement_reconcile_rejects_balance_difference(self):
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        bank_account = AccountingService.get_or_create_account('1101', 'Recon Bank', 'asset', 'debit')
        revenue = AccountingService.get_or_create_account('4001', 'Other Revenue', 'income', 'credit')

        statement = BankStatement.objects.create(
            bank_account=bank_account,
            statement_date=timezone.now().date(),
            opening_balance=Decimal('0.00'),
            closing_balance=Decimal('100.00'),
            created_by=self.user,
        )
        line = BankStatementLine.objects.create(
            bank_statement=statement,
            transaction_date=timezone.now().date(),
            description='Deposit',
            debit_amount=Decimal('50.00'),
            credit_amount=Decimal('0.00'),
            balance=Decimal('50.00'),
        )
        matched_tx = AccountingService.create_journal_entry(
            user=self.user,
            date=timezone.now().date(),
            description='Matched deposit',
            lines=[
                {'account_id': bank_account.id, 'type': 'debit', 'amount': Decimal('50.00')},
                {'account_id': revenue.id, 'type': 'credit', 'amount': Decimal('50.00')},
            ],
            posted=True,
        ).transactions.get(account=bank_account)
        line.matched = True
        line.matched_transaction = matched_tx
        line.save(update_fields=['matched', 'matched_transaction'])

        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.post(f'/api/accounting/bank-statements/{statement.id}/reconcile/')

        self.assertEqual(response.status_code, 400)
        self.assertIn('balance difference', response.data['error'].lower())
        self.assertFalse(BankStatement.objects.get(pk=statement.pk).reconciled)

        line.debit_amount = Decimal('100.00')
        line.save(update_fields=['debit_amount'])
        reconciled_balance = compute_bank_statement_reconciled_balance(statement)
        self.assertEqual(reconciled_balance, Decimal('100.00'))

    def test_period_close_handles_contra_income_account(self):
        close_date = timezone.now().date()
        AccountingService.create_journal_entry(
            user=self.user,
            date=close_date,
            description='Sales return activity',
            lines=[
                {'account_id': self.contra_revenue.id, 'type': 'debit', 'amount': Decimal('30.00')},
                {'account_id': self.asset.id, 'type': 'credit', 'amount': Decimal('30.00')},
            ],
            posted=True,
            branch=self.branch_a,
        )

        closing_entry = AccountingService.close_income_statement_period(
            user=self.user,
            start_date=close_date,
            end_date=close_date,
            branch=self.branch_a,
        )

        self.assertTrue(closing_entry.posted)
        self.assertEqual(
            ReportingService.get_account_balance(
                self.contra_revenue,
                start_date=close_date,
                end_date=close_date,
                branch_id=self.branch_a.id,
            ),
            Decimal('0.00'),
        )
        contra_close_line = closing_entry.transactions.get(account=self.contra_revenue)
        self.assertEqual(contra_close_line.transaction_type, 'credit')

    def test_job_profitability_uses_inventory_sale_transactions(self):
        customer_user = User.objects.create_user(
            username='wave1_customer',
            email='wave1cust@example.com',
            password='password',
            role='customer',
        )
        customer = Customer.objects.create(user=customer_user, customer_number='C-WAVE1')
        vehicle = Vehicle.objects.create(
            owner=customer,
            make='Toyota',
            model='Corolla',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='TEST-001',
            current_mileage=10000,
        )
        category = PartCategory.objects.create(name='Filters')
        part = Part.objects.create(
            part_number='FIL-001',
            name='Oil Filter',
            category=category,
            branch=self.branch_a,
            cost_price=Decimal('10.00'),
            selling_price=Decimal('20.00'),
        )
        from apps.billing.models import Invoice

        work_order = WorkOrder.objects.create(
            customer=customer,
            vehicle=vehicle,
            branch=self.branch_a,
            status='completed',
            work_order_number='WO-WAVE1',
            odometer_in=10000,
            created_by=self.user,
        )
        InventoryTransaction.objects.create(
            part=part,
            transaction_type='sale',
            quantity=-2,
            unit_cost=Decimal('12.50'),
            balance_after=8,
            work_order=work_order,
            created_by=self.user,
        )
        Invoice.objects.create(
            customer=customer,
            work_order=work_order,
            branch=self.branch_a,
            status='sent',
            subtotal=Decimal('100.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('100.00'),
            invoice_date=timezone.now().date(),
            created_by=self.user,
        )

        report = ReportingService.get_job_profitability(
            start_date=timezone.now().date().replace(day=1),
            end_date=timezone.now().date(),
            branch_id=self.branch_a.id,
        )

        job = next(row for row in report['jobs'] if row['work_order_id'] == work_order.id)
        self.assertEqual(job['parts_cost'], 25.0)
        self.assertTrue(job['parts_cost_is_actual'])

    def test_consolidated_profit_loss_scoped_to_accessible_branch(self):
        today = timezone.now().date()
        AccountingService.create_journal_entry(
            user=self.user,
            date=today,
            description='Branch A revenue',
            lines=[
                {'account_id': self.asset.id, 'type': 'debit', 'amount': Decimal('200.00')},
                {'account_id': self.revenue.id, 'type': 'credit', 'amount': Decimal('200.00')},
            ],
            posted=True,
            branch=self.branch_a,
        )
        AccountingService.create_journal_entry(
            user=self.user,
            date=today,
            description='Branch B revenue',
            lines=[
                {'account_id': self.asset.id, 'type': 'debit', 'amount': Decimal('500.00')},
                {'account_id': self.revenue.id, 'type': 'credit', 'amount': Decimal('500.00')},
            ],
            posted=True,
            branch=self.branch_b,
        )

        scoped = ManagementReportingService.get_consolidated_profit_loss(
            today.replace(day=1),
            today,
            branch_ids=[self.branch_a.id],
        )
        self.assertEqual(len(scoped['branches']), 1)
        self.assertEqual(scoped['branches'][0]['branch_id'], self.branch_a.id)
        self.assertEqual(scoped['consolidated']['totals']['income'], 200.0)

        all_branches = ManagementReportingService.get_consolidated_profit_loss(
            today.replace(day=1),
            today,
            branch_ids=[self.branch_a.id, self.branch_b.id],
        )
        self.assertEqual(all_branches['consolidated']['totals']['income'], 700.0)
