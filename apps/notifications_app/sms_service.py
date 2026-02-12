"""
SMS Service Integration
Supports Twilio and other SMS providers
"""
import logging
from typing import List, Optional
from django.conf import settings
from apps.accounts.settings_utils import get_sms_settings

logger = logging.getLogger(__name__)


class SMSService:
    """Base SMS service class"""
    
    def __init__(self):
        self.name = "Base SMS Service"
    
    def send_sms(
        self,
        to: str,
        message: str,
        from_number: Optional[str] = None
    ) -> tuple[bool, str]:
        """
        Send an SMS
        
        Args:
            to: Recipient phone number (E.164 format)
            message: SMS message text
            from_number: Sender phone number (optional, uses default)
            
        Returns:
            Tuple of (success, message_id or error_message)
        """
        raise NotImplementedError
    
    def send_bulk_sms(
        self,
        to: List[str],
        message: str,
        from_number: Optional[str] = None
    ) -> dict:
        """
        Send SMS to multiple recipients
        
        Args:
            to: List of recipient phone numbers
            message: SMS message text
            from_number: Sender phone number (optional)
            
        Returns:
            Dict with success count and results
        """
        results = {'success': 0, 'failed': 0, 'results': []}
        
        for number in to:
            success, result = self.send_sms(number, message, from_number)
            if success:
                results['success'] += 1
                results['results'].append({'to': number, 'status': 'success', 'message_id': result})
            else:
                results['failed'] += 1
                results['results'].append({'to': number, 'status': 'failed', 'error': result})
        
        return results


class TwilioSMSService(SMSService):
    """Twilio SMS service integration"""
    
    def __init__(self):
        super().__init__()
        self.name = "Twilio"
        try:
            from twilio.rest import Client
            
            account_sid = getattr(settings, 'TWILIO_ACCOUNT_SID', '')
            auth_token = getattr(settings, 'TWILIO_AUTH_TOKEN', '')
            
            if account_sid and auth_token:
                self.client = Client(account_sid, auth_token)
                self.from_number = getattr(settings, 'TWILIO_PHONE_NUMBER', '')
            else:
                self.client = None
                logger.warning("Twilio credentials not configured")
        except ImportError:
            logger.error("Twilio library not installed. Install with: pip install twilio")
            self.client = None
    
    def send_sms(
        self,
        to: str,
        message: str,
        from_number: Optional[str] = None
    ) -> tuple[bool, str]:
        """Send SMS via Twilio"""
        if not self.client:
            logger.error("Twilio client not configured")
            return False, "Twilio client not configured"
        
        try:
            from_number = from_number or self.from_number
            
            if not from_number:
                return False, "Twilio phone number not configured"
            
            # Ensure phone number is in E.164 format
            to = self._format_phone_number(to)
            
            message_obj = self.client.messages.create(
                body=message,
                from_=from_number,
                to=to
            )
            
            logger.info(f"SMS sent successfully via Twilio to {to}, SID: {message_obj.sid}")
            return True, message_obj.sid
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Twilio SMS error: {error_msg}")
            return False, error_msg
    
    def _format_phone_number(self, phone: str) -> str:
        """Format phone number to E.164 format"""
        # Remove all non-digit characters
        digits = ''.join(filter(str.isdigit, phone))
        
        # If it doesn't start with +, assume US number and add +1
        if not phone.startswith('+'):
            if len(digits) == 10:
                return f"+1{digits}"
            elif len(digits) == 11 and digits[0] == '1':
                return f"+{digits}"
        
        # If it already has +, return as is
        if phone.startswith('+'):
            return phone
        
        return f"+{digits}"

class HubtelSMSService(SMSService):
    """Hubtel SMS service integration for Ghana"""
    
    def __init__(self):
        super().__init__()
        self.name = "Hubtel"
        try:
            from apps.notifications_app.hubtel_sms import send_sms
            self.send_hubtel = send_sms
        except ImportError:
            logger.warning("Hubtel SMS module not found")
            self.send_hubtel = None
    
    def send_sms(
        self,
        to: str,
        message: str,
        from_number: Optional[str] = None
    ) -> tuple[bool, str]:
        """Send SMS via Hubtel"""
        if not self.send_hubtel:
            return False, "Hubtel module not available"
            
        success, result = self.send_hubtel(to, message, from_number)
        
        if success:
            if isinstance(result, dict):
                return True, result.get('message_id', 'sent')
            return True, str(result)
        else:
            return False, str(result)

class MockSMSService(SMSService):
    """Mock SMS service for testing/development"""
    
    def __init__(self):
        super().__init__()
        self.name = "Mock SMS"
        self.sent_messages = []
    
    def send_sms(
        self,
        to: str,
        message: str,
        from_number: Optional[str] = None
    ) -> tuple[bool, str]:
        """Mock SMS sending (logs instead of sending)"""
        logger.info(f"[MOCK SMS] To: {to}, Message: {message[:50]}...")
        self.sent_messages.append({
            'to': to,
            'message': message,
            'from': from_number
        })
        return True, f"mock_{len(self.sent_messages)}"


def get_sms_service(service_name: str = None) -> SMSService:
    """
    Get SMS service instance
    
    Args:
        service_name: Name of service ('twilio', 'hubtel', 'mock')
                     If None, uses default from settings
        
    Returns:
        SMSService instance
    """
    if not service_name:
        # Try to get from dynamic settings first
        sms_settings = get_sms_settings()
        service_name = sms_settings.get('sms_provider')
        
        # Fallback to Django settings if not found
        if not service_name:
            service_name = getattr(settings, 'SMS_SERVICE', 'mock')
            
    service_name = str(service_name).lower()
    
    if service_name == 'twilio':
        return TwilioSMSService()
    elif service_name == 'hubtel':
        return HubtelSMSService()
    else:
        # Default to mock for development
        return MockSMSService()


def send_notification_sms(
    recipient_phone: str,
    message: str,
    service_name: str = None
) -> bool:
    """
    Send a notification SMS
    
    Args:
        recipient_phone: Recipient phone number
        message: SMS message text
        service_name: SMS service to use (optional)
        
    Returns:
        True if successful, False otherwise
    """
    try:
        sms_service = get_sms_service(service_name)
        success, result = sms_service.send_sms(recipient_phone, message)
        return success
    except Exception as e:
        logger.error(f"Failed to send notification SMS: {str(e)}")
        return False

