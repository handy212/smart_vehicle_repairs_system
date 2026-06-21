"""Helpers for inventory / non-inventory / service catalog parts."""

from __future__ import annotations


def billing_line_type_for_part(part) -> str:
    """
    Map a catalog Part to an SVR billing document line type.

    Service catalog items bill as ``other`` (QBO still uses the linked Part Item
    when ``part`` FK is set). Physical and non-inventory parts bill as ``part``.
    """
    if getattr(part, 'item_type', None) == 'service':
        return 'other'
    return 'part'


def part_tracks_stock(part) -> bool:
    tracks = getattr(part, 'tracks_inventory', None)
    if callable(tracks):
        return bool(tracks())
    return getattr(part, 'item_type', 'inventory') == 'inventory'
