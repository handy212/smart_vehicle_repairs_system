"""Tests for QBO OAuth state persistence."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.quickbooks_online.models import QBOOAuthState
from apps.quickbooks_online.oauth_state import (
    consume_oauth_state,
    persist_oauth_state,
    resolve_oauth_state,
)

User = get_user_model()


class OAuthStateTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(
            username='qbo-admin',
            email='qbo@example.com',
            password='test-pass',
        )
        self.other = User.objects.create_user(
            username='other',
            email='other@example.com',
            password='test-pass',
        )

    def test_persist_and_resolve_oauth_state(self):
        persist_oauth_state(
            state_token='state-abc',
            redirect_uri='https://app.example.com/api/quickbooks/callback/',
            user=self.user,
        )
        redirect_uri, row = resolve_oauth_state('state-abc', self.user, None)
        self.assertEqual(redirect_uri, 'https://app.example.com/api/quickbooks/callback/')
        self.assertIsInstance(row, QBOOAuthState)

    def test_rejects_wrong_user(self):
        persist_oauth_state(
            state_token='state-xyz',
            redirect_uri='https://app.example.com/api/quickbooks/callback/',
            user=self.user,
        )
        redirect_uri, row = resolve_oauth_state('state-xyz', self.other, None)
        self.assertIsNone(redirect_uri)
        self.assertIsNone(row)

    def test_session_fallback_when_db_missing(self):
        redirect_uri, marker = resolve_oauth_state('sess-state', self.user, 'sess-state')
        self.assertIsNone(redirect_uri)
        self.assertEqual(marker, 'session')

    def test_consume_marks_state_used(self):
        persist_oauth_state(
            state_token='state-use-once',
            redirect_uri='https://app.example.com/api/quickbooks/callback/',
            user=self.user,
        )
        _, row = resolve_oauth_state('state-use-once', self.user, None)
        consume_oauth_state(row)
        row.refresh_from_db()
        self.assertIsNotNone(row.consumed_at)
        redirect_uri, again = resolve_oauth_state('state-use-once', self.user, None)
        self.assertIsNone(redirect_uri)

    def test_cleanup_expired(self):
        QBOOAuthState.objects.create(
            state_token='old',
            redirect_uri='https://example.com/callback/',
            user=self.user,
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        QBOOAuthState.cleanup_expired()
        self.assertFalse(QBOOAuthState.objects.filter(state_token='old').exists())
