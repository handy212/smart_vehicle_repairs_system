"""
Custom template tags and filters for admin templates
"""
from django import template

register = template.Library()


@register.filter(name='format_permission')
def format_permission(value):
    """
    Format permission name by replacing underscores with spaces and title-casing
    Example: 'manage_users' -> 'Manage Users'
    """
    if not value:
        return ''
    return value.replace('_', ' ').title()


@register.filter
def get_item(dictionary, key):
    """Get item from dictionary by key"""
    if not dictionary:
        return None
    return dictionary.get(key)
