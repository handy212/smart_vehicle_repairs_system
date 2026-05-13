from rest_framework import serializers
from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from .services import AccountingService
from apps.branches.utils import resolve_branch
from apps.branches.models import Branch
from .models import (
    Account, JournalEntry, Transaction, AccountingControl, AuditLog,
    BankStatement, BankStatementLine, FundTransfer,
    Budget, BudgetLine
)


def _request_has_branch_hint(request):
    return bool(
        request.query_params.get('branch')
        or request.query_params.get('branch_id')
        or request.headers.get('X-Branch-ID')
        or request.META.get('HTTP_X_BRANCH_ID')
        or request.headers.get('X_BRANCH_ID')
        or (getattr(request, 'session', None) and request.session.get('active_branch_id'))
    )


def _user_can_use_branch(user, branch):
    return bool(user.is_superuser or user.has_branch_access(branch))

class AccountSimpleSerializer(serializers.ModelSerializer):
    balance = serializers.SerializerMethodField()
    
    class Meta:
        model = Account
        fields = ['id', 'code', 'name', 'account_type', 'balance_type', 'is_active', 'balance']
    
    def get_balance(self, obj):
        """Ending balance through today from posted journals only."""
        from django.utils import timezone
        from .services import ReportingService

        return float(
            ReportingService.get_account_balance(obj, date=timezone.now().date())
        )

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


class GeneralLedgerLineSerializer(serializers.ModelSerializer):
    """Posted journal lines for general ledger drill-down."""

    journal_entry_id = serializers.IntegerField(source='journal_entry.id', read_only=True)
    date = serializers.DateField(source='journal_entry.date', read_only=True)
    reference = serializers.CharField(source='journal_entry.reference', read_only=True)
    posted = serializers.BooleanField(source='journal_entry.posted', read_only=True)
    branch_id = serializers.IntegerField(
        source='journal_entry.branch_id', read_only=True, allow_null=True
    )
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)

    class Meta:
        model = Transaction
        fields = [
            'id',
            'journal_entry_id',
            'date',
            'reference',
            'posted',
            'branch_id',
            'account_code',
            'account_name',
            'amount',
            'transaction_type',
            'description',
        ]

class TransactionCreateSerializer(serializers.ModelSerializer):
    account_id = serializers.PrimaryKeyRelatedField(queryset=Account.objects.all(), source='account')

    class Meta:
        model = Transaction
        fields = ['account_id', 'amount', 'transaction_type', 'description']

class JournalEntryCreateSerializer(serializers.ModelSerializer):
    transactions = TransactionCreateSerializer(many=True)
    branch = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = JournalEntry
        fields = ['date', 'description', 'reference', 'branch', 'transactions']
    
    def create(self, validated_data):
        transactions_data = validated_data.pop('transactions')
        lines = [
            {
                'account_id': tx_data['account'].id,
                'type': tx_data['transaction_type'],
                'amount': tx_data['amount'],
                'description': tx_data.get('description', ''),
            }
            for tx_data in transactions_data
        ]

        try:
            with transaction.atomic():
                request = self.context.get('request')
                branch = validated_data.get('branch')
                if branch is None and request is not None:
                    is_global_user = (
                        request.user.is_superuser
                        or getattr(request.user, 'role', None) == 'super-admin'
                    )
                    if not is_global_user or _request_has_branch_hint(request):
                        branch = resolve_branch(request)

                return AccountingService.create_journal_entry(
                    user=self.context['request'].user,
                    date=validated_data['date'],
                    description=validated_data['description'],
                    reference=validated_data.get('reference', ''),
                    lines=lines,
                    posted=True,
                    branch=branch,
                )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages if hasattr(exc, 'messages') else str(exc))
    
    def validate(self, data):
        # Validation logic to ensure credits == debits
        transactions = data.get('transactions', [])
        debits = sum(tx['amount'] for tx in transactions if tx['transaction_type'] == 'debit')
        credits = sum(tx['amount'] for tx in transactions if tx['transaction_type'] == 'credit')
        
        if debits != credits:
            raise serializers.ValidationError(f"Journal Entry is not balanced. Debits: {debits}, Credits: {credits}")

        request = self.context.get('request')
        branch = data.get('branch')
        if branch is not None and request is not None:
            user = request.user
            if not _user_can_use_branch(user, branch):
                raise serializers.ValidationError({'branch': 'You do not have access to this branch.'})
            
        return data

class JournalEntrySerializer(serializers.ModelSerializer):
    transactions = TransactionSerializer(many=True, read_only=True)
    branch_id = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = JournalEntry
        fields = ['id', 'date', 'description', 'reference', 'posted', 'branch_id', 'created_at', 'transactions']


class JournalEntryReverseSerializer(serializers.Serializer):
    date = serializers.DateField(required=False)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)


class PeriodCloseSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    branch = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.all(),
        required=False,
        allow_null=True,
    )

    def validate(self, data):
        if data['start_date'] > data['end_date']:
            raise serializers.ValidationError({'end_date': 'End date must be on or after start date.'})
        request = self.context.get('request')
        branch = data.get('branch')
        if request and branch and not _user_can_use_branch(request.user, branch):
            raise serializers.ValidationError({'branch': 'You do not have access to this branch.'})
        return data

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
        read_only_fields = ('created_by', 'reconciled', 'reconciled_by', 'reconciled_at')

    def validate(self, attrs):
        if self.instance and self.instance.reconciled:
            protected_fields = {'bank_account', 'statement_date', 'opening_balance', 'closing_balance'}
            if protected_fields.intersection(attrs):
                raise serializers.ValidationError('Cannot edit accounting details of a reconciled statement.')
        return attrs


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
        read_only_fields = ('matched', 'matched_transaction', 'matched_by', 'matched_at')

    def validate(self, attrs):
        statement = attrs.get('bank_statement') or getattr(self.instance, 'bank_statement', None)
        if statement and statement.reconciled:
            raise serializers.ValidationError('Cannot edit lines on a reconciled statement.')
        debit = attrs.get('debit_amount', getattr(self.instance, 'debit_amount', None))
        credit = attrs.get('credit_amount', getattr(self.instance, 'credit_amount', None))
        if debit is not None and credit is not None:
            if (debit > 0 and credit > 0) or (debit == 0 and credit == 0):
                raise serializers.ValidationError('Statement line must have exactly one debit or credit amount.')
        return attrs


class FundTransferSerializer(serializers.ModelSerializer):
    from_account_name = serializers.CharField(source='from_account.name', read_only=True)
    to_account_name = serializers.CharField(source='to_account.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    
    class Meta:
        model = FundTransfer
        fields = '__all__'
        read_only_fields = ('transfer_number', 'status', 'created_by', 'approved_by', 'approved_at', 'journal_entry')

    def validate(self, attrs):
        from_account = attrs.get('from_account', getattr(self.instance, 'from_account', None))
        to_account = attrs.get('to_account', getattr(self.instance, 'to_account', None))
        if from_account and to_account and from_account == to_account:
            raise serializers.ValidationError('Source and destination accounts must be different.')
        if self.instance and self.instance.status == 'completed':
            raise serializers.ValidationError('Completed transfers cannot be edited.')
        return attrs


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

    def validate(self, attrs):
        request = self.context.get('request')
        budget = attrs.get('budget', getattr(self.instance, 'budget', None))
        if request and budget and budget.branch and not _user_can_use_branch(request.user, budget.branch):
            raise serializers.ValidationError({'budget': 'You do not have access to this budget branch.'})
        return attrs


class BudgetSerializer(serializers.ModelSerializer):
    lines = BudgetLineSerializer(many=True, read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    lines_count = serializers.IntegerField(source='lines.count', read_only=True)
    
    class Meta:
        model = Budget
        fields = '__all__'
        read_only_fields = ('status', 'created_by', 'created_at', 'approved_by', 'approved_at', 'updated_at')

    def validate(self, attrs):
        request = self.context.get('request')
        branch = attrs.get('branch', getattr(self.instance, 'branch', None))
        if request and branch and not _user_can_use_branch(request.user, branch):
            raise serializers.ValidationError({'branch': 'You do not have access to this branch.'})
        return attrs

# ============================================================================
# PHASE 13: ACCRUALS SERIALIZERS
# ============================================================================

from .models import Accrual

class AccrualSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    
    class Meta:
        model = Accrual
        fields = '__all__'
        read_only_fields = ('branch', 'status', 'created_by', 'created_at', 'accrual_je', 'reversal_je')

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
