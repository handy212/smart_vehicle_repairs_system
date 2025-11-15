"""
Initialize default system settings
"""
from .admin_models import SystemSettings


def initialize_default_settings():
    """
    Initialize default system settings if they don't exist
    """
    default_settings = {
        # Company Info
        'company': [
            {'key': 'company_name', 'value': 'Smart Vehicle Repairs', 'description': 'Company name'},
            {'key': 'company_tagline', 'value': 'Your Trusted Auto Service Partner', 'description': 'Company tagline'},
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
        # Branding & Theme
        'branding': [
            {'key': 'site_name', 'value': 'Smart Vehicle Repairs', 'description': 'Site name'},
            {'key': 'logo_path', 'value': '', 'description': 'Company logo file path'},
            {'key': 'logo_dark_path', 'value': '', 'description': 'Company logo for dark backgrounds'},
            {'key': 'favicon_path', 'value': '', 'description': 'Site favicon file path'},
            {'key': 'login_background', 'value': '', 'description': 'Login page background image'},
            {'key': 'customer_login_background', 'value': '', 'description': 'Customer login page background image'},
            {'key': 'staff_login_background', 'value': '', 'description': 'Staff login page background image'},
            {'key': 'login_background_overlay', 'value': '0.85', 'description': 'Background overlay opacity (0.0 to 1.0)'},
            {'key': 'primary_color', 'value': '#6366f1', 'description': 'Primary brand color'},
            {'key': 'secondary_color', 'value': '#8b5cf6', 'description': 'Secondary brand color'},
            {'key': 'success_color', 'value': '#10b981', 'description': 'Success color'},
            {'key': 'danger_color', 'value': '#ef4444', 'description': 'Danger/error color'},
            {'key': 'theme_mode', 'value': 'light', 'description': 'Theme mode (light/dark)'},
        ],
        # Email Settings
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
        # SMS Settings
        'sms': [
            {'key': 'sms_enabled', 'value': 'false', 'description': 'Enable SMS notifications'},
            {'key': 'sms_provider', 'value': 'hubtel', 'description': 'SMS provider'},
            {'key': 'hubtel_client_id', 'value': '', 'description': 'Hubtel Client ID', 'is_secret': True},
            {'key': 'hubtel_client_secret', 'value': '', 'description': 'Hubtel Client Secret', 'is_secret': True},
            {'key': 'hubtel_sender_id', 'value': '', 'description': 'Hubtel Sender ID'},
            {'key': 'hubtel_api_url', 'value': 'https://api.hubtel.com/v1/messages/send', 'description': 'Hubtel API URL'},
            {'key': 'sms_signature', 'value': 'Smart Vehicle Repairs', 'description': 'SMS signature'},
            {'key': 'sms_test_number', 'value': '', 'description': 'Test phone number for SMS'},
        ],
        # Payment & Billing
        'payment': [
            {'key': 'currency', 'value': 'USD', 'description': 'Default currency code'},
            {'key': 'currency_symbol', 'value': '$', 'description': 'Currency symbol'},
            {'key': 'tax_rate', 'value': '0.00', 'description': 'Default tax rate (%)'},
            {'key': 'tax_name', 'value': 'VAT', 'description': 'Tax name'},
            {'key': 'payment_terms', 'value': '30', 'description': 'Payment terms (days)'},
            {'key': 'late_fee_enabled', 'value': 'false', 'description': 'Enable late payment fees'},
            {'key': 'late_fee_amount', 'value': '0.00', 'description': 'Late fee amount'},
            {'key': 'late_fee_type', 'value': 'percentage', 'description': 'Late fee type (fixed/percentage)'},
            {'key': 'payment_gateway', 'value': '', 'description': 'Payment gateway provider'},
            {'key': 'stripe_public_key', 'value': '', 'description': 'Stripe public key', 'is_secret': True},
            {'key': 'stripe_secret_key', 'value': '', 'description': 'Stripe secret key', 'is_secret': True},
            {'key': 'paypal_client_id', 'value': '', 'description': 'PayPal client ID', 'is_secret': True},
            {'key': 'paypal_secret', 'value': '', 'description': 'PayPal secret', 'is_secret': True},
        ],
        # Notifications
        'notification': [
            {'key': 'notification_email_enabled', 'value': 'true', 'description': 'Enable email notifications'},
            {'key': 'notification_sms_enabled', 'value': 'false', 'description': 'Enable SMS notifications'},
            {'key': 'notification_push_enabled', 'value': 'false', 'description': 'Enable push notifications'},
        ],
        # Security
        'security': [
            {'key': 'password_min_length', 'value': '8', 'description': 'Minimum password length'},
            {'key': 'password_require_uppercase', 'value': 'true', 'description': 'Require uppercase letters'},
            {'key': 'password_require_lowercase', 'value': 'true', 'description': 'Require lowercase letters'},
            {'key': 'password_require_number', 'value': 'true', 'description': 'Require numbers'},
            {'key': 'password_require_special', 'value': 'false', 'description': 'Require special characters'},
            {'key': 'session_timeout', 'value': '30', 'description': 'Session timeout (minutes)'},
            {'key': 'max_login_attempts', 'value': '5', 'description': 'Maximum login attempts'},
            {'key': 'lockout_duration', 'value': '30', 'description': 'Account lockout duration (minutes)'},
            {'key': 'two_factor_enabled', 'value': 'false', 'description': 'Enable two-factor authentication'},
            {'key': 'allowed_file_types', 'value': 'pdf,jpg,jpeg,png,doc,docx', 'description': 'Allowed file types'},
            {'key': 'max_file_size', 'value': '10', 'description': 'Maximum file size (MB)'},
        ],
        # Business Settings
        'business': [
            {'key': 'business_hours_weekday', 'value': '08:00-18:00', 'description': 'Weekday business hours'},
            {'key': 'business_hours_saturday', 'value': '09:00-15:00', 'description': 'Saturday business hours'},
            {'key': 'business_hours_sunday', 'value': 'Closed', 'description': 'Sunday business hours'},
            {'key': 'appointment_duration', 'value': '60', 'description': 'Default appointment duration (minutes)'},
            {'key': 'appointment_buffer', 'value': '15', 'description': 'Appointment buffer time (minutes)'},
            {'key': 'max_appointments_per_day', 'value': '', 'description': 'Maximum appointments per day'},
            {'key': 'online_booking_enabled', 'value': 'true', 'description': 'Enable online booking'},
            {'key': 'deposit_required', 'value': 'false', 'description': 'Require deposit for appointments'},
            {'key': 'deposit_percentage', 'value': '0', 'description': 'Deposit percentage'},
            {'key': 'cancellation_policy', 'value': '', 'description': 'Cancellation policy'},
        ],
        # Integrations
        'integration': [
            {'key': 'google_analytics_id', 'value': '', 'description': 'Google Analytics ID', 'is_secret': True},
            {'key': 'facebook_pixel_id', 'value': '', 'description': 'Facebook Pixel ID', 'is_secret': True},
        ],
        # Maintenance
        'maintenance': [
            {'key': 'maintenance_mode', 'value': 'false', 'description': 'Enable maintenance mode'},
            {'key': 'maintenance_message', 'value': 'System is under maintenance. Please check back later.', 'description': 'Maintenance message'},
        ],
    }
    
    created_count = 0
    
    for category, settings_list in default_settings.items():
        for setting_data in settings_list:
            key = setting_data['key']
            # Check if setting already exists
            if not SystemSettings.objects.filter(key=key).exists():
                SystemSettings.objects.create(
                    category=category,
                    key=key,
                    value=setting_data.get('value', ''),
                    description=setting_data.get('description', ''),
                    is_secret=setting_data.get('is_secret', False),
                    is_active=True
                )
                created_count += 1
    
    return created_count


def initialize_category_settings(category):
    """
    Initialize settings for a specific category
    """
    # Get all default settings
    default_settings = {
        'company': [
            {'key': 'company_name', 'value': 'Smart Vehicle Repairs', 'description': 'Company name'},
            {'key': 'company_tagline', 'value': 'Your Trusted Auto Service Partner', 'description': 'Company tagline'},
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
            {'key': 'logo_path', 'value': '', 'description': 'Company logo file path'},
            {'key': 'logo_dark_path', 'value': '', 'description': 'Company logo for dark backgrounds'},
            {'key': 'favicon_path', 'value': '', 'description': 'Site favicon file path'},
            {'key': 'login_background', 'value': '', 'description': 'Login page background image'},
            {'key': 'customer_login_background', 'value': '', 'description': 'Customer login page background image'},
            {'key': 'staff_login_background', 'value': '', 'description': 'Staff login page background image'},
            {'key': 'login_background_overlay', 'value': '0.85', 'description': 'Background overlay opacity (0.0 to 1.0)'},
            {'key': 'primary_color', 'value': '#6366f1', 'description': 'Primary brand color'},
            {'key': 'secondary_color', 'value': '#8b5cf6', 'description': 'Secondary brand color'},
            {'key': 'success_color', 'value': '#10b981', 'description': 'Success color'},
            {'key': 'danger_color', 'value': '#ef4444', 'description': 'Danger/error color'},
            {'key': 'theme_mode', 'value': 'light', 'description': 'Theme mode (light/dark)'},
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
            {'key': 'sms_enabled', 'value': 'false', 'description': 'Enable SMS notifications'},
            {'key': 'sms_provider', 'value': 'hubtel', 'description': 'SMS provider'},
            {'key': 'hubtel_client_id', 'value': '', 'description': 'Hubtel Client ID', 'is_secret': True},
            {'key': 'hubtel_client_secret', 'value': '', 'description': 'Hubtel Client Secret', 'is_secret': True},
            {'key': 'hubtel_sender_id', 'value': '', 'description': 'Hubtel Sender ID'},
            {'key': 'hubtel_api_url', 'value': 'https://api.hubtel.com/v1/messages/send', 'description': 'Hubtel API URL'},
            {'key': 'sms_signature', 'value': 'Smart Vehicle Repairs', 'description': 'SMS signature'},
            {'key': 'sms_test_number', 'value': '', 'description': 'Test phone number for SMS'},
        ],
        'payment': [
            {'key': 'currency', 'value': 'USD', 'description': 'Default currency code'},
            {'key': 'currency_symbol', 'value': '$', 'description': 'Currency symbol'},
            {'key': 'tax_rate', 'value': '0.00', 'description': 'Default tax rate (%)'},
            {'key': 'tax_name', 'value': 'VAT', 'description': 'Tax name'},
            {'key': 'payment_terms', 'value': '30', 'description': 'Payment terms (days)'},
            {'key': 'late_fee_enabled', 'value': 'false', 'description': 'Enable late payment fees'},
            {'key': 'late_fee_amount', 'value': '0.00', 'description': 'Late fee amount'},
            {'key': 'late_fee_type', 'value': 'percentage', 'description': 'Late fee type (fixed/percentage)'},
            {'key': 'payment_gateway', 'value': '', 'description': 'Payment gateway provider'},
            {'key': 'stripe_public_key', 'value': '', 'description': 'Stripe public key', 'is_secret': True},
            {'key': 'stripe_secret_key', 'value': '', 'description': 'Stripe secret key', 'is_secret': True},
            {'key': 'paypal_client_id', 'value': '', 'description': 'PayPal client ID', 'is_secret': True},
            {'key': 'paypal_secret', 'value': '', 'description': 'PayPal secret', 'is_secret': True},
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
            {'key': 'session_timeout', 'value': '30', 'description': 'Session timeout (minutes)'},
            {'key': 'max_login_attempts', 'value': '5', 'description': 'Maximum login attempts'},
            {'key': 'lockout_duration', 'value': '30', 'description': 'Account lockout duration (minutes)'},
            {'key': 'two_factor_enabled', 'value': 'false', 'description': 'Enable two-factor authentication'},
            {'key': 'allowed_file_types', 'value': 'pdf,jpg,jpeg,png,doc,docx', 'description': 'Allowed file types'},
            {'key': 'max_file_size', 'value': '10', 'description': 'Maximum file size (MB)'},
        ],
        'business': [
            {'key': 'business_hours_weekday', 'value': '08:00-18:00', 'description': 'Weekday business hours'},
            {'key': 'business_hours_saturday', 'value': '09:00-15:00', 'description': 'Saturday business hours'},
            {'key': 'business_hours_sunday', 'value': 'Closed', 'description': 'Sunday business hours'},
            {'key': 'appointment_duration', 'value': '60', 'description': 'Default appointment duration (minutes)'},
            {'key': 'appointment_buffer', 'value': '15', 'description': 'Appointment buffer time (minutes)'},
            {'key': 'max_appointments_per_day', 'value': '', 'description': 'Maximum appointments per day'},
            {'key': 'online_booking_enabled', 'value': 'true', 'description': 'Enable online booking'},
            {'key': 'deposit_required', 'value': 'false', 'description': 'Require deposit for appointments'},
            {'key': 'deposit_percentage', 'value': '0', 'description': 'Deposit percentage'},
            {'key': 'cancellation_policy', 'value': '', 'description': 'Cancellation policy'},
        ],
        'integration': [
            {'key': 'google_analytics_id', 'value': '', 'description': 'Google Analytics ID', 'is_secret': True},
            {'key': 'facebook_pixel_id', 'value': '', 'description': 'Facebook Pixel ID', 'is_secret': True},
        ],
        'maintenance': [
            {'key': 'maintenance_mode', 'value': 'false', 'description': 'Enable maintenance mode'},
            {'key': 'maintenance_message', 'value': 'System is under maintenance. Please check back later.', 'description': 'Maintenance message'},
        ],
    }
    
    if category not in default_settings:
        return 0
    
    created_count = 0
    for setting_data in default_settings[category]:
        key = setting_data['key']
        if not SystemSettings.objects.filter(key=key).exists():
            SystemSettings.objects.create(
                category=category,
                key=key,
                value=setting_data.get('value', ''),
                description=setting_data.get('description', ''),
                is_secret=setting_data.get('is_secret', False),
                is_active=True
            )
            created_count += 1
    
    return created_count

