"""Cache helpers for QuickBooks connection status."""

from __future__ import annotations

from django.core.cache import cache


def api_ready_cache_key(config_id: int) -> str:
    return f'qbo:api-ready:{config_id}'


def clear_api_ready_cache(config_id: int | None) -> None:
    if config_id:
        cache.delete(api_ready_cache_key(config_id))
