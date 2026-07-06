"""QuickBooks webhook signature verification helpers."""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging

logger = logging.getLogger(__name__)


def verify_qbo_webhook_signature(
    *,
    payload_bytes: bytes,
    signature_header: str,
    webhook_token: str,
) -> bool:
    """Return True when the intuit-signature header matches the payload."""
    if not webhook_token or not signature_header:
        return False

    expected = hmac.new(
        webhook_token.encode('utf-8'),
        payload_bytes,
        hashlib.sha256,
    ).digest()
    expected_b64 = base64.b64encode(expected).decode('utf-8')
    return hmac.compare_digest(signature_header, expected_b64)


def webhook_signature_accepted(
    *,
    payload_bytes: bytes,
    signature_header: str,
    webhook_token: str,
    require_signatures: bool,
    debug: bool,
) -> tuple[bool, str | None]:
    """
    Decide whether an inbound QBO webhook should be processed.

    Returns (accepted, rejection_reason).
    """
    signature = (signature_header or '').strip()

    if webhook_token:
        if not signature:
            logger.warning('QBO webhook rejected: missing intuit-signature header.')
            return False, 'Missing signature'
        if not verify_qbo_webhook_signature(
            payload_bytes=payload_bytes,
            signature_header=signature,
            webhook_token=webhook_token,
        ):
            logger.warning('QBO webhook rejected: invalid signature.')
            return False, 'Invalid signature'
        return True, None

    if signature:
        # A signature was sent but we cannot verify it — never accept.
        logger.warning(
            'QBO webhook rejected: signature provided but quickbooks_webhook_token is not configured.'
        )
        return False, 'Invalid signature'

    if require_signatures:
        logger.warning('QBO webhook rejected: quickbooks_webhook_token not configured.')
        return False, 'Webhook verification token required'

    if debug:
        logger.warning(
            'QBO webhook: accepting unsigned payload in DEBUG mode '
            '(configure quickbooks_webhook_token for signature verification).'
        )
        return True, None

    logger.warning('QBO webhook rejected: unsigned payload outside DEBUG mode.')
    return False, 'Invalid signature'
