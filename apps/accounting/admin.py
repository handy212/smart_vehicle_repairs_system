from django.contrib import admin
from .models import Account, JournalEntry, Transaction


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
