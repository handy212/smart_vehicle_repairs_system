"""
Base settings for Smart Vehicle Repairs System.
"""
import os
from pathlib import Path
from datetime import timedelta
import environ
from corsheaders.defaults import default_headers

# Build paths inside the project
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Environment variables
env = environ.Env(
    DEBUG=(bool, False)
)

# Read .env file
environ.Env.read_env(os.path.join(BASE_DIR, '.env'))

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = env('SECRET_KEY')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env('DEBUG', default=False)

ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=[])

# Application definition
INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.sites',
    'django.contrib.humanize',
    
    # Third-party apps
    'rest_framework',
    'rest_framework.authtoken',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',  # Google OAuth provider
    'corsheaders',
    'guardian',
    'rolepermissions',
    'crispy_forms',
    'crispy_bootstrap5',
    'widget_tweaks',
    'django_filters',
    'djmoney',
    'imagekit',
    'storages',
    'django_extensions',
    'channels',
    'import_export',
    'drf_spectacular',
    'django_celery_beat',
    'django_celery_results',
    # 'django_ledger',  # Removed for accounting module archival
    'auditlog',  
    
    # Local apps
    'apps.accounts',
    'apps.branches',
    'apps.vehicles',
    'apps.customers',
    'apps.appointments',
    'apps.workorders',
    'apps.gatepass',
    'apps.inventory',
    'apps.billing',
    'apps.inspections',
    'apps.diagnosis',
    'apps.reporting',
    'apps.notifications_app',
    'apps.documents',
    'apps.subscriptions',
    'apps.roadside',
    'apps.fixed_assets.apps.FixedAssetsConfig',  
    'apps.technicians',
    'apps.hr',
    'apps.accounting',
    'apps.portal',
    'apps.quickbooks_online',
    'apps.feedback',
    'apps.chat',
]

# Keep the workflow builder code in the repo, but do not activate it yet.
# Current production repair flow uses the hardcoded WorkOrder transition rules.
ENABLE_WORKFLOW_APP = False

if ENABLE_WORKFLOW_APP:
    INSTALLED_APPS.append('apps.workflows')

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # Serve static files directly from Django in production (when behind Gunicorn)
    # If you later put Nginx in front, this can still remain enabled.
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'allauth.account.middleware.AccountMiddleware',
    'apps.accounts.middleware.AuditlogDRFMiddleware',
    'apps.accounts.middleware.ModuleAvailabilityMiddleware',
    'apps.accounts.middleware.MaintenanceModeMiddleware',
    'auditlog.middleware.AuditlogMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'apps.accounts.context_processors.settings_context',
                'apps.branches.context_processors.branch_context',
                # 'django_ledger.context.django_ledger_context',  # Removed for accounting module archival
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Database
DATABASES = {
    'default': env.db('DATABASE_URL', default='sqlite:///db.sqlite3')
}

# Password validation
# Use custom validators that read from system settings
# Note: These can be overridden at runtime based on system settings
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'apps.accounts.password_validators.SystemSettingsMinimumLengthValidator',
    },
    {
        'NAME': 'apps.accounts.password_validators.SystemSettingsUppercaseValidator',
    },
    {
        'NAME': 'apps.accounts.password_validators.SystemSettingsLowercaseValidator',
    },
    {
        'NAME': 'apps.accounts.password_validators.SystemSettingsNumericValidator',
    },
    {
        'NAME': 'apps.accounts.password_validators.SystemSettingsSpecialCharacterValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'static']

# VIN decode (NHTSA VPIC) timeout
VIN_DECODE_TIMEOUT_SECONDS = env.int('VIN_DECODE_TIMEOUT_SECONDS', default=5)

# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# In production, media is typically served by Nginx (or S3). If you're using
# a reverse proxy (like Nginx Proxy Manager) and want Django to serve media
# directly, enable this via env: SERVE_MEDIA=True
SERVE_MEDIA = env.bool('SERVE_MEDIA', default=False)

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Custom User Model
AUTH_USER_MODEL = 'accounts.User'

# Sites Framework
SITE_ID = 1

# Django REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'apps.accounts.authentication.JWTCookieAuthentication',
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'config.pagination.SafePageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'EXCEPTION_HANDLER': 'config.exceptions.custom_exception_handler',
    # Default rate limiting — protects against brute-force in all environments.
    # Production settings may override with different values.
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
        'user': '5000/hour',
        'login': '10/minute',  # Tight limit for auth endpoints — prevents brute-force
        '2fa_verify': '5/minute',
        'refresh': '30/minute',
        # Login/layout may fetch branding from several client hooks; SSR adds more.
        'public_settings': '120/minute',
        'share_access_code': '10/minute',
    },
}

# JWT refresh cookie (HttpOnly; not readable by JavaScript)
JWT_REFRESH_COOKIE_NAME = 'svr_refresh_token'
JWT_REFRESH_COOKIE_PATH = '/api/auth/'
JWT_REFRESH_COOKIE_SAMESITE = 'Lax'

JWT_ACCESS_COOKIE_NAME = 'access_token'
JWT_ACCESS_COOKIE_PATH = '/'
JWT_ACCESS_COOKIE_SAMESITE = 'Lax'
# When True, omit access token from login JSON (cookie + memory bootstrap only)
JWT_OMIT_ACCESS_FROM_JSON = env.bool('JWT_OMIT_ACCESS_FROM_JSON', default=False)

# Webhooks must be signed in production (see production.py)
REQUIRE_WEBHOOK_SIGNATURES = env.bool('REQUIRE_WEBHOOK_SIGNATURES', default=False)

# CORS Headers (allow branch switch header by default)
# Note: This can be overridden in environment-specific settings
CORS_ALLOW_HEADERS = list(default_headers) + [
    'X-Branch-ID',
]
# CORS settings - can be overridden in development/production
CORS_ALLOW_CREDENTIALS = True

# JWT Settings
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=env.int('JWT_ACCESS_TOKEN_LIFETIME', default=60)),
    'REFRESH_TOKEN_LIFETIME': timedelta(minutes=env.int('JWT_REFRESH_TOKEN_LIFETIME', default=1440)),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# Web Push (VAPID) settings
VAPID_PUBLIC_KEY = env('VAPID_PUBLIC_KEY', default='')
VAPID_PRIVATE_KEY = env('VAPID_PRIVATE_KEY', default='')
VAPID_EMAIL = env('VAPID_EMAIL', default='')

# Django Allauth
AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
    'allauth.account.auth_backends.AuthenticationBackend',
    'guardian.backends.ObjectPermissionBackend',
]

# Updated allauth settings (new format)
ACCOUNT_LOGIN_METHODS = {'email'}
ACCOUNT_SIGNUP_FIELDS = ['email*', 'password1*', 'password2*']
ACCOUNT_EMAIL_VERIFICATION = 'optional'

# Social Account Settings
SOCIALACCOUNT_PROVIDERS = {
    'google': {
        'SCOPE': [
            'profile',
            'email',
        ],
        'AUTH_PARAMS': {
            'access_type': 'online',
        },
        'APP': {
            'client_id': env('GOOGLE_OAUTH_CLIENT_ID', default=''),
            'secret': env('GOOGLE_OAUTH_CLIENT_SECRET', default=''),
            'key': ''
        }
    }
}

# Social account adapter settings
SOCIALACCOUNT_AUTO_SIGNUP = True  # Automatically create accounts for new social logins
SOCIALACCOUNT_EMAIL_REQUIRED = True  # Require email from social provider
SOCIALACCOUNT_QUERY_EMAIL = True  # Request email from social provider
ACCOUNT_ADAPTER = 'apps.accounts.adapters.AccountAdapter'
SOCIALACCOUNT_ADAPTER = 'apps.accounts.adapters.SocialAccountAdapter'

# Crispy Forms
CRISPY_ALLOWED_TEMPLATE_PACKS = "bootstrap5"
CRISPY_TEMPLATE_PACK = "bootstrap5"

# Django Messages
from django.contrib.messages import constants as messages
MESSAGE_TAGS = {
    messages.DEBUG: 'alert-secondary',
    messages.INFO: 'alert-info',
    messages.SUCCESS: 'alert-success',
    messages.WARNING: 'alert-warning',
    messages.ERROR: 'alert-danger',
}

# Login/Logout URLs
LOGIN_URL = '/accounts/login/'
LOGIN_REDIRECT_URL = '/dashboard/'
LOGOUT_REDIRECT_URL = '/'

# Email Configuration
EMAIL_BACKEND = env('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = env('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT = env.int('EMAIL_PORT', default=587)
EMAIL_USE_TLS = env.bool('EMAIL_USE_TLS', default=True)
EMAIL_HOST_USER = env('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = env('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = env('EMAIL_HOST_USER', default='noreply@example.com')

# Celery Configuration
CELERY_BROKER_URL = env('REDIS_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = 'django-db'
CELERY_CACHE_BACKEND = 'django-cache'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
SYSTEM_BACKUP_ASYNC = env.bool('SYSTEM_BACKUP_ASYNC', default=False)

# Bare-metal UI updater (/opt -> /var/www/svr). Requires deploy/sudoers-svr-system-update.
SYSTEM_UPDATE_SOURCE_DIR = env('SYSTEM_UPDATE_SOURCE_DIR', default='/opt/smart_vehicle_repairs_system')
SYSTEM_UPDATE_TARGET_DIR = env('SYSTEM_UPDATE_TARGET_DIR', default='/var/www/svr')
SYSTEM_UPDATE_GIT_REF = env('SYSTEM_UPDATE_GIT_REF', default='main')
SYSTEM_UPDATE_GIT_URL = env(
    'SYSTEM_UPDATE_GIT_URL',
    default='https://github.com/handy212/smart_vehicle_repairs_system.git',
)
SYSTEM_UPDATE_RUN_SCRIPT = env(
    'SYSTEM_UPDATE_RUN_SCRIPT',
    default=str(Path(SYSTEM_UPDATE_SOURCE_DIR) / 'deploy' / 'run-system-update.sh'),
)
SYSTEM_UPDATE_ENABLED = env.bool('SYSTEM_UPDATE_ENABLED', default=False)
SYSTEM_UPDATE_ASYNC = env.bool('SYSTEM_UPDATE_ASYNC', default=True)

# QBO outbound failed-sync retry (used by Celery Beat below)
QUICKBOOKS_RETRY_FAILED_OUTBOUND_ENABLED = env.bool(
    'QUICKBOOKS_RETRY_FAILED_OUTBOUND_ENABLED', default=True,
)
QUICKBOOKS_RETRY_FAILED_OUTBOUND_INTERVAL = env.int(
    'QUICKBOOKS_RETRY_FAILED_OUTBOUND_INTERVAL', default=900,
)
QUICKBOOKS_RETRY_FAILED_BATCH_SIZE = env.int('QUICKBOOKS_RETRY_FAILED_BATCH_SIZE', default=100)
QUICKBOOKS_OUTBOUND_QUEUE_DEPTH_LIMIT = env.int('QUICKBOOKS_OUTBOUND_QUEUE_DEPTH_LIMIT', default=40)
# Kept short: each blocked worker slot during an Intuit outage stalls the next
# entity in the queue. A 3-attempt retry at this timeout caps one sync call at
# roughly 3x this value, instead of multi-minute stalls.
QUICKBOOKS_QBO_HTTP_TIMEOUT = env.int('QUICKBOOKS_QBO_HTTP_TIMEOUT', default=35)
QUICKBOOKS_WEBHOOK_DEBOUNCE_SECONDS = env.int('QUICKBOOKS_WEBHOOK_DEBOUNCE_SECONDS', default=30)

# QBO Inbound Sync Schedule — runs every 30 minutes
# These are default schedules; admins can also override via django-celery-beat's DB scheduler.
from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    'qbo-pull-vendors': {
        'task': 'apps.quickbooks_online.tasks.task_pull_vendors_from_qbo',
        'schedule': 1800,  # every 30 minutes
    },
    'qbo-pull-invoices': {
        'task': 'apps.quickbooks_online.tasks.task_pull_invoices_from_qbo',
        'schedule': 1800,
    },
    'qbo-pull-bills': {
        'task': 'apps.quickbooks_online.tasks.task_pull_bills_from_qbo',
        'schedule': 1800,
    },
    'qbo-pull-bill-payments': {
        'task': 'apps.quickbooks_online.tasks.task_pull_bill_payments_from_qbo',
        'schedule': 1800,
    },
    'qbo-pull-estimates': {
        'task': 'apps.quickbooks_online.tasks.task_pull_estimates_from_qbo',
        'schedule': 1800,
    },
    'qbo-pull-credit-memos': {
        'task': 'apps.quickbooks_online.tasks.task_pull_credit_memos_from_qbo',
        'schedule': 1800,
    },
    'qbo-pull-vendor-credits': {
        'task': 'apps.quickbooks_online.tasks.task_pull_vendor_credits_from_qbo',
        'schedule': 1800,
    },
    'qbo-pull-items': {
        'task': 'apps.quickbooks_online.tasks.task_pull_items_from_qbo',
        'schedule': 1800,
    },
    'qbo-retry-failed-outbound': {
        'task': 'apps.quickbooks_online.tasks.task_retry_failed_outbound_syncs',
        'schedule': QUICKBOOKS_RETRY_FAILED_OUTBOUND_INTERVAL,
    },
}


# Redis Cache
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': env('REDIS_URL', default='redis://localhost:6379/1'),
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        }
    }
}

# Channels Configuration
ASGI_APPLICATION = 'config.asgi.application'
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [env('REDIS_URL', default='redis://localhost:6379/0')],
        },
    },
}

# API Documentation
SPECTACULAR_SETTINGS = {
    'TITLE': 'Smart Vehicle Repairs API',
    'DESCRIPTION': 'Comprehensive Vehicle Repair Management System with modules for Customers, Inventory, Billing, and Service Tracking.',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'CONTACT': {
        'name': 'SafeTrack Systems Support',
        'url': 'https://safetracksystems.com',
        'email': 'support@safetracksystems.com',
    },
    'COMPONENT_SPLIT_PATCH': True,
    'COMPONENT_SPLIT_REQUEST': True,
    'SWAGGER_UI_DIST': 'SIDECAR',
    'SWAGGER_UI_FAVICON_HREF': 'SIDECAR',
    'REDOC_DIST': 'SIDECAR',
    'SWAGGER_UI_SETTINGS': {
        'deepLinking': True,
        'persistAuthorization': True,
        'displayOperationId': True,
        'filter': True,
    },
    'ENUM_NAME_OVERRIDES': {
        'WorkOrderStatusEnum': 'apps.workorders.models.WorkOrder.STATUS_CHOICES',
        'InvoiceStatusEnum': 'apps.billing.models.Invoice.STATUS_CHOICES',
        'PaymentStatusEnum': 'apps.billing.models.Payment.STATUS_CHOICES',
    },
    'POSTPROCESSING_HOOKS': [
        'apps.core.schema_hooks.custom_postprocessing_hook',
    ],
    # Require staff authentication to view API docs.
    # This prevents information disclosure of all endpoints/parameters.
    'SERVE_PERMISSIONS': ['rest_framework.permissions.IsAdminUser'],
}

# CarAPI Configuration
CARAPI_BASE_URL = 'https://carapi.app/api'
CARAPI_KEY = env('CARAPI_KEY', default='')
CARAPI_SECRET = env('CARAPI_SECRET', default='')

# QuickBooks Online Configuration
QUICKBOOKS_CLIENT_ID = env('QUICKBOOKS_CLIENT_ID', default='')
QUICKBOOKS_CLIENT_SECRET = env('QUICKBOOKS_CLIENT_SECRET', default='')
QUICKBOOKS_SANDBOX_ENABLED = env.bool('QUICKBOOKS_SANDBOX_ENABLED', default=DEBUG)
# Push customers, invoices, parts, etc. to QBO on save (requires QBO connected).
QUICKBOOKS_AUTO_SYNC_ENABLED = env.bool('QUICKBOOKS_AUTO_SYNC_ENABLED', default=True)
SETTLEMENT_ACCOUNT_BRANCH_ENFORCEMENT = env.bool(
    'SETTLEMENT_ACCOUNT_BRANCH_ENFORCEMENT', default=True,
)
# When True, QBO outbound sync runs in-process after save (no Celery worker required).
QUICKBOOKS_SYNC_INLINE = env.bool('QUICKBOOKS_SYNC_INLINE', default=DEBUG)
# Optional override; default is {FRONTEND_BASE_URL}/api/quickbooks/callback/
QBO_REDIRECT_URI = env('QBO_REDIRECT_URI', default='')

# Twilio Configuration
TWILIO_ACCOUNT_SID = env('TWILIO_ACCOUNT_SID', default='')
TWILIO_AUTH_TOKEN = env('TWILIO_AUTH_TOKEN', default='')
TWILIO_PHONE_NUMBER = env('TWILIO_PHONE_NUMBER', default='')

# WhatsApp Integration
WHATSAPP_ENABLED = env.bool('WHATSAPP_ENABLED', default=False)
WHATSAPP_ACCESS_TOKEN = env('WHATSAPP_ACCESS_TOKEN', default='')
WHATSAPP_PHONE_NUMBER_ID = env('WHATSAPP_PHONE_NUMBER_ID', default='')
WHATSAPP_BUSINESS_ACCOUNT_ID = env('WHATSAPP_BUSINESS_ACCOUNT_ID', default='')

# Gemini AI Configuration
GEMINI_API_KEY = env('GEMINI_API_KEY', default='')

# Firebase Configuration
FIREBASE_CREDENTIALS_PATH = env('FIREBASE_CREDENTIALS_PATH', default='')
if FIREBASE_CREDENTIALS_PATH and not FIREBASE_CREDENTIALS_PATH.startswith('/'):
    FIREBASE_CREDENTIALS_PATH = str(BASE_DIR / FIREBASE_CREDENTIALS_PATH)
FIREBASE_ENABLED = env.bool('FIREBASE_ENABLED', default=False)

# Hubtel Configuration (Ghana SMS & Payment Gateway)
HUBTEL_CLIENT_ID = env('HUBTEL_CLIENT_ID', default='')
HUBTEL_CLIENT_SECRET = env('HUBTEL_CLIENT_SECRET', default='')
HUBTEL_FROM = env('HUBTEL_FROM', default='Vehicle Repairs')
HUBTEL_SMS_ENABLED = env.bool('HUBTEL_SMS_ENABLED', default=False)

HUBTEL_MERCHANT_ID = env('HUBTEL_MERCHANT_ID', default='')
HUBTEL_API_KEY = env('HUBTEL_API_KEY', default='')
HUBTEL_API_SECRET = env('HUBTEL_API_SECRET', default='')
HUBTEL_PAYMENT_ENABLED = env.bool('HUBTEL_PAYMENT_ENABLED', default=False)
HUBTEL_SANDBOX = env.bool('HUBTEL_SANDBOX', default=DEBUG)

# Queue event-driven notification delivery via Celery (inline when DEBUG).
NOTIFICATIONS_ASYNC = env.bool('NOTIFICATIONS_ASYNC', default=not DEBUG)

# Paystack Payment Gateway Configuration (Ghana)
PAYSTACK_PUBLIC_KEY = env('PAYSTACK_PUBLIC_KEY', default='')
PAYSTACK_SECRET_KEY = env('PAYSTACK_SECRET_KEY', default='')
PAYSTACK_PAYMENT_ENABLED = env.bool('PAYSTACK_PAYMENT_ENABLED', default=False)

# Stripe Payment Gateway Configuration
STRIPE_PUBLIC_KEY = env('STRIPE_PUBLIC_KEY', default='')
STRIPE_SECRET_KEY = env('STRIPE_SECRET_KEY', default='')

# PayPal Configuration
PAYPAL_CLIENT_ID = env('PAYPAL_CLIENT_ID', default='')
PAYPAL_SECRET = env('PAYPAL_SECRET', default='')

# Site URL for payment callbacks
SITE_URL = env('SITE_URL', default='http://localhost:8000')

# Frontend base URL (used for redirect-based payment success pages)
FRONTEND_BASE_URL = env('FRONTEND_BASE_URL', default='http://localhost:3000')

# Role Permissions
ROLEPERMISSIONS_MODULE = 'config.roles'

# Logging Configuration
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
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
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'django.log',
            'formatter': 'verbose',
        },
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'error_file': {
            'level': 'ERROR',
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'error.log',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
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
            'handlers': ['console'],
            'level': 'INFO',
            'filters': ['skip_maintenance_mode_503'],
            'propagate': True,
        },
        'apps.vehicles': {
            'handlers': ['console', 'file', 'error_file'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}

# Django Ledger Settings - Removed
# DJANGO_LEDGER_USE_DEPRECATED_BEHAVIOR = False

# Repeat Visit Detection Settings
REPEAT_VISIT_DAYS = env.int('REPEAT_VISIT_DAYS', default=30)
REPEAT_VISIT_SIMILARITY_THRESHOLD = env.float('REPEAT_VISIT_SIMILARITY_THRESHOLD', default=0.3)
REPEAT_VISIT_ENABLED = env.bool('REPEAT_VISIT_ENABLED', default=True)

# Google reCAPTCHA Settings
RECAPTCHA_SITE_KEY = env('RECAPTCHA_SITE_KEY', default='')
RECAPTCHA_SECRET_KEY = env('RECAPTCHA_SECRET_KEY', default='')

# Create logs directory if it doesn't exist
os.makedirs(BASE_DIR / 'logs', exist_ok=True)
