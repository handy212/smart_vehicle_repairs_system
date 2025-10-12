"""
Django settings for Smart Vehicle Repairs System.
Import from environment-specific settings modules.
"""

# Import settings based on environment
import os

ENVIRONMENT = os.getenv('DJANGO_ENVIRONMENT', 'development')

if ENVIRONMENT == 'production':
    from .settings.production import *
elif ENVIRONMENT == 'staging':
    from .settings.staging import *
elif ENVIRONMENT == 'testing':
    from .settings.testing import *
else:
    from .settings.development import *


