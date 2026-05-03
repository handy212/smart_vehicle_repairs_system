from rest_framework import serializers
from django.db import transaction as db_transaction
from .models import (
    Account, JournalEntry, Transaction, AccountingControl, AuditLog,
    BankStatement, BankStatementLine, FundTransfer,
    Budget, BudgetLine
)

class AccountSimpleSerializer(serializers.ModelSerializer):
    balance = serializers.SerializerMethodField()
    
    class Meta:
        model = Account
        fields = ['id', 'code', 'name', 'account_type', 'balance_type', 'is_active', 'balance']
    
    def get_balance(self, obj):
        """Calculate current account balance from transactions"""
        from django.db.models import Sum
        from .models import Transaction
        
        debits = Transaction.objects.filter(
            account=obj,
            transaction_type='debit'
        ).aggregate(total=Sum('amount'))['total'] or 0
        
        credits = Transaction.objects.filter(
            account=obj,
            transaction_type='credit'
        ).aggregate(total=Sum('amount'))['total'] or 0
        
        if obj.balance_type == 'debit':
            return float(debits - credits)
        return float(credits - debits)

class AccountSerializer(serializers.ModelSerializer):
    """Full serializer for creating and updating accounts"""
    class Meta:
        model = Account
        fields = ['id', 'code', 'name', 'account_type', 'balance_type', 'description', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']

class TransactionSerializer(serializers.ModelSerializer):
    account = AccountSimpleSerializer(read_only=True)
    date = serializers.DateField(source='journal_entry.date', read_only=True)
    reference = serializers.CharField(source='journal_entry.reference', read_only=True)
    
    class Meta:
        model = Transaction
        fields = ['id', 'account', 'amount', 'transaction_type', 'description', 'date', 'reference']

class TransactionCreateSerializer(serializers.ModelSerializer):
    account_id = serializers.PrimaryKeyRelatedField(queryset=Account.objects.all(), source='account')

    class Meta:
        model = Transaction
        fields = ['account_id', 'amount', 'transaction_type', 'description']

class JournalEntryCreateSerializer(serializers.ModelSerializer):
    transactions = TransactionCreateSerializer(many=True)

    class Meta:
        model = JournalEntry
        fields = ['date', 'description', 'reference', 'transactions']
    
    def create(self, validated_data):
        transactions_data = validated_data.pop('transactions')
        with db_transaction.atomic():
            journal_entry = JournalEntry.objects.create(
                posted=False,
                created_by=self.context['request'].user,
                **validated_data
            )
            
            for tx_data in transactions_data:
                Transaction.objects.create(journal_entry=journal_entry, **tx_data)
                
            if not journal_entry.validate_balanced():
                raise serializers.ValidationError("Journal Entry is not balanced after creation. Transaction was rolled back.")

            journal_entry.posted = True
            journal_entry.save(update_fields=['posted', 'updated_at'])
            return journal_entry
    
    def validate(self, data):
        transactions = data.get('transactions', [])
        if len(transactions) < 2:
            raise serializers.ValidationError("A journal entry must have at least two transaction lines.")

        debits = sum(tx['amount'] for tx in transactions if tx['transaction_type'] == 'debit')
        credits = sum(tx['amount'] for tx in transactions if tx['transaction_type'] == 'credit')
        
        if debits != credits:
            raise serializers.ValidationError(f"Journal Entry is not balanced. Debits: {debits}, Credits: {credits}")
            
        return data

class JournalEntrySerializer(serializers.ModelSerializer):
    transactions = TransactionSerializer(many=True, read_only=True)
    
    class Meta:
        model = JournalEntry
        fields = ['id', 'date', 'description', 'reference', 'posted', 'created_at', 'transactions']

from .models import AccountingControl, AuditLog

class AccountingControlSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountingControl
        fields = ['period_lock_date', 'updated_at', 'updated_by']
        read_only_fields = ['updated_at', 'updated_by']

class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    def get_user_name(self, obj):
        return obj.user.get_full_name() if obj.user else "System"

    class Meta:
        model = AuditLog
        fields = '__all__'


# ============================================================================
# PHASE 8: CASH & BANKING SERIALIZERS
# ============================================================================

class BankStatementSerializer(serializers.ModelSerializer):
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True)
    lines_count = serializers.IntegerField(source='lines.count', read_only=True)
    matched_count = serializers.SerializerMethodField()
    
    def get_matched_count(self, obj):
        return obj.lines.filter(matched=True).count()
    
    class Meta:
        model = BankStatement
        fields = '__all__'
        read_only_fields = ('created_by', 'reconciled_by', 'reconciled_at')


class BankStatementLineSerializer(serializers.ModelSerializer):
    matched_transaction_details = serializers.SerializerMethodField()
    
    def get_matched_transaction_details(self, obj):
        if obj.matched_transaction:
            return {
                'id': obj.matched_transaction.id,
                'amount': obj.matched_transaction.amount,
                'description': obj.matched_transaction.description,
                'date': obj.matched_transaction.journal_entry.date
            }
        return None
    
    class Meta:
        model = BankStatementLine
        fields = '__all__'
        read_only_fields = ('matched_by', 'matched_at')


class FundTransferSerializer(serializers.ModelSerializer):
    from_account_name = serializers.CharField(source='from_account.name', read_only=True)
    to_account_name = serializers.CharField(source='to_account.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    
    class Meta:
        model = FundTransfer
        fields = '__all__'
        read_only_fields = ('transfer_number', 'created_by', 'approved_by', 'approved_at', 'journal_entry')


# ============================================================================
# PHASE 10: BUDGETING & CONTROLS SERIALIZERS
# ============================================================================

class BudgetLineSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)
    
    class Meta:
        model = BudgetLine
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')


class BudgetSerializer(serializers.ModelSerializer):
    lines = BudgetLineSerializer(many=True, read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    lines_count = serializers.IntegerField(source='lines.count', read_only=True)
    
    class Meta:
        model = Budget
        fields = '__all__'
        read_only_fields = ('created_by', 'created_at', 'approved_by', 'approved_at', 'updated_at')

# ============================================================================
# PHASE 13: ACCRUALS SERIALIZERS
# ============================================================================

from .models import Accrual

class AccrualSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    class Meta:
        model = Accrual
        fields = '__all__'
        read_only_fields = ('created_by', 'created_at', 'accrual_je', 'reversal_je')

class AccrualCandidateSerializer(serializers.Serializer):
    """
    Serializer for candidate accruals (uninvoiced WOs, unbilled POs).
    Not a model serializer.
    """
    type = serializers.ChoiceField(choices=['revenue', 'expense'])
    source_model = serializers.CharField()
    source_id = serializers.IntegerField()
    source_reference = serializers.CharField()
    amount = serializers.DecimalField(max_digits=15, decimal_places=2)
    date = serializers.DateField()
    description = serializers.CharField()
