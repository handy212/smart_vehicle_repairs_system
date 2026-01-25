"""
Settings Utilities
Helper functions for working with system settings
"""
from django.core.cache import cache
from .admin_models import SystemSettings


def get_setting(key, default='', use_cache=True):
    """
    Get a setting value by key with optional caching
    
    Args:
        key (str): The setting key
        default (str): Default value if setting doesn't exist
        use_cache (bool): Whether to use cache
    
    Returns:
        str: The setting value
    """
    if use_cache:
        try:
            cache_key = f'setting_{key}'
            value = cache.get(cache_key)
            
            if value is None:
                value = SystemSettings.get_setting(key, default)
                cache.set(cache_key, value, 300)  # Cache for 5 minutes
            
            return value
        except Exception:
            # If cache fails (e.g., Redis not running), fall back to database
            return SystemSettings.get_setting(key, default)
    
    return SystemSettings.get_setting(key, default)


def get_settings(keys, defaults=None, use_cache=True):
    """
    Get multiple settings at once
    
    Args:
        keys (list): List of setting keys
        defaults (dict): Dictionary of default values
        use_cache (bool): Whether to use cache
    
    Returns:
        dict: Dictionary of key-value pairs
    """
    if defaults is None:
        defaults = {}
    
    results = {}
    
    for key in keys:
        default = defaults.get(key, '')
        results[key] = get_setting(key, default, use_cache)
    
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


def get_company_info():
    """Get all company information settings"""
    keys = [
        'company_name',
        'company_tagline',
        'company_email',
        'company_phone',
        'company_address',
        'company_city',
        'company_state',
        'company_zip',
        'company_country',
        'company_website',
        'company_tax_id',
        'company_registration',
    ]
    
    return get_settings(keys)


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
    ]
    
    return get_settings(keys, {
        'theme_mode': 'light',
        'login_background_overlay': '0.85',  # Default 85% opacity
    })


def get_email_settings():
    """Get all email settings"""
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
    
    return get_settings(keys, defaults)


def get_sms_settings():
    """Get all SMS settings"""
    keys = [
        'sms_enabled',
        'sms_provider',
        'hubtel_client_id',
        'hubtel_client_secret',
        'hubtel_sender_id',
        'hubtel_api_url',
        'sms_signature',
        'sms_test_number',
    ]
    
    defaults = {
        'sms_enabled': 'false',
        'sms_provider': 'hubtel',
        'hubtel_api_url': 'https://smsc.hubtel.com/v1/messages/send',
    }
    
    return get_settings(keys, defaults)


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
        'stripe_public_key',
        'stripe_secret_key',
        'paypal_client_id',
        'paypal_secret',
    ]
    
    defaults = {
        'currency': 'USD',
        'currency_symbol': '$',
        'tax_rate': '0.00',
        'tax_name': 'VAT',
        'payment_terms': '30',
        'late_fee_enabled': 'false',
        'late_fee_type': 'percentage',
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
        'notification_quiet_hours_start': '22:00',
        'notification_quiet_hours_end': '08:00',
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
