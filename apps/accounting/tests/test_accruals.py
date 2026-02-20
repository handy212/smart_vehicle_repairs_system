from django.test import TestCase
from django.utils import timezone
from decimal import Decimal
from apps.accounting.models import Account, JournalEntry, Accrual
from apps.accounting.services import AccountingService
from apps.accounting.accruals import AccrualService
from apps.accounts.models import User
from apps.workorders.models import WorkOrder
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle

class AccrualServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')
        # Create necessary accounts
        self.ar_account = AccountingService.get_or_create_account('1200', 'Accounts Receivable', 'asset', 'debit')
        self.revenue_account = AccountingService.get_or_create_account('4000', 'Sales Revenue', 'income', 'credit')
        self.accrued_revenue_account = AccountingService.get_or_create_account('1250', 'Accrued Revenue', 'asset', 'debit')
        
        # Create dummy WorkOrder
        self.customer = Customer.objects.create(user=self.user, customer_number="CUST-TEST-001")
        self.vehicle = Vehicle.objects.create(owner=self.customer, make="Toyota", model="Camry", year=2020, license_plate="ABC-123", current_mileage=0)
        self.wo = WorkOrder.objects.create(
            customer=self.customer, 
            vehicle=self.vehicle, 
            status='completed', # Eligible for accrual
            actual_labor_cost=Decimal('50.00'),
            actual_parts_cost=Decimal('50.00'),
            estimated_total=Decimal('100.00'), # Fallback
            actual_total=Decimal('100.00'),
            odometer_in=0
        )

        from apps.workorders.models import WorkOrderPart
        WorkOrderPart.objects.create(
            work_order=self.wo,
            part_name="Oil Filter",
            quantity=Decimal('1.00'),
            unit_cost=Decimal('100.00'),
            selling_price=Decimal('100.00'),
            status='installed'
        )
        # Recalculate to ensure WO has the total
        self.wo.recalculate_totals()
        
    def test_create_accrual(self):
        # 1. Get Candidates
        candidates = AccrualService.get_accrual_candidates(cutoff_date=timezone.now().date())
        self.assertTrue(len(candidates['revenue']) > 0)
        
        candidate = candidates['revenue'][0]
        self.assertEqual(candidate['amount'], Decimal('100.00')) # Should match WO total
        
        candidate = candidates['revenue'][0]
        self.assertEqual(candidate['amount'], Decimal('100.00')) # Should match WO total
        
        # 2. Create Accrual
        accrual = AccrualService.create_accrual(
            user=self.user,
            account_id=self.revenue_account.id, # Revenue Accrual uses Income Account (Credit side)
            accrual_type='revenue',
            date=timezone.now().date(),
            amount=candidate['amount'],
            description=candidate['description']
        )
        
        self.assertIsNotNone(accrual)
        self.assertIsNotNone(accrual.journal_entry)
        self.assertEqual(accrual.journal_entry.transactions.count(), 2)
        # Verify DR Accrued Revenue, CR Sales Revenue
        self.assertEqual(accrual.journal_entry.transactions.filter(account=self.accrued_revenue_account, transaction_type='debit').count(), 1)
        self.assertEqual(accrual.journal_entry.transactions.filter(account=self.revenue_account, transaction_type='credit').count(), 1)

    def test_reverse_accrual(self):
        # Create first
        accrual = AccrualService.create_accrual(
            user=self.user,
            account_id=self.revenue_account.id,
            accrual_type='revenue',
            date=timezone.now().date(),
            amount=Decimal('100.00'),
            description="Test Accrual"
        )
        
        # Reverse
        je_reversal = AccrualService.reverse_accrual(self.user, accrual)
        
        self.assertIsNotNone(je_reversal)
        self.assertTrue(accrual.is_reversed)
        self.assertEqual(je_reversal.transactions.count(), 2)
        # Verify reversal: DR Sales Revenue, CR Accrued Revenue
        self.assertEqual(je_reversal.transactions.filter(account=self.revenue_account, transaction_type='debit').count(), 1)
        self.assertEqual(je_reversal.transactions.filter(account=self.accrued_revenue_account, transaction_type='credit').count(), 1)
