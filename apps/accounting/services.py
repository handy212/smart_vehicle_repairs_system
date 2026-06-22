from decimal import Decimal
from collections import defaultdict

from django.db import transaction
from django.db import models
from django.db.models import Sum, Q
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.contrib.contenttypes.models import ContentType
from .models import Account, AccountingControl, JournalEntry, Transaction
from apps.billing.models import Invoice, Bill

class AccountingService:
    FINALIZED_INVOICE_STATUSES = {'sent', 'viewed', 'partial', 'paid', 'overdue', 'open'}
    MONEY_QUANT = Decimal('0.01')

    @staticmethod
    def _journal_user_for_payment(payment):
        """Prefer processed_by, then customer.user, then first active user (gateway edge cases)."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        if getattr(payment, 'processed_by_id', None):
            return payment.processed_by
        customer = getattr(payment, 'customer', None)
        if customer is not None and getattr(customer, 'user_id', None):
            return customer.user
        user = User.objects.filter(is_active=True).order_by('-is_superuser', 'pk').first()
        if user is None:
            raise ValidationError(
                'Cannot post payment to the ledger: processed_by is unset and no active fallback user exists.'
            )
        return user

    @staticmethod
    def _payment_journal_date(payment):
        pd = getattr(payment, 'payment_date', None)
        if pd is None:
            return timezone.now().date()
        if hasattr(pd, 'date') and callable(pd.date):
            return pd.date()
        if isinstance(pd, str):
            from django.utils.dateparse import parse_datetime, parse_date

            dt = parse_datetime(pd) or parse_date(pd)
            if dt:
                return dt.date() if hasattr(dt, 'date') else dt
        return timezone.now().date()

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
    def _control_account(cls, field_name, label=None):
        controls = AccountingControl.get_settings()
        account = getattr(controls, field_name, None)
        if account is None:
            raise ValidationError(
                f"Accounting control account '{label or field_name}' is not configured."
            )
        if not account.is_active:
            raise ValidationError(
                f"Accounting control account '{account}' is inactive."
            )
        if not account.is_leaf:
            raise ValidationError(
                f"Accounting control account '{account}' must be a detail/leaf account."
            )
        return account

    @classmethod
    def _optional_control_account(cls, field_name):
        controls = AccountingControl.get_settings()
        account = getattr(controls, field_name, None)
        if account is None or not account.is_active or not account.is_leaf:
            return None
        return account

    @classmethod
    def _cash_settlement_account(cls, till, source_label):
        if not till or not getattr(till, 'till_account_id', None):
            raise ValidationError(
                f"{source_label} requires an active till with a configured till cash account."
            )
        return till.till_account

    @classmethod
    def _bank_settlement_account(cls, source, source_label):
        account = getattr(source, 'bank_account', None)
        if account is None:
            raise ValidationError(
                f"{source_label} requires a selected bank or cash-equivalent account."
            )
        if (
            not account.is_active
            or account.account_type != 'asset'
            or account.account_subtype not in {'bank', 'cash_equivalent'}
            or not account.is_leaf
        ):
            raise ValidationError(
                f"{source_label} bank account must be an active leaf Asset account classified as Bank or Cash Equivalent."
            )
        return account

    @classmethod
    def _create_posted_journal_header(cls, *, user, date, description, reference='', branch=None, content_object=None):
        """Save a posted journal header and allow Transaction lines on the initial save."""
        je = JournalEntry(
            date=date,
            description=description,
            reference=reference or '',
            posted=True,
            created_by=user,
            branch=branch,
        )
        if content_object is not None:
            je.content_object = content_object
        je._current_user = user
        je.save()
        return je

    @classmethod
    def create_journal_entry(cls, user, date, description, lines, posted=True, reference='', branch=None, content_object=None):
        """
        Helper method to create a Journal Entry with lines.
        lines: list of dicts with keys: 'account_id', 'type' ('debit'/'credit'), 'amount', 'description'
        """
        if not lines or len(lines) < 2:
            raise ValidationError(
                "A journal entry needs at least two lines (minimum one debit and one credit)."
            )
        with transaction.atomic():
            debits = sum(Decimal(str(line['amount'])) for line in lines if line['type'] == 'debit')
            credits = sum(Decimal(str(line['amount'])) for line in lines if line['type'] == 'credit')
            if debits != credits:
                raise ValidationError(
                    f"Journal Entry '{description}' is not balanced. Debits: {debits}, Credits: {credits}."
                )

            je = JournalEntry(
                date=date,
                description=description,
                reference=reference or '',
                posted=False,
                created_by=user,
                branch=branch,
            )
            if content_object is not None:
                je.content_object = content_object
            je._current_user = user
            je.save()

            for line in lines:
                tx = Transaction(
                    journal_entry=je,
                    account_id=line['account_id'],
                    amount=line['amount'],
                    transaction_type=line['type'],
                    description=line.get('description', ''),
                )
                tx.save()

            if not je.validate_balanced():
                raise ValidationError(f"Journal Entry '{description}' is not balanced.")

            if posted:
                je.posted = True
                je._current_user = user
                je.save(update_fields=['posted', 'updated_at'])

            return je

    @classmethod
    def reverse_journal_entry(cls, journal_entry, user, date=None, reason=''):
        """
        Create a posted reversing journal entry for an existing posted entry.
        Posted entries remain immutable; corrections must be made through this
        reversal plus a new correcting entry where needed.
        """
        if not journal_entry.posted:
            raise ValidationError("Only posted journal entries can be reversed.")

        if journal_entry.content_object and isinstance(journal_entry.content_object, JournalEntry):
            raise ValidationError("Reversal entries cannot be reversed.")

        reversal_type = ContentType.objects.get_for_model(journal_entry)
        if JournalEntry.objects.filter(
            content_type=reversal_type,
            object_id=journal_entry.id,
            reference=f"REV-JE-{journal_entry.id}",
        ).exists():
            raise ValidationError(f"Journal Entry #{journal_entry.id} has already been reversed.")

        lines = [
            {
                'account_id': tx.account_id,
                'type': 'credit' if tx.transaction_type == 'debit' else 'debit',
                'amount': tx.amount,
                'description': f"Reversal: {tx.description or journal_entry.description}",
            }
            for tx in journal_entry.transactions.select_related('account').all()
        ]

        if not lines:
            raise ValidationError("Cannot reverse a journal entry with no transactions.")

        reversal_reason = reason.strip() if reason else ''
        description = f"Reversal of JE #{journal_entry.id}: {journal_entry.description}"
        if reversal_reason:
            description = f"{description} ({reversal_reason})"

        return cls.create_journal_entry(
            user=user,
            date=date or timezone.now().date(),
            description=description,
            reference=f"REV-JE-{journal_entry.id}",
            lines=lines,
            posted=True,
            branch=journal_entry.branch,
            content_object=journal_entry,
        )

    @classmethod
    def reverse_invoice_journal_entries(cls, invoice, user, reason=''):
        """Reverse all posted journal entries linked to an invoice (revenue and COGS)."""
        invoice_type = ContentType.objects.get_for_model(invoice)
        entries = JournalEntry.objects.filter(
            content_type=invoice_type,
            object_id=invoice.id,
            posted=True,
        ).order_by('id')

        reversals = []
        for journal_entry in entries:
            reversal_type = ContentType.objects.get_for_model(journal_entry)
            if JournalEntry.objects.filter(
                content_type=reversal_type,
                object_id=journal_entry.id,
                reference=f"REV-JE-{journal_entry.id}",
            ).exists():
                continue
            reversals.append(
                cls.reverse_journal_entry(journal_entry, user, reason=reason)
            )
        return reversals

    @classmethod
    def close_income_statement_period(cls, user, start_date, end_date, branch=None):
        """
        Close income and expense activity for a period into retained earnings.
        This creates a posted closing entry and is idempotent for the same
        period and branch.
        """
        if not start_date or not end_date:
            raise ValidationError("start_date and end_date are required.")
        if start_date > end_date:
            raise ValidationError("start_date cannot be after end_date.")

        branch_key = branch.id if branch else 'global'
        reference = f"CLOSE-{start_date:%Y%m%d}-{end_date:%Y%m%d}-{branch_key}"
        existing = JournalEntry.objects.filter(reference=reference, branch=branch).first()
        if existing:
            return existing

        retained_earnings = cls.get_or_create_account('3200', 'Retained Earnings', 'equity', 'credit')
        lines = []

        for account in Account.objects.filter(account_type__in=['income', 'expense'], is_active=True).order_by('code'):
            balance = ReportingService.get_account_balance(
                account,
                start_date=start_date,
                end_date=end_date,
                branch_id=branch.id if branch else None,
            )
            if balance == 0:
                continue

            amount = abs(balance).quantize(cls.MONEY_QUANT)
            if balance > 0:
                account_line_type = 'credit' if account.balance_type == 'debit' else 'debit'
            else:
                account_line_type = 'debit' if account.balance_type == 'debit' else 'credit'
            retained_line_type = 'credit' if account_line_type == 'debit' else 'debit'

            lines.append({
                'account_id': account.id,
                'type': account_line_type,
                'amount': amount,
                'description': f"Close {account.code} for {start_date} to {end_date}",
            })
            lines.append({
                'account_id': retained_earnings.id,
                'type': retained_line_type,
                'amount': amount,
                'description': f"Close {account.code} to retained earnings",
            })

        if not lines:
            raise ValidationError("No income or expense activity found for the selected period.")

        return cls.create_journal_entry(
            user=user,
            date=end_date,
            description=f"Close income statement for {start_date} to {end_date}",
            reference=reference,
            lines=lines,
            posted=True,
            branch=branch,
        )

    @classmethod
    def _has_unreversed_posted_journal(cls, *, content_type, object_id, reference):
        """True when a posted journal entry exists and has not been reversed."""
        je_type = ContentType.objects.get_for_model(JournalEntry)
        checked_ids = set()
        queries = [
            JournalEntry.objects.filter(reference=reference, posted=True),
        ]
        if content_type is not None and object_id is not None:
            queries.insert(
                0,
                JournalEntry.objects.filter(
                    content_type=content_type,
                    object_id=object_id,
                    reference=reference,
                    posted=True,
                ),
            )

        for queryset in queries:
            for journal_entry in queryset:
                if journal_entry.id in checked_ids:
                    continue
                checked_ids.add(journal_entry.id)
                if not JournalEntry.objects.filter(
                    content_type=je_type,
                    object_id=journal_entry.id,
                    reference=f"REV-JE-{journal_entry.id}",
                    posted=True,
                ).exists():
                    return True
        return False

    @classmethod
    def repost_invoice(cls, invoice, user, reason='Invoice updated'):
        """Reverse existing invoice GL entries and post updated amounts."""
        if invoice.status not in cls.FINALIZED_INVOICE_STATUSES:
            return None, None

        cls.reverse_invoice_journal_entries(invoice, user, reason=reason)
        revenue_entry = cls.post_invoice(invoice)
        cogs_entry = cls.post_cogs(invoice)
        return revenue_entry, cogs_entry

    @classmethod
    def post_invoice(cls, invoice):
        """
        Creates a Journal Entry for a finalized Invoice.
        Debit: Accounts Receivable (1200)
        Credit: Sales Revenue (4000)
        Credit: Sales Tax Payable (2100)
        """
        if invoice.status not in cls.FINALIZED_INVOICE_STATUSES:
            return None  # Only post finalized invoices

        invoice_type = ContentType.objects.get_for_model(invoice)
        invoice_reference = invoice.invoice_number or f"INV-{invoice.id}"
        total_amount = Decimal(str(invoice.total or Decimal('0'))).quantize(cls.MONEY_QUANT)

        if total_amount <= 0:
            return None

        # Check if the AR/revenue entry has already been posted. COGS is a
        # separate entry for the same invoice and should not block this one.
        if cls._has_unreversed_posted_journal(
            content_type=invoice_type,
            object_id=invoice.id,
            reference=invoice_reference,
        ):
            return None

        with transaction.atomic():
            ar_account = cls._control_account('accounts_receivable_account', 'Accounts Receivable')
            sales_account = cls._control_account('sales_revenue_account', 'Sales Revenue')
            tax_account = cls._control_account('sales_tax_payable_account', 'Sales Tax Payable')
            discount_account = cls._control_account('sales_discount_account', 'Sales Discount')
            shop_supplies_account = cls._control_account('shop_supplies_revenue_account', 'Shop Supplies Revenue')
            environmental_account = cls._control_account('environmental_fee_revenue_account', 'Environmental Fee Revenue')

            je = cls._create_posted_journal_header(
                user=invoice.created_by,
                date=invoice.invoice_date if invoice.invoice_date else timezone.now().date(),
                description=f"Invoice #{invoice_reference} for {str(invoice.customer)}",
                reference=invoice_reference,
                branch=invoice.branch,
                content_object=invoice,
            )

            tax_amount = Decimal(str(invoice.tax_amount or Decimal('0'))).quantize(cls.MONEY_QUANT)
            discount_amount = Decimal(str(invoice.discount_amount or Decimal('0'))).quantize(cls.MONEY_QUANT)
            shop_supplies_fee = Decimal(str(getattr(invoice, 'shop_supplies_fee', Decimal('0')) or Decimal('0'))).quantize(cls.MONEY_QUANT)
            environmental_fee = Decimal(str(getattr(invoice, 'environmental_fee', Decimal('0')) or Decimal('0'))).quantize(cls.MONEY_QUANT)
            revenue_amount = (
                total_amount
                + discount_amount
                - tax_amount
                - shop_supplies_fee
                - environmental_fee
            ).quantize(cls.MONEY_QUANT)

            if revenue_amount < 0:
                raise ValidationError(
                    f"Invoice {invoice_reference} has invalid totals: derived revenue is negative."
                )

            # Debit AR (Total Amount)
            Transaction.objects.create(
                journal_entry=je,
                account=ar_account,
                amount=total_amount,
                transaction_type='debit',
                description='Invoice Total'
            )

            if discount_amount > 0:
                Transaction.objects.create(
                    journal_entry=je,
                    account=discount_account,
                    amount=discount_amount,
                    transaction_type='debit',
                    description='Sales Discount'
                )

            # Credit Revenue (Subtotal, or total less tax for legacy invoices)
            if revenue_amount > 0:
                Transaction.objects.create(
                    journal_entry=je,
                    account=sales_account,
                    amount=revenue_amount,
                    transaction_type='credit',
                    description='Sales Revenue'
                )

            # Credit Tax (Tax Amount)
            if tax_amount > 0:
                Transaction.objects.create(
                    journal_entry=je,
                    account=tax_account,
                    amount=tax_amount,
                    transaction_type='credit',
                    description='Sales Tax'
                )

            if shop_supplies_fee > 0:
                Transaction.objects.create(
                    journal_entry=je,
                    account=shop_supplies_account,
                    amount=shop_supplies_fee,
                    transaction_type='credit',
                    description='Shop Supplies Fee'
                )

            if environmental_fee > 0:
                Transaction.objects.create(
                    journal_entry=je,
                    account=environmental_account,
                    amount=environmental_fee,
                    transaction_type='credit',
                    description='Environmental Fee'
                )

            # Validate
            if not je.validate_balanced():
                # Should rollback due to atomic block if we raise error, but let's be explicit
                raise ValidationError(f"Journal Entry for Invoice {invoice_reference} is not balanced.")
            
            return je

    @classmethod
    def post_cogs(cls, invoice):
        """
        Creates Cost of Goods Sold entries for an Invoice.
        Debit: Cost of Goods Sold (5100)
        Credit: Inventory Asset (1500)
        """
        if invoice.status not in cls.FINALIZED_INVOICE_STATUSES:
            return None

        invoice_type = ContentType.objects.get_for_model(invoice)
        invoice_reference = invoice.invoice_number or f"INV-{invoice.id}"
        cogs_reference = f"{invoice_reference}-COGS"

        if cls._has_unreversed_posted_journal(
            content_type=invoice_type,
            object_id=invoice.id,
            reference=cogs_reference,
        ):
            return None

        # Iterate over invoice line items, check if they are parts
        # Determine cost (use Part.cost_price for standard costing)
        # Note: In a real system we'd use FIFO/LIFO/Avg layers, but here we use current Unit Cost.
        
        cogs_total = Decimal('0.00')
        line_costs = [] # (line_item, cost_amount)
        
        for line in invoice.line_items.all():
            if line.part:
                from apps.inventory.part_catalog import part_contributes_inventory_cogs

                if not part_contributes_inventory_cogs(line.part):
                    continue
                # Calculate cost: quantity * part.cost_price
                qty = line.quantity or 0
                cost = line.part.cost_price or 0
                line_total_cost = (qty * cost).quantize(cls.MONEY_QUANT)
                
                if line_total_cost > 0:
                    cogs_total += line_total_cost
                    line_costs.append((line, line_total_cost))

        if cogs_total == 0 and invoice.work_order_id:
            from apps.inventory.models import Part
            from apps.inventory.part_catalog import part_contributes_inventory_cogs

            wo = invoice.work_order
            for wo_part in wo.parts.filter(status='installed'):
                if not wo_part.inventory_part_id:
                    continue
                part = Part.objects.filter(pk=wo_part.inventory_part_id).first()
                if not part or not part_contributes_inventory_cogs(part):
                    continue
                qty = wo_part.quantity or Decimal('1')
                unit_cost = part.cost_price or Decimal('0')
                line_total_cost = (qty * unit_cost).quantize(cls.MONEY_QUANT)
                if line_total_cost > 0:
                    cogs_total += line_total_cost
                    line_costs.append((wo_part, line_total_cost))
                    
        if cogs_total == 0:
            return None # No COGS to record

        with transaction.atomic():
            cogs_account = cls._control_account('cost_of_goods_sold_account', 'Cost of Goods Sold')
            inventory_account = cls._control_account('inventory_asset_account', 'Inventory Asset')

            # Create Header (Separate JE for COGS, linked to Invoice)
            # Or could be same JE? Usually separate or same. Let's make it separate usually for clarity
            # "COGS Recognition for Invoice ..."
            
            je = cls._create_posted_journal_header(
                user=invoice.created_by,
                date=invoice.invoice_date if invoice.invoice_date else timezone.now().date(),
                description=f"COGS for Invoice #{invoice_reference}",
                reference=cogs_reference,
                branch=invoice.branch,
                content_object=invoice,
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
                raise ValidationError(f"COGS Journal Entry for Invoice {invoice_reference} is not balanced.")
                
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

        if not bill.line_items.exists():
            return None

        # Check if already posted
        bill_type = ContentType.objects.get_for_model(bill)
        # Note: If we separate COGS in post_invoice, we don't need changes there.
        # But here we replace the previous post_bill implementation
        if JournalEntry.objects.filter(content_type=bill_type, object_id=bill.id).exists():
            return None

        with transaction.atomic():
            ap_account = cls._control_account('accounts_payable_account', 'Accounts Payable')
            expense_account = cls._control_account('default_expense_account', 'Default Expense')
            inventory_account = cls._control_account('inventory_asset_account', 'Inventory Asset')
            input_tax_account = cls._control_account('input_tax_account', 'Input Tax')

            je = cls._create_posted_journal_header(
                user=bill.created_by,
                date=bill.bill_date if bill.bill_date else timezone.now().date(),
                description=f"Bill #{bill.bill_number} from {str(bill.vendor)}",
                reference=bill.reference_number or bill.bill_number,
                branch=bill.branch,
                content_object=bill,
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
        Debit: Cash/Bank
        Credit: Accounts Receivable (invoice clearing)
        Credit: Customer Prepayments (overpayment remainder, when configured)
        """
        if payment.status != 'completed':
            return None

        payment_type = ContentType.objects.get_for_model(payment)
        if JournalEntry.objects.filter(content_type=payment_type, object_id=payment.id).exists():
            return None

        with transaction.atomic():
            from apps.branches.models import Branch

            if payment.payment_method == 'cash':
                cash_account = cls._cash_settlement_account(payment.till, f"Payment {payment.payment_number}")
            else:
                cash_account = cls._bank_settlement_account(payment, f"Payment {payment.payment_number}")
            ar_account = cls._control_account('accounts_receivable_account', 'Accounts Receivable')
            prepayment_account = cls._optional_control_account('customer_prepayment_account')

            allocations = list(
                payment.allocations.select_related('invoice', 'invoice__branch').order_by('id')
            )
            total_pay = Decimal(str(payment.amount)).quantize(cls.MONEY_QUANT)

            branch_ar_credits = defaultdict(lambda: Decimal('0'))
            branch_prepayment_credits = defaultdict(lambda: Decimal('0'))

            if allocations:
                for alloc in allocations:
                    inv = alloc.invoice
                    bid = inv.branch_id if inv and getattr(inv, 'branch_id', None) else None
                    branch_ar_credits[bid] += Decimal(str(alloc.amount)).quantize(cls.MONEY_QUANT)

                allocated_sum = sum(branch_ar_credits.values(), Decimal('0')).quantize(cls.MONEY_QUANT)
                remainder = (total_pay - allocated_sum).quantize(cls.MONEY_QUANT)
                if remainder < 0:
                    raise ValidationError(
                        f"Payment {payment.payment_number} allocations ({allocated_sum}) exceed payment amount ({total_pay})."
                    )
                if remainder > 0:
                    inv = payment.invoice
                    bid = inv.branch_id if inv and getattr(inv, 'branch_id', None) else None
                    branch_prepayment_credits[bid] += remainder
            else:
                inv = payment.invoice
                amount_paid_excluding = max(
                    (inv.amount_paid - total_pay).quantize(cls.MONEY_QUANT) if inv else Decimal('0'),
                    Decimal('0'),
                )
                amount_due_before = (
                    (inv.total - amount_paid_excluding).quantize(cls.MONEY_QUANT) if inv else Decimal('0')
                )
                ar_portion = min(total_pay, max(amount_due_before, Decimal('0'))).quantize(cls.MONEY_QUANT)
                prepayment_portion = (total_pay - ar_portion).quantize(cls.MONEY_QUANT)
                bid = inv.branch_id if inv and getattr(inv, 'branch_id', None) else None
                if ar_portion > 0:
                    branch_ar_credits[bid] += ar_portion
                if prepayment_portion > 0:
                    branch_prepayment_credits[bid] += prepayment_portion

            prepayment_total = sum(branch_prepayment_credits.values(), Decimal('0')).quantize(cls.MONEY_QUANT)
            if prepayment_total > 0 and prepayment_account is None:
                raise ValidationError(
                    "Customer prepayment account is not configured. "
                    "Configure it in Accounting Controls before recording overpayments."
                )

            branch_keys = {k for k in list(branch_ar_credits) + list(branch_prepayment_credits) if k is not None}
            if len(branch_keys) <= 1:
                single_branch_id = next(iter(branch_keys), None)
                branch_obj = Branch.objects.filter(pk=single_branch_id).first() if single_branch_id else None
            else:
                branch_obj = None

            je = cls._create_posted_journal_header(
                user=cls._journal_user_for_payment(payment),
                date=cls._payment_journal_date(payment),
                description=f"Payment {payment.payment_number} from {str(payment.customer)}",
                reference=payment.reference_number or payment.payment_number,
                branch=branch_obj,
                content_object=payment,
            )

            Transaction.objects.create(
                journal_entry=je,
                account=cash_account,
                amount=total_pay,
                transaction_type='debit',
                description=f'Payment Received ({payment.payment_method})',
            )

            for bid, credit_amt in sorted(
                ((k, v) for k, v in branch_ar_credits.items() if v > 0),
                key=lambda x: (x[0] is None, x[0] or 0),
            ):
                labels = []
                if bid is not None:
                    bname = Branch.objects.filter(pk=bid).values_list('name', flat=True).first()
                    if bname:
                        labels.append(str(bname))
                for alloc in allocations:
                    inv = alloc.invoice
                    if not inv:
                        continue
                    ib = inv.branch_id
                    if (bid is None and ib is None) or (bid == ib):
                        labels.append(inv.invoice_number or f'#{inv.pk}')
                if not labels and payment.invoice_id and (
                    bid == payment.invoice.branch_id
                    or (bid is None and payment.invoice.branch_id is None)
                ):
                    labels.append(payment.invoice.invoice_number or f'#{payment.invoice_id}')
                desc = 'AR ' + ', '.join(dict.fromkeys(labels)) if labels else 'AR application'
                Transaction.objects.create(
                    journal_entry=je,
                    account=ar_account,
                    amount=credit_amt,
                    transaction_type='credit',
                    description=desc[:255],
                )

            for bid, credit_amt in sorted(
                ((k, v) for k, v in branch_prepayment_credits.items() if v > 0),
                key=lambda x: (x[0] is None, x[0] or 0),
            ):
                Transaction.objects.create(
                    journal_entry=je,
                    account=prepayment_account,
                    amount=credit_amt,
                    transaction_type='credit',
                    description='Customer prepayment',
                )

            if not je.validate_balanced():
                raise ValidationError(
                    f"Journal Entry for Payment {payment.payment_number} is not balanced."
                )

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
            if bill_payment.payment_method == 'cash':
                cash_account = cls._cash_settlement_account(bill_payment.till, f"Bill payment {bill_payment.payment_number}")
            else:
                cash_account = cls._bank_settlement_account(bill_payment, f"Bill payment {bill_payment.payment_number}")
            ap_account = cls._control_account('accounts_payable_account', 'Accounts Payable')

            je = cls._create_posted_journal_header(
                user=bill_payment.paid_by,
                date=bill_payment.payment_date,
                description=f"Bill Payment {bill_payment.payment_number} to {str(bill_payment.bill.vendor)}",
                reference=bill_payment.reference_number or bill_payment.payment_number,
                branch=bill_payment.bill.branch,
                content_object=bill_payment,
            )

            # 3. Create Transactions
            
            # Debit AP (Gross Amount including WHT)
            gross = bill_payment.gross_amount
            Transaction.objects.create(
                journal_entry=je,
                account=ap_account,
                amount=gross,
                transaction_type='debit',
                description=f'Payment for Bill {bill_payment.bill.bill_number}'
            )

            # Credit Cash (Net Amount paid to vendor)
            Transaction.objects.create(
                journal_entry=je,
                account=cash_account,
                amount=bill_payment.amount,
                transaction_type='credit',
                description=f'Payment Sent ({bill_payment.payment_method})'
            )

            # Credit WHT Payable when tax was withheld
            wht_amount = bill_payment.wht_amount or Decimal('0')
            if wht_amount > 0:
                wht_account = cls._control_account(
                    'withholding_tax_payable_account', 'Withholding Tax Payable'
                )
                Transaction.objects.create(
                    journal_entry=je,
                    account=wht_account,
                    amount=wht_amount,
                    transaction_type='credit',
                    description=f'WHT withheld ({bill_payment.wht_rate}%)'
                )

            # Validate
            if not je.validate_balanced():
                raise ValidationError(f"Journal Entry for Bill Payment {bill_payment.payment_number} is not balanced.")
            
            return je

    @classmethod
    def post_vat_payment(cls, amount, branch=None, user=None, payment_date=None, reference='', vat_return=None):
        """Post GL entry for VAT remittance: Dr Sales Tax Payable, Cr Bank."""
        from django.contrib.contenttypes.models import ContentType

        if vat_return:
            ct = ContentType.objects.get_for_model(vat_return)
            if JournalEntry.objects.filter(content_type=ct, object_id=vat_return.id).exists():
                return None

        with transaction.atomic():
            tax_account = cls._control_account('sales_tax_payable_account', 'Sales Tax Payable')
            bank_account = cls._control_account('default_bank_account', 'Operating Bank Account')

            je = cls._create_posted_journal_header(
                user=user,
                date=payment_date or timezone.now().date(),
                description=f"VAT payment for period ending {getattr(vat_return, 'period_end', '')}",
                reference=reference or 'VAT-PAYMENT',
                branch=branch,
                content_object=vat_return,
            )

            Transaction.objects.create(
                journal_entry=je,
                account=tax_account,
                amount=amount,
                transaction_type='debit',
                description='VAT remittance',
            )
            Transaction.objects.create(
                journal_entry=je,
                account=bank_account,
                amount=amount,
                transaction_type='credit',
                description='VAT payment from bank',
            )

            if not je.validate_balanced():
                raise ValidationError('VAT payment journal entry is not balanced.')
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

        # Shrinkage, damage, counts, and physical-count corrections
        if inventory_transaction.transaction_type not in [
            'adjustment', 'damage', 'count', 'correction', 'loss',
        ]:
            return

        adj_ref = f"INVADJ-{inventory_transaction.pk}"
        if JournalEntry.objects.filter(reference=adj_ref).exists():
            return

        inventory_asset = cls._control_account('inventory_asset_account', 'Inventory Asset')
        shrinkage_expense = cls._control_account('default_expense_account', 'Default Expense')

        quantity = Decimal(str(abs(inventory_transaction.quantity or 0)))
        unit_cost = Decimal(str(inventory_transaction.unit_cost or 0))
        amount = (quantity * unit_cost).quantize(cls.MONEY_QUANT)

        if amount == 0:
            return

        description = (
            f"Inventory {inventory_transaction.get_transaction_type_display()}: "
            f"{inventory_transaction.part.part_number}"
        )

        lines = []
        if inventory_transaction.quantity < 0:
            lines = [
                {
                    'account_id': shrinkage_expense.id,
                    'type': 'debit',
                    'amount': amount,
                    'description': inventory_transaction.part.name,
                },
                {
                    'account_id': inventory_asset.id,
                    'type': 'credit',
                    'amount': amount,
                    'description': inventory_transaction.part.name,
                },
            ]
        else:
            lines = [
                {
                    'account_id': inventory_asset.id,
                    'type': 'debit',
                    'amount': amount,
                    'description': inventory_transaction.part.name,
                },
                {
                    'account_id': shrinkage_expense.id,
                    'type': 'credit',
                    'amount': amount,
                    'description': f"{inventory_transaction.part.name} (recovery)",
                },
            ]

        cls.create_journal_entry(
            user=inventory_transaction.created_by,
            date=inventory_transaction.transaction_date.date(),
            description=description,
            reference=adj_ref,
            lines=lines,
            posted=True,
            branch=getattr(inventory_transaction, 'branch', None),
        )

    @classmethod
    def post_credit_note(cls, credit_note):
        """
        Deprecated — GL posts on CreditNoteApplication via post_credit_note_application().
        Issuing a credit note alone must not create journal entries (posting standard §3).
        """
        import logging
        logging.getLogger(__name__).warning(
            'post_credit_note() is deprecated; use post_credit_note_application() on apply.'
        )
        return None

    @classmethod
    def post_credit_note_application(cls, application):
        """
        Post GL entry when credit note balance is applied to an invoice.
        Debit: Sales Returns & Allowances (+ tax reversal)
        Credit: Accounts Receivable
        """
        from apps.billing.models import CreditNoteApplication

        if not isinstance(application, CreditNoteApplication):
            application = CreditNoteApplication.objects.select_related(
                'credit_note', 'credit_note__customer', 'invoice', 'applied_by'
            ).get(pk=application)

        credit_note = application.credit_note
        if credit_note.status not in ('issued', 'applied'):
            return None

        app_type = ContentType.objects.get_for_model(application)
        reference = f"CN-APP-{application.id}"
        if JournalEntry.objects.filter(
            content_type=app_type,
            object_id=application.id,
            reference=reference,
        ).exists():
            return None

        apply_amount = Decimal(str(application.amount)).quantize(cls.MONEY_QUANT)
        if apply_amount <= 0:
            return None

        cn_total = Decimal(str(credit_note.total or Decimal('0'))).quantize(cls.MONEY_QUANT)
        if cn_total <= 0:
            return None

        ratio = (apply_amount / cn_total).quantize(Decimal('0.0001'))
        subtotal = (Decimal(str(credit_note.subtotal or Decimal('0'))) * ratio).quantize(cls.MONEY_QUANT)
        tax_amount = (Decimal(str(credit_note.tax_amount or Decimal('0'))) * ratio).quantize(cls.MONEY_QUANT)
        if subtotal + tax_amount != apply_amount:
            tax_amount = (apply_amount - subtotal).quantize(cls.MONEY_QUANT)

        sales_returns = cls._control_account('sales_discount_account', 'Sales Returns & Allowances')
        ar_account = cls._control_account('accounts_receivable_account', 'Accounts Receivable')
        tax_account = cls._control_account('sales_tax_payable_account', 'Sales Tax Payable')

        desc_customer = credit_note.customer.full_name
        lines = []
        if subtotal > 0:
            lines.append({
                'account_id': sales_returns.id,
                'type': 'debit',
                'amount': subtotal,
                'description': f'Credit applied for {desc_customer}',
            })
        if tax_amount > 0:
            lines.append({
                'account_id': tax_account.id,
                'type': 'debit',
                'amount': tax_amount,
                'description': f'Tax reversal for {desc_customer}',
            })
        if not lines:
            lines.append({
                'account_id': sales_returns.id,
                'type': 'debit',
                'amount': apply_amount,
                'description': f'Credit applied for {desc_customer}',
            })
        lines.append({
            'account_id': ar_account.id,
            'type': 'credit',
            'amount': apply_amount,
            'description': f'Credit applied to {application.invoice.invoice_number}',
        })

        user = application.applied_by or credit_note.created_by
        return cls.create_journal_entry(
            user=user,
            date=application.applied_at.date() if application.applied_at else timezone.now().date(),
            description=(
                f"Credit Note {credit_note.credit_note_number} applied to "
                f"{application.invoice.invoice_number}"
            ),
            reference=reference,
            lines=lines,
            posted=True,
            branch=credit_note.branch or application.invoice.branch,
            content_object=application,
        )

    @classmethod
    def _fixed_asset_accounts(cls, asset):
        category = asset.category
        asset_account = cls.get_or_create_account(
            asset.gl_asset_account_code or category.gl_asset_account_code or '1600',
            'Fixed Assets',
            'asset',
            'debit',
        )
        depreciation_expense = cls.get_or_create_account(
            asset.gl_depreciation_expense_account_code or category.gl_depreciation_expense_account_code or '5900',
            'Depreciation Expense',
            'expense',
            'debit',
        )
        accumulated_depreciation = cls.get_or_create_account(
            asset.gl_accumulated_depreciation_account_code or category.gl_accumulated_depreciation_account_code or '1610',
            'Accumulated Depreciation',
            'asset',
            'credit',
        )
        return {
            'asset': asset_account,
            'depreciation_expense': depreciation_expense,
            'accumulated_depreciation': accumulated_depreciation,
        }

    @classmethod
    def post_vendor_credit_application(cls, application):
        """
        Post GL when vendor credit is applied to a bill.
        Debit: Accounts Payable
        Credit: Expense/Inventory and Input Tax (proportional)
        """
        from apps.billing.models import VendorCreditApplication

        if not isinstance(application, VendorCreditApplication):
            application = VendorCreditApplication.objects.select_related(
                'vendor_credit', 'vendor_credit__vendor', 'bill', 'applied_by'
            ).get(pk=application)

        vendor_credit = application.vendor_credit
        if vendor_credit.status not in ('issued', 'applied'):
            return None

        app_type = ContentType.objects.get_for_model(application)
        reference = f"VC-APP-{application.id}"
        if JournalEntry.objects.filter(
            content_type=app_type,
            object_id=application.id,
            reference=reference,
        ).exists():
            return None

        apply_amount = Decimal(str(application.amount)).quantize(cls.MONEY_QUANT)
        if apply_amount <= 0:
            return None

        vc_total = Decimal(str(vendor_credit.total or Decimal('0'))).quantize(cls.MONEY_QUANT)
        if vc_total <= 0:
            return None

        ratio = (apply_amount / vc_total).quantize(Decimal('0.0001'))
        subtotal = (Decimal(str(vendor_credit.subtotal or Decimal('0'))) * ratio).quantize(cls.MONEY_QUANT)
        tax_amount = (Decimal(str(vendor_credit.tax_amount or Decimal('0'))) * ratio).quantize(cls.MONEY_QUANT)
        if subtotal + tax_amount != apply_amount:
            tax_amount = (apply_amount - subtotal).quantize(cls.MONEY_QUANT)

        ap_account = cls._control_account('accounts_payable_account', 'Accounts Payable')
        returns_account = (
            cls._optional_control_account('purchase_returns_account')
            or cls._control_account('default_expense_account', 'Default Expense')
        )
        inventory_account = cls._control_account('inventory_asset_account', 'Inventory Asset')
        input_tax_account = cls._control_account('input_tax_account', 'Input Tax')

        inventory_ratio = Decimal('0')
        line_count = vendor_credit.line_items.count()
        if line_count:
            inventory_lines = vendor_credit.line_items.filter(inventory_item__isnull=False)
            inventory_subtotal = sum(line.total for line in inventory_lines) or Decimal('0')
            vc_subtotal = Decimal(str(vendor_credit.subtotal or Decimal('0')))
            if vc_subtotal > 0:
                inventory_ratio = (inventory_subtotal / vc_subtotal).quantize(Decimal('0.0001'))

        inventory_credit = (subtotal * inventory_ratio).quantize(cls.MONEY_QUANT)
        expense_credit = (subtotal - inventory_credit).quantize(cls.MONEY_QUANT)

        lines = [{
            'account_id': ap_account.id,
            'type': 'debit',
            'amount': apply_amount,
            'description': f"Vendor credit applied to {application.bill.bill_number}",
        }]
        if expense_credit > 0:
            lines.append({
                'account_id': returns_account.id,
                'type': 'credit',
                'amount': expense_credit,
                'description': f"Purchase return - {vendor_credit.vendor.name}",
            })
        if inventory_credit > 0:
            lines.append({
                'account_id': inventory_account.id,
                'type': 'credit',
                'amount': inventory_credit,
                'description': f"Inventory return - {vendor_credit.vendor.name}",
            })
        if tax_amount > 0:
            lines.append({
                'account_id': input_tax_account.id,
                'type': 'credit',
                'amount': tax_amount,
                'description': f"Input tax reversal - {vendor_credit.vendor.name}",
            })
        if len(lines) == 1:
            lines.append({
                'account_id': returns_account.id,
                'type': 'credit',
                'amount': apply_amount,
                'description': f"Vendor credit - {vendor_credit.vendor.name}",
            })

        user = application.applied_by or vendor_credit.created_by
        return cls.create_journal_entry(
            user=user,
            date=application.applied_at.date() if application.applied_at else timezone.now().date(),
            description=(
                f"Vendor Credit {vendor_credit.credit_number} applied to "
                f"{application.bill.bill_number}"
            ),
            reference=reference,
            lines=lines,
            posted=True,
            branch=vendor_credit.branch or application.bill.branch,
            content_object=application,
        )

    @classmethod
    def post_fixed_asset_acquisition(cls, asset, user=None):
        """Capitalize a fixed asset: Dr Fixed Asset, Cr clearing/bank."""
        if not asset or not asset.pk:
            return None

        reference = f"FA-ACQ-{asset.asset_number}"
        if JournalEntry.objects.filter(reference=reference).exists():
            return None

        accounts = cls._fixed_asset_accounts(asset)
        clearing = cls._optional_control_account('default_bank_account') or cls.get_or_create_account(
            '1100', 'Operating Bank', 'asset', 'debit'
        )
        amount = Decimal(str(asset.acquisition_cost or Decimal('0'))).quantize(cls.MONEY_QUANT)
        if amount <= 0:
            return None

        return cls.create_journal_entry(
            user=user or asset.created_by,
            date=asset.acquisition_date,
            description=f"Capitalize asset {asset.asset_number} - {asset.name}",
            reference=reference,
            lines=[
                {
                    'account_id': accounts['asset'].id,
                    'type': 'debit',
                    'amount': amount,
                    'description': asset.name,
                },
                {
                    'account_id': clearing.id,
                    'type': 'credit',
                    'amount': amount,
                    'description': f"Acquisition of {asset.asset_number}",
                },
            ],
            posted=True,
            branch=asset.branch,
            content_object=asset,
        )

    @classmethod
    def post_fixed_asset_depreciation(cls, asset, depreciation_amount, posting_date, user=None):
        """Post monthly depreciation: Dr Depreciation Expense, Cr Accumulated Depreciation."""
        amount = Decimal(str(depreciation_amount or Decimal('0'))).quantize(cls.MONEY_QUANT)
        if amount <= 0:
            return None

        posting_date = posting_date or timezone.now().date()
        reference = f"FA-DEP-{asset.asset_number}-{posting_date:%Y%m}"
        if JournalEntry.objects.filter(reference=reference).exists():
            return None

        accounts = cls._fixed_asset_accounts(asset)
        return cls.create_journal_entry(
            user=user or asset.created_by,
            date=posting_date,
            description=f"Depreciation - {asset.asset_number} ({asset.name})",
            reference=reference,
            lines=[
                {
                    'account_id': accounts['depreciation_expense'].id,
                    'type': 'debit',
                    'amount': amount,
                    'description': asset.name,
                },
                {
                    'account_id': accounts['accumulated_depreciation'].id,
                    'type': 'credit',
                    'amount': amount,
                    'description': asset.name,
                },
            ],
            posted=True,
            branch=asset.branch,
            content_object=asset,
        )

    @classmethod
    def post_fixed_asset_disposal(cls, asset, user=None):
        """Post disposal entry with gain/loss recognition."""
        if asset.status not in ('disposed', 'sold'):
            return None

        reference = f"FA-DISP-{asset.asset_number}"
        if JournalEntry.objects.filter(reference=reference).exists():
            return None

        accounts = cls._fixed_asset_accounts(asset)
        proceeds = Decimal(str(asset.disposal_proceeds or Decimal('0'))).quantize(cls.MONEY_QUANT)
        cost = Decimal(str(asset.acquisition_cost or Decimal('0'))).quantize(cls.MONEY_QUANT)
        accumulated = Decimal(str(asset.accumulated_depreciation or Decimal('0'))).quantize(cls.MONEY_QUANT)
        nbv = (cost - accumulated).quantize(cls.MONEY_QUANT)
        gain_loss = (proceeds - nbv).quantize(cls.MONEY_QUANT)

        clearing = cls._optional_control_account('default_bank_account') or cls.get_or_create_account(
            '1100', 'Operating Bank', 'asset', 'debit'
        )
        gain_account = cls._optional_control_account('sales_revenue_account') or cls.get_or_create_account(
            '8100', 'Gain on Disposal', 'income', 'credit'
        )
        loss_account = cls._optional_control_account('default_expense_account') or cls.get_or_create_account(
            '5900', 'Loss on Disposal', 'expense', 'debit'
        )

        lines = []
        if proceeds > 0:
            lines.append({
                'account_id': clearing.id,
                'type': 'debit',
                'amount': proceeds,
                'description': f"Proceeds from disposal of {asset.asset_number}",
            })
        if accumulated > 0:
            lines.append({
                'account_id': accounts['accumulated_depreciation'].id,
                'type': 'debit',
                'amount': accumulated,
                'description': f"Remove accumulated depreciation for {asset.asset_number}",
            })
        if gain_loss < 0:
            lines.append({
                'account_id': loss_account.id,
                'type': 'debit',
                'amount': abs(gain_loss),
                'description': f"Loss on disposal of {asset.asset_number}",
            })
        lines.append({
            'account_id': accounts['asset'].id,
            'type': 'credit',
            'amount': cost,
            'description': f"Remove asset cost for {asset.asset_number}",
        })
        if gain_loss > 0:
            lines.append({
                'account_id': gain_account.id,
                'type': 'credit',
                'amount': gain_loss,
                'description': f"Gain on disposal of {asset.asset_number}",
            })

        return cls.create_journal_entry(
            user=user or asset.created_by,
            date=asset.disposal_date or timezone.now().date(),
            description=f"Dispose asset {asset.asset_number} - {asset.name}",
            reference=reference,
            lines=lines,
            posted=True,
            branch=asset.branch,
            content_object=asset,
        )

    @classmethod
    def post_refund(cls, refund):
        """
        Post GL entry for cash refund.
        Debit: Accounts Receivable (or Sales Returns if CN applied)
        Credit: Cash
        """
        if refund.status != 'completed':
            return

        refund_type = ContentType.objects.get_for_model(refund)
        if JournalEntry.objects.filter(
            content_type=refund_type,
            object_id=refund.id,
            reference=refund.refund_number,
        ).exists():
            return

        ar_account = cls._control_account('accounts_receivable_account', 'Accounts Receivable')
        if refund.till_id:
            cash_account = cls._cash_settlement_account(refund.till, f"Refund {refund.refund_number}")
        else:
            cash_account = cls._bank_settlement_account(refund, f"Refund {refund.refund_number}")

        amount = Decimal(str(refund.amount or Decimal('0'))).quantize(cls.MONEY_QUANT)
        if amount <= 0:
            return

        who = refund.customer.full_name
        return cls.create_journal_entry(
            user=refund.processed_by,
            date=refund.processed_at.date() if refund.processed_at else timezone.now().date(),
            description=f"Refund {refund.refund_number}",
            reference=refund.refund_number,
            lines=[
                {
                    'account_id': ar_account.id,
                    'type': 'debit',
                    'amount': amount,
                    'description': f'Refund to {who}',
                },
                {
                    'account_id': cash_account.id,
                    'type': 'credit',
                    'amount': amount,
                    'description': f'Refund to {who}',
                },
            ],
            posted=True,
            branch=refund.invoice.branch if refund.invoice else None,
            content_object=refund,
        )

    @classmethod
    def post_inter_branch_transfer(cls, transfer):
        """
        Post GL entries for inter-branch inventory transfer.
        Creates intercompany clearing accounts (Due To / Due From).
        """
        if transfer.status != 'received':
            return

        src_ref = f"IBT-{transfer.pk}-SOURCE"
        dst_ref = f"IBT-{transfer.pk}-DEST"
        if JournalEntry.objects.filter(reference=src_ref).exists():
            return

        inventory_asset = cls._control_account('inventory_asset_account', 'Inventory Asset')
        due_from = cls.get_or_create_account('1900', 'Due From Other Branches', 'asset', 'debit')
        due_to = cls.get_or_create_account('2900', 'Due To Other Branches', 'liability', 'credit')

        total_value = sum(
            (
                Decimal(str(item.quantity_received or item.quantity_sent or item.quantity_requested or 0))
                * Decimal(str(item.part.cost_price or 0))
                for item in transfer.items.all()
            ),
            Decimal('0.00'),
        ).quantize(cls.MONEY_QUANT)

        if total_value == 0:
            return

        recv_user = transfer.received_by or transfer.created_by
        cls.create_journal_entry(
            user=transfer.created_by,
            date=transfer.shipped_date.date() if transfer.shipped_date else timezone.now().date(),
            description=(
                f"Transfer Out {transfer.transfer_number} to {transfer.destination_branch.name}"
            ),
            reference=src_ref,
            lines=[
                {
                    'account_id': due_from.id,
                    'type': 'debit',
                    'amount': total_value,
                    'description': f"Due from {transfer.destination_branch.name}",
                },
                {
                    'account_id': inventory_asset.id,
                    'type': 'credit',
                    'amount': total_value,
                    'description': f"Transfer to {transfer.destination_branch.name}",
                },
            ],
            posted=True,
            branch=transfer.source_branch,
        )
        cls.create_journal_entry(
            user=recv_user,
            date=transfer.received_date.date() if transfer.received_date else timezone.now().date(),
            description=(
                f"Transfer In {transfer.transfer_number} from {transfer.source_branch.name}"
            ),
            reference=dst_ref,
            lines=[
                {
                    'account_id': inventory_asset.id,
                    'type': 'debit',
                    'amount': total_value,
                    'description': f"Transfer from {transfer.source_branch.name}",
                },
                {
                    'account_id': due_to.id,
                    'type': 'credit',
                    'amount': total_value,
                    'description': f"Due to {transfer.source_branch.name}",
                },
            ],
            posted=True,
            branch=transfer.destination_branch,
        )

    # ========================================================================
    # PHASE 8: CASH & BANKING
    # ========================================================================

    @classmethod
    def post_till_open(cls, till):
        """
        Till opening is an operating session marker for a cash account.
        It records opening cash but does not move money between GL accounts.
        """
        return None

    @classmethod
    def post_till_close(cls, till):
        """
        Post GL only for till variance. Closing the operating session itself
        does not move cash between GL accounts.
        """
        if till.status != 'closed':
            return

        till_cash = cls._cash_settlement_account(till, f"Till {till.id}")
        cash_over_short = cls._control_account('cash_over_short_account', 'Cash Over/Short')

        close_dt = till.closed_at.date() if till.closed_at else timezone.now().date()
        
        # Handle Variance (Cash Over/Short)
        if till.variance and till.variance != 0:
            if JournalEntry.objects.filter(reference=f"TILL-{till.id}-VAR").exists():
                return
            variance_je = cls._create_posted_journal_header(
                user=till.closed_by or till.cashier,
                date=close_dt,
                description=f"Till Variance #{till.id} - {till.cashier.get_full_name()}",
                reference=f"TILL-{till.id}-VAR",
                branch=till.branch,
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
                    account=till_cash,
                    amount=abs(till.variance),
                    transaction_type='credit',
                    description=f"Cash shortage - Till #{till.id}"
                )
            else:
                # Cash Over: Debit Cash in Safe, Credit Cash Over/Short (recovery)
                Transaction.objects.create(
                    journal_entry=variance_je,
                    account=till_cash,
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
    def post_till_cash_movement(cls, movement):
        """
        Post GL for till pay-in / pay-out (non-sale cash).
        Pay-in: Dr Cash in Drawer, Cr Cash in Safe (same economic story as extra float from safe).
        Pay-out: Dr Cash in Safe, Cr Cash in Drawer (safe drop / cash leaving drawer).
        """
        ref = f"TILL-{movement.till_id}-MOV-{movement.id}"
        if JournalEntry.objects.filter(reference=ref).exists():
            return

        till = movement.till
        if till.status != 'open':
            return

        till_cash = cls._cash_settlement_account(till, f"Till movement {movement.id}")
        cash_safe = cls._control_account('till_counterparty_cash_account', 'Till Counterparty Cash')
        amt = movement.amount
        user = movement.recorded_by
        date = movement.created_at.date() if movement.created_at else timezone.now().date()
        desc_reason = (movement.reason or '').strip()[:200]

        je = cls._create_posted_journal_header(
            user=user,
            date=date,
            description=f"Till {movement.get_movement_type_display()} #{movement.id} (Till #{till.id})",
            reference=ref,
            branch=till.branch,
        )

        if movement.movement_type == 'pay_in':
            Transaction.objects.create(
                journal_entry=je,
                account=till_cash,
                amount=amt,
                transaction_type='debit',
                description=desc_reason or 'Pay in to drawer',
            )
            Transaction.objects.create(
                journal_entry=je,
                account=cash_safe,
                amount=amt,
                transaction_type='credit',
                description=desc_reason or 'Pay in to drawer',
            )
        else:
            Transaction.objects.create(
                journal_entry=je,
                account=cash_safe,
                amount=amt,
                transaction_type='debit',
                description=desc_reason or 'Pay out from drawer',
            )
            Transaction.objects.create(
                journal_entry=je,
                account=till_cash,
                amount=amt,
                transaction_type='credit',
                description=desc_reason or 'Pay out from drawer',
            )

    @classmethod
    def post_fund_transfer(cls, transfer):
        """
        Post GL entry for fund transfer.
        Debit: To Account, Credit: From Account
        """
        if transfer.status != 'completed' or transfer.journal_entry:
            return

        from apps.accounting.account_validation import validate_settlement_account

        validate_settlement_account(transfer.from_account, field_name='from_account')
        validate_settlement_account(transfer.to_account, field_name='to_account')

        je = cls._create_posted_journal_header(
            user=transfer.approved_by or transfer.created_by,
            date=transfer.transfer_date,
            description=transfer.description,
            reference=transfer.transfer_number,
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

    # ========================================================================
    # HR PAYROLL INTEGRATION
    # ========================================================================

    @classmethod
    def post_payroll(cls, payroll_period):
        """
        Creates a Journal Entry when a payroll period is marked as paid.
        Aggregates all payslips into one balanced JE:

        DR  6000  Salary Expense           (sum of basic_salary)
        DR  6010  Overtime Expense          (sum of overtime_pay)
        DR  6020  Allowances Expense        (sum of all allowance values)
            CR  2300  PAYE Tax Payable      (sum of tax_amount)
            CR  2310  Payroll Deductions    (sum of all deduction values)
            CR  1000  Cash/Bank             (sum of net_pay)
        """
        from django.contrib.contenttypes.models import ContentType

        if payroll_period.status != 'paid':
            return None

        # Prevent duplicate posting
        pp_type = ContentType.objects.get_for_model(payroll_period)
        if JournalEntry.objects.filter(content_type=pp_type, object_id=payroll_period.id).exists():
            return None

        payslips = payroll_period.payslips.all()
        if not payslips.exists():
            return None

        # Helper to safely sum values from dict or list JSON fields
        def _sum_json_values(data):
            total = Decimal('0')
            if isinstance(data, dict):
                items = data.values()
            elif isinstance(data, list):
                items = data
            else:
                return total
            for v in items:
                val = v.get('amount') if isinstance(v, dict) else v
                if val is not None:
                    try:
                        total += Decimal(str(val))
                    except (ValueError, TypeError):
                        pass
            return total

        # Aggregate totals across all payslips
        total_basic = Decimal('0')
        total_overtime = Decimal('0')
        total_allowances = Decimal('0')
        total_tax = Decimal('0')
        total_deductions = Decimal('0')
        total_net = Decimal('0')
        total_unpaid_absence = Decimal('0')
        total_employer_contributions = Decimal('0')

        for slip in payslips:
            total_basic += slip.basic_salary or Decimal('0')
            total_overtime += slip.overtime_pay or Decimal('0')
            total_allowances += _sum_json_values(slip.allowances)
            total_tax += slip.tax_amount or Decimal('0')
            total_deductions += _sum_json_values(slip.deductions)
            total_net += slip.net_pay or Decimal('0')
            total_unpaid_absence += (slip.unpaid_leave_deduction or Decimal('0')) + (slip.absence_deduction or Decimal('0'))
            total_employer_contributions += _sum_json_values(getattr(slip, 'employer_contributions', {}))

        salary_expense_amount = total_basic - total_unpaid_absence

        with transaction.atomic():
            # 1. Get or create GL accounts
            salary_expense = cls.get_or_create_account('6000', 'Salary Expense', 'expense', 'debit')
            overtime_expense = cls.get_or_create_account('6010', 'Overtime Expense', 'expense', 'debit')
            allowances_expense = cls.get_or_create_account('6020', 'Allowances Expense', 'expense', 'debit')
            tax_payable = cls.get_or_create_account('2300', 'PAYE Tax Payable', 'liability', 'credit')
            deductions_payable = cls.get_or_create_account('2310', 'Payroll Deductions Payable', 'liability', 'credit')
            employer_statutory_payable = cls.get_or_create_account('2315', 'Employer Statutory Payable', 'liability', 'credit')
            employer_statutory_expense = cls.get_or_create_account('6030', 'Employer Statutory Expense', 'expense', 'debit')
            cash_account = cls._control_account('default_bank_account', 'Default Bank Account')

            je = cls._create_posted_journal_header(
                user=payroll_period.approved_by or payroll_period.created_by,
                date=payroll_period.end_date,
                description=f"Payroll: {payroll_period.name}",
                reference=f"PAY-{payroll_period.id}",
                branch=payroll_period.branch,
                content_object=payroll_period,
            )

            # 3. Debit lines (expenses)
            if salary_expense_amount > 0:
                Transaction.objects.create(
                    journal_entry=je, account=salary_expense,
                    amount=salary_expense_amount, transaction_type='debit',
                    description='Basic salaries net of unpaid leave and absence deductions',
                )
            if total_overtime > 0:
                Transaction.objects.create(
                    journal_entry=je, account=overtime_expense,
                    amount=total_overtime, transaction_type='debit',
                    description='Overtime pay',
                )
            if total_allowances > 0:
                Transaction.objects.create(
                    journal_entry=je, account=allowances_expense,
                    amount=total_allowances, transaction_type='debit',
                    description='Allowances (Housing, Transport, etc.)',
                )
            if total_employer_contributions > 0:
                Transaction.objects.create(
                    journal_entry=je, account=employer_statutory_expense,
                    amount=total_employer_contributions, transaction_type='debit',
                    description='Employer SSNIT and tier 2 contributions',
                )

            # 4. Credit lines (liabilities + cash)
            if total_tax > 0:
                Transaction.objects.create(
                    journal_entry=je, account=tax_payable,
                    amount=total_tax, transaction_type='credit',
                    description='PAYE income tax withheld',
                )
            if total_deductions > 0:
                Transaction.objects.create(
                    journal_entry=je, account=deductions_payable,
                    amount=total_deductions, transaction_type='credit',
                    description='Payroll deductions (SSNIT, Provident Fund, etc.)',
                )
            if total_employer_contributions > 0:
                Transaction.objects.create(
                    journal_entry=je, account=employer_statutory_payable,
                    amount=total_employer_contributions, transaction_type='credit',
                    description='Employer statutory contributions payable',
                )
            if total_net > 0:
                Transaction.objects.create(
                    journal_entry=je, account=cash_account,
                    amount=total_net, transaction_type='credit',
                    description='Net pay disbursed to employees',
                )

            # 5. Validate balance
            if not je.validate_balanced():
                raise ValidationError(
                    f"Payroll Journal Entry for '{payroll_period.name}' is not balanced. "
                    f"Debits: {salary_expense_amount + total_overtime + total_allowances + total_employer_contributions}, "
                    f"Credits: {total_tax + total_deductions + total_employer_contributions + total_net}"
                )

            return je


class ReportingService:
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
        
        def build_nodes(account_type):
            nodes = []
            total = Decimal('0.00')
            roots = Account.objects.filter(
                account_type=account_type,
                is_active=True,
            ).filter(Q(parent__isnull=True) | ~Q(parent__account_type=account_type)).order_by('code')
            for account in roots:
                bal = cls.get_account_balance_with_children(account, date=date, branch_id=branch_id)
                if bal == 0:
                    continue
                nodes.append({
                    'id': account.id,
                    'code': account.code,
                    'name': account.name,
                    'account_type': account.account_type,
                    'account_subtype': account.account_subtype,
                    'parent': account.parent_id,
                    'balance': bal,
                    'children_count': account.children.count(),
                })
                total += bal
            return nodes, total

        assets, total_assets = build_nodes('asset')
        liabilities, total_liabilities = build_nodes('liability')
        equity, total_equity = build_nodes('equity')
                
        # 4. Retained Earnings (Calculated)
        # Income - Expenses (All time up to date)
        # Net Income = Total Income (Credit) - Total Expenses (Debit)
        
        total_income_lifetime = sum(
            cls.get_account_balance_with_children(a, date=date, branch_id=branch_id)
            for a in Account.objects.filter(account_type='income', is_active=True).filter(Q(parent__isnull=True) | ~Q(parent__account_type='income'))
        )
        total_expense_lifetime = sum(
            cls.get_account_balance_with_children(a, date=date, branch_id=branch_id)
            for a in Account.objects.filter(account_type='expense', is_active=True).filter(Q(parent__isnull=True) | ~Q(parent__account_type='expense'))
        )
        
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
                'id': account.id,
                'code': account.code,
                'name': account.name,
                'type': account.account_type,
                'account_subtype': account.account_subtype,
                'parent': account.parent_id,
                'parent_code': account.parent.code if account.parent_id else '',
                'parent_name': account.parent.name if account.parent_id else '',
                'is_parent': account.children.exists(),
                'rollup_balance': cls.get_account_balance_with_children(account, date=date, branch_id=branch_id),
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
        # Filter by code range or description as 'bank'/'cash' types don't exist in model choices
        # Assuming typical chart of accounts: 1000-1099 is Cash/Bank
        cash_accounts = Account.objects.filter(
            Q(code__startswith='10') | Q(name__icontains='bank') | Q(name__icontains='cash'),
            account_type='asset'
        )
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
            
            # Classify based on contra-accounts. Account only has broad types,
            # so use stable code/name heuristics for fixed assets and financing.
            contra_accounts = []
            other_txns = je.transactions.exclude(id=txn.id)
            for other in other_txns:
                contra_accounts.append(other.account)
            
            activity = 'operating_activities' # Default

            def is_fixed_asset(account):
                code = account.code or ''
                name = (account.name or '').lower()
                return (
                    account.account_type == 'asset'
                    and (
                        code.startswith(('16', '17', '18'))
                        or any(term in name for term in ['fixed asset', 'equipment', 'vehicle', 'building', 'furniture'])
                    )
                )

            def is_financing_account(account):
                code = account.code or ''
                if account.account_type == 'equity' or code.startswith('3'):
                    return True
                if account.account_type != 'liability':
                    return False
                return code.startswith(('24', '25', '26', '27', '28', '29')) or any(
                    term in (account.name or '').lower()
                    for term in ['loan', 'note payable', 'long-term', 'long term', 'due to owner']
                )

            if any(is_fixed_asset(account) for account in contra_accounts):
                activity = 'investing_activities'
            elif any(is_financing_account(account) for account in contra_accounts):
                activity = 'financing_activities'
            # else: operating (income, expense, current assets, current liabilities)
            
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
            status__in=list(AccountingService.FINALIZED_INVOICE_STATUSES)
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
        from apps.billing.models import Invoice, Bill

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
        Calculate job profitability by work order with per-category margin breakdown.
        Returns: revenue, direct_costs, gross_profit, margin% broken down by labor/parts/other.
        Uses actual costs when available, falls back to estimated.
        """
        from apps.workorders.models import WorkOrder
        from apps.billing.models import Invoice, InvoiceLineItem
        from apps.inventory.models import InventoryTransaction
        from django.db import models
        from decimal import Decimal
        from django.db.models import Sum

        def _margin(revenue, cost):
            if revenue > 0:
                return float(((revenue - cost) / revenue * 100).quantize(Decimal('0.01')))
            return 0.0

        # Build query
        wo_qs = WorkOrder.objects.select_related('customer', 'vehicle', 'branch')

        if work_order_id:
            wo_qs = wo_qs.filter(id=work_order_id)
        if start_date and end_date:
            from datetime import datetime, time

            start_dt = datetime.combine(start_date, time.min) if not isinstance(start_date, datetime) else start_date
            end_dt = datetime.combine(end_date, time.max) if not isinstance(end_date, datetime) else end_date
            if timezone.is_naive(start_dt):
                start_dt = timezone.make_aware(start_dt)
            if timezone.is_naive(end_dt):
                end_dt = timezone.make_aware(end_dt)
            wo_qs = wo_qs.filter(created_at__range=[start_dt, end_dt])
        if branch_id:
            wo_qs = wo_qs.filter(branch_id=branch_id)

        # Only include work orders with invoices
        wo_qs = wo_qs.filter(status__in=['invoiced', 'completed', 'closed'])

        results = []
        for wo in wo_qs:
            # Revenue from invoices
            invoices = Invoice.objects.filter(
                work_order=wo,
                status__in=['sent', 'viewed', 'partial', 'paid', 'overdue']
            )
            revenue = invoices.aggregate(total=Sum('total'))['total'] or Decimal('0')

            if revenue == 0:
                continue  # Skip work orders with no revenue

            # --- Per-category revenue from invoice line items ---
            line_items = InvoiceLineItem.objects.filter(invoice__in=invoices)
            labor_revenue = line_items.filter(item_type='labor').aggregate(
                total=Sum('total'))['total'] or Decimal('0')
            parts_revenue = line_items.filter(item_type='part').aggregate(
                total=Sum('total'))['total'] or Decimal('0')
            other_revenue = line_items.exclude(item_type__in=['labor', 'part']).aggregate(
                total=Sum('total'))['total'] or Decimal('0')

            # Fall back to invoice-level subtotals if no line items recorded
            if labor_revenue == 0 and parts_revenue == 0 and other_revenue == 0:
                first_inv = invoices.first()
                if first_inv:
                    labor_revenue = first_inv.labor_subtotal or Decimal('0')
                    parts_revenue = first_inv.parts_subtotal or Decimal('0')
                    other_revenue = first_inv.sublet_subtotal or Decimal('0')

            # --- Parts cost from inventory transactions (actual) ---
            parts_cost = InventoryTransaction.objects.filter(
                work_order=wo,
                transaction_type='sale'
            ).aggregate(
                total=Sum(models.F('quantity') * models.F('unit_cost'))
            )['total'] or Decimal('0')
            parts_cost = abs(parts_cost)

            # Fall back to work order actual_parts_cost when no inventory transactions
            if parts_cost == 0:
                parts_cost = wo.actual_parts_cost or Decimal('0')

            # --- Labor cost: prefer actual, fall back to estimated ---
            labor_cost = (
                wo.actual_labor_cost
                if wo.actual_labor_cost and wo.actual_labor_cost > 0
                else wo.estimated_labor_cost
            ) or Decimal('0')

            direct_costs = parts_cost + labor_cost
            gross_profit = revenue - direct_costs
            margin = (gross_profit / revenue * 100) if revenue > 0 else Decimal('0')

            results.append({
                'work_order_id': wo.id,
                'work_order_number': wo.work_order_number,
                'customer': wo.customer.full_name if wo.customer else 'N/A',
                'vehicle': f"{wo.vehicle.year} {wo.vehicle.make} {wo.vehicle.model}" if wo.vehicle else 'N/A',
                'branch': wo.branch.name if wo.branch else 'N/A',
                'status': wo.status,
                'created_at': wo.created_at,
                'completed_at': wo.completed_at,
                # Totals
                'revenue': float(revenue),
                'parts_cost': float(parts_cost),
                'labor_cost': float(labor_cost),
                'direct_costs': float(direct_costs),
                'gross_profit': float(gross_profit),
                'margin_percent': float(margin.quantize(Decimal('0.01'))),
                # Per-category breakdown
                'labor_revenue': float(labor_revenue),
                'parts_revenue': float(parts_revenue),
                'other_revenue': float(other_revenue),
                'labor_margin_percent': _margin(labor_revenue, labor_cost),
                'parts_margin_percent': _margin(parts_revenue, parts_cost),
                'other_margin_percent': _margin(other_revenue, Decimal('0')),
                # Cost basis flag
                'labor_cost_is_actual': bool(wo.actual_labor_cost and wo.actual_labor_cost > 0),
                'parts_cost_is_actual': bool(
                    InventoryTransaction.objects.filter(work_order=wo, transaction_type='sale').exists()
                ),
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
                'avg_margin_percent': float((total_profit / total_revenue * 100) if total_revenue > 0 else Decimal('0')),
                'total_labor_revenue': sum(j['labor_revenue'] for j in results),
                'total_parts_revenue': sum(j['parts_revenue'] for j in results),
                'total_other_revenue': sum(j['other_revenue'] for j in results),
                'total_labor_cost': sum(j['labor_cost'] for j in results),
                'total_parts_cost': sum(j['parts_cost'] for j in results),
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
        
        # Determine balance based on balance_type if available (preferred), else account_type
        if account.balance_type == 'debit':
            return debits - credits
        elif account.balance_type == 'credit':
            return credits - debits
        
        # Fallback if balance_type is not reliable
        if account.account_type in ['asset', 'expense']:
            return debits - credits
        elif account.account_type in ['liability', 'equity', 'income']:
            return credits - debits
        return Decimal('0')

    @classmethod
    def get_account_balance_with_children(cls, account, date=None, start_date=None, end_date=None, branch_id=None):
        """Return direct account balance plus all descendant balances."""
        total = cls.get_account_balance(
            account,
            date=date,
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id,
        )
        for child in account.children.filter(is_active=True):
            total += cls.get_account_balance_with_children(
                child,
                date=date,
                start_date=start_date,
                end_date=end_date,
                branch_id=branch_id,
            )
        return total

    @classmethod
    def get_expense_breakdown(cls, start_date, end_date, branch_id=None):
        """
        Returns business expenses categorized by type:
        - parts: cost of parts/inventory purchased (GL 5100-5199 or inventory transactions)
        - labor: direct labor expense (GL 5200-5299 or work order actual labor cost)
        - overhead: all other operating expenses (GL 5300+)
        Also aggregates totals and % of total for each category.
        """
        from apps.billing.models import InvoiceLineItem, Invoice
        from apps.workorders.models import WorkOrder
        from apps.inventory.models import InventoryTransaction
        from django.db.models import Sum, F
        from decimal import Decimal

        # --- Parts expense: sum of inventory issues in the period (actual COGS) ---
        it_qs = InventoryTransaction.objects.filter(
            transaction_type='sale',
            transaction_date__range=[start_date, end_date],
        )
        if branch_id:
            it_qs = it_qs.filter(work_order__branch_id=branch_id)
        parts_expense = it_qs.aggregate(
            total=Sum(F('quantity') * F('unit_cost'))
        )['total'] or Decimal('0')
        parts_expense = abs(parts_expense)

        # Fall back to GL accounts 5100-5199 (Purchases/Inventory accounts) if no inv. transactions
        if parts_expense == 0:
            parts_expense = sum(
                cls.get_account_balance(acc, start_date=start_date, end_date=end_date, branch_id=branch_id)
                for acc in Account.objects.filter(
                    account_type='expense', code__gte='5100', code__lt='5200', is_active=True
                )
            ) or Decimal('0')

        # --- Labor expense: sum of actual labor costs from work orders in the period ---
        wo_qs = WorkOrder.objects.filter(
            created_at__date__range=[start_date, end_date],
        )
        if branch_id:
            wo_qs = wo_qs.filter(branch_id=branch_id)
        labor_expense = wo_qs.aggregate(
            total=Sum('actual_labor_cost')
        )['total'] or Decimal('0')

        # Fall back to GL accounts 5200-5299 (Labor accounts) if no actual labor recorded
        if labor_expense == 0:
            labor_expense = sum(
                cls.get_account_balance(acc, start_date=start_date, end_date=end_date, branch_id=branch_id)
                for acc in Account.objects.filter(
                    account_type='expense', code__gte='5200', code__lt='5300', is_active=True
                )
            ) or Decimal('0')

        # --- Overhead: GL expense accounts outside parts/labor ranges ---
        overhead_expense = Decimal('0')
        overhead_detail = []
        for acc in Account.objects.filter(account_type='expense', is_active=True).exclude(
            code__range=('5100', '5299')
        ):
            bal = cls.get_account_balance(acc, start_date=start_date, end_date=end_date, branch_id=branch_id)
            if bal > 0:
                overhead_expense += bal
                overhead_detail.append({'code': acc.code, 'name': acc.name, 'amount': float(bal)})

        total = parts_expense + labor_expense + overhead_expense

        def pct(val):
            return float((val / total * 100).quantize(Decimal('0.01'))) if total > 0 else 0.0

        return {
            'period': {'start': str(start_date), 'end': str(end_date)},
            'total_expenses': float(total),
            'categories': {
                'parts': {
                    'amount': float(parts_expense),
                    'percent': pct(parts_expense),
                    'label': 'Parts & Inventory',
                },
                'labor': {
                    'amount': float(labor_expense),
                    'percent': pct(labor_expense),
                    'label': 'Direct Labor',
                },
                'overhead': {
                    'amount': float(overhead_expense),
                    'percent': pct(overhead_expense),
                    'label': 'Overhead & Operating',
                    'detail': overhead_detail,
                },
            },
        }

    # ========================================================================
    # PHASE 10: BUDGETING & CONTROLS
    # ========================================================================

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
    def get_management_metrics(start_date, end_date, branch_id=None):
        """
        Consolidated metrics for management reporting.
        When branch_id is set, KPIs and job profitability are scoped to that branch.
        """
        from apps.accounting.models import Account
        
        # P&L Summary
        pl = ReportingService.get_profit_loss(start_date, end_date, branch_id=branch_id)
        
        # Cash on Hand (Bank + Cash accounts)
        cash_accounts = Account.objects.filter(
            models.Q(code__startswith='10') | models.Q(name__icontains='bank') | models.Q(name__icontains='cash'),
            account_type='asset',
            is_active=True
        )
        cash_balance = sum(
            ReportingService.get_account_balance(acc, date=end_date, branch_id=branch_id)
            for acc in cash_accounts
        )
        
        # AR/AP Summary
        ar_aging = ReportingService.get_aging_report('ar', date=end_date, branch_id=branch_id)
        ap_aging = ReportingService.get_aging_report('ap', date=end_date, branch_id=branch_id)
        
        # Job Profitability (Top 5 by Margin)
        job_profit = ReportingService.get_job_profitability(
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id,
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
        cf = ReportingService.get_cash_flow_statement(start_date, end_date, branch_id=branch_id)
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
        
        # Branch Performance (omit when already viewing a single branch)
        from apps.branches.models import Branch
        branch_performance = []
        if branch_id is None:
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
            'branch_id': branch_id,
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

    @staticmethod
    def get_command_center_snapshot(start_date, end_date, branch_id=None, user=None):
        """
        Consolidated accounting dashboard payload for the frontend command center.
        """
        from datetime import timedelta

        from apps.accounting.analytics import AnalyticsService
        from apps.accounting.management_reports import ManagementReportingService
        from apps.billing.models import CashierTill, Payment

        def money(value):
            if value is None:
                return 0.0
            return float(value)

        def account_balance(account):
            return ReportingService.get_account_balance(account, date=end_date, branch_id=branch_id)

        def status_from(value, warning_at, critical_at, lower_is_worse=False):
            numeric = money(value)
            if lower_is_worse:
                if numeric <= critical_at:
                    return 'critical'
                if numeric <= warning_at:
                    return 'warning'
                return 'healthy'
            if numeric >= critical_at:
                return 'critical'
            if numeric >= warning_at:
                return 'warning'
            return 'healthy'

        def trend(current, previous):
            current_value = money(current)
            previous_value = money(previous)
            if abs(current_value - previous_value) < 0.01:
                return 'stable'
            return 'up' if current_value > previous_value else 'down'

        def format_duration(delta):
            if not delta:
                return ''
            total_minutes = max(int(delta.total_seconds() // 60), 0)
            hours, minutes = divmod(total_minutes, 60)
            if hours >= 24:
                days, hours = divmod(hours, 24)
                return f'{days}d {hours}h'
            if hours:
                return f'{hours}h {minutes}m'
            return f'{minutes}m'

        def role_view():
            role = getattr(user, 'role', '') if user else ''
            if role == 'accountant':
                return 'accountant'
            if role == 'manager':
                return 'branch_manager'
            if role in {'super-admin', 'admin'}:
                return 'executive'
            if user and (
                getattr(user, 'is_superuser', False)
                or getattr(user, 'role', '') in {'admin', 'super-admin'}
            ):
                return 'executive'
            return 'finance_manager'

        balance_sheet = ReportingService.get_balance_sheet(end_date, branch_id=branch_id)
        profit_loss = ReportingService.get_profit_loss(start_date, end_date, branch_id=branch_id)
        cash_flow = ReportingService.get_cash_flow_statement(start_date, end_date, branch_id=branch_id)
        tax_report = ReportingService.get_tax_report(start_date, end_date, branch_id=branch_id)
        ar_aging = ReportingService.get_aging_report('ar', end_date, branch_id=branch_id)
        ap_aging = ReportingService.get_aging_report('ap', end_date, branch_id=branch_id)
        supplier_aging = ManagementReportingService.get_supplier_ap_aging(end_date, branch_id=branch_id)
        revenue_mix = ManagementReportingService.get_revenue_mix(start_date, end_date, branch_id=branch_id)
        expense_breakdown = ReportingService.get_expense_breakdown(start_date, end_date, branch_id=branch_id)
        analytics = AnalyticsService.get_dashboard_snapshot(start_date, end_date, branch_id=branch_id)
        management = DashboardService.get_management_metrics(start_date, end_date, branch_id=branch_id)

        today = timezone.now().date()
        month_start = today.replace(day=1)
        year_start = today.replace(month=1, day=1)
        period_days = max((end_date - start_date).days + 1, 1)
        previous_end = start_date - timedelta(days=1)
        previous_start = previous_end - timedelta(days=period_days - 1)
        previous_profit_loss = ReportingService.get_profit_loss(previous_start, previous_end, branch_id=branch_id)
        previous_balance_sheet = ReportingService.get_balance_sheet(previous_end, branch_id=branch_id)
        previous_cash_flow = ReportingService.get_cash_flow_statement(previous_start, previous_end, branch_id=branch_id)

        payments_qs = Payment.objects.filter(status='completed', invoice__isnull=False)
        invoices_qs = Invoice.objects.exclude(status='void')
        bills_qs = Bill.objects.all()
        if branch_id:
            payments_qs = payments_qs.filter(invoice__branch_id=branch_id)
            invoices_qs = invoices_qs.filter(branch_id=branch_id)
            bills_qs = bills_qs.filter(branch_id=branch_id)

        revenue_today = payments_qs.filter(payment_date__date=today).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        revenue_mtd = payments_qs.filter(payment_date__date__gte=month_start, payment_date__date__lte=today).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        revenue_ytd = payments_qs.filter(payment_date__date__gte=year_start, payment_date__date__lte=today).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        customer_map = {}
        for invoice in invoices_qs.filter(invoice_date__gte=start_date, invoice_date__lte=end_date).select_related('customer'):
            customer_name = str(invoice.customer) if invoice.customer_id else 'Walk-in Customer'
            row = customer_map.setdefault(customer_name, {
                'customer': customer_name,
                'revenue': Decimal('0'),
                'invoice_count': 0,
                'last_invoice_date': invoice.invoice_date.isoformat() if invoice.invoice_date else None,
            })
            row['revenue'] += invoice.total or Decimal('0')
            row['invoice_count'] += 1
            if invoice.invoice_date:
                row['last_invoice_date'] = max(row['last_invoice_date'] or invoice.invoice_date.isoformat(), invoice.invoice_date.isoformat())

        top_customers = [
            {
                'customer': row['customer'],
                'revenue': money(row['revenue']),
                'invoice_count': row['invoice_count'],
                'last_invoice_date': row['last_invoice_date'],
            }
            for row in sorted(customer_map.values(), key=lambda item: item['revenue'], reverse=True)[:5]
        ]

        overdue_invoices_qs = invoices_qs.filter(
            status__in=['sent', 'viewed', 'partial', 'overdue'],
            due_date__lt=today,
        ).exclude(amount_due=0).order_by('-amount_due')[:10]
        overdue_invoices = [
            {
                'id': inv.id,
                'number': inv.invoice_number,
                'customer': str(inv.customer),
                'amount_due': money(inv.amount_due),
                'due_date': inv.due_date.isoformat() if inv.due_date else None,
            }
            for inv in overdue_invoices_qs.select_related('customer')
        ]

        upcoming_windows = []
        open_bills_qs = bills_qs.filter(status__in=['open', 'partially_paid', 'overdue']).exclude(amount_due=0)
        overdue_bills_qs = open_bills_qs.filter(due_date__lt=today)
        due_this_week_qs = open_bills_qs.filter(due_date__gte=today, due_date__lte=today + timedelta(days=7))
        due_this_month_qs = open_bills_qs.filter(due_date__gte=today, due_date__lte=today + timedelta(days=30))
        for days in (7, 14, 30):
            due_limit = today + timedelta(days=days)
            due_qs = open_bills_qs.filter(due_date__gte=today, due_date__lte=due_limit)
            upcoming_windows.append({
                'days': days,
                'label': f'{days} Days',
                'amount': money(due_qs.aggregate(total=Sum('amount_due'))['total'] or Decimal('0')),
                'count': due_qs.count(),
            })

        till_accounts_qs = Account.objects.filter(is_till_enabled=True, is_active=True)
        till_accounts = []
        for account in till_accounts_qs.order_by('code'):
            latest_till = (
                CashierTill.objects.filter(till_account=account)
                .select_related('branch', 'cashier')
                .order_by('-opened_at', '-id')
                .first()
            )
            last_closed_till = (
                CashierTill.objects.filter(till_account=account, status='closed')
                .select_related('branch', 'cashier')
                .order_by('-closed_at', '-id')
                .first()
            )
            till_accounts.append({
                'id': account.id,
                'code': account.code,
                'name': account.name,
                'balance': money(account_balance(account)),
                'open_till_status': latest_till.status if latest_till else 'closed',
                'last_till_closure': last_closed_till.closed_at.isoformat() if last_closed_till and last_closed_till.closed_at else None,
                'last_reconciliation': last_closed_till.closed_at.isoformat() if last_closed_till and last_closed_till.closed_at else None,
                'variance_status': getattr(last_closed_till, 'variance_approval_status', '') if last_closed_till else 'not_required',
                'href': f'/accounting/reports/general-ledger?account_id={account.id}',
            })

        bank_accounts_qs = Account.objects.filter(
            account_type='asset',
            account_subtype__in=['bank', 'cash_equivalent'],
            is_active=True,
        )
        bank_accounts = []
        for account in bank_accounts_qs.order_by('code'):
            latest_statement = account.bank_statements.order_by('-statement_date', '-id').prefetch_related('lines').first()
            unreconciled = 0
            reconciled_balance = Decimal('0')
            if latest_statement:
                reconciled_balance = latest_statement.closing_balance or Decimal('0')
                unreconciled = latest_statement.lines.filter(Q(matched=False) | Q(matched_transaction__isnull=True)).count()
            bank_accounts.append({
                'id': account.id,
                'bank_name': account.name,
                'name': account.name,
                'account_name': f'{account.code} - {account.name}',
                'balance': money(account_balance(account)),
                'ledger_balance': money(account_balance(account)),
                'reconciled_balance': money(reconciled_balance),
                'difference': money(account_balance(account) - reconciled_balance),
                'last_reconciliation_date': latest_statement.statement_date.isoformat() if latest_statement else None,
                'unreconciled_transactions': unreconciled,
                'href': f'/accounting/banking/reconciliation?account_id={account.id}',
            })

        till_qs = CashierTill.objects.select_related('branch', 'cashier', 'till_account').all()
        if branch_id:
            till_qs = till_qs.filter(branch_id=branch_id)
        open_tills_qs = till_qs.filter(status='open').order_by('-opened_at')
        closed_tills_today = till_qs.filter(status='closed', closed_at__date=end_date).count()
        pending_till_closures = open_tills_qs.count()
        open_tills = [
            {
                'id': till.id,
                'user': till.cashier.get_full_name() or till.cashier.username,
                'branch': till.branch.name if till.branch_id else '',
                'till_account': str(till.till_account) if till.till_account_id else '',
                'opening_balance': money(till.opening_balance),
                'current_balance': money(till.calculate_expected_balance()),
                'open_duration': format_duration(till.duration),
                'href': f'/accounting/tills/{till.id}',
            }
            for till in open_tills_qs
        ]

        till_shortage = Decimal('0')
        till_excess = Decimal('0')
        till_pay_ins = Decimal('0')
        till_pay_outs = Decimal('0')
        till_cash_receipts = Decimal('0')
        till_cash_refunds = Decimal('0')
        pending_variance_approvals = 0
        pending_supervisor_actions = []
        for till in till_qs.filter(opened_at__date__gte=start_date, opened_at__date__lte=end_date):
            till_pay_ins += till.cash_movements.filter(movement_type='pay_in').aggregate(total=Sum('amount'))['total'] or Decimal('0')
            till_pay_outs += till.cash_movements.filter(movement_type='pay_out').aggregate(total=Sum('amount'))['total'] or Decimal('0')
            till_cash_receipts += till.cash_payments_total()
            till_cash_refunds += till.cash_refunds_total()
            if till.variance and till.variance < 0:
                till_shortage += abs(till.variance)
            elif till.variance and till.variance > 0:
                till_excess += till.variance
            if till.variance_approval_status == 'supervisor_required':
                pending_variance_approvals += 1
                pending_supervisor_actions.append({
                    'id': till.id,
                    'user': till.cashier.get_full_name() or till.cashier.username,
                    'branch': till.branch.name if till.branch_id else '',
                    'till_account': str(till.till_account) if till.till_account_id else '',
                    'variance': money(till.variance),
                    'closed_at': till.closed_at.isoformat() if till.closed_at else None,
                    'reason': till.notes,
                    'href': f'/accounting/tills/{till.id}',
                    'approve_href': f'/accounting/tills/{till.id}',
                })

        revenue_trend = [
            {
                'period': point.get('date'),
                'revenue': money(point.get('revenue')),
            }
            for point in analytics.get('trends', [])
        ]

        expense_trend = [
            {
                'date': point.get('date'),
                'expense': money(point.get('expense')),
            }
            for point in analytics.get('trends', [])
        ]

        expense_categories = []
        categories = expense_breakdown.get('categories', {})
        for key in ('parts', 'labor', 'overhead'):
            if key in categories:
                item = categories[key]
                expense_categories.append({
                    'name': item.get('label', key.title()),
                    'value': money(item.get('amount')),
                    'percent': money(item.get('percent')),
                })

        top_categories = [
            {
                'name': detail.get('name'),
                'amount': money(detail.get('amount')),
            }
            for detail in categories.get('overhead', {}).get('detail', [])[:5]
        ]

        negative_cash_accounts = [
            {'name': row['name'], 'balance': row['balance']}
            for row in till_accounts + bank_accounts
            if row['balance'] < 0
        ]

        control = AccountingControl.get_settings()
        inventory_gl_value = Decimal('0')
        inventory_operational_value = Decimal('0')
        if control.inventory_asset_account_id:
            inventory_gl_value = ReportingService.get_account_balance(
                control.inventory_asset_account, date=end_date, branch_id=branch_id
            )
        try:
            from apps.inventory.models import Part
            from apps.inventory.services import InventoryService

            branch_obj = None
            if branch_id:
                from apps.branches.models import Branch
                branch_obj = Branch.objects.filter(pk=branch_id).first()
            inventory_operational_value = InventoryService.get_stock_valuation(
                Part.objects.filter(is_active=True), branch=branch_obj
            )
        except Exception:
            inventory_operational_value = Decimal('0')
        missing_control_accounts = [
            field for field in AccountingControl.ACCOUNT_FIELD_NAMES
            if getattr(control, f'{field}_id', None) is None
        ]
        unbalanced_journals = 0
        for journal in JournalEntry.objects.prefetch_related('transactions')[:250]:
            if not journal.validate_balanced():
                unbalanced_journals += 1
        failed_reconciliations = sum(1 for account in bank_accounts if account['unreconciled_transactions'] > 0)
        overdue_ar_amount = sum(Decimal(str(row['amount_due'])) for row in overdue_invoices)
        overdue_ap_amount = overdue_bills_qs.aggregate(total=Sum('amount_due'))['total'] or Decimal('0')

        recent_entries = [
            {
                'id': je.id,
                'reference': je.reference,
                'description': je.description,
                'date': je.date.isoformat() if je.date else None,
                'posted': je.posted,
            }
            for je in JournalEntry.objects.order_by('-date', '-id')[:8]
        ]
        if branch_id:
            recent_entries = [
                {
                    'id': je.id,
                    'reference': je.reference,
                    'description': je.description,
                    'date': je.date.isoformat() if je.date else None,
                    'posted': je.posted,
                }
                for je in JournalEntry.objects.filter(branch_id=branch_id).order_by('-date', '-id')[:8]
            ]

        alerts = []
        if negative_cash_accounts:
            alerts.append({
                'severity': 'critical',
                'title': 'Negative cash balance',
                'message': f"{negative_cash_accounts[0]['name']} is below zero and needs review.",
                'href': '/accounting/reports/balance-sheet',
            })
        if pending_variance_approvals:
            alerts.append({
                'severity': 'warning',
                'title': 'Pending till variance approvals',
                'message': f'{pending_variance_approvals} till variances require supervisor action.',
                'href': '/accounting/tills',
            })
        if overdue_invoices:
            alerts.append({
                'severity': 'warning',
                'title': 'Overdue receivables',
                'message': f'{len(overdue_invoices)} overdue invoices need collection follow-up.',
                'href': '/accounting/reports/aging',
            })
        if overdue_bills_qs.exists():
            alerts.append({
                'severity': 'warning',
                'title': 'Overdue supplier bills',
                'message': f'{overdue_bills_qs.count()} supplier bills are overdue.',
                'href': '/billing/bills?status=overdue',
            })
        if money(tax_report.get('net_tax_liability')) > 0:
            alerts.append({
                'severity': 'warning',
                'title': 'Tax due',
                'message': 'Net tax liability is currently payable.',
                'href': '/accounting/reports/tax',
            })
        if not balance_sheet.get('is_balanced', True):
            alerts.append({
                'severity': 'critical',
                'title': 'Books out of balance',
                'message': 'Balance sheet is not balanced for the selected date.',
                'href': '/accounting/reports/trial-balance',
            })
        if missing_control_accounts:
            alerts.append({
                'severity': 'critical',
                'title': 'Missing control accounts',
                'message': f'{len(missing_control_accounts)} accounting control accounts are not configured.',
                'href': '/accounting/controls',
            })
        if failed_reconciliations:
            alerts.append({
                'severity': 'info',
                'title': 'Bank reconciliation backlog',
                'message': f'{failed_reconciliations} bank accounts have unreconciled transactions.',
                'href': '/accounting/banking/reconciliation',
            })

        monitoring = [
            {
                'id': 'critical',
                'title': 'Critical Controls',
                'severity': 'critical',
                'items': [
                    {
                        'id': 'books_out_of_balance',
                        'label': 'Books out of balance',
                        'count': 0 if balance_sheet.get('is_balanced', True) else 1,
                        'href': '/accounting/reports/trial-balance',
                    },
                    {
                        'id': 'unbalanced_journals',
                        'label': 'Unbalanced journals',
                        'count': unbalanced_journals,
                        'href': '/accounting/journal-entries?status=unbalanced',
                    },
                    {
                        'id': 'missing_control_accounts',
                        'label': 'Missing control accounts',
                        'count': len(missing_control_accounts),
                        'href': '/accounting/controls',
                    },
                    {
                        'id': 'negative_cash_accounts',
                        'label': 'Negative cash balances',
                        'count': len(negative_cash_accounts),
                        'amount': money(sum(Decimal(str(row['balance'])) for row in negative_cash_accounts)),
                        'href': '/accounting/reports/balance-sheet',
                    },
                ],
            },
            {
                'id': 'warning',
                'title': 'Operational Exceptions',
                'severity': 'warning',
                'items': [
                    {
                        'id': 'overdue_receivables',
                        'label': 'Overdue customer invoices',
                        'count': len(overdue_invoices),
                        'amount': money(overdue_ar_amount),
                        'href': '/accounting/reports/aging',
                    },
                    {
                        'id': 'overdue_payables',
                        'label': 'Overdue supplier bills',
                        'count': overdue_bills_qs.count(),
                        'amount': money(overdue_ap_amount),
                        'href': '/billing/bills?status=overdue',
                    },
                    {
                        'id': 'till_variance_approvals',
                        'label': 'Till variance approvals',
                        'count': pending_variance_approvals,
                        'amount': money(till_shortage + till_excess),
                        'href': '/accounting/tills',
                    },
                    {
                        'id': 'bank_reconciliation_backlog',
                        'label': 'Bank reconciliation queues',
                        'count': failed_reconciliations,
                        'href': '/accounting/banking/reconciliation',
                    },
                ],
            },
            {
                'id': 'information',
                'title': 'Upcoming Work',
                'severity': 'info',
                'items': [
                    {
                        'id': 'pending_bill_approvals',
                        'label': 'Supplier bill approvals',
                        'count': bills_qs.filter(status='pending_approval').count(),
                        'href': '/billing/bills?status=pending_approval',
                    },
                    {
                        'id': 'pending_till_closures',
                        'label': 'Open tills awaiting closure',
                        'count': pending_till_closures,
                        'href': '/accounting/tills',
                    },
                    {
                        'id': 'upcoming_tax_deadlines',
                        'label': 'Upcoming tax deadlines',
                        'count': 3,
                        'href': '/accounting/reports/tax',
                    },
                ],
            },
        ]

        return {
            'period': {'start': start_date.isoformat(), 'end': end_date.isoformat()},
            'branch_id': branch_id,
            'role_view': role_view(),
            'financial_position': {
                'total_assets': money(balance_sheet['totals']['assets']),
                'total_liabilities': money(balance_sheet['totals']['liabilities']),
                'equity': money(balance_sheet['totals']['equity']),
                'current_profit_loss': money(profit_loss['totals']['net_income']),
                'net_worth': money(balance_sheet['totals']['assets'] - balance_sheet['totals']['liabilities']),
                'is_balanced': balance_sheet.get('is_balanced', True),
                'inventory_gl_value': money(inventory_gl_value),
                'inventory_operational_value': money(inventory_operational_value),
            },
            'revenue_expenses': {
                'revenue_today': money(revenue_today),
                'revenue_this_month': money(revenue_mtd),
                'revenue_this_year': money(revenue_ytd),
                'expenses_this_period': money(profit_loss['totals']['expenses']),
                'gross_profit': money(profit_loss['totals']['income'] - profit_loss['totals']['expenses']),
                'net_profit': money(profit_loss['totals']['net_income']),
            },
            'cash_position': {
                'cash_on_hand': money(analytics['financial_health']['cash_on_hand']),
                'bank_balance': money(sum(Decimal(str(item['balance'])) for item in bank_accounts) if bank_accounts else Decimal('0')),
                'till_balances': money(sum(Decimal(str(item['balance'])) for item in till_accounts) if till_accounts else Decimal('0')),
                'total_available_cash': money(Decimal(str(analytics['financial_health']['cash_on_hand'])) + sum(Decimal(str(item['balance'])) for item in bank_accounts + till_accounts)),
                'runway_months': money(analytics['financial_health']['runway_months']),
                'negative_cash_accounts': negative_cash_accounts,
            },
            'working_capital': {
                'accounts_receivable': money(ar_aging['summary']['total']),
                'accounts_payable': money(ap_aging['summary']['total']),
                'outstanding_customer_balances': money(ar_aging['summary']['total']),
                'outstanding_supplier_balances': money(ap_aging['summary']['total']),
                'net_working_capital': money(ar_aging['summary']['total'] - ap_aging['summary']['total']),
            },
            'revenue_analytics': {
                'trend': revenue_trend,
                'by_branch': revenue_mix.get('by_branch', []),
                'by_service_type': revenue_mix.get('by_product', []),
                'top_customers': top_customers,
            },
            'expense_analytics': {
                'trend': expense_trend,
                'categories': expense_categories,
                'top_categories': top_categories,
            },
            'receivables': {
                'total_outstanding': money(ar_aging['summary']['total']),
                'aging_buckets': ar_aging['summary'],
                'top_debtors': sorted(
                    [
                        {
                            'id': row['id'],
                            'number': row['number'],
                            'entity': row['entity'],
                            'amount': money(row['amount']),
                            'due_date': row['due_date'].isoformat() if row.get('due_date') else None,
                        }
                        for row in ar_aging.get('details', [])
                    ],
                    key=lambda row: row['amount'],
                    reverse=True,
                )[:5],
                'overdue_invoices': overdue_invoices,
            },
            'payables': {
                'total_outstanding': money(ap_aging['summary']['total']),
                'summary': {
                    'total_outstanding': money(ap_aging['summary']['total']),
                    'due_this_week': money(due_this_week_qs.aggregate(total=Sum('amount_due'))['total'] or Decimal('0')),
                    'due_this_week_count': due_this_week_qs.count(),
                    'due_this_month': money(due_this_month_qs.aggregate(total=Sum('amount_due'))['total'] or Decimal('0')),
                    'due_this_month_count': due_this_month_qs.count(),
                    'overdue_bills': money(overdue_bills_qs.aggregate(total=Sum('amount_due'))['total'] or Decimal('0')),
                    'overdue_bills_count': overdue_bills_qs.count(),
                },
                'aging_buckets': ap_aging['summary'],
                'top_creditors': supplier_aging.get('suppliers', [])[:5],
                'upcoming_payments': upcoming_windows,
                'pending_approvals': bills_qs.filter(status='pending_approval').count(),
            },
            'cash_bank': {
                'till_accounts': till_accounts,
                'bank_accounts': bank_accounts,
            },
            'till_management': {
                'open_tills': open_tills,
                'totals': {
                    'open_tills': pending_till_closures,
                    'closed_tills_today': closed_tills_today,
                    'pending_closures': pending_till_closures,
                    'shortages': money(till_shortage),
                    'excesses': money(till_excess),
                    'pay_ins': money(till_pay_ins),
                    'pay_outs': money(till_pay_outs),
                    'cash_receipts': money(till_cash_receipts),
                    'cash_refunds': money(till_cash_refunds),
                    'net_movement': money(till_cash_receipts - till_cash_refunds + till_pay_ins - till_pay_outs),
                    'pending_variance_approvals': pending_variance_approvals,
                },
                'pending_supervisor_actions': pending_supervisor_actions[:10],
            },
            'tax': {
                'vat_collected': money(tax_report['tax_collected']['vat']),
                'vat_payable': money(tax_report['net_tax_liability']),
                'input_vat': money(tax_report['tax_paid']['total']),
                'output_vat': money(tax_report['tax_collected']['total']),
                'tax_due': money(tax_report['net_tax_liability']),
                'tax_credit': money(abs(tax_report['net_tax_liability']) if tax_report['net_tax_liability'] < 0 else Decimal('0')),
                'net_tax_position': money(tax_report['net_tax_liability']),
                'deadlines': [
                    {'label': 'VAT return preparation', 'tax_type': 'VAT', 'due_date': (end_date + timedelta(days=7)).isoformat(), 'filing_date': (end_date + timedelta(days=7)).isoformat(), 'days_remaining': 7, 'severity': 'warning'},
                    {'label': 'Management review', 'tax_type': 'VAT', 'due_date': (end_date + timedelta(days=14)).isoformat(), 'filing_date': (end_date + timedelta(days=14)).isoformat(), 'days_remaining': 14, 'severity': 'info'},
                    {'label': 'Filing and payment', 'tax_type': 'VAT', 'due_date': (end_date + timedelta(days=21)).isoformat(), 'filing_date': (end_date + timedelta(days=21)).isoformat(), 'days_remaining': 21, 'severity': 'info'},
                ],
            },
            'statements': {
                'profit_loss': {
                    'revenue': money(profit_loss['totals']['income']),
                    'cost_of_sales': money(profit_loss['totals']['expenses']),
                    'gross_profit': money(profit_loss['totals']['income'] - profit_loss['totals']['expenses']),
                    'expenses': money(profit_loss['totals']['expenses']),
                    'net_profit': money(profit_loss['totals']['net_income']),
                    'trend': {
                        'revenue': trend(profit_loss['totals']['income'], previous_profit_loss['totals']['income']),
                        'gross_profit': trend(profit_loss['totals']['income'] - profit_loss['totals']['expenses'], previous_profit_loss['totals']['income'] - previous_profit_loss['totals']['expenses']),
                        'net_profit': trend(profit_loss['totals']['net_income'], previous_profit_loss['totals']['net_income']),
                    },
                },
                'balance_sheet': {
                    'assets': money(balance_sheet['totals']['assets']),
                    'liabilities': money(balance_sheet['totals']['liabilities']),
                    'equity': money(balance_sheet['totals']['equity']),
                    'trend': {
                        'assets': trend(balance_sheet['totals']['assets'], previous_balance_sheet['totals']['assets']),
                        'liabilities': trend(balance_sheet['totals']['liabilities'], previous_balance_sheet['totals']['liabilities']),
                        'equity': trend(balance_sheet['totals']['equity'], previous_balance_sheet['totals']['equity']),
                    },
                },
                'cash_flow': {
                    'operating_cash_flow': money(cash_flow['operating_activities']['net']),
                    'investing_cash_flow': money(cash_flow['investing_activities']['net']),
                    'financing_cash_flow': money(cash_flow['financing_activities']['net']),
                    'closing_balance': money(cash_flow['closing_balance']),
                    'trend': {
                        'operating_cash_flow': trend(cash_flow['operating_activities']['net'], previous_cash_flow['operating_activities']['net']),
                        'investing_cash_flow': trend(cash_flow['investing_activities']['net'], previous_cash_flow['investing_activities']['net']),
                        'financing_cash_flow': trend(cash_flow['financing_activities']['net'], previous_cash_flow['financing_activities']['net']),
                    },
                },
            },
            'financial_health': {
                'cash': {
                    'status': status_from(analytics['financial_health']['runway_months'], 3, 1, lower_is_worse=True),
                    'label': 'Cash Health',
                    'message': f"{money(analytics['financial_health']['runway_months']):.1f} months runway",
                },
                'receivables': {
                    'status': status_from(overdue_ar_amount, 1, 10000),
                    'label': 'Receivable Health',
                    'message': f"{money(overdue_ar_amount):.2f} overdue",
                },
                'payables': {
                    'status': status_from(overdue_ap_amount, 1, 10000),
                    'label': 'Payable Health',
                    'message': f"{money(overdue_ap_amount):.2f} overdue",
                },
                'tills': {
                    'status': status_from(pending_variance_approvals + money(till_shortage), 1, 5),
                    'label': 'Till Health',
                    'message': f'{pending_variance_approvals} approvals pending',
                },
                'accounting': {
                    'status': 'critical' if missing_control_accounts or unbalanced_journals else ('warning' if failed_reconciliations else 'healthy'),
                    'label': 'Accounting Health',
                    'message': f'{len(missing_control_accounts)} missing controls, {failed_reconciliations} reconciliation queues',
                },
            },
            'alerts': alerts,
            'monitoring': monitoring,
            'recent_activity': {
                'journal_entries': recent_entries,
            },
            'metadata': {
                'generated_at': timezone.now().isoformat(),
                'permissions': getattr(user, 'role', None),
            },
        }

    @staticmethod
    def get_financial_ratios(as_of_date=None, start_date=None, end_date=None, branch_id=None):
        """Compute common financial ratios from balance sheet and P&L."""
        if not as_of_date:
            as_of_date = timezone.now().date()
        if not start_date:
            start_date = as_of_date.replace(month=1, day=1)
        if not end_date:
            end_date = as_of_date

        balance_sheet = ReportingService.get_balance_sheet(as_of_date, branch_id=branch_id)
        profit_loss = ReportingService.get_profit_loss(start_date, end_date, branch_id=branch_id)

        def sum_subtype(accounts, subtype):
            return sum(
                Decimal(str(a.get('balance', 0)))
                for a in accounts
                if a.get('account_subtype') == subtype
            )

        def sum_codes(accounts, prefixes):
            return sum(
                Decimal(str(a.get('balance', 0)))
                for a in accounts
                if any(str(a.get('code', '')).startswith(p) for p in prefixes)
            )

        assets = balance_sheet.get('assets', [])
        liabilities = balance_sheet.get('liabilities', [])

        current_assets = sum_subtype(assets, 'current_asset') or sum_codes(assets, ['10', '11', '12', '13', '14', '15'])
        current_liabilities = sum_subtype(liabilities, 'current_liability') or sum_codes(liabilities, ['20', '21', '22'])
        total_assets = Decimal(str(balance_sheet['totals']['assets']))
        total_liabilities = Decimal(str(balance_sheet['totals']['liabilities']))
        total_equity = Decimal(str(balance_sheet['totals']['equity']))
        revenue = Decimal(str(profit_loss['totals']['income']))
        net_income = Decimal(str(profit_loss['totals']['net_income']))
        expenses = Decimal(str(profit_loss['totals']['expenses']))

        cash_and_bank = sum_codes(assets, ['1010', '1100', '10', '11'])
        inventory = sum_codes(assets, ['1500', '15'])

        def safe_div(numerator, denominator, as_percent=False):
            if not denominator:
                return None
            value = float(numerator) / float(denominator)
            return round(value * 100, 2) if as_percent else round(value, 4)

        return {
            'as_of_date': as_of_date.isoformat(),
            'period': {'start': start_date.isoformat(), 'end': end_date.isoformat()},
            'inputs': {
                'current_assets': float(current_assets),
                'current_liabilities': float(current_liabilities),
                'total_assets': float(total_assets),
                'total_liabilities': float(total_liabilities),
                'total_equity': float(total_equity),
                'revenue': float(revenue),
                'net_income': float(net_income),
                'expenses': float(expenses),
                'cash_and_bank': float(cash_and_bank),
                'inventory': float(inventory),
            },
            'ratios': {
                'current_ratio': safe_div(current_assets, current_liabilities),
                'quick_ratio': safe_div(current_assets - inventory, current_liabilities),
                'cash_ratio': safe_div(cash_and_bank, current_liabilities),
                'debt_to_equity': safe_div(total_liabilities, total_equity),
                'debt_ratio': safe_div(total_liabilities, total_assets),
                'equity_ratio': safe_div(total_equity, total_assets),
                'net_profit_margin': safe_div(net_income, revenue, as_percent=True),
                'return_on_assets': safe_div(net_income, total_assets, as_percent=True),
                'return_on_equity': safe_div(net_income, total_equity, as_percent=True),
                'expense_ratio': safe_div(expenses, revenue, as_percent=True),
            },
        }

    @staticmethod
    def get_vat_return(start_date=None, end_date=None, branch_id=None):
        """VAT return worksheet from operational tax data."""
        tax_report = ReportingService.get_tax_report(start_date, end_date, branch_id=branch_id)
        collected = tax_report['tax_collected']
        return {
            'period': tax_report['period'],
            'worksheet': {
                'output_vat': collected.get('vat', 0),
                'output_nhil': collected.get('nhil', 0),
                'output_getfund': collected.get('getfund', 0),
                'output_hrl': collected.get('hrl', 0),
                'total_output_tax': collected.get('total', 0),
                'input_vat': tax_report['tax_paid']['total'],
                'net_vat_payable': tax_report['net_tax_liability'],
            },
            'supporting': {
                'invoice_count': tax_report['invoice_count'],
                'bill_count': tax_report['bill_count'],
            },
            'status': 'draft',
        }

    @staticmethod
    def get_tax_reconciliation(start_date=None, end_date=None, branch_id=None):
        """Reconcile GL tax accounts against operational tax report."""
        if not start_date:
            start_date = timezone.now().date().replace(month=1, day=1)
        if not end_date:
            end_date = timezone.now().date()

        tax_report = ReportingService.get_tax_report(start_date, end_date, branch_id=branch_id)
        control = AccountingControl.get_settings()

        gl_output_tax = Decimal('0')
        gl_input_tax = Decimal('0')
        if control.sales_tax_payable_account_id:
            gl_output_tax = ReportingService.get_account_balance(
                control.sales_tax_payable_account, date=end_date, branch_id=branch_id
            )
        if control.input_tax_account_id:
            gl_input_tax = ReportingService.get_account_balance(
                control.input_tax_account, date=end_date, branch_id=branch_id
            )

        operational_output = Decimal(str(tax_report['tax_collected']['total']))
        operational_input = Decimal(str(tax_report['tax_paid']['total']))
        gl_net = gl_output_tax - gl_input_tax
        operational_net = Decimal(str(tax_report['net_tax_liability']))

        return {
            'period': {'start': start_date.isoformat(), 'end': end_date.isoformat()},
            'gl': {
                'output_tax_balance': float(gl_output_tax),
                'input_tax_balance': float(gl_input_tax),
                'net_position': float(gl_net),
            },
            'operational': {
                'output_tax_total': float(operational_output),
                'input_tax_total': float(operational_input),
                'net_position': float(operational_net),
            },
            'variance': {
                'output': float(gl_output_tax - operational_output),
                'input': float(gl_input_tax - operational_input),
                'net': float(gl_net - operational_net),
            },
            'in_balance': abs(gl_net - operational_net) <= Decimal('0.01'),
        }

    @staticmethod
    def get_withholding_tax_report(start_date=None, end_date=None, branch_id=None):
        """Withholding tax summary from WHT liability account and bill payment transactions."""
        from apps.billing.models import BillPayment

        if not start_date:
            start_date = timezone.now().date().replace(month=1, day=1)
        if not end_date:
            end_date = timezone.now().date()

        control = AccountingControl.get_settings()
        wht_account = control.withholding_tax_payable_account
        lines = []
        total = Decimal('0')

        if wht_account:
            balance = ReportingService.get_account_balance(
                wht_account, date=end_date, branch_id=branch_id
            )
            if balance != 0:
                lines.append({
                    'code': wht_account.code,
                    'name': wht_account.name,
                    'balance': float(balance),
                })
                total = balance

        payment_qs = BillPayment.objects.filter(
            wht_amount__gt=0,
            payment_date__gte=start_date,
            payment_date__lte=end_date,
        ).select_related('bill', 'bill__vendor')
        if branch_id:
            payment_qs = payment_qs.filter(bill__branch_id=branch_id)

        transactions = []
        period_total = Decimal('0')
        for bp in payment_qs.order_by('payment_date', 'payment_number'):
            period_total += bp.wht_amount
            transactions.append({
                'payment_number': bp.payment_number,
                'payment_date': bp.payment_date.isoformat(),
                'vendor': str(bp.bill.vendor),
                'bill_number': bp.bill.bill_number,
                'wht_rate': float(bp.wht_rate),
                'wht_amount': float(bp.wht_amount),
                'net_paid': float(bp.amount),
                'gross_amount': float(bp.gross_amount),
                'certificate': bp.wht_certificate,
            })

        return {
            'period': {'start': start_date.isoformat(), 'end': end_date.isoformat()},
            'configured': wht_account is not None,
            'control_account': {
                'code': wht_account.code,
                'name': wht_account.name,
            } if wht_account else None,
            'lines': lines,
            'total_withheld': float(total),
            'period_transactions': transactions,
            'period_withheld_total': float(period_total),
            'note': (
                'Configure withholding_tax_payable_account in Accounting Controls. '
                'Record WHT on vendor bill payments to auto-post liability.'
                if not wht_account
                else None
            ),
        }


class ExportService:
    @staticmethod
    def generate_board_pack(start_date, end_date, branch_id=None):
        """
        Generates a PDF Board Pack containing key financial reports and metrics.
        Returns: BytesIO object containing the PDF
        """
        import io
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Table, Paragraph, Spacer, PageBreak
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch, mm
        from apps.core.services.report_pdf import get_compact_table_style
        
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=8 * mm,
            rightMargin=8 * mm,
            topMargin=8 * mm,
            bottomMargin=8 * mm,
        )
        styles = getSampleStyleSheet()
        story = []
        
        # --- TITLE PAGE ---
        title_style = ParagraphStyle(
            'Title',
            parent=styles['Heading1'],
            fontSize=16,
            leading=19,
            alignment=1, # Center
            spaceAfter=12
        )
        subtitle_style = ParagraphStyle(
            'Subtitle',
            parent=styles['Normal'],
            fontSize=9,
            leading=11,
            alignment=1, # Center
            spaceAfter=6
        )
        
        story.append(Spacer(1, 1.5*inch))
        story.append(Paragraph("Management Accounts Pack", title_style))
        story.append(Paragraph(f"Period: {start_date} to {end_date}", subtitle_style))
        story.append(Paragraph(f"Generated on {timezone.now().date()}", subtitle_style))
        story.append(PageBreak())
        
        # --- EXECUTIVE SUMMARY (KPIs) ---
        metrics = DashboardService.get_management_metrics(start_date, end_date, branch_id=branch_id)
        
        story.append(Paragraph("Executive Summary", styles['Heading1']))
        story.append(Spacer(1, 0.1*inch))
        
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
        
        kpi_table = Table(kpi_data, colWidths=[3*inch, 2*inch], repeatRows=1)
        kpi_table.setStyle(get_compact_table_style())
        story.append(kpi_table)
        story.append(PageBreak())
        
        # --- PROFIT & LOSS SUMMARY ---
        story.append(Paragraph("Profit & Loss Summary", styles['Heading1']))
        story.append(Spacer(1, 0.1*inch))
        
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
        
        pl_table = Table(pl_data, colWidths=[4*inch, 2*inch], repeatRows=1)
        pl_style = get_compact_table_style()
        pl_style.add('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold')
        pl_style.add('BACKGROUND', (0, len(pl['income']) + 2), (1, len(pl['income']) + 2), colors.HexColor('#f3f4f6'))
        pl_style.add('BACKGROUND', (0, -3), (1, -3), colors.HexColor('#f3f4f6'))
        pl_style.add('BACKGROUND', (0, -1), (1, -1), colors.HexColor('#dcfce7'))
        pl_table.setStyle(pl_style)
        story.append(pl_table)
        story.append(PageBreak())

        # --- MoM / YoY COMPARISON ---
        from .management_reports import ManagementReportingService

        story.append(Paragraph("Period Comparison (MoM & YoY)", styles['Heading1']))
        story.append(Spacer(1, 0.1*inch))
        for label, comparison in (('Month over Month', 'mom'), ('Year over Year', 'yoy')):
            comp = ManagementReportingService.get_profit_loss_comparative(
                start_date, end_date, branch_id=None, comparison=comparison
            )
            v = comp['variance']
            comp_data = [
                ['Metric', 'Current', 'Prior', 'Change', 'Change %'],
                [
                    'Revenue',
                    f"{v['income']['current']:,.2f}",
                    f"{v['income']['prior']:,.2f}",
                    f"{v['income']['change']:,.2f}",
                    f"{v['income']['change_percent']:.1f}%",
                ],
                [
                    'Expenses',
                    f"{v['expenses']['current']:,.2f}",
                    f"{v['expenses']['prior']:,.2f}",
                    f"{v['expenses']['change']:,.2f}",
                    f"{v['expenses']['change_percent']:.1f}%",
                ],
                [
                    'Net Income',
                    f"{v['net_income']['current']:,.2f}",
                    f"{v['net_income']['prior']:,.2f}",
                    f"{v['net_income']['change']:,.2f}",
                    f"{v['net_income']['change_percent']:.1f}%",
                ],
            ]
            story.append(Paragraph(label, styles['Heading2']))
            comp_table = Table(comp_data, colWidths=[1.4*inch, 1.1*inch, 1.1*inch, 1.1*inch, 0.9*inch], repeatRows=1)
            comp_table.setStyle(get_compact_table_style())
            story.append(comp_table)
            story.append(Spacer(1, 0.15*inch))

        doc.build(story)
        buffer.seek(0)
        return buffer
