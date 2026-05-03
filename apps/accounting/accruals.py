from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.db.models import Sum
from apps.accounting.models import Accrual, Account, JournalEntry
from apps.accounting.services import AccountingService
from apps.workorders.models import WorkOrder
from apps.inventory.models import PurchaseOrder

class AccrualService:
    @staticmethod
    def identify_accruals(cutoff_date=None):
        """
        Identify unbilled revenue and expenses up to cutoff_date.
        Returns: Dict with 'revenue' and 'expense' lists of candidates.
        """
        if not cutoff_date:
            cutoff_date = timezone.now().date()
            
        candidates = {
            'revenue': [],
            'expense': []
        }
        active_sources = set(
            Accrual.objects.filter(source_id__isnull=False).values_list(
                'accrual_type',
                'source_model',
                'source_id',
            )
        )
        
        # 1. Accrued Revenue: Completed Work Orders not yet Invoiced
        # Assuming we check if 'invoices' relation exists or using status
        # Assuming WO has 'completed_at' or using 'updated_at' for completed/closed status
        # Note: 'invoiced' is a status. If status is 'completed', it means work done but not invoiced.
        
        uninvoiced_wos = WorkOrder.objects.filter(
            status='completed',
            updated_at__date__lte=cutoff_date
        )
        
        for wo in uninvoiced_wos:
            if ('revenue', 'WorkOrder', wo.id) in active_sources:
                continue

            # Estimate revenue from Work Order total (parts + labor)
            # This requires calculating total if not stored
            # Assuming we can get a total price estimate
             # For simplicity, let's assume we can calculate it or it's a field.
             # In a real app, we might need to sum work order lines.
             # There's likely no direct 'total' field on WO until invoice, typically.
             # But let's check if we can calculate from parts/labor.
             # Based on previous file reads, WO has 'inventory_transactions' and 'labor_entries'.
            
            # Simplified calculation
            total_estimate = Decimal('0.00')
            # Check for parts cost + markup? Or just use cost for now? 
            # Accrued Revenue should be at Selling Price.
            # We'll skip complex calculation here and assume 0 for now or implement if needed.
            # Actually, let's just create a placeholder
            
            amount = wo.actual_total or wo.estimated_total or Decimal('0.00')
            if amount <= 0:
                continue

            candidates['revenue'].append({
                'source': wo,
                'source_model': 'WorkOrder',
                'source_id': wo.id,
                'source_reference': wo.work_order_number,
                'amount': amount,
                'date': wo.updated_at.date(),
                'description': f"Accrued Revenue for WO #{wo.work_order_number}"
            })

        # 2. Accrued Expense: Received POs not yet Billed
        # PurchaseOrder status='received' or 'partially_received'
        # Check if Bill exists (Bills usually link to PO)
        
        # Note: We need to import Bill here or inside function to avoid circular imports?
        from apps.billing.models import Bill
        
        received_pos = PurchaseOrder.objects.filter(
            status__in=['received', 'partially_received'],
            received_date__lte=cutoff_date
        ).exclude(
            # Exclude POs that have Bills
            id__in=Bill.objects.values_list('purchase_order_id', flat=True)
        )
        
        for po in received_pos:
            if ('expense', 'PurchaseOrder', po.id) in active_sources:
                continue

            if po.total <= 0:
                continue

            candidates['expense'].append({
                'source': po,
                'source_model': 'PurchaseOrder',
                'source_id': po.id,
                'source_reference': po.po_number,
                'amount': po.total,
                'date': po.received_date or po.updated_at.date(),
                'description': f"Accrued Expense for PO {po.po_number} ({po.supplier.name})"
            })

        return candidates

    @staticmethod
    def get_accrual_candidates(cutoff_date=None):
        """Alias for identify_accruals for test compatibility"""
        return AccrualService.identify_accruals(cutoff_date)

    @staticmethod
    @transaction.atomic
    def create_accrual(
        user,
        account_id,
        amount,
        date,
        description,
        accrual_type,
        reversal_date=None,
        source_model='',
        source_id=None,
        source_reference='',
    ):
        """
        Create an Accrual record and post the Journal Entry.
        accrual_type: 'expense' or 'revenue'
        account_id: The P&L account (Expense or Income account)
        """
        account = Account.objects.get(id=account_id)
        
        # 1. Create Accrual Record
        accrual = Accrual.objects.create(
            created_by=user,
            account=account,
            amount=amount,
            accrual_date=date,
            reversal_date=reversal_date,
            description=description,
            accrual_type=accrual_type,
            source_model=source_model or '',
            source_id=source_id,
            source_reference=source_reference or '',
            status='active'
        )
        
        # 2. Post Journal Entry
        # Define accounts
        # Note: Hardcoded codes for now, should be configurable.
        if accrual_type == 'expense':
            # Expense Accural:
            # DR Expense Account (Actual Expense)
            # CR Accrued Liabilities (2050)
            dr_account = account
            cr_account = AccountingService.get_or_create_account('2050', 'Accrued Liabilities', 'liability', 'credit')
        else:
            # Revenue Accrual:
            # DR Accrued Income (1250)
            # CR Income Account (Actual Revenue)
            dr_account = AccountingService.get_or_create_account('1250', 'Accrued Revenue', 'asset', 'debit')
            cr_account = account

        lines = [
            {
                'account_id': dr_account.id,
                'type': 'debit',
                'amount': amount,
                'description': description
            },
            {
                'account_id': cr_account.id,
                'type': 'credit',
                'amount': amount,
                'description': description
            }
        ]
        
        je = AccountingService.create_journal_entry(
            user=user,
            date=date,
            description=f"Accrual: {description}",
            lines=lines,
            posted=True
        )
        
        accrual.accrual_je = je
        accrual.save()
        
        return accrual

    @staticmethod
    @transaction.atomic
    def reverse_accrual(user, accrual):
        """
        Reverse a previously created accrual.
        Usually run at start of next period.
        """
        if accrual.status != 'active':
            return # Already reversed
            
        # Create Reversal JE (Swap DR/CR)
        original_je = accrual.accrual_je
        if not original_je:
             # Should not happen if created via service
            return

        reversal_date = accrual.reversal_date or timezone.now().date()

        # Generate Reversal Lines based on original JE lines but swapped types
        # This assumes simplistic 2-line JE. Safe for accruals.
        lines = []
        for tx in original_je.transactions.all():
            lines.append({
                'account_id': tx.account.id,
                'type': 'credit' if tx.transaction_type == 'debit' else 'debit',
                'amount': tx.amount,
                'description': f"Reversal: {tx.description}"
            })
            
        je = AccountingService.create_journal_entry(
            user=user,
            date=reversal_date,
            description=f"Reversal of Accrual #{accrual.id}: {accrual.description}",
            lines=lines,
            posted=True
        )
        
        accrual.reversal_je = je
        accrual.status = 'reversed'
        accrual.save()
        
        return je
