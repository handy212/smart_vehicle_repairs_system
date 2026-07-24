"""Atomic document numbering for accounting documents."""
import re

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.accounting.models import AccountingControl, DocumentNumberSequence

# {PREFIX}-{branch_code}-{seq:06} — year omitted so numbers stay short for QBO DocNumber (21 max).
DOCUMENT_NUMBER_MAX_LENGTH = 32

# Customers use a global short id (C1, C2, …). Other docs use a perpetual branch sequence.
_PERPETUAL_YEAR = 0
_CUSTOMER_GLOBAL_YEAR = 0
_CUSTOMER_NUMBER_RE = re.compile(r'^C(\d+)$')


class DocumentNumberService:
    PREFIXES = {
        'invoice': 'INV',
        'credit_note': 'CN',
        'payment': 'PAY',
        'bill': 'BILL',
        'vendor_credit': 'VC',
        'sales_order': 'SO',
        'customer': 'C',
    }

    # Customer numbers are identifiers, not GL documents — never block on period lock.
    SKIP_PERIOD_LOCK = frozenset({'customer'})

    @classmethod
    def _assert_not_locked(cls, document_date):
        controls = AccountingControl.get_settings()
        if controls.period_lock_date and document_date <= controls.period_lock_date:
            raise ValidationError(
                f"Accounting period is locked through {controls.period_lock_date}. "
                "Cannot allocate document numbers for locked periods."
            )

    @classmethod
    def _max_existing_customer_seq(cls) -> int:
        """Highest numeric suffix among existing short customer numbers (C123)."""
        from apps.customers.models import Customer

        max_n = 0
        for raw in Customer.objects.filter(customer_number__startswith='C').values_list(
            'customer_number', flat=True
        ):
            match = _CUSTOMER_NUMBER_RE.match(raw or '')
            if match:
                max_n = max(max_n, int(match.group(1)))
        return max_n

    @classmethod
    def allocate_customer_number(cls, branch=None) -> str:
        """
        Allocate the next customer number: C1, C2, C3, …

        Global sequence (not per year / branch). Branch is only used to satisfy
        DocumentNumberSequence's FK; HQ (or first active) is preferred.
        """
        branch = resolve_numbering_branch(branch)
        if branch is None:
            raise ValidationError(
                "Cannot assign a customer number without an active branch. "
                "Create a branch first."
            )

        with transaction.atomic():
            sequence, _created = DocumentNumberSequence.objects.select_for_update().get_or_create(
                document_type='customer',
                branch=branch,
                fiscal_year=_CUSTOMER_GLOBAL_YEAR,
                defaults={'last_sequence': 0},
            )
            floor = cls._max_existing_customer_seq()
            if sequence.last_sequence < floor:
                sequence.last_sequence = floor
            sequence.last_sequence += 1
            sequence.save(update_fields=['last_sequence', 'updated_at'])
            return f"C{sequence.last_sequence}"

    @classmethod
    def _seed_floor_for_branch_sequence(cls, document_type: str, branch) -> int:
        """
        Highest sequence already used for this type/branch (legacy yearly rows +
        numbers already on documents), so perpetual numbering never reuses a value.
        """
        legacy_max = (
            DocumentNumberSequence.objects.filter(
                document_type=document_type,
                branch=branch,
            ).aggregate(m=Max('last_sequence'))['m']
            or 0
        )
        return max(legacy_max, cls._max_existing_document_seq(document_type, branch))

    @classmethod
    def _max_existing_document_seq(cls, document_type: str, branch) -> int:
        """Parse existing document numbers for this prefix/branch and return max seq."""
        prefix = cls.PREFIXES.get(document_type)
        if not prefix or branch is None:
            return 0
        branch_code = (branch.code or 'HQ').upper()
        # Match both new INV-ACC-000001 and legacy INV-2026-ACC-000001.
        pattern = re.compile(
            rf'^{re.escape(prefix)}-(?:\d{{4}}-)?{re.escape(branch_code)}-(\d+)$',
            re.IGNORECASE,
        )

        values = []
        if document_type == 'invoice':
            from apps.billing.models import Invoice
            values = Invoice.objects.filter(
                branch=branch,
                invoice_number__startswith=f'{prefix}-',
            ).values_list('invoice_number', flat=True)
        elif document_type == 'payment':
            from apps.billing.models import Payment
            values = Payment.objects.filter(
                payment_number__startswith=f'{prefix}-',
            ).values_list('payment_number', flat=True)
            # Payments may not have branch FK on number alone; filter in Python via pattern.
        elif document_type == 'credit_note':
            from apps.billing.models import CreditNote
            values = CreditNote.objects.filter(
                branch=branch,
                credit_note_number__startswith=f'{prefix}-',
            ).values_list('credit_note_number', flat=True)
        elif document_type == 'bill':
            from apps.billing.models import Bill
            values = Bill.objects.filter(
                branch=branch,
                bill_number__startswith=f'{prefix}-',
            ).values_list('bill_number', flat=True)
        elif document_type == 'vendor_credit':
            from apps.billing.models import VendorCredit
            values = VendorCredit.objects.filter(
                credit_number__startswith=f'{prefix}-',
            ).values_list('credit_number', flat=True)
        elif document_type == 'sales_order':
            from apps.billing.models import SalesOrder
            values = SalesOrder.objects.filter(
                branch=branch,
                sales_order_number__startswith=f'{prefix}-',
            ).values_list('sales_order_number', flat=True)

        max_n = 0
        for raw in values:
            match = pattern.match(raw or '')
            if match:
                max_n = max(max_n, int(match.group(1)))
        return max_n

    @classmethod
    def allocate(cls, document_type, branch, document_date=None):
        """
        Allocate the next document number atomically.

        Customers: C{n} (global short sequence).
        Other types: {PREFIX}-{branch_code}-{seq:06}
        Example: INV-ACC-000042
        """
        if document_type == 'customer':
            return cls.allocate_customer_number(branch)

        if document_type not in cls.PREFIXES:
            raise ValidationError(f"Unsupported document type: {document_type}")
        if branch is None:
            raise ValidationError("Branch is required for document numbering.")

        doc_date = document_date or timezone.now().date()
        if hasattr(doc_date, 'date') and callable(doc_date.date):
            doc_date = doc_date.date()

        if document_type not in cls.SKIP_PERIOD_LOCK:
            cls._assert_not_locked(doc_date)
        branch_code = (branch.code or 'HQ').upper()
        prefix = cls.PREFIXES[document_type]

        with transaction.atomic():
            sequence, created = DocumentNumberSequence.objects.select_for_update().get_or_create(
                document_type=document_type,
                branch=branch,
                fiscal_year=_PERPETUAL_YEAR,
                defaults={'last_sequence': 0},
            )
            floor = cls._seed_floor_for_branch_sequence(document_type, branch)
            if sequence.last_sequence < floor:
                sequence.last_sequence = floor
            sequence.last_sequence += 1
            sequence.save(update_fields=['last_sequence', 'updated_at'])
            return f"{prefix}-{branch_code}-{sequence.last_sequence:06d}"


def resolve_numbering_branch(explicit=None):
    """Return the branch to use for customer/document numbering."""
    if explicit is not None:
        return explicit

    from apps.branches.models import Branch

    return (
        Branch.objects.filter(is_active=True, is_headquarters=True).first()
        or Branch.objects.filter(is_active=True).order_by('name').first()
    )
