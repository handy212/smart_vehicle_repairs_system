"""Tests for QBO webhook signature verification."""

from django.test import TestCase, override_settings

from apps.quickbooks_online.webhook_security import (
    verify_qbo_webhook_signature,
    webhook_signature_accepted,
)


class WebhookSecurityTests(TestCase):
    def test_valid_signature(self):
        token = 'verifier-secret'
        payload = b'{"eventNotifications":[]}'
        import base64
        import hashlib
        import hmac

        digest = base64.b64encode(
            hmac.new(token.encode(), payload, hashlib.sha256).digest()
        ).decode()

        self.assertTrue(
            verify_qbo_webhook_signature(
                payload_bytes=payload,
                signature_header=digest,
                webhook_token=token,
            )
        )

    def test_rejects_invalid_signature_when_token_configured(self):
        accepted, reason = webhook_signature_accepted(
            payload_bytes=b'{}',
            signature_header='not-valid',
            webhook_token='secret',
            require_signatures=False,
            debug=True,
        )
        self.assertFalse(accepted)
        self.assertEqual(reason, 'Invalid signature')

    def test_rejects_spoofed_signature_without_token_even_in_debug(self):
        accepted, reason = webhook_signature_accepted(
            payload_bytes=b'{}',
            signature_header='fake-signature',
            webhook_token='',
            require_signatures=False,
            debug=True,
        )
        self.assertFalse(accepted)
        self.assertEqual(reason, 'Invalid signature')

    @override_settings(DEBUG=True)
    def test_accepts_unsigned_only_in_debug_without_token(self):
        accepted, reason = webhook_signature_accepted(
            payload_bytes=b'{}',
            signature_header='',
            webhook_token='',
            require_signatures=False,
            debug=True,
        )
        self.assertTrue(accepted)
        self.assertIsNone(reason)

    def test_rejects_unsigned_outside_debug(self):
        accepted, reason = webhook_signature_accepted(
            payload_bytes=b'{}',
            signature_header='',
            webhook_token='',
            require_signatures=False,
            debug=False,
        )
        self.assertFalse(accepted)
        self.assertEqual(reason, 'Invalid signature')
