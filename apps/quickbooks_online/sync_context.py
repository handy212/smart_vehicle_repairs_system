"""Context flags for suppressing outbound QBO signals during inbound import."""
from __future__ import annotations

import contextvars

_outbound_suppressed = contextvars.ContextVar('qbo_outbound_suppressed', default=False)
_item_qty_sync_suppressed = contextvars.ContextVar('qbo_item_qty_sync_suppressed', default=False)


def outbound_signals_suppressed() -> bool:
    return bool(_outbound_suppressed.get())


def item_qty_sync_suppressed() -> bool:
    return bool(_item_qty_sync_suppressed.get())


class suppress_outbound_qbo_signals:
    """Prevent post_save handlers from pushing entities back to QBO during inbound pull."""

    def __enter__(self):
        self._token = _outbound_suppressed.set(True)
        return self

    def __exit__(self, exc_type, exc, tb):
        _outbound_suppressed.reset(self._token)
        return False


class suppress_qbo_item_qty_sync:
    """Skip Item QtyOnHand overwrite; inventory adjustment documents own the QBO qty delta."""

    def __enter__(self):
        self._token = _item_qty_sync_suppressed.set(True)
        return self

    def __exit__(self, exc_type, exc, tb):
        _item_qty_sync_suppressed.reset(self._token)
        return False
