"""
Initialize supported system settings.
"""
from .admin_models import SystemSettings


DEFAULT_SETTINGS = {
    'company': [
        {'key': 'company_name', 'value': 'Smart Vehicle Repairs', 'description': 'Company name'},
        {'key': 'company_email', 'value': '', 'description': 'Company email address'},
        {'key': 'company_phone', 'value': '', 'description': 'Company phone number'},
        {'key': 'company_address', 'value': '', 'description': 'Company street address'},
        {'key': 'company_city', 'value': '', 'description': 'Company city'},
        {'key': 'company_state', 'value': '', 'description': 'Company state/province'},
        {'key': 'company_zip', 'value': '', 'description': 'Company zip/postal code'},
        {'key': 'company_country', 'value': 'USA', 'description': 'Company country'},
        {'key': 'company_website', 'value': '', 'description': 'Company website URL'},
        {'key': 'company_tax_id', 'value': '', 'description': 'Company tax ID', 'is_secret': True},
        {'key': 'company_registration', 'value': '', 'description': 'Company registration number'},
    ],
    'branding': [
        {'key': 'site_name', 'value': 'Smart Vehicle Repairs', 'description': 'Site name'},
        {'key': 'logo_path', 'value': '', 'description': 'Company logo'},
        {'key': 'logo_dark_path', 'value': '', 'description': 'Company logo for dark backgrounds'},
        {'key': 'favicon_path', 'value': '', 'description': 'Site favicon'},
        {'key': 'login_background', 'value': '', 'description': 'Login page background image'},
        {'key': 'login_background_overlay', 'value': '0.85', 'description': 'Login background overlay opacity'},
        {'key': 'primary_color', 'value': '#6366f1', 'description': 'Primary brand color'},
        {'key': 'secondary_color', 'value': '#8b5cf6', 'description': 'Secondary brand color'},
        {'key': 'success_color', 'value': '#10b981', 'description': 'Success color'},
        {'key': 'danger_color', 'value': '#ef4444', 'description': 'Danger/error color'},
        {'key': 'theme_mode', 'value': 'perfex', 'description': 'Theme mode'},
        {'key': 'self_registration_enabled', 'value': 'true', 'description': 'Allow customers to create their own account from the login page'},
        {'key': 'document_watermark_enabled', 'value': 'true', 'description': 'Show watermarks on printed and downloaded documents'},
    ],
    'email': [
        {'key': 'email_enabled', 'value': 'false', 'description': 'Enable email notifications'},
        {'key': 'email_backend', 'value': 'django.core.mail.backends.smtp.EmailBackend', 'description': 'Email backend'},
        {'key': 'email_host', 'value': '', 'description': 'SMTP server host'},
        {'key': 'email_port', 'value': '587', 'description': 'SMTP server port'},
        {'key': 'email_username', 'value': '', 'description': 'SMTP username', 'is_secret': True},
        {'key': 'email_password', 'value': '', 'description': 'SMTP password', 'is_secret': True},
        {'key': 'email_use_tls', 'value': 'true', 'description': 'Use TLS encryption'},
        {'key': 'email_use_ssl', 'value': 'false', 'description': 'Use SSL encryption'},
        {'key': 'email_from_name', 'value': 'Smart Vehicle Repairs', 'description': 'Email sender name'},
        {'key': 'email_from_address', 'value': '', 'description': 'Email sender address'},
        {'key': 'email_reply_to', 'value': '', 'description': 'Email reply-to address'},
        {'key': 'email_signature', 'value': '', 'description': 'Email signature'},
    ],
    'sms': [
        {'key': 'sms_enabled', 'value': 'false', 'description': ''},
        {'key': 'sms_provider', 'value': 'hubtel', 'description': ''},
        {'key': 'hubtel_client_id', 'value': '', 'description': '', 'is_secret': True},
        {'key': 'hubtel_client_secret', 'value': '', 'description': '', 'is_secret': True},
        {'key': 'hubtel_sender_id', 'value': '', 'description': ''},
        {'key': 'hubtel_api_url', 'value': 'https://smsc.hubtel.com/v1/messages/send', 'description': ''},
        {'key': 'twilio_account_sid', 'value': '', 'description': '', 'is_secret': True},
        {'key': 'twilio_auth_token', 'value': '', 'description': '', 'is_secret': True},
        {'key': 'twilio_phone_number', 'value': '', 'description': ''},
        {'key': 'sms_signature', 'value': 'Smart Vehicle Repairs', 'description': ''},
        {'key': 'sms_test_number', 'value': '', 'description': ''},
    ],
    'payment': [
        {'key': 'currency', 'value': 'GHS', 'description': 'Default currency code'},
        {'key': 'currency_symbol', 'value': '₵', 'description': 'Currency symbol'},
        {'key': 'tax_rate', 'value': '0.00', 'description': 'Default tax rate (%)'},
        {'key': 'tax_name', 'value': 'VAT', 'description': 'Tax name'},
        {'key': 'payment_terms', 'value': '30', 'description': 'Payment terms in days'},
        {'key': 'late_fee_enabled', 'value': 'false', 'description': 'Enable late payment fees'},
        {'key': 'late_fee_amount', 'value': '0.00', 'description': 'Late fee amount'},
        {'key': 'late_fee_type', 'value': 'percentage', 'description': 'Late fee type'},
        {'key': 'payment_gateway_enabled', 'value': 'false', 'description': 'Enable online payments'},
        {'key': 'payment_gateway', 'value': 'paystack', 'description': 'Online payment gateway'},
        {'key': 'paystack_public_key', 'value': '', 'description': 'Paystack public key', 'is_secret': True},
        {'key': 'paystack_secret_key', 'value': '', 'description': 'Paystack secret key', 'is_secret': True},
    ],
    'notification': [
        {'key': 'notification_email_enabled', 'value': 'true', 'description': 'Enable email notifications'},
        {'key': 'notification_sms_enabled', 'value': 'false', 'description': 'Enable SMS notifications'},
        {'key': 'notification_push_enabled', 'value': 'false', 'description': 'Enable push notifications'},
    ],
    'security': [
        {'key': 'password_min_length', 'value': '8', 'description': 'Minimum password length'},
        {'key': 'password_require_uppercase', 'value': 'true', 'description': 'Require uppercase letters'},
        {'key': 'password_require_lowercase', 'value': 'true', 'description': 'Require lowercase letters'},
        {'key': 'password_require_number', 'value': 'true', 'description': 'Require numbers'},
        {'key': 'password_require_special', 'value': 'false', 'description': 'Require special characters'},
        {'key': 'session_timeout', 'value': '30', 'description': 'Session timeout in minutes'},
        {'key': 'max_login_attempts', 'value': '5', 'description': 'Maximum login attempts'},
        {'key': 'lockout_duration', 'value': '30', 'description': 'Account lockout duration in minutes'},
        {'key': 'two_factor_enabled', 'value': 'false', 'description': 'Enable two-factor authentication'},
        {'key': 'allowed_file_types', 'value': 'pdf,jpg,jpeg,png,doc,docx', 'description': 'Allowed file types'},
        {'key': 'max_file_size', 'value': '10', 'description': 'Maximum file size in MB'},
    ],
    'business': [
        {'key': 'business_hours_weekday', 'value': '08:00-18:00', 'description': 'Weekday business hours'},
        {'key': 'business_hours_saturday', 'value': '09:00-15:00', 'description': 'Saturday business hours'},
        {'key': 'business_hours_sunday', 'value': 'Closed', 'description': 'Sunday business hours'},
        {'key': 'appointment_duration', 'value': '60', 'description': 'Default appointment duration in minutes'},
        {'key': 'appointment_buffer', 'value': '15', 'description': 'Appointment buffer in minutes'},
        {'key': 'max_appointments_per_day', 'value': '', 'description': 'Maximum appointments per day'},
        {'key': 'online_booking_enabled', 'value': 'true', 'description': 'Enable online booking'},
        {'key': 'deposit_required', 'value': 'false', 'description': 'Require deposit for appointments'},
        {'key': 'deposit_percentage', 'value': '0', 'description': 'Deposit percentage'},
        {'key': 'cancellation_policy', 'value': '', 'description': 'Cancellation policy'},
    ],
    'integration': [
        {'key': 'recaptcha_enabled', 'value': 'false', 'description': ''},
        {'key': 'recaptcha_site_key', 'value': '', 'description': ''},
        {'key': 'recaptcha_secret_key', 'value': '', 'description': '', 'is_secret': True},
        {'key': 'firebase_enabled', 'value': 'false', 'description': ''},
        {'key': 'firebase_api_key', 'value': '', 'description': '', 'is_secret': True},
        {'key': 'firebase_project_id', 'value': '', 'description': ''},
        {'key': 'firebase_messaging_sender_id', 'value': '', 'description': ''},
        {'key': 'firebase_app_id', 'value': '', 'description': ''},
        {'key': 'firebase_credentials_path', 'value': '', 'description': '', 'is_secret': True},
        {'key': 'quickbooks_client_id', 'value': '', 'description': ''},
        {'key': 'quickbooks_client_secret', 'value': '', 'description': '', 'is_secret': True},
        {'key': 'quickbooks_sandbox_enabled', 'value': 'true', 'description': ''},
    ],
    'maintenance': [
        {'key': 'maintenance_mode', 'value': 'false', 'description': 'Enable maintenance mode'},
        {'key': 'maintenance_message', 'value': 'System is under maintenance. Please check back later.', 'description': 'Maintenance message'},
        {'key': 'log_level', 'value': 'INFO', 'description': 'Logging level'},
        {'key': 'backup_enabled', 'value': 'true', 'description': 'Enable scheduled backups'},
        {'key': 'backup_frequency', 'value': 'daily', 'description': 'Scheduled backup frequency'},
        {'key': 'backup_retention_days', 'value': '30', 'description': 'Days to retain backups'},
    ],
}

DEPRECATED_SETTING_KEYS = {
    'customer_login_background',
    'staff_login_background',
    'stripe_public_key',
    'stripe_secret_key',
    'paypal_client_id',
    'paypal_secret',
    'payment_terms_days',
    'late_fee_percentage',
    'smtp_host',
    'smtp_port',
    'smtp_username',
    'smtp_password',
    'smtp_use_tls',
    'smtp_use_ssl',
    'require_2fa',
    'session_timeout_minutes',
    'lockout_duration_minutes',
    'appointment_duration_minutes',
    'appointment_buffer_minutes',
    'allow_online_booking',
    'require_deposit',
}


def supported_setting_keys(category=None):
    if category:
        keys = {setting['key'] for setting in DEFAULT_SETTINGS.get(category, [])}
        if category == 'tax':
            keys.update(key for key, _value, _description in SystemSettings.TAX_SETTING_DEFAULTS)
        return keys
    keys = {setting['key'] for settings_list in DEFAULT_SETTINGS.values() for setting in settings_list}
    keys.update(key for key, _value, _description in SystemSettings.TAX_SETTING_DEFAULTS)
    return keys


def cleanup_deprecated_settings(category=None):
    supported_keys = supported_setting_keys(category)
    managed_categories = set(DEFAULT_SETTINGS.keys()) | {'tax'}
    queryset = SystemSettings.objects.filter(category__in=managed_categories).exclude(key__in=supported_keys)
    if category:
        queryset = queryset.filter(category=category)
    queryset = queryset | SystemSettings.objects.filter(key__in=DEPRECATED_SETTING_KEYS)
    if category:
        queryset = queryset.filter(category=category)
    updated = queryset.exclude(is_active=False).update(is_active=False)
    return updated


def initialize_default_settings():
    created_count = 0
    for category in DEFAULT_SETTINGS:
        created_count += initialize_category_settings(category)
    cleanup_deprecated_settings()
    return created_count


def initialize_category_settings(category):
    if category not in DEFAULT_SETTINGS:
        return 0

    created_count = 0
    for setting_data in DEFAULT_SETTINGS[category]:
        key = setting_data['key']
        setting, created = SystemSettings.objects.get_or_create(
            key=key,
            defaults={
                'category': category,
                'value': setting_data.get('value', ''),
                'description': setting_data.get('description', ''),
                'is_secret': setting_data.get('is_secret', False),
                'is_active': True,
            },
        )
        if created:
            created_count += 1
        else:
            updates = {}
            for field in ('category', 'description', 'is_secret'):
                next_value = category if field == 'category' else setting_data.get(field, False if field == 'is_secret' else '')
                if getattr(setting, field) != next_value:
                    updates[field] = next_value
            if setting.key in supported_setting_keys(category) and not setting.is_active:
                updates['is_active'] = True
            if updates:
                for field, value in updates.items():
                    setattr(setting, field, value)
                setting.save(update_fields=[*updates.keys(), 'updated_at'])

    cleanup_deprecated_settings(category)
    return created_count
