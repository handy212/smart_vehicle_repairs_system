"""Helpers for shop Terms & Conditions acknowledgement on approvals."""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.accounts.settings_utils import get_document_terms
from apps.accounts.terms_models import TermsAcceptance


TERMS_KEY_BY_DOCUMENT = {
    TermsAcceptance.DOCUMENT_ESTIMATE: 'estimate_terms_and_conditions',
    TermsAcceptance.DOCUMENT_WORK_ORDER: 'work_order_terms_and_conditions',
}


def get_terms_for_document(document_type: str) -> dict:
    """Return {terms_key, terms_text, document_type} for the given document type."""
    terms = get_document_terms()
    key = TERMS_KEY_BY_DOCUMENT.get(document_type, 'work_order_terms_and_conditions')
    text = (terms.get(key) or '').strip()
    # Fall back to estimate terms for WO if WO terms empty (common shared shop policy)
    if not text and document_type == TermsAcceptance.DOCUMENT_WORK_ORDER:
        key = 'estimate_terms_and_conditions'
        text = (terms.get(key) or '').strip()
    return {
        'document_type': document_type,
        'terms_key': key,
        'terms_text': text,
        'requires_acceptance': True,
    }


def parse_accepted_terms(data) -> bool:
    """Truthiness for accepted_terms from request payloads."""
    if data is None:
        return False
    if isinstance(data, dict):
        value = data.get('accepted_terms')
    else:
        value = data
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


def require_terms_acceptance(data) -> None:
    """Raise ValidationError unless accepted_terms is true."""
    if not parse_accepted_terms(data):
        raise ValidationError(
            'You must accept the Terms & Conditions before approving.'
        )


def format_terms_validation_error(exc: Exception) -> str:
    if hasattr(exc, 'messages'):
        return '; '.join(str(m) for m in exc.messages)
    detail = getattr(exc, 'detail', None)
    if detail is not None:
        return str(detail)
    message = str(exc)
    if message.startswith("['") and message.endswith("']"):
        return message[2:-2]
    return message


def _client_ip(request) -> str | None:
    if request is None:
        return None
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip() or None
    return request.META.get('REMOTE_ADDR') or None


def _user_agent(request) -> str:
    if request is None:
        return ''
    return (request.META.get('HTTP_USER_AGENT') or '')[:2000]


def resolve_acceptance_channel(*, request=None, method: str = '', is_public: bool = False) -> str:
    if is_public:
        return TermsAcceptance.CHANNEL_PUBLIC
    user = getattr(request, 'user', None) if request is not None else None
    if user is not None and getattr(user, 'is_authenticated', False):
        if getattr(user, 'role', None) == 'customer':
            return TermsAcceptance.CHANNEL_PORTAL
    method = (method or '').strip().lower()
    mapping = {
        'phone': TermsAcceptance.CHANNEL_PHONE,
        'email': TermsAcceptance.CHANNEL_EMAIL,
        'in_person': TermsAcceptance.CHANNEL_IN_PERSON,
        'text': TermsAcceptance.CHANNEL_TEXT,
        'digital': TermsAcceptance.CHANNEL_DIGITAL,
        'staff': TermsAcceptance.CHANNEL_STAFF,
    }
    if method in mapping:
        return mapping[method]
    if user is not None and getattr(user, 'is_authenticated', False):
        return TermsAcceptance.CHANNEL_STAFF
    return TermsAcceptance.CHANNEL_DIGITAL


def record_terms_acceptance(
    *,
    customer,
    document_type: str,
    request=None,
    user=None,
    work_order=None,
    estimate=None,
    method: str = '',
    is_public: bool = False,
    signature_data: str = '',
    notes: str = '',
) -> TermsAcceptance:
    """Persist a snapshot of the accepted terms for audit."""
    payload = get_terms_for_document(document_type)
    accepted_by = user
    if accepted_by is None and request is not None:
        req_user = getattr(request, 'user', None)
        if req_user is not None and getattr(req_user, 'is_authenticated', False):
            accepted_by = req_user

    return TermsAcceptance.objects.create(
        customer=customer,
        document_type=document_type,
        terms_key=payload['terms_key'],
        terms_text=payload['terms_text'] or '(No terms text configured at time of acceptance)',
        accepted=True,
        accepted_at=timezone.now(),
        acceptance_channel=resolve_acceptance_channel(
            request=request, method=method, is_public=is_public
        ),
        accepted_by_user=accepted_by,
        work_order=work_order,
        estimate=estimate,
        ip_address=_client_ip(request),
        user_agent=_user_agent(request),
        signature_data=(signature_data or '')[:500_000],
        notes=(notes or '')[:5000],
    )


def enforce_and_record_approval_terms(
    *,
    request,
    customer,
    document_type: str,
    work_order=None,
    estimate=None,
    method: str = '',
    is_public: bool = False,
) -> TermsAcceptance:
    """Validate accepted_terms from the request and persist the acceptance record."""
    data = getattr(request, 'data', {}) or {}
    require_terms_acceptance(data)
    signature_data = data.get('signature_data') or data.get('signature') or ''
    notes = data.get('approval_notes') or data.get('notes') or ''
    return record_terms_acceptance(
        customer=customer,
        document_type=document_type,
        request=request,
        user=getattr(request, 'user', None) if not is_public else None,
        work_order=work_order,
        estimate=estimate,
        method=method,
        is_public=is_public,
        signature_data=signature_data if isinstance(signature_data, str) else '',
        notes=notes if isinstance(notes, str) else '',
    )
