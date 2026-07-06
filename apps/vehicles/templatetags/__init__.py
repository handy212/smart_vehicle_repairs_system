"""
Custom template filters for vehicles app
"""
from django import template
import os

register = template.Library()

@register.filter
def file_exists(value):
    """
    Check if a file exists on the filesystem
    Usage: {% if vehicle.image|file_exists %}
    """
    if not value:
        return False
    
    try:
        # Check if the file exists using Django's storage system
        return value.storage.exists(value.name)
    except:
        return False

@register.filter
def safe_image_url(value):
    """
    Get image URL only if file exists, otherwise return None
    Usage: {{ vehicle.image|safe_image_url }}
    """
    if not value:
        return None
        
    try:
        if value.storage.exists(value.name):
            return value.url
        else:
            return None
    except:
        return None