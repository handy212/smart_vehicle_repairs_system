from django.contrib import admin
from .models import (
    Account,
    AccountingControl,
    Accrual,
    AuditLog,
    BankStatement,
    BankStatementLine,
    Budget,
    BudgetLine,
    FundTransfer,
    JournalEntry,
    RevenueProduct,
    Transaction,
)


class TransactionInline(admin.TabularInline):
    model = Transaction
    extra = 2


@admin.register(JournalEntry)
class JournalEntryAdmin(admin.ModelAdmin):
    list_display = ('date', 'description', 'reference', 'posted', 'created_by')
    list_filter = ('posted', 'date')
    search_fields = ('description', 'reference')
    inlines = [TransactionInline]
    date_hierarchy = 'date'


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'account_type', 'balance_type', 'is_active')
    list_filter = ('account_type', 'balance_type', 'is_active')
    search_fields = ('code', 'name')


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('journal_entry', 'account', 'transaction_type', 'amount', 'description')
    list_filter = ('transaction_type', 'account__account_type')
    search_fields = ('journal_entry__description', 'journal_entry__reference', 'account__code', 'account__name')
    autocomplete_fields = ('journal_entry', 'account')


class BankStatementLineInline(admin.TabularInline):
    model = BankStatementLine
    extra = 0
    autocomplete_fields = ('matched_transaction',)
    readonly_fields = ('matched_at',)


@admin.register(BankStatement)
class BankStatementAdmin(admin.ModelAdmin):
    list_display = ('bank_account', 'statement_date', 'opening_balance', 'closing_balance', 'reconciled')
    list_filter = ('reconciled', 'statement_date')
    search_fields = ('bank_account__code', 'bank_account__name')
    autocomplete_fields = ('bank_account', 'created_by', 'reconciled_by')
    readonly_fields = ('reconciled_at', 'created_at', 'updated_at')
    inlines = [BankStatementLineInline]
    date_hierarchy = 'statement_date'


@admin.register(BankStatementLine)
class BankStatementLineAdmin(admin.ModelAdmin):
    list_display = ('transaction_date', 'bank_statement', 'description', 'debit_amount', 'credit_amount', 'matched')
    list_filter = ('matched', 'transaction_date')
    search_fields = ('description', 'reference', 'bank_statement__bank_account__name')
    autocomplete_fields = ('bank_statement', 'matched_transaction', 'matched_by')
    readonly_fields = ('matched_at', 'created_at')
    date_hierarchy = 'transaction_date'


@admin.register(FundTransfer)
class FundTransferAdmin(admin.ModelAdmin):
    list_display = ('transfer_number', 'from_account', 'to_account', 'amount', 'transfer_date', 'status')
    list_filter = ('status', 'transfer_date')
    search_fields = ('transfer_number', 'reference', 'description', 'from_account__code', 'to_account__code')
    autocomplete_fields = ('from_account', 'to_account', 'journal_entry', 'created_by', 'approved_by')
    readonly_fields = ('transfer_number', 'created_at', 'approved_at', 'updated_at')
    date_hierarchy = 'transfer_date'


class BudgetLineInline(admin.TabularInline):
    model = BudgetLine
    extra = 0
    autocomplete_fields = ('account',)


@admin.register(Budget)
class BudgetAdmin(admin.ModelAdmin):
    list_display = ('name', 'fiscal_year', 'branch', 'status', 'start_date', 'end_date')
    list_filter = ('status', 'fiscal_year', 'branch')
    search_fields = ('name', 'description')
    autocomplete_fields = ('branch', 'created_by', 'approved_by')
    readonly_fields = ('created_at', 'approved_at', 'updated_at')
    inlines = [BudgetLineInline]
    date_hierarchy = 'start_date'


@admin.register(BudgetLine)
class BudgetLineAdmin(admin.ModelAdmin):
    list_display = ('budget', 'account', 'period', 'amount')
    list_filter = ('period', 'budget__fiscal_year')
    search_fields = ('budget__name', 'account__code', 'account__name', 'notes')
    autocomplete_fields = ('budget', 'account')


@admin.register(Accrual)
class AccrualAdmin(admin.ModelAdmin):
    list_display = ('accrual_type', 'account', 'amount', 'accrual_date', 'reversal_date', 'status')
    list_filter = ('accrual_type', 'status', 'accrual_date')
    search_fields = ('description', 'source_model', 'source_reference', 'account__code', 'account__name')
    autocomplete_fields = ('account', 'accrual_je', 'reversal_je', 'created_by')
    readonly_fields = ('created_at',)
    date_hierarchy = 'accrual_date'


@admin.register(AccountingControl)
class AccountingControlAdmin(admin.ModelAdmin):
    list_display = ('period_lock_date', 'updated_by', 'updated_at')
    autocomplete_fields = ('updated_by',)
    readonly_fields = ('updated_at',)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'user', 'action', 'resource_type', 'resource_id', 'ip_address')
    list_filter = ('action', 'resource_type', 'timestamp')
    search_fields = ('resource_type', 'resource_id', 'details', 'user__email')
    autocomplete_fields = ('user',)
    readonly_fields = ('timestamp',)
    date_hierarchy = 'timestamp'


@admin.register(RevenueProduct)
class RevenueProductAdmin(admin.ModelAdmin):
    list_display = (
        'code', 'name', 'owner_account_code', 'revenue_class',
        'default_billing_line_type', 'catalog_part', 'is_active', 'sort_order',
    )
    list_filter = ('revenue_class', 'is_active', 'default_billing_line_type')
    search_fields = ('code', 'name', 'owner_account_code', 'owner_account_label')
    autocomplete_fields = ('catalog_part',)
    ordering = ('sort_order', 'name')
