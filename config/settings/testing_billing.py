"""
Testing settings variant that keeps billing installed for commercial workflow checks.
"""
from .testing import *  # noqa: F401,F403

if 'apps.billing' not in INSTALLED_APPS:
    INSTALLED_APPS.append('apps.billing')
