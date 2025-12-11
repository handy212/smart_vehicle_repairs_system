"""
Hubtel SMS Integration for Ghana
Sends SMS notifications via Hubtel SMS Gateway
Uses Hubtel SMSC API: https://smsc.hubtel.com/v1/messages/send
"""
import logging
import requests
from django.conf import settings
from apps.accounts.settings_utils import get_sms_settings

logger = logging.getLogger(__name__)

# Hubtel configuration - Try system settings first, fallback to Django settings
def _get_hubtel_config():
    """Get Hubtel configuration from system settings or Django settings"""
    sms_settings = get_sms_settings()
    
    # Try system settings first
    client_id = sms_settings.get('hubtel_client_id') or getattr(settings, 'HUBTEL_CLIENT_ID', '')
    client_secret = sms_settings.get('hubtel_client_secret') or getattr(settings, 'HUBTEL_CLIENT_SECRET', '')
    from_id = sms_settings.get('hubtel_sender_id') or getattr(settings, 'HUBTEL_FROM', 'Vehicle Repairs')
    api_url = sms_settings.get('hubtel_api_url') or 'https://smsc.hubtel.com/v1/messages/send'
    
    # Check if SMS is enabled in system settings or Django settings
    sms_enabled = sms_settings.get('sms_enabled', 'false').lower() == 'true'
    django_enabled = getattr(settings, 'HUBTEL_SMS_ENABLED', False)
    enabled = sms_enabled or django_enabled
    
    return {
        'client_id': client_id,
        'client_secret': client_secret,
        'from_id': from_id,
        'api_url': api_url,
        'enabled': enabled,
    }

def is_hubtel_available():
    """Check if Hubtel SMS is configured and available"""
    config = _get_hubtel_config()
    return config['enabled'] and bool(config['client_id']) and bool(config['client_secret'])

# For backward compatibility, functions that return config values dynamically
def get_hubtel_client_id():
    """Get Hubtel client ID from system settings or Django settings"""
    return _get_hubtel_config()['client_id']

def get_hubtel_client_secret():
    """Get Hubtel client secret from system settings or Django settings"""
    return _get_hubtel_config()['client_secret']

def get_hubtel_from():
    """Get Hubtel sender ID from system settings or Django settings"""
    return _get_hubtel_config()['from_id']

def get_hubtel_api_url():
    """Get Hubtel API URL from system settings or Django settings"""
    return _get_hubtel_config()['api_url']

def is_hubtel_enabled():
    """Check if Hubtel is enabled from system settings or Django settings"""
    return _get_hubtel_config()['enabled']

# Note: For backward compatibility, any code that directly accesses these
# module-level constants will need to be updated to use the functions above
# or the _get_hubtel_config() function. The send_sms() function has been
# updated to use _get_hubtel_config() directly.


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
    Send SMS via Hubtel SMSC API
    
    Args:
        phone_number (str): Recipient phone number
        message (str): SMS message content (max 160 chars for single SMS)
        sender (str, optional): Sender ID/name. Defaults to HUBTEL_FROM
        
    Returns:
        tuple: (success: bool, response: dict/str)
        
    Response dict on success:
        {
            'message_id': 'xxx',
            'status': 0,
            'rate': 0.03,
            'phone': '233244123456'
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
    
    # Use provided sender or default
    config = _get_hubtel_config()
    from_sender = sender or config['from_id']
    
    try:
        # Send SMS using Hubtel SMSC API (Quick Send - GET method)
        response = requests.get(
            config['api_url'],
            params={
                'clientid': config['client_id'],
                'clientsecret': config['client_secret'],
                'from': from_sender,
                'to': formatted_phone,
                'content': message
            },
            timeout=30
        )
        
        # Parse response
        response.raise_for_status()
        data = response.json()
        
        # Check status (0 = sent successfully)
        if data.get('status') == 0:
            logger.info(f"SMS sent successfully to {formatted_phone}: {data.get('messageId')}")
            return True, {
                'message_id': data.get('messageId'),
                'status': data.get('status'),
                'status_description': data.get('statusDescription'),
                'rate': data.get('rate'),
                'network_id': data.get('networkId'),
                'phone': formatted_phone
            }
        else:
            error_msg = data.get('statusDescription', f"Error status: {data.get('status')}")
            logger.error(f"Failed to send SMS to {formatted_phone}: {error_msg}")
            return False, f"Hubtel error: {error_msg}"
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Request error sending SMS via Hubtel to {formatted_phone}: {e}")
        return False, f"Hubtel request error: {str(e)}"
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
    Note: This requires a separate API endpoint that may not be available
    
    Returns:
        tuple: (success: bool, balance: float/str)
    """
    if not is_hubtel_available():
        return False, "Hubtel not configured"
    
    # Hubtel SMSC API doesn't provide a balance check endpoint
    # This would need to be implemented if Hubtel provides such an endpoint
    logger.warning("Balance check not implemented for Hubtel SMSC API")
    return False, "Balance check not available"


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
