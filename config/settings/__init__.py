"""
Settings package for Smart Vehicle Repairs System
"""
import os


def _resolve_environment() -> str:
    """Resolve Django settings module from explicit env or safe defaults."""
    explicit = (os.getenv('DJANGO_ENVIRONMENT') or '').strip().lower()
    if explicit:
        return explicit

    debug = (os.getenv('DEBUG') or '').strip().lower()
    if debug in ('false', '0', 'no', 'off'):
        return 'production'

    return 'development'


# Determine which settings to use based on environment
ENVIRONMENT = _resolve_environment()

if ENVIRONMENT == 'production':
    from .production import *
elif ENVIRONMENT == 'staging':
    from .staging import *
elif ENVIRONMENT == 'testing':
    from .testing import *
else:
    from .development import *