from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.contrib.contenttypes.models import ContentType
from .models import Account, JournalEntry, Transaction
from apps.billing.models import Invoice, Bill

class AccountingService:
    @staticmethod
    def get_or_create_account(code, name, account_type, balance_type):
        """Helper to get or create system accounts"""
        account, created = Account.objects.get_or_create(
            code=code,
            defaults={
                'name': name,
                'account_type': account_type,
                'balance_type': balance_type,
                'is_active': True
            }
        )
        return account

    @classmethod
    def post_invoice(cls, invoice):
        """
        Creates a Journal Entry for a finalized Invoice.
        Debit: Accounts Receivable (1200)
        Credit: Sales Revenue (4000)
        Credit: Sales Tax Payable (2100)
        """
        if invoice.status not in ['open', 'paid']:
            return None  # Only post finalized invoices

        # Check if already posted
        invoice_type = ContentType.objects.get_for_model(invoice)
        if JournalEntry.objects.filter(content_type=invoice_type, object_id=invoice.id).exists():
            return None

        with transaction.atomic():
            # 1. Get Accounts
            ar_account = cls.get_or_create_account('1200', 'Accounts Receivable', 'asset', 'debit')
            sales_account = cls.get_or_create_account('4000', 'Sales Revenue', 'income', 'credit')
            tax_account = cls.get_or_create_account('2100', 'Sales Tax Payable', 'liability', 'credit')

            # 2. Create Header
            je = JournalEntry.objects.create(
                date=invoice.invoice_date if invoice.invoice_date else timezone.now().date(),
                description=f"Invoice #{invoice.invoice_number} for {str(invoice.customer)}",
                reference=invoice.invoice_number,
                posted=True,
                created_by=invoice.created_by,
                branch=invoice.branch,
                content_object=invoice
            )

            # 3. Create Transactions
            
            # Debit AR (Total Amount)
            Transaction.objects.create(
                journal_entry=je,
                account=ar_account,
                amount=invoice.total,
                transaction_type='debit',
                description='Invoice Total'
            )

            # Credit Revenue (Subtotal)
            if invoice.subtotal > 0:
                Transaction.objects.create(
                    journal_entry=je,
                    account=sales_account,
                    amount=invoice.subtotal,
                    transaction_type='credit',
                    description='Sales Revenue'
                )

            # Credit Tax (Tax Amount)
            if invoice.tax_amount > 0:
                Transaction.objects.create(
                    journal_entry=je,
                    account=tax_account,
                    amount=invoice.tax_amount,
                    transaction_type='credit',
                    description='Sales Tax'
                )

            # Validate
            if not je.validate_balanced():
                # Should rollback due to atomic block if we raise error, but let's be explicit
                raise ValidationError(f"Journal Entry for Invoice {invoice.invoice_number} is not balanced.")
            
            return je

            # Debit AP (Total Amount)
            Transaction.objects.create(
                journal_entry=je,
                account=ap_account,
                amount=bill_payment.amount,
                transaction_type='debit',
                description=f'Payment for Bill {bill_payment.bill.bill_number}'
            )

            # Credit Cash (Total Amount)
            Transaction.objects.create(
                journal_entry=je,
                account=cash_account,
                amount=bill_payment.amount,
                transaction_type='credit',
                description=f'Payment Sent ({bill_payment.payment_method})'
            )

            # Validate
            if not je.validate_balanced():
                raise ValidationError(f"Journal Entry for Bill Payment {bill_payment.payment_number} is not balanced.")
            
            return je

    @classmethod
    def post_cogs(cls, invoice):
        """
        Creates Cost of Goods Sold entries for an Invoice.
        Debit: Cost of Goods Sold (5100)
        Credit: Inventory Asset (1500)
        """
        # Iterate over invoice line items, check if they are parts
        # Determine cost (use Part.cost_price for standard costing)
        # Note: In a real system we'd use FIFO/LIFO/Avg layers, but here we use current Unit Cost.
        
        cogs_total = Decimal('0.00')
        line_costs = [] # (line_item, cost_amount)
        
        for line in invoice.line_items.all():
            if line.part:
                # Calculate cost: quantity * part.cost_price
                qty = line.quantity or 0
                cost = line.part.cost_price or 0
                line_total_cost = qty * cost
                
                if line_total_cost > 0:
                    cogs_total += line_total_cost
                    line_costs.append((line, line_total_cost))
                    
        if cogs_total == 0:
            return None # No COGS to record

        with transaction.atomic():
            cogs_account = cls.get_or_create_account('5100', 'Cost of Goods Sold', 'expense', 'debit')
            inventory_account = cls.get_or_create_account('1500', 'Inventory Asset', 'asset', 'debit')

            # Create Header (Separate JE for COGS, linked to Invoice)
            # Or could be same JE? Usually separate or same. Let's make it separate usually for clarity
            # "COGS Recognition for Invoice ..."
            
            je = JournalEntry.objects.create(
                date=invoice.invoice_date if invoice.invoice_date else timezone.now().date(),
                description=f"COGS for Invoice #{invoice.invoice_number}",
                reference=f"{invoice.invoice_number}-COGS",
                posted=True,
                created_by=invoice.created_by,
                branch=invoice.branch,
                content_object=invoice
            )
            
            # Debit COGS (Total)
            Transaction.objects.create(
                journal_entry=je,
                account=cogs_account,
                amount=cogs_total,
                transaction_type='debit',
                description='Cost of Goods Sold'
            )
            
            # Credit Inventory (Total)
            Transaction.objects.create(
                journal_entry=je,
                account=inventory_account,
                amount=cogs_total,
                transaction_type='credit',
                description='Inventory Usage'
            )
            
            if not je.validate_balanced():
                raise ValidationError(f"COGS Journal Entry for Invoice {invoice.invoice_number} is not balanced.")
                
            return je

    @classmethod
    def post_bill(cls, bill):
        """
        Creates a Journal Entry for a finalized Vendor Bill.
        Debit: Purchases/Expense (5000)  OR  Inventory Asset (1500)
        Debit: Input Sales Tax (2200)
        Credit: Accounts Payable (2000)
        """
        if bill.status not in ['open', 'paid']:
            return None

        # Check if already posted
        bill_type = ContentType.objects.get_for_model(bill)
        # Note: If we separate COGS in post_invoice, we don't need changes there.
        # But here we replace the previous post_bill implementation
        if JournalEntry.objects.filter(content_type=bill_type, object_id=bill.id).exists():
            return None

        with transaction.atomic():
            # 1. Get Accounts
            ap_account = cls.get_or_create_account('2000', 'Accounts Payable', 'liability', 'credit')
            expense_account = cls.get_or_create_account('5000', 'Purchases/Expense', 'expense', 'debit')
            inventory_account = cls.get_or_create_account('1500', 'Inventory Asset', 'asset', 'debit')
            input_tax_account = cls.get_or_create_account('2200', 'Input Sales Tax', 'asset', 'debit') 

            # 2. Create Header
            je = JournalEntry.objects.create(
                date=bill.bill_date if bill.bill_date else timezone.now().date(),
                description=f"Bill #{bill.bill_number} from {str(bill.vendor)}",
                reference=bill.reference_number or bill.bill_number,
                posted=True,
                created_by=bill.created_by,
                branch=bill.branch,
                content_object=bill
            )

            # 3. Create Transactions
            
            # Credit AP (Total Amount)
            Transaction.objects.create(
                journal_entry=je,
                account=ap_account,
                amount=bill.total,
                transaction_type='credit',
                description='Bill Total'
            )

            # Calculate Debits (Split by Expense vs Inventory)
            # We iterate line items now
            
            inventory_total = Decimal('0.00')
            expense_total = Decimal('0.00')
            
            for line in bill.line_items.all():
                if line.inventory_item:
                    inventory_total += line.total
                else:
                    expense_total += line.total

            # Note: tax_amount is typically excluded from line item totals in many systems or included.
            # In our Bill model (Step 696), line.total seems to be qty * price. 
            # Bill.total = subtotal + tax.
            # So line items sum to subtotal?
            # Step 1595: self.total = self.quantity * self.unit_price.
            # So line totals are PRE-TAX usually unless unit_price includes tax.
            # Let's assume line totals sum to bill.subtotal.
            
            # Additional check: If (inventory + expense) != subtotal, we might have a gap.
            # But let's trust line items for distribution.
            
            # If line items are empty but subtotal exist (legacy data?), default to expense.
            if inventory_total == 0 and expense_total == 0 and bill.subtotal > 0:
                expense_total = bill.subtotal
            
            # Create Debit for Inventory
            if inventory_total > 0:
                 Transaction.objects.create(
                    journal_entry=je,
                    account=inventory_account,
                    amount=inventory_total,
                    transaction_type='debit',
                    description='Inventory Purchase'
                )
            
            # Create Debit for Expense
            if expense_total > 0:
                 Transaction.objects.create(
                    journal_entry=je,
                    account=expense_account,
                    amount=expense_total,
                    transaction_type='debit',
                    description='General Expense'
                )

            # Debit Input Tax (Tax Amount)
            if bill.tax_amount > 0:
                Transaction.objects.create(
                    journal_entry=je,
                    account=input_tax_account,
                    amount=bill.tax_amount,
                    transaction_type='debit',
                    description='Input Tax'
                )

            # Validate
            if not je.validate_balanced():
                raise ValidationError(f"Journal Entry for Bill {bill.bill_number} is not balanced.")
            
            return je

    @classmethod
    def post_payment(cls, payment):
        """
        Creates a Journal Entry for an Inbound Customer Payment.
        Debit: Cash/Undeposited Funds (1000)
        Credit: Accounts Receivable (1200)
        """
        if payment.status != 'completed':
            return None

        # Check if already posted
        payment_type = ContentType.objects.get_for_model(payment)
        if JournalEntry.objects.filter(content_type=payment_type, object_id=payment.id).exists():
            return None

        with transaction.atomic():
            # 1. Get Accounts
            cash_account = cls.get_or_create_account('1000', 'Cash/Bank', 'asset', 'debit')
            ar_account = cls.get_or_create_account('1200', 'Accounts Receivable', 'asset', 'debit')

            # 2. Create Header
            je = JournalEntry.objects.create(
                date=payment.payment_date.date() if payment.payment_date else timezone.now().date(),
                description=f"Payment {payment.payment_number} from {str(payment.customer)}",
                reference=payment.reference_number or payment.payment_number,
                posted=True,
                created_by=payment.processed_by,
                # branch=payment.invoice.branch, # Payment linked to invoice, infer branch
                content_object=payment
            )
            if payment.invoice and payment.invoice.branch:
                je.branch = payment.invoice.branch
                je.save()

            # 3. Create Transactions
            
            # Debit Cash (Total Amount)
            Transaction.objects.create(
                journal_entry=je,
                account=cash_account,
                amount=payment.amount,
                transaction_type='debit',
                description=f'Payment Received ({payment.payment_method})'
            )

            # Credit AR (Total Amount)
            Transaction.objects.create(
                journal_entry=je,
                account=ar_account,
                amount=payment.amount,
                transaction_type='credit',
                description='Payment applied to Invoice'
            )

            # Validate
            if not je.validate_balanced():
                raise ValidationError(f"Journal Entry for Payment {payment.payment_number} is not balanced.")
            return je

    @classmethod
    def post_bill_payment(cls, bill_payment):
        """Post GL entry for Vendor Bill Payment"""
        # Similar to post_payment but for AP
        # Check if already posted
        bp_type = ContentType.objects.get_for_model(bill_payment)
        if JournalEntry.objects.filter(content_type=bp_type, object_id=bill_payment.id).exists():
            return None

        with transaction.atomic():
            # 1. Get Accounts
            cash_account = cls.get_or_create_account('1000', 'Cash/Bank', 'asset', 'debit')
            ap_account = cls.get_or_create_account('2000', 'Accounts Payable', 'liability', 'credit')

            # 2. Create Header
            je = JournalEntry.objects.create(
                date=bill_payment.payment_date,
                description=f"Bill Payment {bill_payment.payment_number} to {str(bill_payment.bill.vendor)}",
                reference=bill_payment.reference_number or bill_payment.payment_number,
                posted=True,
                created_by=bill_payment.paid_by,
                branch=bill_payment.bill.branch,
                content_object=bill_payment
            )

            # 3. Create Transactions
            
            # Debit AP (Total Amount)
            Transaction.objects.create(
                journal_entry=je,
                account=ap_account,
                amount=bill_payment.amount,
                transaction_type='debit',
                description=f'Payment for Bill {bill_payment.bill.bill_number}'
            )

            # Credit Cash (Total Amount)
            Transaction.objects.create(
                journal_entry=je,
                account=cash_account,
                amount=bill_payment.amount,
                transaction_type='credit',
                description=f'Payment Sent ({bill_payment.payment_method})'
            )

            # Validate
            if not je.validate_balanced():
                raise ValidationError(f"Journal Entry for Bill Payment {bill_payment.payment_number} is not balanced.")
            
            return je

    # ========================================================================
    # PHASE 7: OPERATIONAL INTEGRATION
    # ========================================================================

    @classmethod
    def post_inventory_adjustment(cls, inventory_transaction):
        """
        Post GL entry for inventory adjustments (shrinkage, damage, counts).
        Only posts for adjustment-type transactions (adjustment, damage, count).
        """
        from apps.inventory.models import InventoryTransaction
        
        # Only process adjustment types
        if inventory_transaction.transaction_type not in ['adjustment', 'damage', 'count']:
            return
        
        # Get accounts
        inventory_asset = Account.objects.filter(code='1300').first()  # Inventory Asset
        shrinkage_expense = Account.objects.filter(code='5900').first()  # Inventory Shrinkage Expense
        
        if not inventory_asset or not shrinkage_expense:
            return  # Accounts not set up yet
        
        # Calculate value of adjustment
        amount = abs(inventory_transaction.quantity) * (inventory_transaction.unit_cost or Decimal('0'))
        
        if amount == 0:
            return
        
        # Create Journal Entry
        description = f"Inventory {inventory_transaction.get_transaction_type_display()}: {inventory_transaction.part.part_number}"
        je = JournalEntry.objects.create(
            date=inventory_transaction.transaction_date.date(),
            description=description,
            reference=f"INV-{inventory_transaction.id}",
            posted=True,
            created_by=inventory_transaction.created_by
        )
        
        # If quantity is negative (removal/loss)
        if inventory_transaction.quantity < 0:
            # Debit: Shrinkage Expense, Credit: Inventory Asset
            Transaction.objects.create(
                journal_entry=je,
                account=shrinkage_expense,
                amount=amount,
                transaction_type='debit',
                description=f"{inventory_transaction.part.name}"
            )
            Transaction.objects.create(
                journal_entry=je,
                account=inventory_asset,
                amount=amount,
                transaction_type='credit',
                description=f"{inventory_transaction.part.name}"
            )
        # If quantity is positive (found stock / count correction)
        else:
            # Debit: Inventory Asset, Credit: Shrinkage Expense (recovery)
            Transaction.objects.create(
                journal_entry=je,
                account=inventory_asset,
                amount=amount,
                transaction_type='debit',
                description=f"{inventory_transaction.part.name}"
            )
            Transaction.objects.create(
                journal_entry=je,
                account=shrinkage_expense,
                amount=amount,
                transaction_type='credit',
                description=f"{inventory_transaction.part.name} (recovery)"
            )

    @classmethod
    def post_credit_note(cls, credit_note):
        """
        Post GL entry for Credit Note (revenue reversal).
        Debit: Sales Returns & Allowances
        Credit: Accounts Receivable
        """
        from apps.billing.models import CreditNote
        
        if credit_note.status != 'issued':
            return
        
        # Get accounts
        sales_returns = Account.objects.filter(code='4100').first()  # Sales Returns & Allowances
        ar_account = Account.objects.filter(code='1200').first()  # Accounts Receivable
        
        if not sales_returns or not ar_account:
            return
        
        amount = credit_note.amount
        
        je = JournalEntry.objects.create(
            date=credit_note.issue_date,
            description=f"Credit Note {credit_note.credit_note_number}",
            reference=credit_note.credit_note_number,
            posted=True,
            created_by=credit_note.created_by
        )
        
        # Debit: Sales Returns
        Transaction.objects.create(
            journal_entry=je,
            account=sales_returns,
            amount=amount,
            transaction_type='debit',
            description=f"Credit Note for {credit_note.customer.name}"
        )
        
        # Credit: AR
        Transaction.objects.create(
            journal_entry=je,
            account=ar_account,
            amount=amount,
            transaction_type='credit',
            description=f"Credit Note for {credit_note.customer.name}"
        )

    @classmethod
    def post_refund(cls, refund):
        """
        Post GL entry for cash refund.
        Debit: Accounts Receivable (or Sales Returns if CN applied)
        Credit: Cash
        """
        from apps.billing.models import Refund
        
        if refund.status != 'completed':
            return
        
        # Get accounts
        ar_account = Account.objects.filter(code='1200').first()
        cash_account = Account.objects.filter(code='1000').first()
        
        if not ar_account or not cash_account:
            return
        
        amount = refund.amount
        
        je = JournalEntry.objects.create(
            date=refund.processed_at.date() if refund.processed_at else timezone.now().date(),
            description=f"Refund {refund.refund_number}",
            reference=refund.refund_number,
            posted=True,
            created_by=refund.processed_by
        )
        
        # Debit: AR
        Transaction.objects.create(
            journal_entry=je,
            account=ar_account,
            amount=amount,
            transaction_type='debit',
            description=f"Refund to {refund.customer.name}"
        )
        
        # Credit: Cash
        Transaction.objects.create(
            journal_entry=je,
            account=cash_account,
            amount=amount,
            transaction_type='credit',
            description=f"Refund to {refund.customer.name}"
        )

    @classmethod
    def post_inter_branch_transfer(cls, transfer):
        """
        Post GL entries for inter-branch inventory transfer.
        Creates intercompany clearing accounts (Due To / Due From).
        """
        from apps.inventory.models import Transfer
        
        if transfer.status != 'received':
            return  # Only post when received
        
        # Get accounts
        inventory_asset = Account.objects.filter(code='1300').first()
        due_from = Account.objects.filter(code='1900').first()  # Due From Other Branches
        due_to = Account.objects.filter(code='2900').first()  # Due To Other Branches
        
        if not inventory_asset or not due_from or not due_to:
            return
        
        # Calculate total value of transfer
        total_value = sum(
            item.quantity * (item.part.cost_price or Decimal('0'))
            for item in transfer.items.all()
        )
        
        if total_value == 0:
            return
        
        # Source Branch Entry: Debit Due From, Credit Inventory
        je_source = JournalEntry.objects.create(
            date=transfer.shipped_date.date() if transfer.shipped_date else timezone.now().date(),
            description=f"Transfer Out {transfer.transfer_number} to {transfer.destination_branch.name}",
            reference=transfer.transfer_number,
            posted=True,
            created_by=transfer.created_by,
            branch=transfer.source_branch
        )
        
        Transaction.objects.create(
            journal_entry=je_source,
            account=due_from,
            amount=total_value,
            transaction_type='debit',
            description=f"Due from {transfer.destination_branch.name}"
        )
        Transaction.objects.create(
            journal_entry=je_source,
            account=inventory_asset,
            amount=total_value,
            transaction_type='credit',
            description=f"Transfer to {transfer.destination_branch.name}"
        )
        
        # Destination Branch Entry: Debit Inventory, Credit Due To
        je_dest = JournalEntry.objects.create(
            date=transfer.received_date.date() if transfer.received_date else timezone.now().date(),
            description=f"Transfer In {transfer.transfer_number} from {transfer.source_branch.name}",
            reference=transfer.transfer_number,
            posted=True,
            created_by=transfer.received_by,
            branch=transfer.destination_branch
        )
        
        Transaction.objects.create(
            journal_entry=je_dest,
            account=inventory_asset,
            amount=total_value,
            transaction_type='debit',
            description=f"Transfer from {transfer.source_branch.name}"
        )
        Transaction.objects.create(
            journal_entry=je_dest,
            account=due_to,
            amount=total_value,
            transaction_type='credit',
            description=f"Due to {transfer.source_branch.name}"
        )

    # ========================================================================
    # PHASE 8: CASH & BANKING
    # ========================================================================

    @classmethod
    def post_till_open(cls, till):
        """
        Post GL entry for cashier till opening.
        Transfers opening float from safe to drawer.
        Debit: Cash Drawer (1020), Credit: Cash in Safe (1010)
        """
        from apps.billing.models import CashierTill
        
        if till.status != 'open' or till.opening_balance == 0:
            return
        
        # Get accounts
        cash_drawer = Account.objects.filter(code='1020').first()  # Cash in Drawer
        cash_safe = Account.objects.filter(code='1010').first()  # Cash in Safe
        
        if not cash_drawer or not cash_safe:
            return  # Accounts not set up yet
        
        # Create Journal Entry
        je = JournalEntry.objects.create(
            date=till.opened_at.date(),
            description=f"Till Open #{till.id} - {till.cashier.get_full_name()}",
            reference=f"TILL-{till.id}-OPEN",
            posted=True,
            created_by=till.cashier,
            branch=till.branch
        )
        
        # Debit: Cash Drawer
        Transaction.objects.create(
            journal_entry=je,
            account=cash_drawer,
            amount=till.opening_balance,
            transaction_type='debit',
            description=f"Opening float for {till.cashier.get_full_name()}"
        )
        
        # Credit: Cash in Safe
        Transaction.objects.create(
            journal_entry=je,
            account=cash_safe,
            amount=till.opening_balance,
            transaction_type='credit',
            description=f"Opening float for {till.cashier.get_full_name()}"
        )

    @classmethod
    def post_till_close(cls, till):
        """
        Post GL entry for cashier till closing.
        Handles deposit back to safe and variance (over/short).
        """
        from apps.billing.models import CashierTill
        
        if till.status != 'closed' or not till.closing_balance:
            return
        
        # Get accounts
        cash_drawer = Account.objects.filter(code='1020').first()
        cash_safe = Account.objects.filter(code='1010').first()
        cash_over_short = Account.objects.filter(code='5950').first()  # Cash Over/Short Expense
        
        if not cash_drawer or not cash_safe:
            return
        
        # Base entry: deposit closing balance back to safe
        je = JournalEntry.objects.create(
            date=till.closed_at.date() if till.closed_at else timezone.now().date(),
            description=f"Till Close #{till.id} - {till.cashier.get_full_name()}",
            reference=f"TILL-{till.id}-CLOSE",
            posted=True,
            created_by=till.cashier,
            branch=till.branch
        )
        
        # Debit: Cash in Safe
        Transaction.objects.create(
            journal_entry=je,
            account=cash_safe,
            amount=till.closing_balance,
            transaction_type='debit',
            description=f"Till closing deposit from {till.cashier.get_full_name()}"
        )
        
        # Credit: Cash Drawer
        Transaction.objects.create(
            journal_entry=je,
            account=cash_drawer,
            amount=till.closing_balance,
            transaction_type='credit',
            description=f"Till closing deposit from {till.cashier.get_full_name()}"
        )
        
        # Handle Variance (Cash Over/Short)
        if till.variance and till.variance != 0 and cash_over_short:
            variance_je = JournalEntry.objects.create(
                date=till.closed_at.date() if till.closed_at else timezone.now().date(),
                description=f"Till Variance #{till.id} - {till.cashier.get_full_name()}",
                reference=f"TILL-{till.id}-VAR",
                posted=True,
                created_by=till.cashier,
                branch=till.branch
            )
            
            if till.variance < 0:
                # Cash Short: Debit Cash Over/Short, Credit Cash in Safe
                Transaction.objects.create(
                    journal_entry=variance_je,
                    account=cash_over_short,
                    amount=abs(till.variance),
                    transaction_type='debit',
                    description=f"Cash shortage - Till #{till.id}"
                )
                Transaction.objects.create(
                    journal_entry=variance_je,
                    account=cash_safe,
                    amount=abs(till.variance),
                    transaction_type='credit',
                    description=f"Cash shortage - Till #{till.id}"
                )
            else:
                # Cash Over: Debit Cash in Safe, Credit Cash Over/Short (recovery)
                Transaction.objects.create(
                    journal_entry=variance_je,
                    account=cash_safe,
                    amount=till.variance,
                    transaction_type='debit',
                    description=f"Cash overage - Till #{till.id}"
                )
                Transaction.objects.create(
                    journal_entry=variance_je,
                    account=cash_over_short,
                    amount=till.variance,
                    transaction_type='credit',
                    description=f"Cash overage - Till #{till.id}"
                )

    @classmethod
    def post_fund_transfer(cls, transfer):
        """
        Post GL entry for fund transfer.
        Debit: To Account, Credit: From Account
        """
        from apps.accounting.models import FundTransfer
        
        if transfer.status != 'completed' or transfer.journal_entry:
            return  # Already posted or not completed
        
        # Create Journal Entry
        je = JournalEntry.objects.create(
            date=transfer.transfer_date,
            description=transfer.description,
            reference=transfer.transfer_number,
            posted=True,
            created_by=transfer.approved_by or transfer.created_by
        )
        
        # Debit: To Account
        Transaction.objects.create(
            journal_entry=je,
            account=transfer.to_account,
            amount=transfer.amount,
            transaction_type='debit',
            description=f"Transfer from {transfer.from_account.name}"
        )
        
        # Credit: From Account
        Transaction.objects.create(
            journal_entry=je,
            account=transfer.from_account,
            amount=transfer.amount,
            transaction_type='credit',
            description=f"Transfer to {transfer.to_account.name}"
        )
        
        # Link JE to transfer
        transfer.journal_entry = je
        transfer.save()


class ReportingService:
    @staticmethod
    def get_account_balance(account, date=None, start_date=None, end_date=None):
        """
        Calculate account balance.
        If date is provided, calculates cumulative balance up to that date (Balance Sheet).
        If start_date/end_date provided, calculates net movement in range (P&L).
        """
        qs = Transaction.objects.filter(journal_entry__posted=True, account=account)
        
        if date:
            qs = qs.filter(journal_entry__date__lte=date)
        elif start_date and end_date:
            qs = qs.filter(journal_entry__date__range=[start_date, end_date])
            
        aggregates = qs.aggregate(
            debits=Sum('amount', filter=Q(transaction_type='debit')),
            credits=Sum('amount', filter=Q(transaction_type='credit'))
        )
        
        debits = aggregates['debits'] or Decimal('0.00')
        credits = aggregates['credits'] or Decimal('0.00')
        
        if account.balance_type == 'debit':
            return debits - credits
        else:
            return credits - debits

    @classmethod
    def get_balance_sheet(cls, date=None, branch_id=None):
        if not date:
            date = timezone.now().date()
            
        assets = []
        liabilities = []
        equity = []
        
        total_assets = Decimal('0.00')
        total_liabilities = Decimal('0.00')
        total_equity = Decimal('0.00')
        
        # 1. Assets
        # Optimize: fetch all relevant accounts with balances in one go? 
        # For simplicity, iterating is fine for < 100 accounts.
        for account in Account.objects.filter(account_type='asset', is_active=True):
            bal = cls.get_account_balance(account, date=date, branch_id=branch_id)
            if bal != 0:
                assets.append({'code': account.code, 'name': account.name, 'balance': bal})
                total_assets += bal
                
        # 2. Liabilities
        for account in Account.objects.filter(account_type='liability', is_active=True):
            bal = cls.get_account_balance(account, date=date, branch_id=branch_id)
            if bal != 0:
                liabilities.append({'code': account.code, 'name': account.name, 'balance': bal})
                total_liabilities += bal

        # 3. Equity (Explicit Accounts)
        for account in Account.objects.filter(account_type='equity', is_active=True):
            bal = cls.get_account_balance(account, date=date, branch_id=branch_id)
            if bal != 0:
                equity.append({'code': account.code, 'name': account.name, 'balance': bal})
                total_equity += bal
                
        # 4. Retained Earnings (Calculated)
        # Income - Expenses (All time up to date)
        # Net Income = Total Income (Credit) - Total Expenses (Debit)
        
        total_income_lifetime = sum(cls.get_account_balance(a, date=date, branch_id=branch_id) for a in Account.objects.filter(account_type='income'))
        total_expense_lifetime = sum(cls.get_account_balance(a, date=date, branch_id=branch_id) for a in Account.objects.filter(account_type='expense'))
        
        retained_earnings = total_income_lifetime - total_expense_lifetime
        
        if retained_earnings != 0:
            equity.append({'code': 'RE', 'name': 'Retained Earnings (Calculated)', 'balance': retained_earnings})
            total_equity += retained_earnings

        return {
            'date': date,
            'assets': assets,
            'liabilities': liabilities,
            'equity': equity,
            'totals': {
                'assets': total_assets,
                'liabilities': total_liabilities,
                'equity': total_equity,
                'liabilities_plus_equity': total_liabilities + total_equity
            },
            'is_balanced': total_assets == (total_liabilities + total_equity)
        }

    @classmethod
    def get_profit_loss(cls, start_date, end_date, branch_id=None):
        income = []
        expenses = []
        
        total_income = Decimal('0.00')
        total_expenses = Decimal('0.00')
        
        # 1. Income
        for account in Account.objects.filter(account_type='income', is_active=True):
            bal = cls.get_account_balance(account, start_date=start_date, end_date=end_date, branch_id=branch_id)
            if bal != 0:
                income.append({'code': account.code, 'name': account.name, 'balance': bal})
                total_income += bal
                
        # 2. Expenses
        for account in Account.objects.filter(account_type='expense', is_active=True):
            bal = cls.get_account_balance(account, start_date=start_date, end_date=end_date, branch_id=branch_id)
            if bal != 0:
                expenses.append({'code': account.code, 'name': account.name, 'balance': bal})
                total_expenses += bal
                
        return {
            'period': {'start': start_date, 'end': end_date},
            'branch_id': branch_id,
            'income': income,
            'expenses': expenses,
            'totals': {
                'income': total_income,
                'expenses': total_expenses,
                'net_income': total_income - total_expenses
            }
        }

    @classmethod
    def get_trial_balance(cls, date=None, branch_id=None):
        """
        Generates a Trial Balance report.
        Lists all accounts with their debit/credit balances.
        """
        if not date:
            date = timezone.now().date()
            
        accounts_data = []
        total_debits = Decimal('0.00')
        total_credits = Decimal('0.00')
        
        # Iterate all accounts
        for account in Account.objects.filter(is_active=True).order_by('code'):
            # Calculate raw balance (debits - credits)
            qs = Transaction.objects.filter(
                journal_entry__posted=True, 
                account=account,
                journal_entry__date__lte=date
            )
            if branch_id:
                qs = qs.filter(journal_entry__branch_id=branch_id)
            aggregates = qs.aggregate(
                debits=Sum('amount', filter=Q(transaction_type='debit')),
                credits=Sum('amount', filter=Q(transaction_type='credit'))
            )
            debits = aggregates['debits'] or Decimal('0.00')
            credits = aggregates['credits'] or Decimal('0.00')
            
            # Net for this account
            net_balance = debits - credits
            
            if net_balance == 0:
                continue

            # In Trial Balance, we show Debit OR Credit column based on the sign
            row = {
                'code': account.code,
                'name': account.name,
                'type': account.account_type,
                'debit': Decimal('0.00'),
                'credit': Decimal('0.00')
            }
            
            if net_balance > 0:
                row['debit'] = net_balance
                total_debits += net_balance
            else:
                row['credit'] = abs(net_balance)
                total_credits += abs(net_balance)
                
            accounts_data.append(row)
            
        return {
            'date': date,
            'accounts': accounts_data,
            'totals': {
                'debits': total_debits,
                'credits': total_credits
            },
            'is_balanced': total_debits == total_credits
        }

    @staticmethod
    def get_cash_flow_statement(start_date=None, end_date=None, branch_id=None):
        """
        Generates Statement of Cash Flows (Direct Method - Simplified).
        Classifies cash movements into Operating, Investing, and Financing.
        """
        if not end_date:
            end_date = timezone.now().date()
        if not start_date:
            # Default to beginning of year if not specified
            start_date = end_date.replace(month=1, day=1)
            
        # 1. Identify Cash Accounts
        cash_accounts = Account.objects.filter(account_type__in=['bank', 'cash'])
        cash_account_ids = cash_accounts.values_list('id', flat=True)
        
        # 2. Initialize Report Structure
        report = {
            'operating_activities': {'inflows': Decimal('0.00'), 'outflows': Decimal('0.00'), 'net': Decimal('0.00')},
            'investing_activities': {'inflows': Decimal('0.00'), 'outflows': Decimal('0.00'), 'net': Decimal('0.00')},
            'financing_activities': {'inflows': Decimal('0.00'), 'outflows': Decimal('0.00'), 'net': Decimal('0.00')},
            'net_increase_decrease': Decimal('0.00'),
            'opening_balance': Decimal('0.00'),
            'closing_balance': Decimal('0.00'),
            'summary': []
        }
        
        # 3. Calculate Opening Balance (Cash at start_date)
        # Sum of all cash transactions before start_date
        opening_qs = Transaction.objects.filter(
            account__in=cash_accounts,
            journal_entry__posted=True,
            journal_entry__date__lt=start_date
        )
        if branch_id:
            opening_qs = opening_qs.filter(journal_entry__branch_id=branch_id)
        op_agg = opening_qs.aggregate(
            debits=Sum('amount', filter=Q(transaction_type='debit')),
            credits=Sum('amount', filter=Q(transaction_type='credit'))
        )
        op_debits = op_agg['debits'] or Decimal('0.00')
        op_credits = op_agg['credits'] or Decimal('0.00')
        # Cash is Asset (Debit Balance)
        report['opening_balance'] = op_debits - op_credits
        
        # 4. Process Period Transactions
        transactions = Transaction.objects.filter(
            account__in=cash_accounts,
            journal_entry__posted=True,
            journal_entry__date__range=[start_date, end_date]
        )
        if branch_id:
            transactions = transactions.filter(journal_entry__branch_id=branch_id)
            
        transactions = transactions.select_related('journal_entry')
        
        for txn in transactions:
            je = txn.journal_entry
            amount = txn.amount
            is_inflow = (txn.transaction_type == 'debit')
            
            # Simple Classification Heuristic based on contra-accounts
            # Create a set of account types involved in the OTHER side of the JE
            contra_types = set()
            other_txns = je.transactions.exclude(id=txn.id)
            for other in other_txns:
                contra_types.add(other.account.account_type)
            
            activity = 'operating_activities' # Default
            
            if 'fixed_asset' in contra_types or 'non_current_asset' in contra_types:
                activity = 'investing_activities'
            elif 'equity' in contra_types or 'long_term_liability' in contra_types:
                activity = 'financing_activities'
            # else: operating (income, expense, current_asset, current_liability)
            
            if is_inflow:
                report[activity]['inflows'] += amount
            else:
                report[activity]['outflows'] += amount
                
        # 5. Net Calculations
        for activity in ['operating_activities', 'investing_activities', 'financing_activities']:
            report[activity]['net'] = report[activity]['inflows'] - report[activity]['outflows']
            
        report['net_increase_decrease'] = (
            report['operating_activities']['net'] +
            report['investing_activities']['net'] +
            report['financing_activities']['net']
        )
        
        report['closing_balance'] = report['opening_balance'] + report['net_increase_decrease']
        
        return report

    @staticmethod
    def get_tax_report(start_date=None, end_date=None, branch_id=None):
        """
        Generate Tax Report (Sales Tax Collected vs Input Tax Paid)
        """
        from apps.billing.models import Invoice, Bill
        from django.db.models import Sum, Q
        
        # Default to current year
        if not start_date:
            start_date = timezone.now().date().replace(month=1, day=1)
        if not end_date:
            end_date = timezone.now().date()
        
        # Tax Collected (from Invoices - Sales Tax)
        invoices = Invoice.objects.filter(
            invoice_date__gte=start_date,
            invoice_date__lte=end_date,
            status__in=['open', 'partial', 'paid']  # Only finalized invoices
        )
        
        if branch_id:
            invoices = invoices.filter(branch_id=branch_id)
        
        tax_collected = invoices.aggregate(
            vat=Sum('tax_vat_amount') or Decimal('0'),
            nhil=Sum('tax_nhil_amount') or Decimal('0'),
            getfund=Sum('tax_getfund_amount') or Decimal('0'),
            hrl=Sum('tax_hrl_amount') or Decimal('0'),
            total=Sum('tax_amount') or Decimal('0')
        )
        
        # Tax Paid (from Bills - Input Tax)
        bills = Bill.objects.filter(
            bill_date__gte=start_date,
            bill_date__lte=end_date,
            status__in=['open', 'partially_paid', 'paid']
        )
        
        if branch_id:
            bills = bills.filter(branch_id=branch_id)
        
        tax_paid = bills.aggregate(
            total=Sum('tax_amount') or Decimal('0')
        )
        
        # Net Tax Liability
        net_tax = (tax_collected['total'] or Decimal('0')) - (tax_paid['total'] or Decimal('0'))
        
        return {
            'period': {
                'start_date': start_date,
                'end_date': end_date
            },
            'tax_collected': {
                'vat': float(tax_collected['vat'] or Decimal('0')),
                'nhil': float(tax_collected['nhil'] or Decimal('0')),
                'getfund': float(tax_collected['getfund'] or Decimal('0')),
                'hrl': float(tax_collected['hrl'] or Decimal('0')),
                'total': float(tax_collected['total'] or Decimal('0'))
            },
            'tax_paid': {
                'total': float(tax_paid['total'] or Decimal('0'))
            },
            'net_tax_liability': float(net_tax),
            'invoice_count': invoices.count(),
            'bill_count': bills.count()
        }

    @staticmethod
    def get_aging_report(report_type='ar', date=None, branch_id=None):
        """
        Generates AP (Accounts Payable) or AR (Accounts Receivable) Aging Report.
        Buckets: Current, 1-30, 31-60, 61-90, 90+
        """
        if not date:
            date = timezone.now().date()
            
        buckets = {
            'current': Decimal('0.00'),
            '1-30': Decimal('0.00'),
            '31-60': Decimal('0.00'),
            '61-90': Decimal('0.00'),
            '90+': Decimal('0.00'),
            'total': Decimal('0.00')
        }
        
        details = []
        
        if report_type == 'ar':
            # Accounts Receivable (Invoices)
            # Filter for open invoices
            queryset = Invoice.objects.filter(
                status__in=['sent', 'viewed', 'partial', 'overdue']
            ).exclude(amount_due=0)
            
            if branch_id:
                queryset = queryset.filter(branch_id=branch_id)
            
            for invoice in queryset:
                due_date = invoice.due_date
                amount = invoice.amount_due
                
                # Determine bucket
                if not due_date or date <= due_date:
                    bucket = 'current'
                else:
                    days_overdue = (date - due_date).days
                    if days_overdue <= 30:
                        bucket = '1-30'
                    elif days_overdue <= 60:
                        bucket = '31-60'
                    elif days_overdue <= 90:
                        bucket = '61-90'
                    else:
                        bucket = '90+'
                
                buckets[bucket] += amount
                buckets['total'] += amount
                
                details.append({
                    'id': invoice.id,
                    'number': invoice.invoice_number,
                    'entity': str(invoice.customer),
                    'date': invoice.invoice_date,
                    'due_date': invoice.due_date,
                    'amount': amount,
                    'bucket': bucket
                })

        elif report_type == 'ap':
            # Accounts Payable (Bills)
            queryset = Bill.objects.filter(
                status__in=['open', 'partially_paid', 'overdue']
            ).exclude(amount_due=0)
            
            if branch_id:
                queryset = queryset.filter(branch_id=branch_id)
            
            for bill in queryset:
                due_date = bill.due_date
                amount = bill.amount_due
                
                if not due_date or date <= due_date:
                    bucket = 'current'
                else:
                    days_overdue = (date - due_date).days
                    if days_overdue <= 30:
                        bucket = '1-30'
                    elif days_overdue <= 60:
                        bucket = '31-60'
                    elif days_overdue <= 90:
                        bucket = '61-90'
                    else:
                        bucket = '90+'
                
                buckets[bucket] += amount
                buckets['total'] += amount
                
                details.append({
                    'id': bill.id,
                    'number': bill.bill_number,
                    'entity': str(bill.vendor),
                    'date': bill.bill_date,
                    'due_date': bill.due_date,
                    'amount': amount,
                    'bucket': bucket
                })
        return {
            'report_type': report_type,
            'date': date,
            'summary': buckets,
            'details': details
        }

    # ========================================================================
    # PHASE 9: JOB PROFITABILITY & BRANCH REPORTS
    # ========================================================================
    
    @staticmethod
    def get_job_profitability(work_order_id=None, start_date=None, end_date=None, branch_id=None):
        """
        Calculate job profitability by work order.
        Returns: revenue, direct_costs, gross_profit, margin%
        """
        from apps.workorders.models import WorkOrder
        from apps.billing.models import Invoice
        from apps.inventory.models import InventoryTransaction
        from django.db import models
        from decimal import Decimal
        from django.db.models import Sum
        
        # Build query
        wo_qs = WorkOrder.objects.select_related('customer', 'vehicle', 'branch')
        
        if work_order_id:
            wo_qs = wo_qs.filter(id=work_order_id)
        if start_date and end_date:
            wo_qs = wo_qs.filter(created_at__range=[start_date, end_date])
        if branch_id:
            wo_qs = wo_qs.filter(branch_id=branch_id)
        
        # Only include work orders with invoices
        wo_qs = wo_qs.filter(status__in=['invoiced', 'completed', 'closed'])
        
        results = []
        for wo in wo_qs:
            # Revenue from invoices
            invoices = Invoice.objects.filter(
                work_order=wo,
                status__in=['open', 'paid', 'partial']
            )
            revenue = invoices.aggregate(total=Sum('total'))['total'] or Decimal('0')
            
            if revenue == 0:
                continue  # Skip work orders with no revenue
            
            # Parts cost from inventory transactions
            parts_cost = InventoryTransaction.objects.filter(
                work_order=wo,
                transaction_type='issue'
            ).aggregate(
                total=Sum(models.F('quantity') * models.F('unit_cost'))
            )['total'] or Decimal('0')
            
            # Labor cost - use actual from work order
            # (In a real system, this would come from time tracking)
            labor_cost = wo.estimated_labor_cost or Decimal('0')
            
            direct_costs = parts_cost + labor_cost
            gross_profit = revenue - direct_costs
            margin = (gross_profit / revenue * 100) if revenue > 0 else Decimal('0')
            
            results.append({
                'work_order_id': wo.id,
                'work_order_number': wo.work_order_number,
                'customer': wo.customer.name if wo.customer else 'N/A',
                'vehicle': f"{wo.vehicle.year} {wo.vehicle.make} {wo.vehicle.model}" if wo.vehicle else 'N/A',
                'branch': wo.branch.name if wo.branch else 'N/A',
                'status': wo.status,
                'created_at': wo.created_at,
                'completed_at': wo.completed_at,
                'revenue': float(revenue),
                'parts_cost': float(parts_cost),
                'labor_cost': float(labor_cost),
                'direct_costs': float(direct_costs),
                'gross_profit': float(gross_profit),
                'margin_percent': float(margin.quantize(Decimal('0.01')))
            })
        
        # Sort by gross profit descending
        results.sort(key=lambda x: x['gross_profit'], reverse=True)
        
        total_revenue = sum(j['revenue'] for j in results)
        total_costs = sum(j['direct_costs'] for j in results)
        total_profit = sum(j['gross_profit'] for j in results)
        
        return {
            'jobs': results,
            'totals': {
                'count': len(results),
                'revenue': total_revenue,
                'direct_costs': total_costs,
                'gross_profit': total_profit,
                'avg_margin_percent': float((total_profit / total_revenue * 100) if total_revenue > 0 else Decimal('0'))
            }
        }
    
    @classmethod
    def get_profit_loss(cls, start_date, end_date, branch_id=None):
        """
        Enhanced P&L with optional branch filter.
        """
        from apps.accounting.models import Account
        from decimal import Decimal
        
        income = []
        expenses = []
        
        total_income = Decimal('0.00')
        total_expenses = Decimal('0.00')
        
        # 1. Income
        for account in Account.objects.filter(account_type='income', is_active=True):
            bal = cls.get_account_balance(
                account, 
                start_date=start_date, 
                end_date=end_date,
                branch_id=branch_id
            )
            if bal != 0:
                income.append({'code': account.code, 'name': account.name, 'balance': bal})
                total_income += bal
                
        # 2. Expenses
        for account in Account.objects.filter(account_type='expense', is_active=True):
            bal = cls.get_account_balance(
                account, 
                start_date=start_date, 
                end_date=end_date,
                branch_id=branch_id
            )
            if bal != 0:
                expenses.append({'code': account.code, 'name': account.name, 'balance': bal})
                total_expenses += bal
                
        return {
            'period': {'start': start_date, 'end': end_date},
            'branch_id': branch_id,
            'branch_name': None,  # Will be populated by view
            'income': income,
            'expenses': expenses,
            'totals': {
                'income': total_income,
                'expenses': total_expenses,
                'net_income': total_income - total_expenses
            }
        }
    
    @staticmethod
    def get_account_balance(account, date=None, start_date=None, end_date=None, branch_id=None):
        """
        Calculate account balance with optional branch filter.
        Enhanced to support branch-specific reporting.
        """
        from apps.accounting.models import Transaction
        from django.db.models import Sum, Q
        from decimal import Decimal
        
        qs = Transaction.objects.filter(journal_entry__posted=True, account=account)
        
        if date:
            qs = qs.filter(journal_entry__date__lte=date)
        elif start_date and end_date:
            qs = qs.filter(journal_entry__date__range=[start_date, end_date])
        
        # Branch filter
        if branch_id:
            qs = qs.filter(journal_entry__branch_id=branch_id)
            
        aggregates = qs.aggregate(
            debits=Sum('amount', filter=Q(transaction_type='debit')),
            credits=Sum('amount', filter=Q(transaction_type='credit'))
        )
        
        debits = aggregates['debits'] or Decimal('0')
        credits = aggregates['credits'] or Decimal('0')
        
        # Determine balance based on account type
        if account.account_type in ['asset', 'expense']:
            return debits - credits
        elif account.account_type in ['liability', 'equity', 'income']:
            return credits - debits
        return Decimal('0')

    # ========================================================================
    # PHASE 10: BUDGETING & CONTROLS
    # ========================================================================
    
    @staticmethod
    def get_budget_vs_actual(budget_id, start_date=None, end_date=None):
        """
        Compare budgeted amounts to actual spend.
        Returns variance analysis for each budget line.
        """
        from apps.accounting.models import Budget, BudgetLine
        from decimal import Decimal
        
        try:
            budget = Budget.objects.prefetch_related('lines__account').get(id=budget_id)
        except Budget.DoesNotExist:
            return {'error': 'Budget not found'}
        
        # Use budget dates if not provided
        if not start_date:
            start_date = budget.start_date
        if not end_date:
            end_date = budget.end_date
        
        results = []
        for line in budget.lines.all():
            # Get actual spend for this account in the period
            actual = ReportingService.get_account_balance(
                line.account,
                start_date=start_date,
                end_date=end_date,
                branch_id=budget.branch_id if budget.branch else None
            )
            
            variance = abs(actual) - line.amount
            variance_pct = (variance / line.amount * 100) if line.amount != 0 else Decimal('0')
            
            # Determine status
            if line.account.account_type in ['expense']:
                # For expenses: negative variance is good (under budget)
                status = 'under' if variance < 0 else 'over' if variance > 0 else 'on_target'
            else:
                # For income: positive variance is good (over budget)
                status = 'over' if variance > 0 else 'under' if variance < 0 else 'on_target'
            
            results.append({
                'account_code': line.account.code,
                'account_name': line.account.name,
                'account_type': line.account.account_type,
                'period': line.period,
                'budget': float(line.amount),
                'actual': float(abs(actual)),
                'variance': float(variance),
                'variance_percent': float(variance_pct.quantize(Decimal('0.01'))),
                'status': status
            })
        
        total_budget = sum(l['budget'] for l in results)
        total_actual = sum(l['actual'] for l in results)
        total_variance = sum(l['variance'] for l in results)
        
        return {
            'budget': {
                'id': budget.id,
                'name': budget.name,
                'fiscal_year': budget.fiscal_year,
                'status': budget.status,
                'branch_name': budget.branch.name if budget.branch else 'All Branches'
            },
            'period': {
                'start': start_date,
                'end': end_date
            },
            'lines': results,
            'summary': {
                'total_budget': total_budget,
                'total_actual': total_actual,
                'total_variance': total_variance,
                'variance_percent': float((total_variance / total_budget * 100) if total_budget != 0 else Decimal('0'))
            }
        }


    @staticmethod
    def get_budget_vs_actual(budget_id, start_date=None, end_date=None):
        """
        Compare budgeted amounts to actual spend.
        """
        from .models import Budget
        
        try:
            budget = Budget.objects.get(id=budget_id)
        except Budget.DoesNotExist:
            return None
            
        # Default dates to budget dates if not provided
        if not start_date:
            start_date = budget.start_date
        if not end_date:
            end_date = budget.end_date
            
        results = []
        total_budget = Decimal('0.00')
        total_actual = Decimal('0.00')
        
        for line in budget.lines.select_related('account').all():
            # Get actual balance for this account in the period
            # Note: For expense accounts, debit is positive (normal balance)
            # For income accounts, credit is positive (normal balance)
            actual = ReportingService.get_account_balance(
                line.account,
                start_date=start_date,
                end_date=end_date,
                branch_id=budget.branch_id 
            )
            
            # Variance calculation depends on account type
            # For expenses: Over budget (Actual > Budget) is negative/bad
            # For income: Under budget (Actual < Budget) is negative/bad
            
            variance = line.amount - actual # Positive means under budget (good for expenses)
            
            if line.account.account_type == 'income':
                variance = actual - line.amount # Positive means over budget (good for income)
                status = 'under' if variance < 0 else 'over'
            else:
                 # Expenses
                variance = line.amount - actual # Positive means under budget (good)
                status = 'over' if variance < 0 else 'under'

            variance_pct = (variance / line.amount * 100) if line.amount != 0 else Decimal('0')
            
            results.append({
                'account_code': line.account.code,
                'account_name': line.account.name,
                'account_type': line.account.account_type,
                'period': line.period,
                'budget': float(line.amount),
                'actual': float(actual),
                'variance': float(variance),
                'variance_percent': float(variance_pct),
                'status': status
            })
            
            total_budget += line.amount
            total_actual += actual

        total_variance = total_budget - total_actual # Simple math for summary
        total_variance_pct = (total_variance / total_budget * 100) if total_budget != 0 else Decimal('0')

        return {
            'budget': {
                'name': budget.name,
                'fiscal_year': budget.fiscal_year,
                'branch_name': budget.branch.name if budget.branch else 'Company-wide'
            },
            'period': {'start': start_date, 'end': end_date},
            'lines': results,
            'summary': {
                'total_budget': float(total_budget),
                'total_actual': float(total_actual),
                'total_variance': float(total_variance),
                'variance_percent': float(total_variance_pct)
            }
        }


class DashboardService:
    @staticmethod
    def get_management_metrics(start_date, end_date):
        """
        Consolidated metrics for management reporting.
        """
        from apps.accounting.models import Account
        
        # P&L Summary
        pl = ReportingService.get_profit_loss(start_date, end_date)
        
        # Cash on Hand (Bank + Cash accounts)
        cash_accounts = Account.objects.filter(account_type__in=['bank', 'cash'], is_active=True)
        cash_balance = sum(
            ReportingService.get_account_balance(acc, date=end_date)
            for acc in cash_accounts
        )
        
        # AR/AP Summary
        ar_aging = ReportingService.get_aging_report('ar', date=end_date)
        ap_aging = ReportingService.get_aging_report('ap', date=end_date)
        
        # Job Profitability (Top 5 by Margin)
        job_profit = ReportingService.get_job_profitability(
            start_date=start_date,
            end_date=end_date
        )
        top_jobs = job_profit['jobs'][:5]
        
        # Operating Expenses Breakdown (Top 5 Expenses)
        expenses = sorted(pl['expenses'], key=lambda x: x['balance'], reverse=True)[:5]
        
        formatted_expenses = [
            {
                'name': e['name'],
                'code': e['code'],
                'amount': float(e['balance'])
            } for e in expenses
        ]

        
        # Cash Burn & Runway
        # Calculate 'Burn' as average monthly Operating Cash Outflow over the last 3 months
        # Note: In a startup context, burn is usually net cash outflow. 
        # Here we'll approximation using Operating Activities Net.
        # If Net is positive, Burn is 0.
        
        # Get Cash Flow for the period
        cf = ReportingService.get_cash_flow_statement(start_date, end_date)
        net_operating_cash = cf['operating_activities']['net']
        
        # Burn Rate (Monthly average for the selected period)
        # Calculate number of months in period
        days = (end_date - start_date).days + 1
        months = max(days / 30.0, 1.0)
        
        if net_operating_cash < 0:
            monthly_burn = float(abs(net_operating_cash) / Decimal(months))
        else:
            monthly_burn = 0.0 # Generating cash, no burn
            
        runway_months = (float(cash_balance) / monthly_burn) if monthly_burn > 0 else 0
        
        # Branch Performance
        # Group revenue/profit by branch.
        # This requires iterating branches and running P&L.
        # Optimization: Could potential do singular aggregation query if performance is issue.
        from apps.branches.models import Branch
        branch_performance = []
        for branch in Branch.objects.filter(is_active=True):
            b_pl = ReportingService.get_profit_loss(start_date, end_date, branch_id=branch.id)
            branch_performance.append({
                'id': branch.id,
                'name': branch.name,
                'revenue': float(b_pl['totals']['income']),
                'net_income': float(b_pl['totals']['net_income']),
                'margin': float(b_pl['totals']['net_income'] / b_pl['totals']['income'] * 100) if b_pl['totals']['income'] > 0 else 0
            })

        return {
            'period': {'start': start_date, 'end': end_date},
            'kpis': {
                'revenue': float(pl['totals']['income']),
                'expenses': float(pl['totals']['expenses']),
                'net_income': float(pl['totals']['net_income']),
                'cash_balance': float(cash_balance),
                'ar_outstanding': float(ar_aging['summary']['total']),
                'ap_outstanding': float(ap_aging['summary']['total']),
                'avg_job_margin': float(job_profit['totals']['avg_margin_percent']),
                'monthly_burn': monthly_burn,
                'runway_months': runway_months
            },
            'top_expenses': formatted_expenses,
            'top_jobs': top_jobs,
            'branch_performance': branch_performance
        }

class ExportService:
    @staticmethod
    def generate_board_pack(start_date, end_date):
        """
        Generates a PDF Board Pack containing key financial reports and metrics.
        Returns: BytesIO object containing the PDF
        """
        import io
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter, landscape
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, Image
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from django.conf import settings
        
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []
        
        # --- TITLE PAGE ---
        title_style = ParagraphStyle(
            'Title',
            parent=styles['Heading1'],
            fontSize=24,
            alignment=1, # Center
            spaceAfter=30
        )
        subtitle_style = ParagraphStyle(
            'Subtitle',
            parent=styles['Normal'],
            fontSize=14,
            alignment=1, # Center
            spaceAfter=12
        )
        
        story.append(Spacer(1, 2*inch))
        story.append(Paragraph("Management Accounts Pack", title_style))
        story.append(Paragraph(f"Period: {start_date} to {end_date}", subtitle_style))
        story.append(Paragraph(f"Generated on {timezone.now().date()}", subtitle_style))
        story.append(PageBreak())
        
        # --- EXECUTIVE SUMMARY (KPIs) ---
        metrics = DashboardService.get_management_metrics(start_date, end_date)
        
        story.append(Paragraph("Executive Summary", styles['Heading1']))
        story.append(Spacer(1, 0.2*inch))
        
        kpi_data = [
            ['Metric', 'Value'],
            ['Total Revenue', f"{metrics['kpis']['revenue']:,.2f}"],
            ['Net Income', f"{metrics['kpis']['net_income']:,.2f}"],
            ['Total Expenses', f"{metrics['kpis']['expenses']:,.2f}"],
            ['Cash on Hand', f"{metrics['kpis']['cash_balance']:,.2f}"],
            ['AR Outstanding', f"{metrics['kpis']['ar_outstanding']:,.2f}"],
            ['AP Outstanding', f"{metrics['kpis']['ap_outstanding']:,.2f}"],
            ['Avg Job Margin', f"{metrics['kpis']['avg_job_margin']:.1f}%"],
        ]
        
        kpi_table = Table(kpi_data, colWidths=[3*inch, 2*inch])
        kpi_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))
        story.append(kpi_table)
        story.append(PageBreak())
        
        # --- PROFIT & LOSS SUMMARY ---
        story.append(Paragraph("Profit & Loss Summary", styles['Heading1']))
        story.append(Spacer(1, 0.2*inch))
        
        pl = ReportingService.get_profit_loss(start_date, end_date)
        
        pl_data = [['Account', 'Amount']]
        # Income
        pl_data.append(['INCOME', ''])
        for item in pl['income']:
            pl_data.append([item['name'], f"{item['balance']:,.2f}"])
        pl_data.append(['Total Income', f"{pl['totals']['income']:,.2f}"])
        
        # Expenses
        pl_data.append(['', ''])
        pl_data.append(['EXPENSES', ''])
        for item in pl['expenses']:
             pl_data.append([item['name'], f"{item['balance']:,.2f}"])
        pl_data.append(['Total Expenses', f"{pl['totals']['expenses']:,.2f}"])
        
        # Net Income
        pl_data.append(['', ''])
        pl_data.append(['NET INCOME', f"{pl['totals']['net_income']:,.2f}"])
        
        pl_table = Table(pl_data, colWidths=[4*inch, 2*inch])
        pl_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'), # Net Income bold
             # Highlight Totals
            ('BACKGROUND', (0, len(pl['income'])+2), (1, len(pl['income'])+2), colors.lightgrey), # Total Income
            ('BACKGROUND', (0, -3), (1, -3), colors.lightgrey), # Total Expenses
            ('BACKGROUND', (0, -1), (1, -1), colors.lightgreen), # Net Income
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        story.append(pl_table)
        
        doc.build(story)
        buffer.seek(0)
        return buffer
