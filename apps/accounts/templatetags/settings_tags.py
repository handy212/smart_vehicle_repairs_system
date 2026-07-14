"""
Template tags for system settings
"""
from django import template
from django.db import DatabaseError
from apps.accounts.settings_utils import get_setting

register = template.Library()


@register.simple_tag
def get_setting_value(key, default=''):
    """
    Get a system setting value
    Usage: {% get_setting_value 'company_name' %}
    """
    return get_setting(key, default)


@register.simple_tag
def get_print_footer_branches():
    try:
        from apps.branches.models import Branch
        from apps.branches.utils import branch_print_display_name

        branches = Branch.objects.filter(is_active=True).only('name').order_by('name')
        return [
            {
                'name': branch.name,
                'display_name': branch_print_display_name(branch.name),
            }
            for branch in branches
        ]
    except DatabaseError:
        return []


@register.filter
def branch_print_name(name):
    """Strip trailing 'Branch' from a branch name for print footers."""
    from apps.branches.utils import branch_print_display_name

    return branch_print_display_name(name or '')


@register.filter
def bank_detail_accounts(text):
    """Split free-text bank details into separate payment accounts for printing."""
    from apps.accounts.bank_details import parse_invoice_bank_accounts

    return parse_invoice_bank_accounts(text)


@register.simple_tag
def site_logo(theme='light'):
    """
    Get the appropriate logo based on theme
    Usage: {% site_logo 'dark' %}
    """
    from django.conf import settings
    
    if theme == 'dark':
        logo_path = get_setting('logo_dark_path', '')
        if not logo_path:
            logo_path = get_setting('logo_path', '')
    else:
        logo_path = get_setting('logo_path', '')
    
    if logo_path:
        return f"{settings.MEDIA_URL}{logo_path}"
    return ''


@register.simple_tag
def site_favicon():
    """
    Get the favicon path
    Usage: {% site_favicon %}
    """
    from django.conf import settings
    
    favicon_path = get_setting('favicon_path', '')
    if favicon_path:
        return f"{settings.MEDIA_URL}{favicon_path}"
    return ''


@register.simple_tag
def format_currency(amount, include_symbol=True):
    """
    Format amount with currency
    Usage: {% format_currency 100.50 %}
    """
    from apps.accounts.settings_utils import get_payment_settings
    
    payment = get_payment_settings()
    symbol = payment.get('currency_symbol', '$')
    
    try:
        amount = float(amount)
        if include_symbol:
            return f"{symbol}{amount:,.2f}"
        return f"{amount:,.2f}"
    except (ValueError, TypeError):
        if include_symbol:
            return f"{symbol}0.00"
        return "0.00"


@register.filter
def with_currency(amount):
    """
    Filter to add currency symbol to amount
    Usage: {{ amount|with_currency }}
    """
    from apps.accounts.settings_utils import get_payment_settings
    
    payment = get_payment_settings()
    symbol = payment.get('currency_symbol', '$')
    
    try:
        amount = float(amount)
        return f"{symbol}{amount:,.2f}"
    except (ValueError, TypeError):
        return f"{symbol}0.00"
