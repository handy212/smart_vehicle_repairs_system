"""OAuth state persistence helpers for QuickBooks connect/callback."""

from __future__ import annotations

import logging
from datetime import timedelta

from django.utils import timezone

from .models import QBOOAuthState

logger = logging.getLogger(__name__)

OAUTH_STATE_TTL_MINUTES = 15


def persist_oauth_state(*, state_token: str, redirect_uri: str, user) -> None:
    QBOOAuthState.cleanup_expired()
    # One active flow per user — prevents state table growth and confusion.
    QBOOAuthState.objects.filter(user=user, consumed_at__isnull=True).delete()
    QBOOAuthState.objects.create(
        state_token=state_token,
        redirect_uri=redirect_uri,
        user=user,
        expires_at=timezone.now() + timedelta(minutes=OAUTH_STATE_TTL_MINUTES),
    )


def resolve_oauth_state(state_token: str | None, user, session_state: str | None):
    """
    Validate OAuth state from DB (preferred) or session fallback.

    Returns (redirect_uri, oauth_state_row) or (None, None) when invalid.
    """
    if not state_token:
        return None, None

    oauth_state = (
        QBOOAuthState.objects.filter(
            state_token=state_token,
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .select_related('user')
        .first()
    )
    if oauth_state:
        if oauth_state.user_id != user.id:
            logger.warning(
                'QBO OAuth state user mismatch (state user=%s, callback user=%s)',
                oauth_state.user_id,
                user.id,
            )
            return None, None
        return oauth_state.redirect_uri, oauth_state

    if session_state and state_token == session_state:
        return None, 'session'

    return None, None


def consume_oauth_state(oauth_state) -> None:
    if oauth_state is None or oauth_state == 'session':
        return
    if not oauth_state.consumed_at:
        oauth_state.consumed_at = timezone.now()
        oauth_state.save(update_fields=['consumed_at'])


def invalidate_oauth_state(state_token: str | None) -> None:
    """Mark a state token used so it cannot be replayed."""
    if not state_token:
        return
    QBOOAuthState.objects.filter(
        state_token=state_token,
        consumed_at__isnull=True,
    ).update(consumed_at=timezone.now())
