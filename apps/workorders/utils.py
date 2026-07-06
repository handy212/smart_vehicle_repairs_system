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


def get_recent_completed_work_orders(vehicle, days=30):
    """
    Get recently completed work orders for a vehicle within the specified days.
    
    Args:
        vehicle: Vehicle instance or ID
        days: Number of days to look back (default 30)
    
    Returns:
        QuerySet of completed work orders ordered by completion date descending
    """
    from apps.vehicles.models import Vehicle
    
    if hasattr(vehicle, "pk"):
        vehicle_id = vehicle.pk
    else:
        vehicle_id = vehicle
    
    cutoff_date = timezone.now() - timedelta(days=days)
    
    return WorkOrder.objects.filter(
        vehicle_id=vehicle_id,
        status__in=['completed', 'invoiced', 'closed'],
        completed_at__isnull=False,
        completed_at__gte=cutoff_date
    ).select_related('primary_technician', 'branch').order_by('-completed_at')


def calculate_concern_similarity(concerns1, concerns2):
    """
    Calculate similarity between two customer concern texts.
    Uses a combination of sequence matching and word overlap.
    
    Args:
        concerns1: First concern text
        concerns2: Second concern text
    
    Returns:
        Similarity score between 0.0 and 1.0
    """
    if not concerns1 or not concerns2:
        return 0.0
    
    # Normalize text (lowercase, remove extra spaces)
    text1 = re.sub(r'\s+', ' ', str(concerns1).lower().strip())
    text2 = re.sub(r'\s+', ' ', str(concerns2).lower().strip())
    
    if not text1 or not text2:
        return 0.0
    
    # Use SequenceMatcher for similarity
    similarity = SequenceMatcher(None, text1, text2).ratio()
    
    # Also check for common keywords
    words1 = set(text1.split())
    words2 = set(text2.split())
    
    if len(words1) == 0 or len(words2) == 0:
        return float(similarity)
    
    # Jaccard similarity for word overlap
    intersection = len(words1 & words2)
    union = len(words1 | words2)
    word_similarity = intersection / union if union > 0 else 0.0
    
    # Combine both metrics (weighted average)
    combined = (similarity * 0.6) + (word_similarity * 0.4)
    
    return round(combined, 3)


def detect_repeat_visit(vehicle, customer_concerns, date=None, days=30, similarity_threshold=0.3):
    """
    Detect if a vehicle is returning within the specified days for a similar problem.
    
    Args:
        vehicle: Vehicle instance or ID
        customer_concerns: Current customer concerns text
        date: Optional date to check from (defaults to now)
        days: Number of days to look back (default 30)
        similarity_threshold: Minimum similarity score to consider a match (default 0.3)
    
    Returns:
        List of dictionaries with match information:
        - work_order: WorkOrder instance
        - work_order_number: str
        - completed_at: datetime
        - days_ago: int
        - customer_concerns: str
        - similarity: float
        - technician: str (technician name)
        - branch_name: str
    """
    if not customer_concerns or not customer_concerns.strip():
        return []
    
    recent_work_orders = get_recent_completed_work_orders(vehicle, days=days)
    
    matches = []
    check_date = date or timezone.now()
    
    for wo in recent_work_orders:
        if not wo.completed_at:
            continue
        
        similarity = calculate_concern_similarity(customer_concerns, wo.customer_concerns)
        
        if similarity >= similarity_threshold:
            days_ago = (check_date - wo.completed_at).days
            
            technician_name = None
            if wo.primary_technician:
                technician_name = f"{wo.primary_technician.first_name} {wo.primary_technician.last_name}".strip()
            elif wo.assigned_technicians.exists():
                tech = wo.assigned_technicians.first()
                technician_name = f"{tech.first_name} {tech.last_name}".strip()
            
            branch_name = wo.branch.name if wo.branch else 'Unknown Branch'
            
            matches.append({
                'work_order': wo,
                'work_order_id': wo.id,
                'work_order_number': wo.work_order_number,
                'completed_at': wo.completed_at,
                'days_ago': days_ago,
                'customer_concerns': wo.customer_concerns,
                'similarity': similarity,
                'technician': technician_name or 'Not assigned',
                'branch_name': branch_name,
            })
    
    # Sort by similarity (highest first), then by days_ago (most recent first)
    matches.sort(key=lambda x: (-x['similarity'], x['days_ago']))
    
    return matches


