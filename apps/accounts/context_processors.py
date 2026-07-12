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
    
    # Determine login background (prioritize specific, then general, then default)
    # Ensure paths include branding/ prefix if they don't already
    def normalize_branding_path(path):
        if not path:
            return ''
        # Coerce to string and strip whitespace
        path = str(path).strip()
        if not path:
            return ''
        # Remove MEDIA_URL prefix if present (e.g., '/media/' or 'media/')
        media_url = django_settings.MEDIA_URL or '/media/'
        if path.startswith(media_url):
            path = path[len(media_url):]
        if path.startswith('/media/'):
            path = path[len('/media/'):]
        if path.startswith('media/'):
            path = path[len('media/') :]
        # Strip any leading slash after cleanup
        if path.startswith('/'):
            path = path.lstrip('/')
        if path.startswith('branding/'):
            return path
        # If it's just a filename and doesn't start with branding/, add it
        if '/' not in path or path.startswith('login_bg_') or path.startswith('customer_bg_') or path.startswith('staff_bg_'):
            return f'branding/{path}'
        return path
    
    login_bg = normalize_branding_path(branding.get('login_background', ''))
    customer_bg = normalize_branding_path(branding.get('customer_login_background', ''))
    staff_bg = normalize_branding_path(branding.get('staff_login_background', ''))
    overlay_opacity = float(branding.get('login_background_overlay', '0.85'))
    
    return {
        'SITE_NAME': branding.get('site_name', 'Smart Vehicle Repairs'),
        'COMPANY_NAME': company.get('company_name', ''),
        'COMPANY_TAGLINE': company.get('company_tagline', ''),
        'COMPANY_EMAIL': company.get('company_email', ''),
        'COMPANY_PHONE': company.get('company_phone', ''),
        'COMPANY_ADDRESS': company.get('company_address', ''),
        'COMPANY_CITY': company.get('company_city', ''),
        'COMPANY_REGION': company.get('company_region', ''),
        'COMPANY_AREA': company.get('company_area', ''),
        'COMPANY_COUNTRY': company.get('company_country', ''),
        # Legacy aliases for older templates
        'COMPANY_STATE': company.get('company_region', ''),
        'COMPANY_ZIP': company.get('company_area', ''),
        'COMPANY_WEBSITE': company.get('company_website', ''),
        'COMPANY_TAX_ID': company.get('company_tax_id', ''),
        'LOGO_PATH': normalize_branding_path(branding.get('logo_path', '')),
        'LOGO_DARK_PATH': normalize_branding_path(branding.get('logo_dark_path', '')),
        'FAVICON_PATH': normalize_branding_path(branding.get('favicon_path', '')),
        'LOGIN_BACKGROUND': login_bg,  # General background (fallback)
        'CUSTOMER_LOGIN_BACKGROUND': customer_bg or login_bg,  # Customer-specific or fallback
        'STAFF_LOGIN_BACKGROUND': staff_bg or login_bg,  # Staff-specific or fallback
        'LOGIN_BACKGROUND_OVERLAY': overlay_opacity,  # Overlay opacity for readability
        'PRIMARY_COLOR': branding.get('primary_color', '#0d6efd'),
        'SECONDARY_COLOR': branding.get('secondary_color', '#6c757d'),
        'SUCCESS_COLOR': branding.get('success_color', '#198754'),
        'DANGER_COLOR': branding.get('danger_color', '#dc3545'),
        'CURRENCY_SYMBOL': payment.get('currency_symbol', '$'),
        'CURRENCY_CODE': payment.get('currency', 'USD'),
        'MEDIA_URL': django_settings.MEDIA_URL,
    }
