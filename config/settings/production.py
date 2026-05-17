"""
Production settings for Smart Vehicle Repairs System.
"""
from .base import *

# Production security settings
DEBUG = False

# Required: Must be set via environment variables
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS')  # No default - force explicit setting

# Security settings
SECURE_HSTS_SECONDS = env.int('SECURE_HSTS_SECONDS', default=31536000)  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool('SECURE_HSTS_INCLUDE_SUBDOMAINS', default=True)
SECURE_HSTS_PRELOAD = env.bool('SECURE_HSTS_PRELOAD', default=True)
SECURE_SSL_REDIRECT = env.bool('SECURE_SSL_REDIRECT', default=True)
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'

# Session security
SESSION_COOKIE_SECURE = env.bool('SESSION_COOKIE_SECURE', default=True)
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_AGE = 3600  # 1 hour
SESSION_EXPIRE_AT_BROWSER_CLOSE = True

# CSRF security
CSRF_COOKIE_SECURE = env.bool('CSRF_COOKIE_SECURE', default=True)
CSRF_COOKIE_HTTPONLY = True

# CSRF trusted origins (needed when using a separate frontend on LAN/HTTP)
CSRF_TRUSTED_ORIGINS = env.list('CSRF_TRUSTED_ORIGINS', default=[])

# Trust reverse proxy (e.g., Nginx Proxy Manager) for HTTPS detection
# Ensure your proxy sends: X-Forwarded-Proto: https
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True

# Frame options
X_FRAME_OPTIONS = 'DENY'

# Content Security Policy
# Restricts where the browser can load resources from.
# Adjust script-src / style-src if you add third-party CDNs.
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "font-src 'self' data:; "
    "connect-src 'self'; "
    "frame-ancestors 'none';"
)

# CORS Settings - restrictive for production
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=[])
CORS_ALLOW_CREDENTIALS = True

# Email backend for production
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'

# AWS S3 Configuration for production
USE_S3 = env.bool('USE_S3', default=False)

if USE_S3:
    AWS_ACCESS_KEY_ID = env('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = env('AWS_SECRET_ACCESS_KEY')
    AWS_STORAGE_BUCKET_NAME = env('AWS_STORAGE_BUCKET_NAME')
    AWS_S3_REGION_NAME = env('AWS_S3_REGION_NAME', default='us-east-1')
    AWS_S3_CUSTOM_DOMAIN = f'{AWS_STORAGE_BUCKET_NAME}.s3.amazonaws.com'
    AWS_S3_OBJECT_PARAMETERS = {'CacheControl': 'max-age=86400'}
    AWS_DEFAULT_ACL = 'public-read'
    
    # S3 Static Settings
    STATICFILES_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
    STATIC_URL = f'https://{AWS_S3_CUSTOM_DOMAIN}/static/'
    
    # S3 Media Settings
    DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
    MEDIA_URL = f'https://{AWS_S3_CUSTOM_DOMAIN}/media/'

# Database connection pooling for production
DATABASES['default']['CONN_MAX_AGE'] = 60

# Production caching with Redis
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': env('REDIS_URL'),
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            'CONNECTION_POOL_KWARGS': {
                'max_connections': 50,
                'retry_on_timeout': True,
            },
        },
        'KEY_PREFIX': 'svr_prod',
        'TIMEOUT': 300,
    }
}

# Session storage in Redis for production
SESSION_ENGINE = 'django.contrib.sessions.backends.cache'
SESSION_CACHE_ALIAS = 'default'

# Production logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'filters': {
        'skip_maintenance_mode_503': {
            '()': 'config.logging_filters.SkipMaintenanceMode503Filter',
        },
    },
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'production.log',
            'maxBytes': 1024*1024*10,  # 10 MB
            'backupCount': 5,
            'formatter': 'verbose',
        },
        'error_file': {
            'level': 'ERROR',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'error.log',
            'maxBytes': 1024*1024*10,  # 10 MB
            'backupCount': 5,
            'formatter': 'verbose',
        },
        'security_file': {
            'level': 'WARNING',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'security.log',
            'maxBytes': 1024*1024*10,  # 10 MB
            'backupCount': 10,
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['file'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['file'],
            'level': 'INFO',
            'propagate': False,
        },
        'django.request': {
            'handlers': ['error_file'],
            'level': 'ERROR',
            'filters': ['skip_maintenance_mode_503'],
            'propagate': True,
        },
        'django.server': {
            'handlers': ['file'],
            'level': 'INFO',
            'filters': ['skip_maintenance_mode_503'],
            'propagate': True,
        },
        'django.security': {
            'handlers': ['security_file'],
            'level': 'WARNING',
            'propagate': True,
        },
    },
}

# Celery settings for production
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_ACKS_LATE = True

# Rate limiting
REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES'] = [
    'rest_framework.throttling.AnonRateThrottle',
    'rest_framework.throttling.UserRateThrottle'
]
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = {
    # NOTE: The dashboard polls multiple endpoints frequently (e.g. notifications),
    # so the previous limits could lock out legitimate users.
    # You can override these via env vars if needed.
    'anon': os.getenv('DRF_THROTTLE_ANON', '1000/hour'),
    'user': os.getenv('DRF_THROTTLE_USER', '50000/hour'),
    'login': os.getenv('DRF_THROTTLE_LOGIN', '10/minute'),
}

# Disable debug toolbar and extensions in production
INSTALLED_APPS = [app for app in INSTALLED_APPS if app not in ['debug_toolbar', 'django_extensions']]
MIDDLEWARE = [mw for mw in MIDDLEWARE if 'debug_toolbar' not in mw]

# Insert CSP middleware immediately after SecurityMiddleware
_csp = 'config.middleware.ContentSecurityPolicyMiddleware'
if _csp not in MIDDLEWARE:
    _sec_idx = next(
        (i for i, m in enumerate(MIDDLEWARE) if 'SecurityMiddleware' in m), 0
    )
    MIDDLEWARE.insert(_sec_idx + 1, _csp)
