"""
Middleware to apply security settings dynamically
"""
from django.utils.deprecation import MiddlewareMixin
from .settings_utils import get_security_settings


class SecuritySettingsMiddleware(MiddlewareMixin):
    """
    Middleware to apply security settings from SystemSettings
    This updates session cookie age and other security settings dynamically
    """
    def process_request(self, request):
        """Apply security settings to request/response"""
        security_settings = get_security_settings()
        
        # Update session cookie age from settings
        # Note: This affects new sessions, existing sessions keep their original timeout
        session_timeout_minutes = int(security_settings.get('session_timeout_minutes', '1440'))
        from django.conf import settings
        settings.SESSION_COOKIE_AGE = session_timeout_minutes * 60  # Convert minutes to seconds
        
        return None

