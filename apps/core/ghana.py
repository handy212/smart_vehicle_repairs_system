"""Ghana address helpers shared across branches, customers, users, and suppliers."""

# Ghana's 16 administrative regions
GHANA_REGION_CHOICES = [
    ('Ahafo', 'Ahafo'),
    ('Ashanti', 'Ashanti'),
    ('Bono', 'Bono'),
    ('Bono East', 'Bono East'),
    ('Central', 'Central'),
    ('Eastern', 'Eastern'),
    ('Greater Accra', 'Greater Accra'),
    ('North East', 'North East'),
    ('Northern', 'Northern'),
    ('Oti', 'Oti'),
    ('Savannah', 'Savannah'),
    ('Upper East', 'Upper East'),
    ('Upper West', 'Upper West'),
    ('Volta', 'Volta'),
    ('Western', 'Western'),
    ('Western North', 'Western North'),
]

GHANA_REGIONS = {code for code, _ in GHANA_REGION_CHOICES}

# Common aliases / legacy values → canonical region name
REGION_ALIASES = {
    'greater accra': 'Greater Accra',
    'accra': 'Greater Accra',
    'ga': 'Greater Accra',
    'ashanti': 'Ashanti',
    'ashanti region': 'Ashanti',
    'bono': 'Bono',
    'brong ahafo': 'Bono',
    'bono east': 'Bono East',
    'ahafo': 'Ahafo',
    'central': 'Central',
    'eastern': 'Eastern',
    'western': 'Western',
    'western north': 'Western North',
    'volta': 'Volta',
    'oti': 'Oti',
    'northern': 'Northern',
    'north east': 'North East',
    'northeast': 'North East',
    'savannah': 'Savannah',
    'upper east': 'Upper East',
    'upper west': 'Upper West',
}


def normalize_ghana_region(value: str | None, default: str = 'Greater Accra') -> str:
    """Map free-text / legacy region values onto a canonical Ghana region."""
    raw = (value or '').strip()
    if not raw:
        return default
    if raw in GHANA_REGIONS:
        return raw
    mapped = REGION_ALIASES.get(raw.lower())
    if mapped:
        return mapped
    # Title-case match against known regions
    for region in GHANA_REGIONS:
        if region.lower() == raw.lower():
            return region
    return default


def format_ghana_location(*, area: str = '', city: str = '', region: str = '') -> str:
    """Format Area, City, Region for display."""
    return ', '.join(p for p in [area, city, region] if p)
