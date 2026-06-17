"""Atomic fiscal-year document numbering for accounting documents."""
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.accounting.models import AccountingControl, DocumentNumberSequence


class DocumentNumberService:
    PREFIXES = {
        'invoice': 'INV',
        'credit_note': 'CN',
        'payment': 'PAY',
        'bill': 'BILL',
        'vendor_credit': 'VC',
        'sales_order': 'SO',
    }

    @classmethod
    def _assert_not_locked(cls, document_date):
        controls = AccountingControl.get_settings()
        if controls.period_lock_date and document_date <= controls.period_lock_date:
            raise ValidationError(
                f"Accounting period is locked through {controls.period_lock_date}. "
                "Cannot allocate document numbers for locked periods."
            )

    @classmethod
    def allocate(cls, document_type, branch, document_date=None):
        """
        Allocate the next document number atomically.

        Format: {PREFIX}-{YYYY}-{branch_code}-{seq:06}
        Example: INV-2026-HQ-000042
        """
        if document_type not in cls.PREFIXES:
            raise ValidationError(f"Unsupported document type: {document_type}")
        if branch is None:
            raise ValidationError("Branch is required for document numbering.")

        doc_date = document_date or timezone.now().date()
        if hasattr(doc_date, 'date') and callable(doc_date.date):
            doc_date = doc_date.date()

        cls._assert_not_locked(doc_date)
        fiscal_year = doc_date.year
        branch_code = (branch.code or 'HQ').upper()
        prefix = cls.PREFIXES[document_type]

        with transaction.atomic():
            sequence, _created = DocumentNumberSequence.objects.select_for_update().get_or_create(
                document_type=document_type,
                branch=branch,
                fiscal_year=fiscal_year,
                defaults={'last_sequence': 0},
            )
            sequence.last_sequence += 1
            sequence.save(update_fields=['last_sequence', 'updated_at'])
            return f"{prefix}-{fiscal_year}-{branch_code}-{sequence.last_sequence:06d}"
