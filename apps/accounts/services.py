import random
import logging
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from apps.accounts.models import RegistrationOTP

logger = logging.getLogger(__name__)

class OTPService:
    @staticmethod
    def generate_otp(email, first_name=None):
        """
        Generates a 6-digit OTP, saves it, and sends it via email.
        """
        # Generate 6-digit code
        code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
        
        # Save/Update OTP in DB
        # This resets the created_at time which effectively extends the window on resend
        RegistrationOTP.objects.update_or_create(
            email=email,
            defaults={
                'otp_code': code, 
                'is_verified': False,
                'created_at': timezone.now()
            }
        )
        
        # Send Email
        try:
            greeting = f"Hello {first_name}," if first_name else "Hello,"
            subject = f"Your Verification Code: {code}"
            message = f"{greeting}\n\nYour verification code for Smart Vehicle Repairs is: {code}\n\nPlease enter this code to complete your registration.\n\nThank you!"
            
            send_mail(
                subject,
                message,
                settings.DEFAULT_FROM_EMAIL,
                [email],
                fail_silently=False,
            )
            return True
        except Exception as e:
            logger.error(f"Failed to send registration OTP to {email}: {str(e)}")
            return False

    @staticmethod
    def verify_otp(email, code):
        """
        Verifies if the provided OTP is valid and not expired.
        """
        otp_record = RegistrationOTP.objects.filter(email=email, otp_code=code).first()
        
        if not otp_record:
            return False, "Invalid verification code."
            
        if otp_record.is_verified:
            return False, "This code has already been verified."
            
        if otp_record.is_expired:
            return False, "Verification code has expired. Please request a new one."
            
        return True, otp_record
