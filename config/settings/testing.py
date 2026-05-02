"""
Testing settings for Smart Vehicle Repairs System.
"""
from .base import *

# Testing specific settings
DEBUG = False
ROOT_URLCONF = 'config.urls'

# In-memory database for faster tests
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

# Fast password hashing for tests
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Disable migrations during tests
class DisableMigrations:
    def __contains__(self, item):
        return True
    
    def __getitem__(self, item):
        return None

MIGRATION_MODULES = DisableMigrations()

# Console email backend for tests
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'

# Dummy cache for tests
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
    }
}

# Disable celery during tests
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Simple logging for tests
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'loggers': {
        'apps.quickbooks_online': {
            'handlers': ['console'],
            'level': 'ERROR',
            'propagate': False,
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',
    },
}

# Static files for tests
STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.StaticFilesStorage'

# Media files for tests
DEFAULT_FILE_STORAGE = 'django.core.files.storage.FileSystemStorage'

# Disable external services during tests
FIREBASE_ENABLED = False
HUBTEL_SMS_ENABLED = False
HUBTEL_PAYMENT_ENABLED = False
SKIP_AUDIT_REGISTRY = True
SKIP_MODULE_PERMISSION_CHECKS = True

# Test-specific installed apps
# INSTALLED_APPS += [
#     'django_coverage',
# ]

# Keep third-party/test-only exclusions out of the test app registry while
# leaving local project apps installed for model discovery.
INSTALLED_APPS = [
    app for app in INSTALLED_APPS
    if app not in {
        'debug_toolbar',
        'notifications',
        'schedule',
    }
]

MIDDLEWARE = [
    middleware for middleware in MIDDLEWARE
    if 'debug_toolbar' not in middleware
]
