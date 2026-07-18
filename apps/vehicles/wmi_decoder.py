"""
Local VIN decode from WMI (chars 1–3) + model-year code (char 10).

Does not call NHTSA. Cannot resolve model/trim/engine (maker-specific VDS),
but recovers manufacturer + region + year when VPIC returns empty for non-US VINs.
"""
from __future__ import annotations

from datetime import date
from typing import Any

# ISO 3779 model-year codes (position 10). Letters I, O, Q, U, Z are unused.
# Each letter/digit maps to two calendar years 30 years apart.
_YEAR_CODE_BASE: dict[str, int] = {
    'A': 1980, 'B': 1981, 'C': 1982, 'D': 1983, 'E': 1984,
    'F': 1985, 'G': 1986, 'H': 1987, 'J': 1988, 'K': 1989,
    'L': 1990, 'M': 1991, 'N': 1992, 'P': 1993, 'R': 1994,
    'S': 1995, 'T': 1996, 'V': 1997, 'W': 1998, 'X': 1999,
    'Y': 2000,
    '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005,
    '6': 2006, '7': 2007, '8': 2008, '9': 2009,
}

# Region from VIN position 1 (broad ISO geographic bands).
_REGION_BY_FIRST: dict[str, str] = {
    'A': 'Africa', 'B': 'Africa', 'C': 'Africa', 'D': 'Africa',
    'E': 'Africa', 'F': 'Africa', 'G': 'Africa', 'H': 'Africa',
    'J': 'Asia', 'K': 'Asia', 'L': 'Asia', 'M': 'Asia',
    'N': 'Asia', 'P': 'Asia', 'R': 'Asia',
    'S': 'Europe', 'T': 'Europe', 'U': 'Europe', 'V': 'Europe',
    'W': 'Europe', 'X': 'Europe', 'Y': 'Europe', 'Z': 'Europe',
    '1': 'North America', '2': 'North America', '3': 'North America',
    '4': 'North America', '5': 'North America',
    '6': 'Oceania', '7': 'Oceania',
    '8': 'South America', '9': 'South America',
}

# Common 3-char WMIs — biased toward makes seen in Ghana / West Africa fleets.
# Keep keys uppercase. Values: manufacturer display name.
_WMI_MANUFACTURERS: dict[str, str] = {
    # Toyota / Lexus
    'AHT': 'Toyota', 'AHH': 'Toyota', 'JT2': 'Toyota', 'JT3': 'Toyota',
    'JT4': 'Toyota', 'JT6': 'Toyota', 'JT8': 'Toyota', 'JTD': 'Toyota',
    'JTE': 'Toyota', 'JTF': 'Toyota', 'JTG': 'Toyota', 'JTH': 'Lexus',
    'JTJ': 'Lexus', 'JTK': 'Toyota', 'JTL': 'Toyota', 'JTM': 'Toyota',
    'JTN': 'Toyota', 'JTP': 'Toyota', 'JT1': 'Toyota', 'JTB': 'Toyota',
    'NMT': 'Toyota', 'MR0': 'Toyota', 'MR2': 'Toyota', 'SB1': 'Toyota',
    '4T1': 'Toyota', '4T3': 'Toyota', '4T4': 'Toyota', '5TD': 'Toyota',
    '5TE': 'Toyota', '5TF': 'Toyota', '2T1': 'Toyota', '2T2': 'Toyota',
    '2T3': 'Toyota', '1NX': 'Toyota', '4TA': 'Toyota',
    # Honda / Acura
    '1HG': 'Honda', '1HF': 'Honda', '2HG': 'Honda', '2HJ': 'Honda',
    '2HK': 'Honda', '3HG': 'Honda', '5FN': 'Honda', '5J6': 'Honda',
    'JH2': 'Honda', 'JH4': 'Acura', 'JHM': 'Honda', 'SHH': 'Honda',
    'SHS': 'Honda', 'MAK': 'Honda', 'PMH': 'Honda',
    # Nissan / Infiniti
    '1N4': 'Nissan', '1N6': 'Nissan', '3N1': 'Nissan', '5N1': 'Nissan',
    'JN1': 'Nissan', 'JN6': 'Nissan', 'JN8': 'Nissan', 'JNK': 'Infiniti',
    'JNR': 'Infiniti', 'MDH': 'Nissan', 'SJN': 'Nissan', 'VSK': 'Nissan',
    '5BZ': 'Nissan',
    # Ford / Lincoln
    '1FA': 'Ford', '1FB': 'Ford', '1FC': 'Ford', '1FD': 'Ford',
    '1FM': 'Ford', '1FT': 'Ford', '1ZV': 'Ford', '2FA': 'Ford',
    '2FM': 'Ford', '2FT': 'Ford', '3FA': 'Ford', '3FT': 'Ford',
    '6FP': 'Ford', '6F1': 'Ford', 'WF0': 'Ford', 'SFA': 'Ford',
    '1LN': 'Lincoln', '5LM': 'Lincoln', '5L1': 'Lincoln',
    # Hyundai / Kia / Genesis
    'KMH': 'Hyundai', 'KM8': 'Hyundai', 'KMJ': 'Hyundai', 'KMF': 'Hyundai',
    'KNA': 'Kia', 'KND': 'Kia', 'KNE': 'Kia', '5XY': 'Kia',
    '5XX': 'Kia', '3KP': 'Kia', 'KMT': 'Genesis',
    # Mercedes / BMW / VW / Audi / Porsche
    'WDB': 'Mercedes-Benz', 'WDC': 'Mercedes-Benz', 'WDD': 'Mercedes-Benz',
    'WDF': 'Mercedes-Benz', 'W1K': 'Mercedes-Benz', 'W1N': 'Mercedes-Benz',
    '4JG': 'Mercedes-Benz', 'WDY': 'Mercedes-Benz',
    'WBA': 'BMW', 'WBS': 'BMW', 'WBY': 'BMW', '5UX': 'BMW', '5YM': 'BMW',
    'WVW': 'Volkswagen', 'WV1': 'Volkswagen', 'WV2': 'Volkswagen',
    '3VW': 'Volkswagen', '1VW': 'Volkswagen',
    'WAU': 'Audi', 'WA1': 'Audi', 'TRU': 'Audi',
    'WP0': 'Porsche', 'WP1': 'Porsche',
    # GM family
    '1G1': 'Chevrolet', '1G2': 'Pontiac', '1GC': 'Chevrolet',
    '1GN': 'Chevrolet', '1GT': 'GMC', '2G1': 'Chevrolet',
    '3G1': 'Chevrolet', 'KL1': 'Chevrolet', 'W0L': 'Opel',
    '1GY': 'Cadillac', '1G6': 'Cadillac',
    # Others common in import markets
    'MAT': 'Tata', 'MA1': 'Mahindra', 'MA3': 'Suzuki', 'MA7': 'Suzuki',
    'MMB': 'Mitsubishi', 'MMC': 'Mitsubishi', 'JA3': 'Mitsubishi',
    'JA4': 'Mitsubishi', '4A3': 'Mitsubishi',
    'JF1': 'Subaru', 'JF2': 'Subaru', '4S3': 'Subaru', '4S4': 'Subaru',
    'JM1': 'Mazda', 'JM3': 'Mazda', '1YV': 'Mazda', '3MZ': 'Mazda',
    'YS3': 'Saab', 'YV1': 'Volvo', 'YV4': 'Volvo',
    'VF1': 'Renault', 'VF3': 'Peugeot', 'VF7': 'Citroën',
    'ZFA': 'Fiat', 'ZFF': 'Ferrari', 'ZAR': 'Alfa Romeo',
    'SAL': 'Land Rover', 'SAJ': 'Jaguar', 'SAT': 'Triumph',
    'SCA': 'Rolls-Royce', 'SCF': 'Aston Martin',
    'LUZ': 'Isuzu', 'MP1': 'Isuzu', 'JAL': 'Isuzu',
    'L6T': 'Geely', 'LGX': 'BYD', 'LVS': 'Ford', 'LVG': 'Toyota',
    'LGB': 'Dongfeng', 'LSV': 'Volkswagen',
    'TMB': 'Škoda', 'TMA': 'Hyundai', 'UU1': 'Dacia',
    'XL9': 'Spyker', 'XL7': 'Suzuki',
    'ACA': 'Hyundai', 'AC5': 'Hyundai',
    'AFB': 'Ford', 'AFA': 'Ford',
    'ADN': 'Nissan', 'ADZ': 'Nissan',
    'AAA': 'Audi',  # rare / regional
}

# 2-char prefix fallback when exact 3-char WMI is unknown.
_WMI_PREFIX2: dict[str, str] = {
    'JT': 'Toyota', 'JH': 'Honda', 'JN': 'Nissan', 'JF': 'Subaru',
    'JM': 'Mazda', 'JA': 'Mitsubishi', 'KL': 'Daewoo/GM Korea',
    'KM': 'Hyundai', 'KN': 'Kia', 'WD': 'Mercedes-Benz', 'WB': 'BMW',
    'WV': 'Volkswagen', 'WA': 'Audi', 'WP': 'Porsche', 'VF': 'PSA/Renault',
    'YS': 'Saab', 'YV': 'Volvo', 'SA': 'UK (Jaguar/Land Rover/etc.)',
    'SF': 'UK manufacturer', 'SH': 'Honda', 'SJ': 'Nissan',
    '1G': 'GM', '1F': 'Ford', '1H': 'Honda', '1N': 'Nissan',
    '1V': 'Volkswagen', '1Y': 'Mazda', '2H': 'Honda', '2T': 'Toyota',
    '2F': 'Ford', '3F': 'Ford', '3V': 'Volkswagen', '4T': 'Toyota',
    '4S': 'Subaru', '5T': 'Toyota', '5F': 'Honda', '5N': 'Nissan',
    '5X': 'Kia/Hyundai', '6F': 'Ford', 'AH': 'Toyota (Africa)',
    'MA': 'India (Suzuki/Mahindra/etc.)', 'MM': 'Mitsubishi',
    'NM': 'Toyota', 'MR': 'Toyota', 'PM': 'Honda', 'MD': 'Nissan',
}


def decode_model_year(year_code: str, *, reference_year: int | None = None) -> int | None:
    """
    Resolve VIN position-10 year code to a calendar year.

    Prefers the candidate closest to ``reference_year`` (default: current year)
    within [1980, reference_year + 1].
    """
    code = (year_code or '').upper().strip()
    if code not in _YEAR_CODE_BASE:
        return None
    base = _YEAR_CODE_BASE[code]
    ref = reference_year if reference_year is not None else date.today().year
    candidates = [base, base + 30]
    # Digits 1-9 also appear as 2031-2039 in the next cycle
    if code.isdigit():
        candidates.append(base + 30)
    valid = [y for y in candidates if 1980 <= y <= ref + 1]
    if not valid:
        return max(candidates)
    return min(valid, key=lambda y: (abs(y - ref), -y))


def decode_region(vin: str) -> str:
    first = (vin or '')[:1].upper()
    return _REGION_BY_FIRST.get(first, '')


def lookup_manufacturer(wmi: str) -> str:
    key = (wmi or '').upper().strip()
    if len(key) >= 3 and key[:3] in _WMI_MANUFACTURERS:
        return _WMI_MANUFACTURERS[key[:3]]
    if len(key) >= 2 and key[:2] in _WMI_PREFIX2:
        return _WMI_PREFIX2[key[:2]]
    return ''


def decode_wmi_local(vin: str, *, reference_year: int | None = None) -> dict[str, Any]:
    """
    Offline decode: manufacturer, region, model year from VIN structure.

    Returns a dict suitable for merging into NHTSA-shaped payloads.
    """
    vin = (vin or '').upper().strip()
    if len(vin) != 17:
        return {}

    wmi = vin[:3]
    year = decode_model_year(vin[9], reference_year=reference_year)
    make = lookup_manufacturer(wmi)
    region = decode_region(vin)

    data: dict[str, Any] = {
        'wmi': wmi,
        'manufacturer': make,
        'make': make,
        'region': region,
        'plant_country': region,
        'year': year,
        'decode_source': 'wmi_local',
        'has_useful_fields': bool(make or year),
        'has_errors': False,
        'error_message': '',
        'model': '',
        'trim': '',
        'engine_type': '',
        'engine_size': '',
        'transmission_type': '',
    }
    if make or year:
        parts = [p for p in (make, region, str(year) if year else '') if p]
        data['summary'] = ' · '.join(parts) + ' (local WMI decode)'
    return data


def merge_wmi_fallback(
    nhtsa_data: dict[str, Any],
    local: dict[str, Any],
) -> dict[str, Any]:
    """
    Fill blank NHTSA fields from local WMI decode. Never overwrites non-empty
    NHTSA make/model/year with local guesses.
    """
    if not local:
        return nhtsa_data

    merged = dict(nhtsa_data)
    sources = ['nhtsa']
    filled: list[str] = []

    for field in ('make', 'manufacturer', 'year', 'region', 'plant_country', 'wmi'):
        current = merged.get(field)
        local_val = local.get(field)
        if local_val in (None, ''):
            continue
        if current in (None, ''):
            merged[field] = local_val
            filled.append(field)

    if filled:
        sources.append('wmi_local')
        merged['wmi_fallback_fields'] = filled
        # Keep NHTSA error_message untouched — UI builds short toasts separately.
        merged['wmi_fallback'] = True

    merged['decode_sources'] = sources
    has_make = bool(str(merged.get('make') or '').strip())
    has_model = bool(str(merged.get('model') or '').strip())
    merged['has_useful_fields'] = has_make or has_model or bool(merged.get('year'))
    if 'wmi_local' in sources:
        merged['decode_source'] = 'nhtsa+wmi_local' if 'nhtsa' in sources else 'wmi_local'
    return merged
