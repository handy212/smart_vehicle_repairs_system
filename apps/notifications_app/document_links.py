"""
Short, time-limited public URLs for document PDFs (WhatsApp / Meta fetch).

Primary format:  {SITE_URL}/d/{code}/
Legacy signed tokens still resolve under /api/notifications/public/documents/...
"""
from __future__ import annotations

import secrets
import string
from datetime import timedelta
from typing import Any, Optional

from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.settings_utils import get_site_url

DOCUMENT_LINK_SALT = "whatsapp-document-pdf"
DOCUMENT_LINK_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
SHORT_CODE_LENGTH = 8
# URL-safe alphabet without ambiguous characters (0/O, 1/l/I)
SHORT_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _signer() -> TimestampSigner:
    return TimestampSigner(salt=DOCUMENT_LINK_SALT)


def _generate_code(length: int = SHORT_CODE_LENGTH) -> str:
    return "".join(secrets.choice(SHORT_CODE_ALPHABET) for _ in range(length))


def build_signed_document_token(document_type: str, object_id: int) -> str:
    """Legacy signed token (kept for backward-compatible URL resolution)."""
    return _signer().sign_object({
        "document_type": document_type,
        "object_id": int(object_id),
    })


def unsign_document_token(token: str, max_age: int = DOCUMENT_LINK_MAX_AGE_SECONDS) -> dict[str, Any]:
    data = _signer().unsign_object(token, max_age=max_age)
    document_type = data.get("document_type")
    object_id = data.get("object_id")
    if document_type not in ("invoice", "estimate", "job_card") or not object_id:
        raise BadSignature("Invalid document token payload")
    return {"document_type": document_type, "object_id": int(object_id)}


def create_or_reuse_share_code(document_type: str, object_id: int) -> str:
    """Return a short code for the document, reusing a non-expired one when possible."""
    from apps.notifications_app.models import DocumentShareLink

    if document_type not in ("invoice", "estimate", "job_card"):
        raise ValueError(f"Unsupported document type: {document_type}")

    now = timezone.now()
    existing = (
        DocumentShareLink.objects.filter(
            document_type=document_type,
            object_id=int(object_id),
            expires_at__gt=now,
        )
        .order_by("-expires_at")
        .first()
    )
    if existing:
        return existing.code

    expires_at = now + timedelta(seconds=DOCUMENT_LINK_MAX_AGE_SECONDS)
    for _ in range(8):
        code = _generate_code()
        try:
            with transaction.atomic():
                DocumentShareLink.objects.create(
                    code=code,
                    document_type=document_type,
                    object_id=int(object_id),
                    expires_at=expires_at,
                )
            return code
        except IntegrityError:
            continue
    # Extremely unlikely collision streak — fall back to longer code
    code = _generate_code(12)
    DocumentShareLink.objects.create(
        code=code,
        document_type=document_type,
        object_id=int(object_id),
        expires_at=expires_at,
    )
    return code


def resolve_document_ref(token_or_code: str) -> dict[str, Any]:
    """
    Resolve either a short share code or a legacy signed token
    to {document_type, object_id}.
    """
    from apps.notifications_app.models import DocumentShareLink

    raw = (token_or_code or "").strip().strip("/")
    if not raw:
        raise BadSignature("Empty document reference")

    # Short codes are short alphanumeric — signed tokens contain ':' from TimestampSigner
    if ":" not in raw and len(raw) <= 16 and all(c in string.ascii_letters + string.digits for c in raw):
        link = DocumentShareLink.objects.filter(code=raw).first()
        if not link:
            raise BadSignature("Unknown share code")
        if link.is_expired:
            raise SignatureExpired("Share code expired")
        DocumentShareLink.objects.filter(pk=link.pk).update(access_count=link.access_count + 1)
        return {"document_type": link.document_type, "object_id": link.object_id}

    return unsign_document_token(raw)


def build_public_document_pdf_url(document_type: str, object_id: int, base_url: Optional[str] = None) -> str:
    base = (base_url or get_site_url() or "").rstrip("/")
    if not base:
        return ""
    code = create_or_reuse_share_code(document_type, object_id)
    # Short vanity path: /d/<code>/  (proxied by Next → Django)
    return f"{base}/d/{code}/"
