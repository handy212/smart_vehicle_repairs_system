"""
Testing settings variant for full workflow checks that need inspections and billing.
"""
from .testing import *  # noqa: F401,F403

for app_name in ['apps.billing', 'apps.inspections']:
    if app_name not in INSTALLED_APPS:
        INSTALLED_APPS.append(app_name)
