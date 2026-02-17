from django.test import TestCase
from django.utils import timezone
from decimal import Decimal
from apps.accounting.models import Account, JournalEntry
from apps.accounting.services import AccountingService, ReportingService
from apps.accounts.models import User

class AccountingServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')
        self.asset_account = AccountingService.get_or_create_account('1000', 'Test Asset', 'asset', 'debit')
        self.expense_account = AccountingService.get_or_create_account('5000', 'Test Expense', 'expense', 'debit')

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
