"""
Staging settings for Smart Vehicle Repairs System.
"""
from .production import *

# Staging specific overrides
DEBUG = env.bool('DEBUG', default=False)

# Less restrictive ALLOWED_HOSTS for staging
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['staging.smartvehiclerepairs.com'])

# Staging database
DATABASES = {
    'default': env.db('DATABASE_URL')
}

# Staging-specific logging (more verbose than production)
LOGGING['loggers']['django']['level'] = 'DEBUG'
LOGGING['root']['level'] = 'DEBUG'

# Allow staging CORS origins
CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=[
    'https://staging.smartvehiclerepairs.com',
])

# Staging-specific Celery settings
CELERY_TASK_ALWAYS_EAGER = env.bool('CELERY_TASK_ALWAYS_EAGER', default=False)

# Enable debug toolbar in staging if needed
if env.bool('ENABLE_DEBUG_TOOLBAR', default=False):
    INSTALLED_APPS += ['debug_toolbar']
    MIDDLEWARE += ['debug_toolbar.middleware.DebugToolbarMiddleware']
    INTERNAL_IPS = ['127.0.0.1']