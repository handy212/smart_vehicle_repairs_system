"""
Custom adapters for django-allauth to handle account and social account behavior.
"""
from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.conf import settings


class AccountAdapter(DefaultAccountAdapter):
    """
    Custom account adapter for handling regular account operations.
    """
    
    def is_open_for_signup(self, request):
        """
        Allow signups based on configuration.
        """
        return True  # Allow signups by default
    
    def save_user(self, request, user, form, commit=True):
        """
        Save user and set default role.
        """
        user = super().save_user(request, user, form, commit=False)
        
        # Set default role if not set
        if not hasattr(user, 'role') or not user.role:
            user.role = 'customer'  # Default role for new registrations
        
        if commit:
            user.save()
        
        return user


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    """
    Custom social account adapter for handling OAuth operations.
    """
    
    def is_open_for_signup(self, request, sociallogin):
        """
        Allow social account signups.
        """
        return True
    
    def pre_social_login(self, request, sociallogin):
        """
        Invoked just after user successfully authenticates via a social provider,
        but before the login is actually processed.
        
        This allows us to link social accounts to existing users if email matches.
        """
        # If user is already logged in, link the account
        if request.user.is_authenticated:
            return
        
        # Try to connect social account to existing user with same email
        try:
            email = sociallogin.account.extra_data.get('email', '').lower()
            if email:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                
                try:
                    user = User.objects.get(email__iexact=email)
                    # Connect this social account to the existing user
                    sociallogin.connect(request, user)
                except User.DoesNotExist:
                    pass
        except Exception as e:
            # Log error but don't prevent login
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error in pre_social_login: {str(e)}")
    
    def populate_user(self, request, sociallogin, data):
        """
        Populate user instance from social provider data.
        """
        user = super().populate_user(request, sociallogin, data)
        
        # Set default role for social login users
        if not hasattr(user, 'role') or not user.role:
            user.role = 'customer'
        
        # Extract additional data from Google
        if sociallogin.account.provider == 'google':
            extra_data = sociallogin.account.extra_data
            
            # Set first and last name if not already set
            if not user.first_name and extra_data.get('given_name'):
                user.first_name = extra_data.get('given_name', '')
            
            if not user.last_name and extra_data.get('family_name'):
                user.last_name = extra_data.get('family_name', '')
            
            # Mark email as verified if Google verified it
            if extra_data.get('email_verified'):
                user.email_verified = True
        
        return user
