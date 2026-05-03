from decimal import Decimal
from django.db import models
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

    code = models.CharField(max_length=20, unique=True, help_text="Unique account code (e.g., 1000)")
    name = models.CharField(max_length=255)
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPE_CHOICES)
    balance_type = models.CharField(max_length=20, choices=BALANCE_TYPE_CHOICES, help_text="Normal balance side")
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='children')
    is_active = models.BooleanField(default=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['account_type']),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


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
        self.full_clean()
        super().save(*args, **kwargs)


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
        if self.journal_entry_id and self.journal_entry.posted and not getattr(self, '_allow_posted_edit', False):
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
    period_lock_date = models.DateField(null=True, blank=True, help_text="Transactions on or before this date cannot be modified.")
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
    
    accrual_je = models.ForeignKey(JournalEntry, on_delete=models.SET_NULL, null=True, blank=True, related_name='accrual_entries')
    reversal_je = models.ForeignKey(JournalEntry, on_delete=models.SET_NULL, null=True, blank=True, related_name='reversal_entries')
    
    status = models.CharField(max_length=20, choices=ACCRUAL_STATUS_CHOICES, default='active')
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    
    @property
    def is_reversed(self):
        return self.status == 'reversed'
        
    @property
    def journal_entry(self):
        return self.accrual_je

    def __str__(self):
        return f"{self.get_accrual_type_display()} - {self.description} - {self.amount}"
