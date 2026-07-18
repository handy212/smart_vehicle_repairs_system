"""
Soft vehicle–part fitment matching against free-text Part compatibility fields.

Empty compatibility → unknown (not universal).
Explicit universal markers (*, universal, all, any) → likely.
"""
from __future__ import annotations

import re
from typing import Iterable, Literal, Optional

FitStatus = Literal["likely", "unlikely", "unknown"]

UNIVERSAL_TOKENS = frozenset({"*", "universal", "all", "any", "n/a", "na", "all makes", "all models"})


def _tokens(value: Optional[str]) -> list[str]:
    if not value or not str(value).strip():
        return []
    parts = re.split(r"[,;/|]+", str(value).strip())
    return [p.strip().lower() for p in parts if p.strip()]


def _is_universal(tokens: Iterable[str]) -> bool:
    return any(t in UNIVERSAL_TOKENS for t in tokens)


def _token_matches(haystack_tokens: list[str], needle: str) -> bool:
    """Case-insensitive token or substring match."""
    needle = (needle or "").strip().lower()
    if not needle or not haystack_tokens:
        return False
    if _is_universal(haystack_tokens):
        return True
    for token in haystack_tokens:
        if token == needle or needle in token or token in needle:
            return True
    return False


def _year_matches(years_field: Optional[str], year: Optional[int]) -> Optional[bool]:
    """
    Return True/False if years_field is parseable and year is given;
    None if years_field empty or year missing (unknown).
    """
    if year is None:
        return None
    tokens = _tokens(years_field)
    if not tokens:
        return None
    if _is_universal(tokens) or any(t in ("all years", "all") for t in tokens):
        return True

    for token in tokens:
        # Range: 2015-2023 or 2015–2023
        m = re.match(r"^(\d{4})\s*[-–—to]+\s*(\d{4})$", token)
        if m:
            start, end = int(m.group(1)), int(m.group(2))
            if start > end:
                start, end = end, start
            if start <= year <= end:
                return True
            continue
        # Single year
        m = re.match(r"^(\d{4})$", token)
        if m and int(m.group(1)) == year:
            return True
        # Loose contains e.g. "2015+"
        m = re.match(r"^(\d{4})\+$", token)
        if m and year >= int(m.group(1)):
            return True

    # Had year tokens but none matched
    return False


def match_part_to_vehicle(
    *,
    compatible_makes: Optional[str] = None,
    compatible_models: Optional[str] = None,
    compatible_years: Optional[str] = None,
    make: Optional[str] = None,
    model: Optional[str] = None,
    year: Optional[int] = None,
) -> FitStatus:
    """
    Soft-match free-text fitment against a vehicle identity.

    - No vehicle context → unknown
    - No fitment data on part → unknown
    - Clear conflicts on a specified dimension → unlikely
    - Matches (or universal) on provided dimensions → likely
    """
    if not make and not model and year is None:
        return "unknown"

    make_tokens = _tokens(compatible_makes)
    model_tokens = _tokens(compatible_models)
    year_tokens = _tokens(compatible_years)

    if not make_tokens and not model_tokens and not year_tokens:
        return "unknown"

    conflicts = 0
    matches = 0
    checked = 0

    if make and make_tokens:
        checked += 1
        if _token_matches(make_tokens, make):
            matches += 1
        elif not _is_universal(make_tokens):
            conflicts += 1

    if model and model_tokens:
        checked += 1
        if _token_matches(model_tokens, model):
            matches += 1
        elif not _is_universal(model_tokens):
            conflicts += 1

    year_result = _year_matches(compatible_years, year)
    if year is not None and year_tokens:
        checked += 1
        if year_result is True:
            matches += 1
        elif year_result is False:
            conflicts += 1

    if conflicts > 0:
        return "unlikely"
    if matches > 0:
        return "likely"
    # Fitment present but no overlapping dimensions to evaluate
    if checked == 0:
        return "unknown"
    return "unknown"


def fitment_rank(status: FitStatus) -> int:
    """Lower is better for sorting."""
    return {"likely": 0, "unknown": 1, "unlikely": 2}.get(status, 1)
