import re
from datetime import timedelta
from difflib import SequenceMatcher
from typing import Iterable, List, Optional, Union

from django.utils import timezone

from .models import WorkOrder


def _normalize_issue_text(text: Optional[str]) -> str:
    """Return a simplified version of the concern text for similarity checks."""
    if not text:
        return ""

    normalized = text.lower()
    normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def find_repeat_workorders(
    vehicle: Union[int, "Vehicle"],
    concern_text: Optional[str],
    *,
    exclude_ids: Optional[Iterable[int]] = None,
    lookback_days: Optional[int] = 365,
    similarity_threshold: float = 0.72,
    limit: int = 25,
) -> List[dict]:
    """
    Find recent work orders for a vehicle that report a similar customer concern.

    Args:
        vehicle: Vehicle instance or ID to match.
        concern_text: The customer concern text to compare against historical work orders.
        exclude_ids: Work order IDs that should be excluded from the result (e.g. the newly created one).
        lookback_days: Optional number of days to look back when searching. Use ``None`` to search all history.
        similarity_threshold: ``SequenceMatcher`` ratio threshold (0-1) required to consider two concerns similar.
        limit: Maximum number of historical work orders to inspect.

    Returns:
        A list of dictionaries containing repeat work order metadata. Each dict includes keys:
        ``id``, ``work_order_number``, ``created_at``, ``customer_concerns``, ``similarity``.
    """

    normalized_target = _normalize_issue_text(concern_text)
    if not normalized_target:
        return []

    # Base queryset scoped to the vehicle.
    if hasattr(vehicle, "pk"):
        queryset = WorkOrder.objects.filter(vehicle=vehicle)
    else:
        queryset = WorkOrder.objects.filter(vehicle_id=vehicle)

    if exclude_ids:
        queryset = queryset.exclude(id__in=list(exclude_ids))

    if lookback_days:
        cutoff = timezone.now() - timedelta(days=lookback_days)
        queryset = queryset.filter(created_at__gte=cutoff)

    candidates = queryset.order_by("-created_at")[:limit]

    repeat_matches: List[dict] = []
    for work_order in candidates:
        comparison_text = _normalize_issue_text(work_order.customer_concerns)
        if not comparison_text:
            continue

        similarity = SequenceMatcher(None, normalized_target, comparison_text).ratio()
        if similarity >= similarity_threshold:
            repeat_matches.append(
                {
                    "id": work_order.id,
                    "work_order_number": work_order.work_order_number,
                    "created_at": work_order.created_at,
                    "customer_concerns": work_order.customer_concerns,
                    "similarity": round(similarity, 3),
                }
            )

    return repeat_matches


