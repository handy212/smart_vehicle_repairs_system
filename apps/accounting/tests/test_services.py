from django.test import TestCase, override_settings
from django.utils import timezone
from django.contrib.contenttypes.models import ContentType
from decimal import Decimal
from rest_framework.test import APIClient
from apps.accounting.models import Account, BankStatement, BankStatementLine, JournalEntry
from apps.accounting.services import AccountingService, ReportingService
from apps.accounts.models import User
from apps.billing.models import Invoice, InvoiceLineItem, Payment
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inventory.models import Part, PartCategory

class AccountingServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='testuser@example.com',
            password='password',
            role='admin',
            first_name='Test',
            last_name='User',
        )
        self.asset_account = AccountingService.get_or_create_account('1000', 'Test Asset', 'asset', 'debit')
        self.expense_account = AccountingService.get_or_create_account('5000', 'Test Expense', 'expense', 'debit')
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TST',
            phone='555-0100',
            address='123 Test Street',
            city='Testville',
            state='TS',
            zip_code='12345',
            created_by=self.user,
        )

    def test_create_journal_entry(self):
        date = timezone.now().date()
        description = "Test Entry"
        lines = [
            {
                'account_id': self.expense_account.id,
                'type': 'debit',
                'amount': Decimal('100.00'),
                'description': 'Expense Line'
            },
            {
                'account_id': self.asset_account.id,
                'type': 'credit',
                'amount': Decimal('100.00'),
                'description': 'Asset Line'
            }
        ]
        
        je = AccountingService.create_journal_entry(
            user=self.user,
            date=date,
            description=description,
            lines=lines,
            posted=True
        )
        
        self.assertIsNotNone(je)
        self.assertTrue(je.posted)
        self.assertEqual(je.transactions.count(), 2)
        self.assertEqual(je.transactions.filter(transaction_type='debit').first().amount, Decimal('100.00'))

    def test_get_account_balance(self):
        # Create a transaction
        date = timezone.now().date()
        lines = [
            {'account_id': self.expense_account.id, 'type': 'debit', 'amount': Decimal('50.00')},
            {'account_id': self.asset_account.id, 'type': 'credit', 'amount': Decimal('50.00')}
        ]
        AccountingService.create_journal_entry(self.user, date, "Test Balance", lines)
        
        # Check balance
        # Expense (Debit Normal) has Debit 50 -> Balance 50
        bal = ReportingService.get_account_balance(self.expense_account)
        self.assertEqual(bal, Decimal('50.00'))
        
        # Asset (Debit Normal) has Credit 50 -> Balance -50
        bal_asset = ReportingService.get_account_balance(self.asset_account)
        self.assertEqual(bal_asset, Decimal('-50.00'))

    def test_invoice_revenue_and_cogs_post_independently_once(self):
        customer_user = User.objects.create_user(
            username='customer',
            email='customer@example.com',
            password='password',
            role='customer',
            first_name='Test',
            last_name='Customer',
            branch=self.branch,
        )
        customer = Customer.objects.create(user=customer_user)
        category = PartCategory.objects.create(name='Filters')
        part = Part.objects.create(
            part_number='OIL-FILTER-1',
            name='Oil Filter',
            category=category,
            branch=self.branch,
            cost_price=Decimal('25.00'),
            selling_price=Decimal('40.00'),
        )
        invoice = Invoice.objects.create(
            customer=customer,
            branch=self.branch,
            status='draft',
            subtotal=Decimal('80.00'),
            tax_amount=Decimal('8.00'),
            total=Decimal('88.00'),
            invoice_date=timezone.now().date(),
            created_by=self.user,
        )
        InvoiceLineItem.objects.create(
            invoice=invoice,
            item_type='part',
            description='Oil filter',
            part=part,
            quantity=Decimal('2.00'),
            unit_price=Decimal('40.00'),
        )

        invoice.status = 'sent'
        revenue_entry = AccountingService.post_invoice(invoice)
        cogs_entry = AccountingService.post_cogs(invoice)
        duplicate_revenue = AccountingService.post_invoice(invoice)
        duplicate_cogs = AccountingService.post_cogs(invoice)

        invoice_type = ContentType.objects.get_for_model(invoice)
        entries = JournalEntry.objects.filter(content_type=invoice_type, object_id=invoice.id)

        self.assertIsNotNone(revenue_entry)
        self.assertIsNotNone(cogs_entry)
        self.assertIsNone(duplicate_revenue)
        self.assertIsNone(duplicate_cogs)
        self.assertEqual(entries.count(), 2)
        self.assertTrue(entries.filter(reference=invoice.invoice_number).exists())
        self.assertTrue(entries.filter(reference=f'{invoice.invoice_number}-COGS').exists())
        self.assertEqual(
            cogs_entry.transactions.get(transaction_type='debit').amount,
            Decimal('50.00'),
        )

    def test_post_invoice_skips_zero_total_invoice(self):
        customer_user = User.objects.create_user(
            username='zero_customer',
            email='zero_customer@example.com',
            password='password',
            role='customer',
            first_name='Zero',
            last_name='Customer',
            branch=self.branch,
        )
        customer = Customer.objects.create(user=customer_user)
        invoice = Invoice.objects.create(
            customer=customer,
            branch=self.branch,
            status='sent',
            subtotal=Decimal('0.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('0.00'),
            invoice_date=timezone.now().date(),
            created_by=self.user,
        )

        entry = AccountingService.post_invoice(invoice)

        invoice_type = ContentType.objects.get_for_model(invoice)
        self.assertIsNone(entry)
        self.assertFalse(
            JournalEntry.objects.filter(
                content_type=invoice_type,
                object_id=invoice.id,
                reference=invoice.invoice_number,
            ).exists()
        )

    def test_completed_payment_posts_journal_entry_with_branch(self):
        customer_user = User.objects.create_user(
            username='payment_customer',
            email='payment_customer@example.com',
            password='password',
            role='customer',
            first_name='Payment',
            last_name='Customer',
            branch=self.branch,
        )
        customer = Customer.objects.create(user=customer_user)
        invoice = Invoice.objects.create(
            customer=customer,
            branch=self.branch,
            status='sent',
            subtotal=Decimal('100.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('100.00'),
            amount_due=Decimal('100.00'),
            invoice_date=timezone.now().date(),
            created_by=self.user,
        )

        payment = Payment.objects.create(
            invoice=invoice,
            customer=customer,
            payment_method='cash',
            amount=Decimal('100.00'),
            status='completed',
            processed_by=self.user,
        )

        payment_type = ContentType.objects.get_for_model(payment)
        entry = JournalEntry.objects.get(content_type=payment_type, object_id=payment.id)

        self.assertTrue(entry.posted)
        self.assertEqual(entry.branch, self.branch)
        self.assertTrue(entry.validate_balanced())
        self.assertEqual(entry.transactions.count(), 2)

    def test_reverse_journal_entry_creates_balanced_posted_reversal_once(self):
        original = AccountingService.create_journal_entry(
            user=self.user,
            date=timezone.now().date(),
            description='Original adjustment',
            reference='ADJ-1',
            lines=[
                {'account_id': self.expense_account.id, 'type': 'debit', 'amount': Decimal('75.00')},
                {'account_id': self.asset_account.id, 'type': 'credit', 'amount': Decimal('75.00')},
            ],
            posted=True,
            branch=self.branch,
        )

        reversal = AccountingService.reverse_journal_entry(original, self.user, reason='Wrong account')
        reversal_type = ContentType.objects.get_for_model(original)

        self.assertTrue(reversal.posted)
        self.assertEqual(reversal.reference, f'REV-JE-{original.id}')
        self.assertEqual(reversal.content_type, reversal_type)
        self.assertEqual(reversal.object_id, original.id)
        self.assertTrue(reversal.validate_balanced())
        self.assertEqual(
            reversal.transactions.get(account=self.expense_account).transaction_type,
            'credit',
        )
        self.assertEqual(
            reversal.transactions.get(account=self.asset_account).transaction_type,
            'debit',
        )

        with self.assertRaisesMessage(Exception, 'already been reversed'):
            AccountingService.reverse_journal_entry(original, self.user)

    def test_close_income_statement_period_posts_to_retained_earnings_once(self):
        close_date = timezone.now().date()
        revenue = AccountingService.get_or_create_account('4000', 'Sales Revenue', 'income', 'credit')

        AccountingService.create_journal_entry(
            user=self.user,
            date=close_date,
            description='Period activity',
            lines=[
                {'account_id': self.asset_account.id, 'type': 'debit', 'amount': Decimal('120.00')},
                {'account_id': revenue.id, 'type': 'credit', 'amount': Decimal('120.00')},
                {'account_id': self.expense_account.id, 'type': 'debit', 'amount': Decimal('45.00')},
                {'account_id': self.asset_account.id, 'type': 'credit', 'amount': Decimal('45.00')},
            ],
            posted=True,
            branch=self.branch,
        )

        closing_entry = AccountingService.close_income_statement_period(
            user=self.user,
            start_date=close_date,
            end_date=close_date,
            branch=self.branch,
        )
        duplicate_close = AccountingService.close_income_statement_period(
            user=self.user,
            start_date=close_date,
            end_date=close_date,
            branch=self.branch,
        )
        retained_earnings = Account.objects.get(code='3200')

        self.assertEqual(closing_entry.id, duplicate_close.id)
        self.assertTrue(closing_entry.posted)
        self.assertEqual(
            ReportingService.get_account_balance(revenue, start_date=close_date, end_date=close_date, branch_id=self.branch.id),
            Decimal('0.00'),
        )
        self.assertEqual(
            ReportingService.get_account_balance(self.expense_account, start_date=close_date, end_date=close_date, branch_id=self.branch.id),
            Decimal('0.00'),
        )
        self.assertEqual(
            ReportingService.get_account_balance(retained_earnings, date=close_date, branch_id=self.branch.id),
            Decimal('75.00'),
        )

    @override_settings(SKIP_MODULE_PERMISSION_CHECKS=True)
    def test_bank_statement_match_enforces_account_amount_side_and_reconciled_state(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        bank_account = AccountingService.get_or_create_account('1010', 'Operating Bank', 'asset', 'debit')
        other_bank = AccountingService.get_or_create_account('1020', 'Other Bank', 'asset', 'debit')
        revenue = AccountingService.get_or_create_account('4000', 'Sales Revenue', 'income', 'credit')

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
            description='Customer deposit',
            debit_amount=Decimal('100.00'),
            credit_amount=Decimal('0.00'),
            balance=Decimal('100.00'),
        )

        wrong_account_entry = AccountingService.create_journal_entry(
            user=self.user,
            date=timezone.now().date(),
            description='Wrong account deposit',
            lines=[
                {'account_id': other_bank.id, 'type': 'debit', 'amount': Decimal('100.00')},
                {'account_id': revenue.id, 'type': 'credit', 'amount': Decimal('100.00')},
            ],
            posted=True,
        )
        wrong_amount_entry = AccountingService.create_journal_entry(
            user=self.user,
            date=timezone.now().date(),
            description='Wrong amount deposit',
            lines=[
                {'account_id': bank_account.id, 'type': 'debit', 'amount': Decimal('90.00')},
                {'account_id': revenue.id, 'type': 'credit', 'amount': Decimal('90.00')},
            ],
            posted=True,
        )
        correct_entry = AccountingService.create_journal_entry(
            user=self.user,
            date=timezone.now().date(),
            description='Correct deposit',
            lines=[
                {'account_id': bank_account.id, 'type': 'debit', 'amount': Decimal('100.00')},
                {'account_id': revenue.id, 'type': 'credit', 'amount': Decimal('100.00')},
            ],
            posted=True,
        )

        url = f'/api/accounting/bank-statement-lines/{line.id}/match/'
        response = client.post(
            url,
            {'transaction_id': wrong_account_entry.transactions.get(account=other_bank).id},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('account', response.data['error'])

        response = client.post(
            url,
            {'transaction_id': wrong_amount_entry.transactions.get(account=bank_account).id},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('amount', response.data['error'])

        response = client.post(
            url,
            {'transaction_id': correct_entry.transactions.get(account=bank_account).id},
            format='json',
        )
        self.assertEqual(response.status_code, 200)

        line.refresh_from_db()
        self.assertTrue(line.matched)
        self.assertEqual(line.matched_transaction.account, bank_account)

        statement.reconciled = True
        statement.reconciled_by = self.user
        statement.reconciled_at = timezone.now()
        statement.save()
        response = client.post(f'/api/accounting/bank-statement-lines/{line.id}/unmatch/', {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('reconciled', response.data['error'])
