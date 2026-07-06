"""
Custom password validators that use system settings
"""
from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _
from .settings_utils import get_security_settings


class SystemSettingsMinimumLengthValidator:
    """
    Validate that the password is of a minimum length based on system settings.
    """
    def __init__(self, min_length=None):
        self.min_length = min_length
    
    def validate(self, password, user=None):
        if self.min_length is None:
            security_settings = get_security_settings()
            self.min_length = int(security_settings.get('password_min_length', '8'))
        
        if len(password) < self.min_length:
            raise ValidationError(
                _("This password must contain at least %(min_length)d characters."),
                code='password_too_short',
                params={'min_length': self.min_length},
            )
    
    def get_help_text(self):
        security_settings = get_security_settings()
        min_length = int(security_settings.get('password_min_length', '8'))
        return _("Your password must contain at least %(min_length)d characters.") % {'min_length': min_length}


class SystemSettingsUppercaseValidator:
    """
    Validate that the password contains uppercase letters if required by system settings.
    """
    def validate(self, password, user=None):
        security_settings = get_security_settings()
        require_uppercase = security_settings.get('password_require_uppercase', 'true').lower() == 'true'
        
        if require_uppercase and not any(c.isupper() for c in password):
            raise ValidationError(
                _("This password must contain at least one uppercase letter."),
                code='password_no_upper',
            )
    
    def get_help_text(self):
        security_settings = get_security_settings()
        require_uppercase = security_settings.get('password_require_uppercase', 'true').lower() == 'true'
        if require_uppercase:
            return _("Your password must contain at least one uppercase letter.")
        return ""


class SystemSettingsLowercaseValidator:
    """
    Validate that the password contains lowercase letters if required by system settings.
    """
    def validate(self, password, user=None):
        security_settings = get_security_settings()
        require_lowercase = security_settings.get('password_require_lowercase', 'true').lower() == 'true'
        
        if require_lowercase and not any(c.islower() for c in password):
            raise ValidationError(
                _("This password must contain at least one lowercase letter."),
                code='password_no_lower',
            )
    
    def get_help_text(self):
        security_settings = get_security_settings()
        require_lowercase = security_settings.get('password_require_lowercase', 'true').lower() == 'true'
        if require_lowercase:
            return _("Your password must contain at least one lowercase letter.")
        return ""


class SystemSettingsNumericValidator:
    """
    Validate that the password contains numeric characters if required by system settings.
    """
    def validate(self, password, user=None):
        security_settings = get_security_settings()
        require_number = security_settings.get('password_require_number', 'true').lower() == 'true'
        
        if require_number and not any(c.isdigit() for c in password):
            raise ValidationError(
                _("This password must contain at least one number."),
                code='password_no_number',
            )
    
    def get_help_text(self):
        security_settings = get_security_settings()
        require_number = security_settings.get('password_require_number', 'true').lower() == 'true'
        if require_number:
            return _("Your password must contain at least one number.")
        return ""


class SystemSettingsSpecialCharacterValidator:
    """
    Validate that the password contains special characters if required by system settings.
    """
    def validate(self, password, user=None):
        security_settings = get_security_settings()
        require_special = security_settings.get('password_require_special', 'false').lower() == 'true'
        
        if require_special:
            special_chars = '!@#$%^&*()_+-=[]{}|;:,.<>?'
            if not any(c in special_chars for c in password):
                raise ValidationError(
                    _("This password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)."),
                    code='password_no_special',
                )
    
    def get_help_text(self):
        security_settings = get_security_settings()
        require_special = security_settings.get('password_require_special', 'false').lower() == 'true'
        if require_special:
            return _("Your password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?).")
        return ""

