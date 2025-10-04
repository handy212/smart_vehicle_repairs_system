"""
Context processors for settings
Makes common settings available in all templates
"""
from django.conf import settings as django_settings
from .settings_utils import get_company_info, get_branding_settings, get_payment_settings


def settings_context(request):
    """
    Add common settings to template context
    """
    company = get_company_info()
    branding = get_branding_settings()
    payment = get_payment_settings()
    
    return {
        'SITE_NAME': branding.get('site_name', 'Smart Vehicle Repairs'),
        'COMPANY_NAME': company.get('company_name', ''),
        'COMPANY_TAGLINE': company.get('company_tagline', ''),
        'COMPANY_EMAIL': company.get('company_email', ''),
        'COMPANY_PHONE': company.get('company_phone', ''),
        'COMPANY_ADDRESS': company.get('company_address', ''),
        'COMPANY_CITY': company.get('company_city', ''),
        'COMPANY_WEBSITE': company.get('company_website', ''),
        'LOGO_PATH': branding.get('logo_path', ''),
        'LOGO_DARK_PATH': branding.get('logo_dark_path', ''),
        'FAVICON_PATH': branding.get('favicon_path', ''),
        'LOGIN_BACKGROUND': branding.get('login_background', ''),
        'PRIMARY_COLOR': branding.get('primary_color', '#0d6efd'),
        'SECONDARY_COLOR': branding.get('secondary_color', '#6c757d'),
        'SUCCESS_COLOR': branding.get('success_color', '#198754'),
        'DANGER_COLOR': branding.get('danger_color', '#dc3545'),
        'CURRENCY_SYMBOL': payment.get('currency_symbol', '$'),
        'CURRENCY_CODE': payment.get('currency', 'USD'),
        'MEDIA_URL': django_settings.MEDIA_URL,
    }
