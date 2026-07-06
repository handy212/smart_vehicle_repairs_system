"""
Development settings for Smart Vehicle Repairs System.
"""
from .base import *
from corsheaders.defaults import default_headers

# Development specific settings
DEBUG = True

# Allow all hosts in development
ALLOWED_HOSTS = ['*']

# CORS Settings for development
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3001",  # Development Next.js
    "http://localhost:8001",  # Development Django
    "http://127.0.0.1:3001",
    "http://127.0.0.1:8001",
]
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]
# Allow all methods and headers in development
CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]
# Override base CORS headers to include all necessary headers
CORS_ALLOW_HEADERS = list(default_headers) + [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
    'x-branch-id',
    'X-Branch-ID',
]
# Ensure CORS middleware handles preflight requests
CORS_PREFLIGHT_MAX_AGE = 86400

# Debug toolbar
INSTALLED_APPS += [
    'debug_toolbar',
]

MIDDLEWARE += [
    'debug_toolbar.middleware.DebugToolbarMiddleware',
]

DEBUG_TOOLBAR_CONFIG = {
    # Preserve django-debug-toolbar's default disabled panels.
    # ProfilingPanel is unsafe with concurrent requests on Python 3.12+
    # and was causing 500s during login/media requests in development.
    'DISABLE_PANELS': {
        'debug_toolbar.panels.templates.TemplatesPanel',
        'debug_toolbar.panels.profiling.ProfilingPanel',
        'debug_toolbar.panels.redirects.RedirectsPanel',
    },
}

INTERNAL_IPS = [
    '127.0.0.1',
    'localhost',
]

# Console email backend for development (default), but allow override from env
EMAIL_BACKEND = env('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')

# SQLite for development (if no DATABASE_URL provided)
if not env('DATABASE_URL', default=None):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

# Cache: Use LocMemCache when Redis is not configured (e.g. no REDIS_URL in .env)
# This allows development without running Redis. Set REDIS_URL to use Redis.
_redis_url = env('REDIS_URL', default=None)
if not _redis_url:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    }
# Session: Use database backend when using LocMemCache (session in cache requires Redis)
if not _redis_url:
    SESSION_ENGINE = 'django.contrib.sessions.backends.db'

# Relaxed throttles for local dev (HMR, Strict Mode, multiple layout hooks, E2E suites)
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['public_settings'] = '1000/hour'
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['anon'] = '5000/hour'
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['login'] = '1000/minute'

# Development logging
LOGGING['root']['level'] = 'DEBUG'
LOGGING['loggers']['django']['level'] = 'DEBUG'
