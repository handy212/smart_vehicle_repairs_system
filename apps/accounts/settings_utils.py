"""
Settings Utilities
Helper functions for working with system settings
"""
from django.core.cache import cache
from .admin_models import SystemSettings


def get_setting(key, default='', use_cache=True, db_first=False):
    """
    Get a setting value by key with optional caching.
    Default priority: Django Settings (.env) > Database > Default.
    Set db_first=True for admin-managed values that must override .env.
    """
    from django.conf import settings
    
    # 1. Check if mapping exists in Django settings (.env)
    # Most secret keys are mapped in settings.py
    env_mapping = {
        'email_host': 'EMAIL_HOST',
        'email_port': 'EMAIL_PORT',
        'email_username': 'EMAIL_HOST_USER',
        'email_password': 'EMAIL_HOST_PASSWORD',
        'email_use_tls': 'EMAIL_USE_TLS',
        'email_use_ssl': 'EMAIL_USE_SSL',
        'hubtel_client_id': 'HUBTEL_CLIENT_ID',
        'hubtel_client_secret': 'HUBTEL_CLIENT_SECRET',
        'hubtel_merchant_id': 'HUBTEL_MERCHANT_ID',
        'hubtel_api_key': 'HUBTEL_API_KEY',
        'hubtel_api_secret': 'HUBTEL_API_SECRET',
        'paystack_public_key': 'PAYSTACK_PUBLIC_KEY',
        'paystack_secret_key': 'PAYSTACK_SECRET_KEY',
        'whatsapp_access_token': 'WHATSAPP_ACCESS_TOKEN',
        'whatsapp_phone_number_id': 'WHATSAPP_PHONE_NUMBER_ID',
        'whatsapp_business_account_id': 'WHATSAPP_BUSINESS_ACCOUNT_ID',
        'firebase_api_key': 'FIREBASE_API_KEY',
        'firebase_project_id': 'FIREBASE_PROJECT_ID',
        'firebase_messaging_sender_id': 'FIREBASE_MESSAGING_SENDER_ID',
        'firebase_app_id': 'FIREBASE_APP_ID',
        'firebase_credentials_path': 'FIREBASE_CREDENTIALS_PATH',
        'recaptcha_site_key': 'RECAPTCHA_SITE_KEY',
        'recaptcha_secret_key': 'RECAPTCHA_SECRET_KEY',
        'google_oauth_client_id': 'GOOGLE_OAUTH_CLIENT_ID',
        'google_oauth_client_secret': 'GOOGLE_OAUTH_CLIENT_SECRET',
        'carapi_key': 'CARAPI_KEY',
        'carapi_secret': 'CARAPI_SECRET',
        'twilio_account_sid': 'TWILIO_ACCOUNT_SID',
        'twilio_auth_token': 'TWILIO_AUTH_TOKEN',
        'twilio_phone_number': 'TWILIO_PHONE_NUMBER',
        'twilio_messaging_service_sid': 'TWILIO_MESSAGING_SERVICE_SID',
        'infobip_base_url': 'INFOBIP_BASE_URL',
        'infobip_api_key': 'INFOBIP_API_KEY',
        'infobip_sender_id': 'INFOBIP_SENDER_ID',
        'infobip_webhook_username': 'INFOBIP_WEBHOOK_USERNAME',
        'infobip_webhook_password': 'INFOBIP_WEBHOOK_PASSWORD',
        'sms_provider': 'SMS_SERVICE',
        'sms_enabled': 'SMS_ENABLED',
        'quickbooks_client_id': 'QUICKBOOKS_CLIENT_ID',
        'quickbooks_client_secret': 'QUICKBOOKS_CLIENT_SECRET',
        'quickbooks_sandbox_enabled': 'QUICKBOOKS_SANDBOX_ENABLED',
        'ai_gemini_api_key': 'GEMINI_API_KEY',
        'ai_gemini_model': 'GEMINI_MODEL',
    }

    def get_env_value():
        if key in env_mapping:
            env_val = getattr(settings, env_mapping[key], None)
            if (
                key == 'sms_enabled'
                and not env_val
                and getattr(settings, 'HUBTEL_SMS_ENABLED', False)
            ):
                # Backward-compatible fallback for existing deployments.
                env_val = True
            if env_val is not None:
                # Handle boolean strings from settings if necessary
                if isinstance(env_val, bool):
                    return 'true' if env_val else 'false'
                return str(env_val)
        return None

    def get_db_value(db_default=default):
        if use_cache:
            try:
                cache_key = f'setting_{key}'
                value = cache.get(cache_key)

                if value is None:
                    value = SystemSettings.get_setting(key, db_default)
                    cache.set(cache_key, value, 300)  # Cache for 5 minutes

                return value
            except Exception:
                # If cache fails (e.g., Redis not running), fall back to database
                return SystemSettings.get_setting(key, db_default)

        return SystemSettings.get_setting(key, db_default)

    if db_first:
        db_value = get_db_value(db_default=None)
        if db_value not in (None, ''):
            return db_value
        env_value = get_env_value()
        return env_value if env_value is not None else default

    env_value = get_env_value()
    if env_value is not None:
        return env_value

    return get_db_value()


def _normalize_site_url(url):
    if not url:
        return ''
    return str(url).strip().rstrip('/')


def _is_localhost_site_url(url):
    normalized = _normalize_site_url(url).lower()
    if not normalized:
        return False
    for host in ('localhost', '127.0.0.1', '0.0.0.0'):
        if f'://{host}' in normalized or normalized.startswith(f'{host}:'):
            return True
    return False


def _first_public_cors_origin():
    from django.conf import settings

    origins = getattr(settings, 'CORS_ALLOWED_ORIGINS', None) or []
    for origin in origins:
        normalized = _normalize_site_url(origin)
        if normalized and not _is_localhost_site_url(normalized):
            return normalized
    return ''


def get_site_url(default=''):
    """
    Resolve the public frontend URL used in emails and portal links.

    Priority:
    1. Admin DB setting `site_url` (localhost values ignored outside DEBUG)
    2. FRONTEND_URL / FRONTEND_BASE_URL Django settings
    3. First non-localhost entry in CORS_ALLOWED_ORIGINS
    4. localhost default only when DEBUG is True
    """
    from django.conf import settings

    debug = getattr(settings, 'DEBUG', False)
    dev_default = _normalize_site_url(default) or 'http://localhost:3000'

    db_url = _normalize_site_url(get_setting('site_url', ''))
    if db_url and (debug or not _is_localhost_site_url(db_url)):
        return db_url

    for attr in ('FRONTEND_URL', 'FRONTEND_BASE_URL'):
        url = _normalize_site_url(getattr(settings, attr, None))
        if url and (debug or not _is_localhost_site_url(url)):
            return url

    cors_origin = _first_public_cors_origin()
    if cors_origin:
        return cors_origin

    if debug:
        return dev_default

    return _normalize_site_url(default)


def get_settings(keys, defaults=None, use_cache=True, db_first=False):
    """
    Get multiple settings at once
    
    Args:
        keys (list): List of setting keys
        defaults (dict): Dictionary of default values
        use_cache (bool): Whether to use cache
        db_first (bool): Whether database settings should override mapped env vars
    
    Returns:
        dict: Dictionary of key-value pairs
    """
    if defaults is None:
        defaults = {}
    
    results = {}
    
    for key in keys:
        default = defaults.get(key, '')
        results[key] = get_setting(key, default, use_cache, db_first=db_first)
    
    return results


def clear_settings_cache():
    """Clear all settings from cache"""
    try:
        # This is a simple implementation
        # In production, you might want to use cache.delete_many() with a pattern
        cache.clear()
    except Exception:
        # If cache fails, just pass
        pass


def clear_setting_cache(key):
    """Clear cache for a specific setting key"""
    try:
        cache_key = f'setting_{key}'
        cache.delete(cache_key)
    except Exception:
        # If cache fails, just pass
        pass


PUBLIC_BRANDING_CACHE_KEY = 'accounts:public_branding:v1'
PUBLIC_DISPLAY_CACHE_KEY = 'accounts:public_display:v1'


def clear_public_branding_cache():
    """Invalidate cached public branding API payload."""
    try:
        cache.delete(PUBLIC_BRANDING_CACHE_KEY)
    except Exception:
        pass


def clear_public_display_cache():
    """Invalidate cached public display settings (currency) API payload."""
    try:
        cache.delete(PUBLIC_DISPLAY_CACHE_KEY)
    except Exception:
        pass


def get_company_info():
    """Get all company information settings"""
    keys = [
        'company_name',
        'company_tagline',
        'company_email',
        'company_phone',
        'company_address',
        'company_city',
        'company_region',
        'company_area',
        'company_country',
        'company_website',
        'company_tax_id',
        'company_registration',
        'currency_symbol',
    ]
    
    return get_settings(keys, {'currency_symbol': '$'}) | {'site_url': get_site_url()}


def get_document_terms():
    """Shop-wide legal / notice text for printed documents."""
    return get_settings(
        [
            'invoice_bank_details',
            'invoice_terms_and_conditions',
            'estimate_terms_and_conditions',
            'proforma_notice',
            'receipt_terms_and_conditions',
            'work_order_terms_and_conditions',
        ],
        {
            'invoice_bank_details': '',
            'invoice_terms_and_conditions': '',
            'estimate_terms_and_conditions': '',
            'proforma_notice': '',
            'receipt_terms_and_conditions': '',
            'work_order_terms_and_conditions': '',
        },
    )


def get_branding_settings():
    """Get all branding settings"""
    keys = [
        'site_name',
        'logo_path',
        'logo_dark_path',
        'favicon_path',
        'login_background',
        'customer_login_background',  # Separate background for customer portal
        'staff_login_background',      # Separate background for staff portal
        'login_background_overlay',    # Overlay opacity (0.0 to 1.0)
        'primary_color',
        'secondary_color',
        'success_color',
        'danger_color',
        'theme_mode',
        'document_watermark_enabled',
    ]
    
    return get_settings(keys, {
        'theme_mode': 'perfex',
        'login_background_overlay': '0.85',  # Default 85% opacity
        'document_watermark_enabled': 'true',
    }, db_first=True)


def get_email_settings():
    """Get all email settings, prioritizing environment variables"""
    # Keys handled by get_setting priority logic
    keys = [
        'email_enabled',
        'email_backend',
        'email_host',
        'email_port',
        'email_username',
        'email_password',
        'email_use_tls',
        'email_use_ssl',
        'email_from_name',
        'email_from_address',
        'email_reply_to',
        'email_signature',
    ]
    
    defaults = {
        'email_enabled': 'false',
        'email_backend': 'django.core.mail.backends.smtp.EmailBackend',
        'email_port': '587',
        'email_use_tls': 'true',
        'email_use_ssl': 'false',
    }
    
    settings_dict = get_settings(keys, defaults)
    
    # Extra layer: override from Django settings directly for core SMTP props
    from django.conf import settings
    settings_dict['email_host'] = getattr(settings, 'EMAIL_HOST', settings_dict['email_host'])
    settings_dict['email_port'] = str(getattr(settings, 'EMAIL_PORT', settings_dict['email_port']))
    settings_dict['email_username'] = getattr(settings, 'EMAIL_HOST_USER', settings_dict['email_username'])
    settings_dict['email_password'] = getattr(settings, 'EMAIL_HOST_PASSWORD', settings_dict['email_password'])
    
    return settings_dict


def get_sms_settings():
    """Get all SMS settings, prioritizing admin-configured database values."""
    keys = [
        'sms_enabled',
        'sms_provider',
        'hubtel_client_id',
        'hubtel_client_secret',
        'hubtel_sender_id',
        'hubtel_api_url',
        'twilio_account_sid',
        'twilio_auth_token',
        'twilio_phone_number',
        'twilio_messaging_service_sid',
        'infobip_base_url',
        'infobip_api_key',
        'infobip_sender_id',
        'infobip_webhook_username',
        'infobip_webhook_password',
        'sms_signature',
        'sms_test_number',
    ]
    
    defaults = {
        'sms_enabled': 'false',
        'sms_provider': 'hubtel',
        'hubtel_api_url': 'https://smsc.hubtel.com/v1/messages/send',
        'twilio_messaging_service_sid': '',
        'infobip_base_url': '',
    }
    
    return get_settings(keys, defaults, db_first=True)


def get_whatsapp_settings():
    """Get all WhatsApp settings"""
    keys = [
        'whatsapp_enabled',
        'whatsapp_access_token',
        'whatsapp_phone_number_id',
        'whatsapp_business_account_id',
        'whatsapp_api_version',
    ]
    
    defaults = {
        'whatsapp_enabled': 'false',
        'whatsapp_api_version': 'v22.0',
    }
    
    settings_dict = get_settings(keys, defaults)
    
    # Fallback to environment variables/Django settings
    from django.conf import settings
    
    # If not enabled in DB, check env
    if settings_dict['whatsapp_enabled'] == 'false':
        env_enabled = getattr(settings, 'WHATSAPP_ENABLED', False)
        if env_enabled:
            settings_dict['whatsapp_enabled'] = 'true'
            
    # Check other credentials
    if not settings_dict.get('whatsapp_access_token'):
        settings_dict['whatsapp_access_token'] = getattr(settings, 'WHATSAPP_ACCESS_TOKEN', '')
        
    if not settings_dict.get('whatsapp_phone_number_id'):
        settings_dict['whatsapp_phone_number_id'] = getattr(settings, 'WHATSAPP_PHONE_NUMBER_ID', '')
        
    if not settings_dict.get('whatsapp_business_account_id'):
        settings_dict['whatsapp_business_account_id'] = getattr(settings, 'WHATSAPP_BUSINESS_ACCOUNT_ID', '')
        
    return settings_dict


def get_payment_settings():
    """Get all payment settings"""
    keys = [
        'currency',
        'currency_symbol',
        'tax_rate',
        'tax_name',
        'payment_terms',
        'late_fee_enabled',
        'late_fee_amount',
        'late_fee_type',
        'payment_gateway',
        'payment_gateway_enabled',
        'paystack_public_key',
        'paystack_secret_key',
    ]
    
    defaults = {
        'currency': 'USD',
        'currency_symbol': '$',
        'tax_rate': '0.00',
        'tax_name': 'VAT',
        'payment_terms': '30',
        'late_fee_enabled': 'false',
        'late_fee_type': 'percentage',
        'payment_gateway': 'paystack',
        'payment_gateway_enabled': 'false',
    }
    
    return get_settings(keys, defaults)


def get_business_settings():
    """Get all business operational settings"""
    keys = [
        'business_hours_weekday',
        'business_hours_saturday',
        'business_hours_sunday',
        'appointment_duration',
        'appointment_buffer',
        'max_appointments_per_day',
        'online_booking_enabled',
        'deposit_required',
        'deposit_percentage',
        'cancellation_policy',
    ]
    
    defaults = {
        'business_hours_weekday': '08:00-18:00',
        'business_hours_saturday': '09:00-15:00',
        'business_hours_sunday': 'Closed',
        'appointment_duration': '60',
        'appointment_buffer': '15',
        'online_booking_enabled': 'true',
        'deposit_required': 'false',
    }
    
    return get_settings(keys, defaults)


def get_security_settings():
    """Get all security settings"""
    keys = [
        'password_min_length',
        'password_require_uppercase',
        'password_require_lowercase',
        'password_require_number',
        'password_require_special',
        'session_timeout',
        'max_login_attempts',
        'lockout_duration',
        'two_factor_enabled',
        'allowed_file_types',
        'max_file_size',
    ]
    
    defaults = {
        'password_min_length': '8',
        'password_require_uppercase': 'true',
        'password_require_lowercase': 'true',
        'password_require_number': 'true',
        'password_require_special': 'false',
        'session_timeout': '30',
        'max_login_attempts': '5',
        'lockout_duration': '30',
        'two_factor_enabled': 'false',
        'allowed_file_types': 'pdf,jpg,jpeg,png,doc,docx',
        'max_file_size': '10',
    }
    
    return get_settings(keys, defaults)


def get_notification_settings():
    """Get all notification settings"""
    keys = [
        'notification_email_enabled',
        'notification_sms_enabled',
        'notification_push_enabled',
        'notify_appointment_created',
        'notify_appointment_reminder',
        'notify_workorder_status',
        'notify_invoice_created',
        'notify_payment_received',
        'appointment_reminder_hours',
        'notification_quiet_hours_start',
        'notification_quiet_hours_end',
    ]
    
    defaults = {
        'notification_email_enabled': 'true',
        'notification_sms_enabled': 'true',
        'notification_push_enabled': 'true',
        'notify_appointment_created': 'true',
        'notify_appointment_reminder': 'true',
        'notify_workorder_status': 'true',
        'notify_invoice_created': 'true',
        'notify_payment_received': 'true',
        'appointment_reminder_hours': '24',
        'notification_quiet_hours_start': '',
        'notification_quiet_hours_end': '',
    }
    
    return get_settings(keys, defaults)


# Validation functions
def validate_email(email):
    """Validate email format"""
    import re
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def validate_url(url):
    """Validate URL format"""
    import re
    pattern = r'^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$'
    return re.match(pattern, url) is not None


def validate_phone(phone):
    """Validate phone number format"""
    import re
    # Basic international phone number validation
    pattern = r'^\+?[1-9]\d{1,14}$'
    cleaned = re.sub(r'[\s\-\(\)]', '', phone)
    return re.match(pattern, cleaned) is not None


def validate_color(color):
    """Validate hex color format"""
    import re
    pattern = r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$'
    return re.match(pattern, color) is not None


def validate_setting_value(key, value):
    """
    Validate setting value based on key
    
    Args:
        key (str): Setting key
        value (str): Value to validate
    
    Returns:
        tuple: (is_valid, error_message)
    """
    # Email validation
    if 'email' in key and '@' in value:
        if not validate_email(value):
            return False, 'Invalid email format'
    
    # URL validation
    if 'url' in key or 'website' in key:
        if value and not validate_url(value):
            return False, 'Invalid URL format'
    
    # Phone validation
    if 'phone' in key:
        if value and not validate_phone(value):
            return False, 'Invalid phone number format'
    
    # Color validation
    if 'color' in key:
        if value and not validate_color(value):
            return False, 'Invalid color format (use #RRGGBB)'
    
    # Numeric validation
    if any(x in key for x in ['rate', 'amount', 'price', 'timeout', 'duration', 'max_', 'min_']):
        try:
            float(value)
        except ValueError:
            return False, 'Must be a numeric value'
    
    # Boolean validation
    if any(x in key for x in ['enabled', 'require', 'is_']):
        if value not in ['true', 'false', 'on', 'off', '1', '0', 'yes', 'no']:
            return False, 'Must be a boolean value (true/false)'
    
    return True, ''
