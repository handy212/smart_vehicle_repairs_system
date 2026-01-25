"""
Serializers for Google OAuth integration with JWT authentication.
"""
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from allauth.socialaccount.models import SocialAccount

User = get_user_model()


class GoogleAuthSerializer(serializers.Serializer):
    """
    Serializer for Google OAuth authentication using Code Flow.
    Accepts an authorization code and returns JWT tokens.
    """
    code = serializers.CharField(required=True, help_text="Google authorization code from frontend")
    
    def validate_code(self, value):
        """
        Exchange the auth code for an id_token and validate it.
        """
        import requests as py_requests
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests
        from django.conf import settings
        
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            # Get credentials from settings
            google_settings = settings.SOCIALACCOUNT_PROVIDERS.get('google', {}).get('APP', {})
            client_id = google_settings.get('client_id')
            client_secret = google_settings.get('secret') # Fix: allauth uses 'secret', not 'client_secret'
            
            if not client_id or not client_secret:
                logger.error(f"Google OAuth configuration missing keys. ID exists: {bool(client_id)}, Secret exists: {bool(client_secret)}")
                raise serializers.ValidationError("Google OAuth is not properly configured (missing ID or Secret)")
            
            # Exchange code for tokens
            token_endpoint = "https://oauth2.googleapis.com/token"
            data = {
                'code': value,
                'client_id': client_id,
                'client_secret': client_secret,
                'redirect_uri': 'postmessage',
                'grant_type': 'authorization_code',
            }
            
            logger.info(f"Attempting token exchange for client_id: {client_id[:10]}...")
            response = py_requests.post(token_endpoint, data=data)
            token_data = response.json()
            
            if 'error' in token_data:
                logger.error(f"Google Token Exchange Failed: {token_data}")
                raise serializers.ValidationError(f"Google Token Exchange Error: {token_data.get('error_description', token_data['error'])}")
            
            id_token_val = token_data.get('id_token')
            if not id_token_val:
                raise serializers.ValidationError("No ID token returned from Google")
            
            # Verify the ID token we just got
            idinfo = id_token.verify_oauth2_token(
                id_token_val, 
                google_requests.Request(), 
                client_id
            )
            
            return idinfo
            
        except Exception as e:
            if isinstance(e, serializers.ValidationError):
                raise e
            raise serializers.ValidationError(f"Authentication failed: {str(e)}")
    
    def create(self, validated_data):
        """
        Check if user exists. If yes, log in. If no, trigger OTP-secured registration.
        """
        idinfo = validated_data['code']
        
        email = idinfo.get('email')
        google_id = idinfo.get('sub')
        
        if not email or not google_id:
            raise serializers.ValidationError("Email and Google ID are required")
        
        import random
        from apps.accounts.models import RegistrationOTP
        from django.core.mail import send_mail
        from django.conf import settings
        
        def send_registration_otp(target_email):
            # Generate 6-digit code
            code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
            
            # Save/Update OTP in DB
            RegistrationOTP.objects.update_or_create(
                email=target_email,
                defaults={'otp_code': code, 'is_verified': False}
            )
            
            # Send Email
            try:
                subject = f"Your Verification Code: {code}"
                message = f"Hello,\n\nYour verification code for Smart Vehicle Repairs is: {code}\n\nPlease enter this code to complete your registration.\n\nThank you!"
                send_mail(
                    subject,
                    message,
                    settings.DEFAULT_FROM_EMAIL,
                    [target_email],
                    fail_silently=False,
                )
                return True
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Failed to send registration OTP: {str(e)}")
                return False

        # Check if user already exists
        user = User.objects.filter(email__iexact=email).first()
        
        if user:
            # User exists, check if social account is linked
            social_account, created = SocialAccount.objects.get_or_create(
                user=user,
                provider='google',
                defaults={
                    'uid': google_id,
                    'extra_data': idinfo
                }
            )
            
            # Allow existing users to login even without phone number
            # Only require phone for NEWLY created users through this Google flow
            # (i.e. if social account was just created AND user has no password)
            is_new_social_user = created and not user.has_usable_password()

            if is_new_social_user and not user.phone:
                send_registration_otp(email)
                return {
                    'registration_required': True,
                    'user_data': {
                        'email': email,
                        'first_name': user.first_name or idinfo.get('given_name', ''),
                        'last_name': user.last_name or idinfo.get('family_name', ''),
                        'google_id': google_id,
                        'profile_picture': idinfo.get('picture', ''),
                    },
                    'google_token_info': idinfo
                }
            
            refresh = RefreshToken.for_user(user)
            return {
                'registration_required': False,
                'user': user,
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }
        
        # User does NOT exist - trigger OTP and flag for registration
        send_registration_otp(email)
        return {
            'registration_required': True,
            'user_data': {
                'email': email,
                'first_name': idinfo.get('given_name', ''),
                'last_name': idinfo.get('family_name', ''),
                'google_id': google_id,
                'profile_picture': idinfo.get('picture', ''),
            },
            'google_token_info': idinfo # Pass this back to be submitted with the final form
        }


class GoogleRegistrationCompleteSerializer(serializers.Serializer):
    """
    Serializer to finalize Google registration with extra info.
    """
    email = serializers.EmailField(required=True)
    first_name = serializers.CharField(required=True)
    last_name = serializers.CharField(required=True)
    phone = serializers.CharField(required=True)
    customer_type = serializers.ChoiceField(choices=['individual', 'business', 'fleet'], default='individual')
    google_id = serializers.CharField(required=True)
    otp_code = serializers.CharField(required=True, min_length=6, max_length=6)
    
    # Optional business fields
    company_name = serializers.CharField(required=False, allow_blank=True)
    business_type = serializers.CharField(required=False, allow_blank=True)
    tax_id = serializers.CharField(required=False, allow_blank=True)
    
    def create(self, validated_data):
        from django.db import transaction
        from apps.customers.models import Customer
        from apps.accounts.models import RegistrationOTP
        
        email = validated_data['email']
        otp_code = validated_data['otp_code']
        
        # Verify OTP
        otp_record = RegistrationOTP.objects.filter(email=email, otp_code=otp_code).first()
        if not otp_record:
            raise serializers.ValidationError({"otp_code": "Invalid or expired verification code."})
        
        with transaction.atomic():
            # Mark OTP as verified/used
            otp_record.is_verified = True
            otp_record.save()
            
            # 1. Get or Create User
            user = User.objects.filter(email__iexact=email).first()
            
            if user:
                # Update existing partial user
                user.first_name = validated_data['first_name']
                user.last_name = validated_data['last_name']
                user.phone = validated_data['phone']
                user.save()
            else:
                # Create new user
                user = User.objects.create_user(
                    email=email,
                    username=email,
                    first_name=validated_data['first_name'],
                    last_name=validated_data['last_name'],
                    phone=validated_data['phone'],
                    role='customer',
                )

            # 2. Get or Create Social Account
            SocialAccount.objects.get_or_create(
                user=user,
                provider='google',
                uid=validated_data['google_id'],
                defaults={'extra_data': {'email': email, 'manual_registration': True}}
            )
            
            # 3. Create or update Customer Profile
            Customer.objects.update_or_create(
                user=user,
                defaults={
                    'customer_type': validated_data['customer_type'],
                    'company_name': validated_data.get('company_name', ''),
                    'business_type': validated_data.get('business_type', ''),
                    'tax_id': validated_data.get('tax_id', ''),
                }
            )
            
        # 4. Generate Tokens
        refresh = RefreshToken.for_user(user)
        return {
            'user': user,
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }


class GoogleAuthResponseSerializer(serializers.Serializer):
    """
    Updated response serializer to handle registration flags.
    """
    registration_required = serializers.BooleanField(default=False)
    user = serializers.SerializerMethodField()
    refresh = serializers.CharField(required=False)
    access = serializers.CharField(required=False)
    user_data = serializers.DictField(required=False)
    google_token_info = serializers.DictField(required=False)
    
    def get_user(self, obj):
        if 'user' in obj:
            from apps.accounts.serializers import UserSerializer
            return UserSerializer(obj['user']).data
        return None
