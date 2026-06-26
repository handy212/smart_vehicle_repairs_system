from decimal import Decimal
from django.db import models
from django.db.models import Q
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _


class Account(models.Model):
    """
    Chart of Accounts
    """
    ACCOUNT_TYPE_CHOICES = [
        ('asset', 'Asset'),
        ('liability', 'Liability'),
        ('equity', 'Equity'),
        ('income', 'Income'),
        ('expense', 'Expense'),
    ]

    BALANCE_TYPE_CHOICES = [
        ('debit', 'Debit'),
        ('credit', 'Credit'),
    ]

    ACCOUNT_SUBTYPE_CHOICES = [
        ('', 'Unclassified'),
        ('cash', 'Cash on Hand'),
        ('bank', 'Bank Account'),
        ('cash_equivalent', 'Cash Equivalent'),
        ('accounts_receivable', 'Accounts Receivable'),
        ('inventory', 'Inventory'),
        ('fixed_asset', 'Fixed Asset'),
        ('current_asset', 'Current Asset'),
        ('current_liability', 'Current Liability'),
        ('tax_payable', 'Taxes Payable'),
        ('accounts_payable', 'Accounts Payable'),
        ('revenue', 'Revenue'),
        ('expense', 'Expense'),
        ('category', 'Category/Header'),
    ]

    TILL_ELIGIBLE_SUBTYPES = {'cash', 'bank', 'cash_equivalent'}

    code = models.CharField(max_length=20, unique=True, help_text="Unique account code (e.g., 1000)")
    name = models.CharField(max_length=255)
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPE_CHOICES)
    balance_type = models.CharField(max_length=20, choices=BALANCE_TYPE_CHOICES, help_text="Normal balance side")
    account_subtype = models.CharField(
        max_length=30,
        choices=ACCOUNT_SUBTYPE_CHOICES,
        blank=True,
        default='',
        help_text="Classification used for reporting and till eligibility."
    )
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='children')
    is_active = models.BooleanField(default=True)
    is_till_enabled = models.BooleanField(default=False)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['account_type']),
            models.Index(fields=['parent']),
            models.Index(fields=['is_till_enabled']),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"

    @property
    def is_leaf(self):
        if not self.pk:
            return True
        return not self.children.exists()

    @property
    def can_enable_till(self):
        return (
            self.is_active
            and self.account_type == 'asset'
            and self.account_subtype in self.TILL_ELIGIBLE_SUBTYPES
            and self.is_leaf
        )

    def clean(self):
        super().clean()
        if self.parent_id and self.parent_id == self.pk:
            raise ValidationError(_("An account cannot be its own parent."))
        parent = self.parent
        seen = set()
        while parent is not None:
            if parent.pk == self.pk:
                raise ValidationError(_("Account hierarchy cannot contain cycles."))
            if parent.pk in seen:
                raise ValidationError(_("Account hierarchy cannot contain cycles."))
            seen.add(parent.pk)
            parent = parent.parent
        if self.parent_id and self.parent and self.parent.is_till_enabled:
            raise ValidationError(_("A till-enabled account cannot be used as a parent account."))
        if self.is_till_enabled and not self.can_enable_till:
            raise ValidationError(
                _("Only active leaf Asset accounts classified as Cash, Bank, or Cash Equivalent can be till-enabled.")
            )


from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType

class JournalEntry(models.Model):
    """
    Header for a double-entry transaction
    """
    date = models.DateField()
    description = models.TextField()
    reference = models.CharField(max_length=100, blank=True, help_text="External reference number")
    posted = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='journal_entries_created')
    branch = models.ForeignKey('branches.Branch', on_delete=models.PROTECT, null=True, blank=True, related_name='journal_entries')
    
    # Link to source document (Invoice, Bill, Payment, etc.)
    content_type = models.ForeignKey(ContentType, on_delete=models.SET_NULL, null=True, blank=True)
    object_id = models.PositiveIntegerField(null=True, blank=True)
    content_object = GenericForeignKey('content_type', 'object_id')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Journal Entries"
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['date']),
            models.Index(fields=['posted']),
            models.Index(fields=['reference']),
            models.Index(fields=['content_type', 'object_id']),
        ]

    def __str__(self):
        return f"JE #{self.id} - {self.date} - {self.description[:50]}"
    
    def validate_balanced(self):
        """Check if debits equal credits"""
        debits = sum(t.amount for t in self.transactions.all() if t.transaction_type == 'debit')
        credits = sum(t.amount for t in self.transactions.all() if t.transaction_type == 'credit')
        return debits == credits

    def clean(self):
        super().clean()
        if self.pk and not getattr(self, '_allow_posted_edit', False):
            original = JournalEntry.objects.filter(pk=self.pk).first()
            if original and original.posted:
                immutable_fields = [
                    'date', 'description', 'reference', 'posted', 'created_by_id',
                    'branch_id', 'content_type_id', 'object_id'
                ]
                changed = [field for field in immutable_fields if getattr(original, field) != getattr(self, field)]
                if changed:
                    raise ValidationError(
                        _("Posted journal entries cannot be edited. Create a reversal entry instead.")
                    )

    def save(self, *args, **kwargs):
        is_initial_posted_create = self.pk is None and self.posted
        self.full_clean()
        super().save(*args, **kwargs)
        if is_initial_posted_create:
            # Legacy posting services create a posted header and immediately add
            # its lines using the same in-memory instance. Keep that initial
            # construction path working while still blocking later fetched
            # posted-entry edits.
            self._allow_initial_posted_lines = True


class Transaction(models.Model):
    """
    Individual debit/credit lines for a Journal Entry
    """
    TRANSACTION_TYPE_CHOICES = [
        ('debit', 'Debit'),
        ('credit', 'Credit'),
    ]

    journal_entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name='transactions')
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='transactions')
    amount = models.DecimalField(max_digits=15, decimal_places=2, validators=[])
    transaction_type = models.CharField(max_length=10, choices=TRANSACTION_TYPE_CHOICES)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['journal_entry']),
            models.Index(fields=['account']),
        ]

    def __str__(self):
        return f"{self.transaction_type.title()} {self.amount} - {self.account.code}"

    def clean(self):
        if self.amount <= 0:
            raise ValidationError(_("Transaction amount must be positive."))
        if self.account_id and not self.account.is_active:
            raise ValidationError(
                _("Journal transactions cannot be posted to inactive accounts.")
            )
        if self.account_id and self.account.children.exists():
            raise ValidationError(
                _("Journal transactions must be posted to detail/leaf accounts, not parent category accounts.")
            )
        allow_initial_line = (
            self.pk is None
            and getattr(self.journal_entry, '_allow_initial_posted_lines', False)
        )
        if (
            self.journal_entry_id
            and self.journal_entry.posted
            and not getattr(self, '_allow_posted_edit', False)
            and not allow_initial_line
        ):
            raise ValidationError(
                _("Transactions on posted journal entries cannot be edited. Create a reversal entry instead.")
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.journal_entry_id and self.journal_entry.posted and not getattr(self, '_allow_posted_edit', False):
            raise ValidationError(
                _("Transactions on posted journal entries cannot be deleted. Create a reversal entry instead.")
            )
        return super().delete(*args, **kwargs)

class AccountingControl(models.Model):
    """
    Global accounting settings/controls.
    Expected to have only one active record.
    """
    ACCOUNT_FIELD_NAMES = [
        'accounts_receivable_account',
        'accounts_payable_account',
        'customer_prepayment_account',
        'sales_revenue_account',
        'sales_discount_account',
        'sales_tax_payable_account',
        'shop_supplies_revenue_account',
        'environmental_fee_revenue_account',
        'input_tax_account',
        'withholding_tax_payable_account',
        'default_expense_account',
        'purchase_returns_account',
        'inventory_asset_account',
        'cost_of_goods_sold_account',
        'cash_over_short_account',
        'till_counterparty_cash_account',
        'default_bank_account',
        'salary_expense_account',
        'overtime_expense_account',
        'allowances_expense_account',
        'employer_statutory_expense_account',
        'paye_tax_payable_account',
        'payroll_deductions_payable_account',
        'employer_statutory_payable_account',
    ]

    period_lock_date = models.DateField(null=True, blank=True, help_text="Transactions on or before this date cannot be modified.")
    accounts_receivable_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_accounts_receivable',
        help_text="Control account for customer receivables."
    )
    accounts_payable_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_accounts_payable',
        help_text="Control account for vendor payables."
    )
    customer_prepayment_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_customer_prepayments',
        help_text="Liability account for customer overpayments / unapplied credits."
    )
    sales_revenue_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_sales_revenue',
        help_text="Default revenue account for invoice sales."
    )
    sales_discount_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_sales_discounts',
        help_text="Contra-revenue account for invoice discounts."
    )
    sales_tax_payable_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_sales_tax_payable',
        help_text="Liability account for output VAT/tax."
    )
    shop_supplies_revenue_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_shop_supplies_revenue',
        help_text="Revenue account for shop supplies fees."
    )
    environmental_fee_revenue_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_environmental_fee_revenue',
        help_text="Revenue account for environmental fees."
    )
    input_tax_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_input_tax',
        help_text="Asset account for recoverable input VAT/tax."
    )
    withholding_tax_payable_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_withholding_tax_payable',
        help_text="Liability account for vendor withholding tax."
    )
    default_expense_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_default_expense',
        help_text="Default expense account for vendor bill lines."
    )
    purchase_returns_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_purchase_returns',
        help_text="Contra-expense account for vendor credit returns (non-inventory)."
    )
    inventory_asset_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_inventory_asset',
        help_text="Inventory asset control account."
    )
    cost_of_goods_sold_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_cogs',
        help_text="Cost of goods sold account."
    )
    cash_over_short_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_cash_over_short',
        help_text="Account used for till shortage and overage variances."
    )
    till_counterparty_cash_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_till_counterparty_cash',
        help_text="Cash account used as the other side of till pay-in/pay-out movements."
    )
    default_bank_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_default_bank',
        help_text="Optional default bank/cash-equivalent account for non-cash settlement."
    )
    salary_expense_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_salary_expense',
        help_text="Payroll basic salary expense account.",
    )
    overtime_expense_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_overtime_expense',
        help_text="Payroll overtime expense account.",
    )
    allowances_expense_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_allowances_expense',
        help_text="Payroll allowances expense account.",
    )
    employer_statutory_expense_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_employer_statutory_expense',
        help_text="Employer SSNIT and tier contributions expense.",
    )
    paye_tax_payable_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_paye_tax_payable',
        help_text="PAYE withheld on payroll.",
    )
    payroll_deductions_payable_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_payroll_deductions_payable',
        help_text="Employee payroll deductions payable (SSNIT, pension, etc.).",
    )
    employer_statutory_payable_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True,
        related_name='control_employer_statutory_payable',
        help_text="Employer statutory contributions payable.",
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    class Meta:
        verbose_name_plural = "Accounting Controls"

    def __str__(self):
        return f"Control Settings (Lock Date: {self.period_lock_date})"

    @classmethod
    def get_settings(cls):
        obj, created = cls.objects.get_or_create(pk=1)
        return obj

    def clean(self):
        super().clean()
        for field_name in self.ACCOUNT_FIELD_NAMES:
            account = getattr(self, field_name, None)
            if account and not account.is_leaf:
                raise ValidationError(_("%(field)s must be a leaf/detail account.") % {'field': field_name})


class VatReturn(models.Model):
    """Persisted VAT return filing with workflow status."""

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('reviewed', 'Reviewed'),
        ('filed', 'Filed'),
        ('paid', 'Paid'),
    ]

    period_start = models.DateField()
    period_end = models.DateField()
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='vat_returns',
        null=True,
        blank=True,
    )
    worksheet = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    filing_reference = models.CharField(max_length=100, blank=True)
    filed_at = models.DateTimeField(null=True, blank=True)
    filed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vat_returns_filed',
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_reference = models.CharField(max_length=100, blank=True)
    payment_journal_entry = models.ForeignKey(
        'JournalEntry',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vat_return_payments',
    )
    gra_acknowledgment = models.CharField(max_length=100, blank=True)
    gra_submitted_at = models.DateTimeField(null=True, blank=True)
    gra_submission_mode = models.CharField(
        max_length=20,
        blank=True,
        choices=[('manual', 'Manual'), ('api', 'API')],
    )
    gra_submission_payload = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='vat_returns_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-period_end', '-created_at']
        indexes = [
            models.Index(fields=['status', 'period_end']),
            models.Index(fields=['branch', 'period_start', 'period_end']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['period_start', 'period_end', 'branch'],
                name='unique_vat_return_period_branch',
            ),
        ]

    def __str__(self):
        branch_code = self.branch.code if self.branch_id else 'ALL'
        return f"VAT {self.period_start}–{self.period_end} ({branch_code}) [{self.status}]"


class AuditLog(models.Model):
    """
    Audit trail for accounting changes.
    """
    ACTION_CHOICES = [
        ('create', 'Create'),
        ('update', 'Update'),
        ('delete', 'Delete'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    resource_type = models.CharField(max_length=50)
    resource_id = models.CharField(max_length=50)
    details = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', 'timestamp']),
            models.Index(fields=['resource_type', 'resource_id']),
            models.Index(fields=['action', 'timestamp']),
        ]
    
    def __str__(self):
        return f"{self.action} on {self.resource_type} by {self.user}"


# ============================================================================
# PHASE 8: CASH & BANKING MODELS
# ============================================================================

class BankStatement(models.Model):
    """Bank statement for reconciliation"""
    bank_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='bank_statements',
        limit_choices_to={'account_type': 'asset'},
        help_text="Must be a bank-type GL account"
    )
    statement_date = models.DateField()
    opening_balance = models.DecimalField(max_digits=15, decimal_places=2)
    closing_balance = models.DecimalField(max_digits=15, decimal_places=2)
    statement_file = models.FileField(upload_to='bank_statements/', null=True, blank=True)
    
    reconciled = models.BooleanField(default=False)
    reconciled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bank_statements_reconciled'
    )
    reconciled_at = models.DateTimeField(null=True, blank=True)
    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='bank_statements_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-statement_date']
        indexes = [
            models.Index(fields=['bank_account', 'statement_date']),
            models.Index(fields=['reconciled', 'statement_date']),
        ]
    
    def __str__(self):
        return f"{self.bank_account.name} - {self.statement_date}"


class BankStatementLine(models.Model):
    """Individual transaction line from bank statement"""
    bank_statement = models.ForeignKey(
        BankStatement,
        on_delete=models.CASCADE,
        related_name='lines'
    )
    transaction_date = models.DateField()
    description = models.TextField()
    reference = models.CharField(max_length=100, blank=True)
    
    debit_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    credit_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    balance = models.DecimalField(max_digits=15, decimal_places=2)
    
    matched = models.BooleanField(default=False)
    matched_transaction = models.ForeignKey(
        'Transaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='matched_bank_lines'
    )
    matched_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bank_lines_matched'
    )
    matched_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['transaction_date', 'id']
        indexes = [
            models.Index(fields=['bank_statement', 'matched']),
            models.Index(fields=['transaction_date']),
        ]
    
    def __str__(self):
        amount = self.debit_amount if self.debit_amount > 0 else -self.credit_amount
        return f"{self.transaction_date} - {self.description[:50]} ({amount})"


class FundTransfer(models.Model):
    """Inter-account fund transfers with approval workflow"""
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    transfer_number = models.CharField(max_length=20, unique=True, editable=False)
    from_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='transfers_out'
    )
    to_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='transfers_in'
    )
    amount = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    transfer_date = models.DateField(default=timezone.now)
    description = models.TextField()
    reference = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fund_transfer'
    )
    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='fund_transfers_created')
    created_at = models.DateTimeField(auto_now_add=True)
    
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fund_transfers_approved'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['from_account', 'to_account']),
        ]
    
    def __str__(self):
        return f"{self.transfer_number}: {self.from_account.code} → {self.to_account.code} ({self.amount})"
    
    def save(self, *args, **kwargs):
        if not self.transfer_number:
            last_transfer = FundTransfer.objects.order_by('-id').first()
            if last_transfer and last_transfer.transfer_number:
                last_number = int(last_transfer.transfer_number[2:])
                new_number = last_number + 1
            else:
                new_number = 1
            self.transfer_number = f"FT{new_number:06d}"
        
        super().save(*args, **kwargs)


class DocumentNumberSequence(models.Model):
    """Fiscal-year sequence counters for standardized accounting document numbers."""

    DOCUMENT_TYPE_CHOICES = [
        ('invoice', 'Invoice'),
        ('credit_note', 'Credit Note'),
        ('payment', 'Payment'),
        ('bill', 'Bill'),
        ('vendor_credit', 'Vendor Credit'),
        ('sales_order', 'Sales Order'),
        ('customer', 'Customer'),
    ]

    document_type = models.CharField(max_length=20, choices=DOCUMENT_TYPE_CHOICES)
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='document_number_sequences',
    )
    fiscal_year = models.PositiveIntegerField()
    last_sequence = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-fiscal_year', 'document_type', 'branch']
        constraints = [
            models.UniqueConstraint(
                fields=['document_type', 'branch', 'fiscal_year'],
                name='unique_document_number_sequence',
            ),
        ]
        indexes = [
            models.Index(fields=['document_type', 'branch', 'fiscal_year']),
        ]

    def __str__(self):
        return f"{self.document_type} {self.branch_id} {self.fiscal_year}: {self.last_sequence}"


# ============================================================================
# PHASE 10: BUDGETING & CONTROLS
# ============================================================================

class Budget(models.Model):
    """Annual or periodic budget"""
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('approved', 'Approved'),
        ('active', 'Active'),
        ('closed', 'Closed'),
    ]
    
    name = models.CharField(max_length=200)
    fiscal_year = models.IntegerField()
    start_date = models.DateField()
    end_date = models.DateField()
    
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='budgets',
        help_text="Branch-specific budget or null for company-wide"
    )
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    description = models.TextField(blank=True)
    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='budgets_created')
    created_at = models.DateTimeField(auto_now_add=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='budgets_approved'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-fiscal_year', '-created_at']
        indexes = [
            models.Index(fields=['fiscal_year', 'status']),
            models.Index(fields=['branch', 'fiscal_year']),
        ]
    
    def __str__(self):
        return f"{self.name} - FY{self.fiscal_year}"


class BudgetLine(models.Model):
    """Budget allocation per account"""
    PERIOD_CHOICES = [
        ('annual', 'Annual'),
        ('q1', 'Q1'),
        ('q2', 'Q2'),
        ('q3', 'Q3'),
        ('q4', 'Q4'),
        ('jan', 'January'),
        ('feb', 'February'),
        ('mar', 'March'),
        ('apr', 'April'),
        ('may', 'May'),
        ('jun', 'June'),
        ('jul', 'July'),
        ('aug', 'August'),
        ('sep', 'September'),
        ('oct', 'October'),
        ('nov', 'November'),
        ('dec', 'December'),
    ]
    
    budget = models.ForeignKey(Budget, on_delete=models.CASCADE, related_name='lines')
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='budget_lines')
    period = models.CharField(max_length=20, choices=PERIOD_CHOICES, default='annual')
    amount = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))]
    )
    notes = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['account__code', 'period']
        indexes = [
            models.Index(fields=['budget', 'account']),
            models.Index(fields=['period']),
        ]
        unique_together = ['budget', 'account', 'period']
    
    def __str__(self):
        return f"{self.budget.name} - {self.account.code} ({self.period})"
    

class Accrual(models.Model):
    """Track accrued expenses/revenues"""
    ACCRUAL_TYPE_CHOICES = [
        ('expense', 'Accrued Expense'),
        ('revenue', 'Accrued Revenue'),
    ]
    
    ACCRUAL_STATUS_CHOICES = [
        ('active', 'Active'),
        ('reversed', 'Reversed'),
    ]
    
    accrual_type = models.CharField(max_length=20, choices=ACCRUAL_TYPE_CHOICES)
    account = models.ForeignKey(Account, on_delete=models.PROTECT, help_text="The expense or revenue account to accrue")
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    accrual_date = models.DateField(help_text="Date to recognize the expense/revenue")
    reversal_date = models.DateField(null=True, blank=True, help_text="Date to reverse the accrual (usually first day of next period)")
    description = models.TextField()
    source_model = models.CharField(max_length=100, blank=True, help_text="Source document model, e.g. WorkOrder or PurchaseOrder")
    source_id = models.PositiveIntegerField(null=True, blank=True, help_text="Source document primary key")
    source_reference = models.CharField(max_length=100, blank=True, help_text="Human-readable source document number")
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='accruals',
    )
    
    accrual_je = models.ForeignKey(JournalEntry, on_delete=models.SET_NULL, null=True, blank=True, related_name='accrual_entries')
    reversal_je = models.ForeignKey(JournalEntry, on_delete=models.SET_NULL, null=True, blank=True, related_name='reversal_entries')
    
    status = models.CharField(max_length=20, choices=ACCRUAL_STATUS_CHOICES, default='active')
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    class Meta:
        indexes = [
            models.Index(fields=['source_model', 'source_id']),
            models.Index(fields=['status', 'accrual_type']),
            models.Index(fields=['branch', 'status']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['accrual_type', 'source_model', 'source_id'],
                condition=Q(source_id__isnull=False, status='active'),
                name='unique_active_accrual_source',
            )
        ]
    
    @property
    def is_reversed(self):
        return self.status == 'reversed'
        
    @property
    def journal_entry(self):
        return self.accrual_je

    def __str__(self):
        return f"{self.get_accrual_type_display()} - {self.description} - {self.amount}"


class RevenueProduct(models.Model):
    """
    Sellable revenue classification aligned with the owner's external chart (QBO).

    Each row maps an operational revenue type (labour discipline, workshop service,
  AA roadside type, subscription, parts category, etc.) to an optional catalog Part
    for QBO Item sync and an owner income account code for reporting.
    """

    REVENUE_CLASS_CHOICES = [
        ('labor', 'Labour'),
        ('service', 'Workshop service'),
        ('part', 'Parts & materials'),
        ('aa_roadside', 'AA / roadside'),
        ('subscription', 'Subscription'),
        ('sublet_revenue', 'Sublet revenue (customer charge)'),
        ('sublet_cost', 'Sublet cost (vendor)'),
        ('fee', 'Fee'),
        ('other', 'Other'),
    ]

    BILLING_LINE_TYPE_CHOICES = [
        ('labor', 'Labor'),
        ('part', 'Part'),
        ('fee', 'Fee'),
        ('sublet', 'Sublet/Outsource'),
        ('other', 'Other'),
    ]

    code = models.SlugField(max_length=64, unique=True)
    name = models.CharField(max_length=200)
    owner_account_code = models.CharField(
        max_length=20,
        blank=True,
        help_text='Owner legacy income account code (e.g. 680, 658).',
    )
    owner_account_label = models.CharField(
        max_length=255,
        blank=True,
        help_text='Owner legacy income account label from their chart.',
    )
    revenue_class = models.CharField(max_length=32, choices=REVENUE_CLASS_CHOICES, default='service')
    default_billing_line_type = models.CharField(
        max_length=20,
        choices=BILLING_LINE_TYPE_CHOICES,
        default='other',
    )
    catalog_part = models.ForeignKey(
        'inventory.Part',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='revenue_products',
        help_text='Service/non-inventory catalog item synced to QBO for this revenue type.',
    )
    roadside_service_type = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        unique=True,
        help_text='Matches roadside.RoadsideRequest.service_type when set.',
    )
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name = 'Revenue product'
        verbose_name_plural = 'Revenue products'
        indexes = [
            models.Index(fields=['revenue_class', 'is_active']),
            models.Index(fields=['owner_account_code']),
        ]

    def __str__(self):
        code = self.owner_account_code
        if code:
            return f'{self.name} ({code})'
        return self.name
