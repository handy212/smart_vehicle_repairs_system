"""
Custom JWT token views with reCAPTCHA verification.

Reads reCAPTCHA configuration from SystemSettings (DB) first,
falling back to Django settings (env vars).
"""
import logging
import requests
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import serializers
from django.conf import settings

from .throttles import LoginRateThrottle

logger = logging.getLogger(__name__)


def _get_recaptcha_config():
    """
    Read reCAPTCHA configuration from DB first, then env vars.
    Returns (enabled: bool, secret_key: str | None)
    """
    try:
        from .admin_models import SystemSettings

        enabled = SystemSettings.get_setting('recaptcha_enabled', 'false')
        secret_key = SystemSettings.get_setting('recaptcha_secret_key', '')
    except Exception:
        # DB might not be ready (e.g. during migrations)
        enabled = 'false'
        secret_key = ''

    # Fall back to env var if DB has no secret key
    if not secret_key:
        secret_key = getattr(settings, 'RECAPTCHA_SECRET_KEY', '') or ''

    is_enabled = enabled.lower() in ('true', '1', 'yes')
    secret_key = secret_key.strip() or None
    # Do not block login when reCAPTCHA is toggled on without a secret key configured.
    if is_enabled and not secret_key:
        is_enabled = False
    return is_enabled, secret_key


class RecaptchaTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Custom serializer that includes reCAPTCHA verification"""

    def validate(self, attrs):
        is_enabled, secret_key = _get_recaptcha_config()

        if is_enabled and secret_key:
            recaptcha_token = self.initial_data.get('recaptcha_token')

            if not recaptcha_token:
                raise serializers.ValidationError({
                    'recaptcha_token': 'reCAPTCHA verification is required.'
                })

            if not self._verify_recaptcha(recaptcha_token, secret_key):
                raise serializers.ValidationError({
                    'recaptcha_token': 'reCAPTCHA verification failed. Please try again.'
                })

        data = super().validate(attrs)

        user = self.user
        if getattr(user, 'two_factor_enabled', False):
            # Generate a temporary token that expires soon
            from django.core.signing import TimestampSigner
            signer = TimestampSigner()
            temp_token = signer.sign_object({'user_id': user.id})
            
            # Return partial response requiring 2FA
            return {
                'requires_2fa': True,
                'temp_token': temp_token,
                'user_id': user.id,
            }

        return data

    @staticmethod
    def _verify_recaptcha(token, secret_key):
        """Verify reCAPTCHA token with Google's API. Fails CLOSED on errors."""
        try:
            response = requests.post(
                'https://www.google.com/recaptcha/api/siteverify',
                data={
                    'secret': secret_key,
                    'response': token,
                },
                timeout=5,
            )
            result = response.json()
            return result.get('success', False)
        except Exception as e:
            logger.error(f"reCAPTCHA verification error: {e}")
            # Fail CLOSED — block login if Google is unreachable
            return False


class RecaptchaTokenObtainPairView(TokenObtainPairView):
    """Custom token view with reCAPTCHA verification and login-rate throttle."""
    serializer_class = RecaptchaTokenObtainPairSerializer
    throttle_classes = [LoginRateThrottle]
