"""
Custom JWT token views with reCAPTCHA verification
"""
import os
import requests
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import status, serializers
from rest_framework.response import Response
from django.conf import settings


class RecaptchaTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Custom serializer that includes reCAPTCHA verification"""
    
    def validate(self, attrs):
        # Get reCAPTCHA token from request data
        recaptcha_token = self.initial_data.get('recaptcha_token')
        
        # Only verify reCAPTCHA if secret key is configured
        recaptcha_secret_key = getattr(settings, 'RECAPTCHA_SECRET_KEY', None)
        
        if recaptcha_secret_key:
            if not recaptcha_token:
                raise serializers.ValidationError({
                    'recaptcha_token': 'reCAPTCHA verification is required.'
                })
            
            # Verify reCAPTCHA token with Google
            recaptcha_verified = self._verify_recaptcha(recaptcha_token)
            
            if not recaptcha_verified:
                raise serializers.ValidationError({
                    'recaptcha_token': 'reCAPTCHA verification failed. Please try again.'
                })
        
        # Continue with normal token validation
        return super().validate(attrs)
    
    def _verify_recaptcha(self, token):
        """Verify reCAPTCHA token with Google's API"""
        recaptcha_secret_key = getattr(settings, 'RECAPTCHA_SECRET_KEY', None)
        
        if not recaptcha_secret_key:
            return True  # Skip verification if not configured
        
        try:
            response = requests.post(
                'https://www.google.com/recaptcha/api/siteverify',
                data={
                    'secret': recaptcha_secret_key,
                    'response': token
                },
                timeout=5
            )
            
            result = response.json()
            return result.get('success', False)
        except Exception as e:
            # Log error but don't block login in case of network issues
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"reCAPTCHA verification error: {str(e)}")
            # In case of network error, allow login (fail open)
            # Change to return False if you want fail closed
            return True


class RecaptchaTokenObtainPairView(TokenObtainPairView):
    """Custom token view with reCAPTCHA verification"""
    serializer_class = RecaptchaTokenObtainPairSerializer

