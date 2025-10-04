"""
Hubtel SMS Integration for Ghana
Sends SMS notifications via Hubtel SMS Gateway
"""
import logging
from django.conf import settings
from pyhubtel_sms import SMS

logger = logging.getLogger(__name__)

# Hubtel configuration
HUBTEL_CLIENT_ID = getattr(settings, 'HUBTEL_CLIENT_ID', '')
HUBTEL_CLIENT_SECRET = getattr(settings, 'HUBTEL_CLIENT_SECRET', '')
HUBTEL_FROM = getattr(settings, 'HUBTEL_FROM', 'Vehicle Repairs')
HUBTEL_ENABLED = getattr(settings, 'HUBTEL_SMS_ENABLED', False)


def initialize_hubtel():
    """
    Initialize Hubtel SMS client
    Returns SMS client instance or None if not configured
    """
    if not HUBTEL_ENABLED:
        logger.info("Hubtel SMS is disabled")
        return None
    
    if not HUBTEL_CLIENT_ID or not HUBTEL_CLIENT_SECRET:
        logger.warning("Hubtel SMS credentials not configured")
        return None
    
    try:
        client = SMS(
            client_id=HUBTEL_CLIENT_ID,
            client_secret=HUBTEL_CLIENT_SECRET
        )
        logger.info("Hubtel SMS client initialized successfully")
        return client
    except Exception as e:
        logger.error(f"Failed to initialize Hubtel SMS client: {e}")
        return None


def is_hubtel_available():
    """Check if Hubtel SMS is configured and available"""
    return HUBTEL_ENABLED and bool(HUBTEL_CLIENT_ID) and bool(HUBTEL_CLIENT_SECRET)


def format_phone_number(phone_number):
    """
    Format phone number for Hubtel (Ghana format)
    
    Args:
        phone_number (str): Phone number in various formats
        
    Returns:
        str: Formatted phone number (233XXXXXXXXX format)
        
    Examples:
        +233244123456 -> 233244123456
        0244123456 -> 233244123456
        244123456 -> 233244123456
    """
    if not phone_number:
        return None
    
    # Remove all non-digit characters
    phone = ''.join(filter(str.isdigit, phone_number))
    
    # Handle different formats
    if phone.startswith('233'):
        # Already in correct format
        return phone
    elif phone.startswith('0'):
        # Remove leading 0 and add 233
        return '233' + phone[1:]
    elif len(phone) == 9:
        # Missing country code and leading 0
        return '233' + phone
    else:
        # Return as is and let Hubtel validate
        return phone


def validate_phone_number(phone_number):
    """
    Validate Ghana phone number
    
    Args:
        phone_number (str): Phone number to validate
        
    Returns:
        tuple: (is_valid, formatted_number, error_message)
    """
    if not phone_number:
        return False, None, "Phone number is required"
    
    formatted = format_phone_number(phone_number)
    
    if not formatted:
        return False, None, "Invalid phone number format"
    
    # Ghana phone numbers should be 12 digits (233 + 9 digits)
    if not formatted.startswith('233'):
        return False, None, "Phone number must be a Ghana number (233)"
    
    if len(formatted) != 12:
        return False, None, f"Invalid phone number length. Expected 12 digits, got {len(formatted)}"
    
    # Valid Ghana network prefixes (after 233)
    valid_prefixes = ['20', '23', '24', '25', '26', '27', '28', '29', '50', '54', '55', '59']
    prefix = formatted[3:5]
    
    if prefix not in valid_prefixes:
        return False, None, f"Invalid Ghana network prefix: {prefix}"
    
    return True, formatted, None


def send_sms(phone_number, message, sender=None):
    """
    Send SMS via Hubtel
    
    Args:
        phone_number (str): Recipient phone number
        message (str): SMS message content (max 160 chars for single SMS)
        sender (str, optional): Sender ID/name. Defaults to HUBTEL_FROM
        
    Returns:
        tuple: (success: bool, response: dict/str)
        
    Response dict on success:
        {
            'message_id': 'xxx',
            'status': 'sent',
            'network': 'MTN',
            'rate': 0.05
        }
    """
    if not is_hubtel_available():
        return False, "Hubtel SMS not configured"
    
    # Validate phone number
    is_valid, formatted_phone, error = validate_phone_number(phone_number)
    if not is_valid:
        return False, f"Invalid phone number: {error}"
    
    # Validate message
    if not message:
        return False, "Message cannot be empty"
    
    # Truncate message if too long (Hubtel handles concatenation)
    if len(message) > 1000:
        logger.warning(f"Message too long ({len(message)} chars), truncating to 1000")
        message = message[:997] + "..."
    
    # Initialize client
    client = initialize_hubtel()
    if not client:
        return False, "Failed to initialize Hubtel SMS client"
    
    # Use provided sender or default
    from_sender = sender or HUBTEL_FROM
    
    try:
        # Send SMS
        response = client.send_message(
            recipient=formatted_phone,
            message=message,
            sender=from_sender
        )
        
        # Check response
        if response and response.get('status') in ['sent', 'success', 'queued']:
            logger.info(f"SMS sent successfully to {formatted_phone}: {response.get('message_id')}")
            return True, {
                'message_id': response.get('message_id'),
                'status': response.get('status'),
                'network': response.get('network'),
                'rate': response.get('rate'),
                'phone': formatted_phone
            }
        else:
            error_msg = response.get('message', 'Unknown error')
            logger.error(f"Failed to send SMS to {formatted_phone}: {error_msg}")
            return False, f"Hubtel error: {error_msg}"
            
    except Exception as e:
        logger.error(f"Exception sending SMS via Hubtel to {formatted_phone}: {e}")
        return False, f"Hubtel error: {str(e)}"


def send_bulk_sms(phone_numbers, message, sender=None):
    """
    Send SMS to multiple recipients
    
    Args:
        phone_numbers (list): List of phone numbers
        message (str): SMS message content
        sender (str, optional): Sender ID/name
        
    Returns:
        dict: Results for each phone number
        {
            '233244123456': {'success': True, 'response': {...}},
            '233501234567': {'success': False, 'response': 'Invalid phone'}
        }
    """
    if not is_hubtel_available():
        return {phone: {'success': False, 'response': 'Hubtel not configured'} 
                for phone in phone_numbers}
    
    results = {}
    
    for phone in phone_numbers:
        success, response = send_sms(phone, message, sender)
        results[phone] = {
            'success': success,
            'response': response
        }
    
    # Log summary
    success_count = sum(1 for r in results.values() if r['success'])
    logger.info(f"Bulk SMS: {success_count}/{len(phone_numbers)} sent successfully")
    
    return results


def check_sms_balance():
    """
    Check Hubtel SMS account balance
    
    Returns:
        tuple: (success: bool, balance: float/str)
    """
    if not is_hubtel_available():
        return False, "Hubtel not configured"
    
    client = initialize_hubtel()
    if not client:
        return False, "Failed to initialize client"
    
    try:
        balance = client.get_balance()
        logger.info(f"Hubtel SMS balance: {balance}")
        return True, balance
    except Exception as e:
        logger.error(f"Failed to check Hubtel balance: {e}")
        return False, str(e)


# Example usage and testing
if __name__ == '__main__':
    # Test phone number formatting
    test_numbers = [
        '+233244123456',
        '0244123456',
        '244123456',
        '233244123456'
    ]
    
    print("Phone Number Formatting Tests:")
    print("=" * 50)
    for num in test_numbers:
        is_valid, formatted, error = validate_phone_number(num)
        print(f"{num} -> {formatted} ({'Valid' if is_valid else f'Invalid: {error}'})")
    
    print("\n" + "=" * 50)
    print("To test SMS sending, configure environment variables:")
    print("HUBTEL_CLIENT_ID=your_client_id")
    print("HUBTEL_CLIENT_SECRET=your_client_secret")
    print("HUBTEL_SMS_ENABLED=True")
    print("=" * 50)
