"""
Development settings for Smart Vehicle Repairs System.
"""
from .base import *
from corsheaders.defaults import default_headers

# Development specific settings
DEBUG = True

# Allow all hosts in development
ALLOWED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0']

# CORS Settings for development
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3001",  # Development Next.js
    "http://localhost:8001",  # Development Django
    "http://127.0.0.1:3001",
    "http://127.0.0.1:8001",
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

# Development logging
LOGGING['root']['level'] = 'DEBUG'
LOGGING['loggers']['django']['level'] = 'DEBUG'