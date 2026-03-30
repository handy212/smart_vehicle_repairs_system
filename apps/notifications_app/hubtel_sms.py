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
    from_id = sms_settings.get('hubtel_sender_id') or getattr(settings, 'HUBTEL_FROM', 'Response1')
    api_url = sms_settings.get('hubtel_api_url') or 'https://smsc.hubtel.com/v1/messages/send'
    
    # Check if SMS is enabled in system settings or Django settings
    # UI Setting takes precedence if set (str 'true' or 'false')
    sms_enabled_str = sms_settings.get('sms_enabled')
    
    if sms_enabled_str and sms_enabled_str in ['true', 'false']:
         enabled = sms_enabled_str.lower() == 'true'
    else:
        # Fallback to django settings if no DB setting exists or it's empty
        enabled = getattr(settings, 'HUBTEL_SMS_ENABLED', False)
    
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
    Uses POST method with Basic Authentication and JSON body
    
    Args:
        phone_number (str): Recipient phone number
        message (str): SMS message content (max 160 chars for single SMS)
        sender (str, optional): Sender ID/name. Defaults to HUBTEL_FROM
        
    Returns:
        tuple: (success: bool, response: dict/str)
        
    Response dict on success:
        {
            'message_id': 'xxx',
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
        # Hubtel SMSC API uses POST with Basic Authentication
        # Matching the working PHP implementation
        import base64
        
        # Create Basic Auth header
        credentials = f"{config['client_id']}:{config['client_secret']}"
        auth_header = base64.b64encode(credentials.encode()).decode()
        
        # Prepare request body (lowercase field names as per Hubtel API)
        payload = {
            'from': from_sender,
            'to': formatted_phone,
            'content': message
        }
        
        # Send SMS using POST with Basic Auth
        response = requests.post(
            config['api_url'],
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Basic {auth_header}'
            },
            timeout=30
        )
        
        # Log the request for debugging
        logger.debug(f"Hubtel API URL: {config['api_url']}")
        logger.debug(f"Hubtel API Request: {payload}")
        
        # Parse response
        response.raise_for_status()
        data = response.json()
        
        # Success is indicated by presence of 'rate' and 'messageId' fields
        # Status 0 also indicates success
        if 'messageId' in data and 'rate' in data:
            message_id = data.get('messageId')
            logger.info(f"SMS sent successfully to {formatted_phone}: {message_id}")
            return True, {
                'message_id': message_id,
                'status': data.get('status', 0),
                'rate': data.get('rate'),
                'network_id': data.get('networkId', ''),
                'phone': formatted_phone
            }
        
        # Handle error responses
        error_msg = data.get('message', 'Failed to send message')
        error_code = data.get('responseCode', 'unknown')
        logger.error(f"Failed to send SMS to {formatted_phone}: {error_msg} (code: {error_code})")
        return False, f"Hubtel error: {error_msg}"
            
    except requests.exceptions.HTTPError as e:
        # Handle HTTP errors specifically
        error_detail = str(e)
        try:
            error_response = e.response.json()
            error_detail = error_response.get('message', error_response.get('Message', str(e)))
            error_code = error_response.get('responseCode', 'unknown')
            logger.error(f"HTTP error sending SMS: {error_detail} (code: {error_code})")
            logger.error(f"Response body: {e.response.text}")
        except:
            logger.error(f"HTTP error sending SMS: {error_detail}")
            logger.error(f"Response body: {e.response.text if hasattr(e.response, 'text') else 'N/A'}")
        return False, f"Hubtel API error: {error_detail}"
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


def get_sms_balance():
    """
    Get SMS account balance from Hubtel
    Returns: dict with balance info or error
    """
    if not is_hubtel_available():
        return {
            'success': False,
            'error': 'Hubtel SMS not configured',
            'balance': 0
        }
    
    config = _get_hubtel_config()
    
    try:
        # Hubtel balance endpoint (use api.hubtel.com as fallback)
        balance_url = 'https://api.hubtel.com/v1/merchantaccount/balance'
        
        # Log attempting balance check
        logger.debug(f"Attempting to fetch SMS balance from {balance_url}")
        
        response = requests.get(
            balance_url,
            auth=(config['client_id'], config['client_secret']),
            timeout=3  # Reduced timeout to prevents blocking workers
        )
        
        if response.status_code == 200:
            data = response.json()
            logger.info(f"SMS balance retrieved successfully: {data}")
            return {
                'success': True,
                'balance': data.get('Balance', 0),
                'currency': data.get('Currency', 'GHS')
            }
        else:
            # Avoid logging large HTML error bodies
            error_text = response.text[:200]
            if '<!DOCTYPE' in error_text or '<html' in error_text:
                error_text = "[HTML Error Page (likely 404 or Maintenance)]"
                
            logger.error(f"Failed to get SMS balance: {response.status_code} - {error_text}")
            return {
                'success': False,
                'error': f'API error: {response.status_code}',
                'balance': 0
            }
            
    except requests.exceptions.Timeout:
        logger.warning("Hubtel SMS balance request timed out after 3s")
        return {
            'success': False,
            'error': 'Request timeout',
            'balance': 0
        }
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to get SMS balance: {str(e)}")
        return {
            'success': False,
            'error': str(e),
            'balance': 0
        }
