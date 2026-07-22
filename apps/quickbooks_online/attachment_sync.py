"""Attach invoice/estimate PDFs to synced QuickBooks transactions."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

try:
    from quickbooks.objects.attachable import Attachable
    from quickbooks.objects.attachable import AttachableRef
    from quickbooks.objects.base import Ref
except ModuleNotFoundError:
    Attachable = None
    AttachableRef = None
    Ref = None


def _pdf_bytes_for_invoice(local_invoice) -> tuple[bytes, str] | None:
    try:
        from apps.core.services.print_service import generate_invoice_pdf

        response = generate_invoice_pdf(local_invoice, branch=local_invoice.branch)
        content = getattr(response, 'content', None)
        if not content:
            return None
        filename = f'invoice_{local_invoice.invoice_number}.pdf'
        return content, filename
    except Exception as exc:
        logger.warning('Could not render invoice PDF for QBO attachment: %s', exc)
        return None


def _pdf_bytes_for_estimate(local_estimate) -> tuple[bytes, str] | None:
    try:
        from apps.core.services.print_service import generate_estimate_pdf

        response = generate_estimate_pdf(local_estimate, branch=local_estimate.branch)
        content = getattr(response, 'content', None)
        if not content:
            return None
        filename = f'estimate_{local_estimate.estimate_number}.pdf'
        return content, filename
    except Exception as exc:
        logger.warning('Could not render estimate PDF for QBO attachment: %s', exc)
        return None


def _existing_attachment_for_entity(client, *, qbo_entity_type: str, qbo_entity_id: str, filename: str):
    """Return an existing Attachable with the same filename for this entity, if any."""
    if Attachable is None or not client or not filename:
        return None
    safe_name = str(filename).replace("'", "\\'")[:100]
    try:
        rows = Attachable.query(
            f"SELECT * FROM Attachable WHERE FileName = '{safe_name}' MAXRESULTS 20",
            qb=client,
        )
    except Exception as exc:
        logger.debug('Could not query QBO attachables for %s: %s', filename, exc)
        return None

    entity_id = str(qbo_entity_id)
    entity_type = (qbo_entity_type or '').lower()
    for row in rows or []:
        refs = getattr(row, 'AttachableRef', None) or []
        if not isinstance(refs, (list, tuple)):
            refs = [refs]
        for ref in refs:
            entity_ref = getattr(ref, 'EntityRef', None)
            if entity_ref is None:
                continue
            ref_type = (getattr(entity_ref, 'type', None) or getattr(entity_ref, 'Type', None) or '').lower()
            ref_value = str(getattr(entity_ref, 'value', None) or getattr(entity_ref, 'Value', None) or '')
            if ref_type == entity_type and ref_value == entity_id:
                return row
    return None


def attach_pdf_to_qbo_entity(
    service,
    *,
    qbo_entity_type: str,
    qbo_entity_id: str,
    pdf_bytes: bytes,
    filename: str,
    replace_existing: bool = False,
):
    """
    Upload a PDF attachable linked to a QBO Invoice or Estimate.

    Skips upload when the same filename is already linked (idempotent), unless
    ``replace_existing`` is True.
    """
    if Attachable is None or AttachableRef is None or Ref is None:
        logger.debug('QuickBooks SDK unavailable for attachments')
        return None

    client = service.get_client()
    if not client:
        return None

    existing = _existing_attachment_for_entity(
        client,
        qbo_entity_type=qbo_entity_type,
        qbo_entity_id=qbo_entity_id,
        filename=filename,
    )
    if existing and not replace_existing:
        logger.debug(
            'QBO attachment already present for %s %s (%s)',
            qbo_entity_type,
            qbo_entity_id,
            filename,
        )
        return existing

    attachable = Attachable()
    attachable.FileName = filename[:100]
    attachable.ContentType = 'application/pdf'
    attachable._FileBytes = pdf_bytes  # noqa: SLF001 — SDK upload contract

    ref = AttachableRef()
    ref.EntityRef = Ref()
    ref.EntityRef.type = qbo_entity_type
    ref.EntityRef.value = str(qbo_entity_id)
    ref.IncludeOnSend = False
    attachable.AttachableRef = [ref]

    try:
        return attachable.save(qb=client)
    except Exception as exc:
        logger.warning(
            'QBO attachment upload failed for %s %s: %s',
            qbo_entity_type,
            qbo_entity_id,
            exc,
        )
        return None


def _pdf_bytes_for_credit_note(local_credit_note) -> tuple[bytes, str] | None:
    try:
        from apps.core.services.print_service import generate_credit_note_pdf

        response = generate_credit_note_pdf(
            local_credit_note,
            branch=getattr(local_credit_note, 'branch', None),
        )
        content = getattr(response, 'content', None)
        if not content:
            return None
        filename = f'credit_note_{local_credit_note.credit_note_number}.pdf'
        return content, filename
    except Exception as exc:
        logger.warning('Could not render credit note PDF for QBO attachment: %s', exc)
        return None


def sync_invoice_attachment(service, local_invoice, qb_invoice_id: str, *, force: bool = False):
    payload = _pdf_bytes_for_invoice(local_invoice)
    if not payload:
        return None
    pdf_bytes, filename = payload
    return attach_pdf_to_qbo_entity(
        service,
        qbo_entity_type='Invoice',
        qbo_entity_id=qb_invoice_id,
        pdf_bytes=pdf_bytes,
        filename=filename,
        replace_existing=force,
    )


def sync_estimate_attachment(service, local_estimate, qb_estimate_id: str, *, force: bool = False):
    payload = _pdf_bytes_for_estimate(local_estimate)
    if not payload:
        return None
    pdf_bytes, filename = payload
    return attach_pdf_to_qbo_entity(
        service,
        qbo_entity_type='Estimate',
        qbo_entity_id=qb_estimate_id,
        pdf_bytes=pdf_bytes,
        filename=filename,
        replace_existing=force,
    )


def sync_credit_note_attachment(service, local_credit_note, qb_credit_memo_id: str, *, force: bool = False):
    payload = _pdf_bytes_for_credit_note(local_credit_note)
    if not payload:
        return None
    pdf_bytes, filename = payload
    return attach_pdf_to_qbo_entity(
        service,
        qbo_entity_type='CreditMemo',
        qbo_entity_id=qb_credit_memo_id,
        pdf_bytes=pdf_bytes,
        filename=filename,
        replace_existing=force,
    )
