"""
Hubtel Payment Gateway Integration for Ghana
Handles mobile money and card payments via Hubtel
"""
import logging
import hashlib
import hmac
from decimal import Decimal
from django.conf import settings
from django.utils import timezone
import requests

logger = logging.getLogger(__name__)

# Hubtel Payment configuration
HUBTEL_MERCHANT_ID = getattr(settings, 'HUBTEL_MERCHANT_ID', '')
HUBTEL_API_KEY = getattr(settings, 'HUBTEL_API_KEY', '')
HUBTEL_API_SECRET = getattr(settings, 'HUBTEL_API_SECRET', '')
HUBTEL_PAYMENT_ENABLED = getattr(settings, 'HUBTEL_PAYMENT_ENABLED', False)
HUBTEL_SANDBOX = getattr(settings, 'HUBTEL_SANDBOX', True)

# API URLs
HUBTEL_SANDBOX_URL = 'https://sandbox.hubtel.com/v1/merchantaccount'
HUBTEL_PRODUCTION_URL = 'https://api.hubtel.com/v1/merchantaccount'


def get_api_url():
    """Get the appropriate API URL based on environment"""
    return HUBTEL_SANDBOX_URL if HUBTEL_SANDBOX else HUBTEL_PRODUCTION_URL


def is_hubtel_payment_available():
    """Check if Hubtel payment gateway is configured"""
    return (HUBTEL_PAYMENT_ENABLED and 
            bool(HUBTEL_MERCHANT_ID) and 
            bool(HUBTEL_API_KEY) and 
            bool(HUBTEL_API_SECRET))


def generate_signature(data_string):
    """
    Generate HMAC signature for Hubtel API requests
    
    Args:
        data_string (str): String to sign
        
    Returns:
        str: HMAC-SHA256 signature
    """
    signature = hmac.new(
        HUBTEL_API_SECRET.encode('utf-8'),
        data_string.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return signature


def format_amount(amount):
    """
    Format amount for Hubtel (must be positive number)
    
    Args:
        amount: Amount to format (int, float, Decimal, or string)
        
    Returns:
        Decimal: Formatted amount
    """
    try:
        decimal_amount = Decimal(str(amount))
        if decimal_amount <= 0:
            raise ValueError("Amount must be positive")
        # Round to 2 decimal places
        return decimal_amount.quantize(Decimal('0.01'))
    except (ValueError, TypeError) as e:
        raise ValueError(f"Invalid amount: {e}")


def initiate_mobile_money_payment(
    phone_number,
    amount,
    description,
    client_reference=None,
    network='mtn',
    callback_url=None
):
    """
    Initiate mobile money payment via Hubtel
    
    Args:
        phone_number (str): Customer's phone number (format: 233XXXXXXXXX)
        amount: Payment amount (will be converted to GHS)
        description (str): Payment description
        client_reference (str, optional): Your internal reference/invoice number
        network (str): Mobile network ('mtn', 'vodafone', 'airtel-tigo')
        callback_url (str, optional): URL for payment callback
        
    Returns:
        tuple: (success: bool, response: dict/str)
        
    Response dict on success:
        {
            'transaction_id': 'xxx',
            'status': 'pending',
            'checkout_url': 'https://...',
            'amount': 100.00,
            'phone': '233244123456'
        }
    """
    if not is_hubtel_payment_available():
        return False, "Hubtel payment gateway not configured"
    
    # Validate and format amount
    try:
        formatted_amount = format_amount(amount)
    except ValueError as e:
        return False, str(e)
    
    # Format phone number
    from apps.notifications_app.hubtel_sms import format_phone_number, validate_phone_number
    is_valid, formatted_phone, error = validate_phone_number(phone_number)
    if not is_valid:
        return False, f"Invalid phone number: {error}"
    
    # Prepare request payload
    payload = {
        'CustomerName': 'Customer',  # Can be enhanced with actual customer name
        'CustomerMsisdn': formatted_phone,
        'CustomerEmail': '',  # Optional
        'Channel': network.lower(),
        'Amount': float(formatted_amount),
        'PrimaryCallbackUrl': callback_url or settings.SITE_URL + '/api/payments/hubtel/callback/',
        'Description': description[:100],  # Max 100 chars
        'ClientReference': client_reference or f'PAY-{timezone.now().strftime("%Y%m%d%H%M%S")}'
    }
    
    try:
        # Make API request
        url = f"{get_api_url()}/merchants/{HUBTEL_MERCHANT_ID}/receive/mobilemoney"
        
        response = requests.post(
            url,
            json=payload,
            auth=(HUBTEL_API_KEY, HUBTEL_API_SECRET),
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        # Parse response
        if response.status_code in [200, 201]:
            data = response.json()
            
            if data.get('ResponseCode') == '0000':  # Success
                logger.info(f"Mobile money payment initiated: {data.get('TransactionId')}")
                return True, {
                    'transaction_id': data.get('TransactionId'),
                    'status': 'pending',
                    'checkout_url': data.get('CheckoutUrl'),
                    'amount': float(formatted_amount),
                    'phone': formatted_phone,
                    'reference': payload['ClientReference']
                }
            else:
                error_msg = data.get('Message', 'Payment initiation failed')
                logger.error(f"Hubtel payment failed: {error_msg}")
                return False, error_msg
        else:
            logger.error(f"Hubtel API error: {response.status_code} - {response.text}")
            return False, f"API error: {response.status_code}"
            
    except requests.exceptions.Timeout:
        logger.error("Hubtel API request timeout")
        return False, "Request timeout"
    except Exception as e:
        logger.error(f"Exception initiating Hubtel payment: {e}")
        return False, f"Payment error: {str(e)}"


def check_payment_status(transaction_id):
    """
    Check status of a payment transaction
    
    Args:
        transaction_id (str): Hubtel transaction ID
        
    Returns:
        tuple: (success: bool, status_data: dict/str)
        
    Status data on success:
        {
            'transaction_id': 'xxx',
            'status': 'success' | 'failed' | 'pending',
            'amount': 100.00,
            'phone': '233244123456',
            'timestamp': '2025-10-02T12:00:00'
        }
    """
    if not is_hubtel_payment_available():
        return False, "Hubtel payment gateway not configured"
    
    try:
        url = f"{get_api_url()}/merchants/{HUBTEL_MERCHANT_ID}/transactions/{transaction_id}"
        
        response = requests.get(
            url,
            auth=(HUBTEL_API_KEY, HUBTEL_API_SECRET),
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Map Hubtel status to our status
            hubtel_status = data.get('Status', '').lower()
            status_map = {
                'success': 'success',
                'successful': 'success',
                'failed': 'failed',
                'pending': 'pending',
                'cancelled': 'failed'
            }
            our_status = status_map.get(hubtel_status, 'pending')
            
            return True, {
                'transaction_id': data.get('TransactionId'),
                'status': our_status,
                'amount': data.get('Amount'),
                'phone': data.get('CustomerMsisdn'),
                'timestamp': data.get('TransactionDate'),
                'reference': data.get('ClientReference'),
                'raw_response': data
            }
        else:
            logger.error(f"Failed to check transaction status: {response.status_code}")
            return False, f"API error: {response.status_code}"
            
    except Exception as e:
        logger.error(f"Exception checking transaction status: {e}")
        return False, str(e)


def process_callback(callback_data):
    """
    Process payment callback from Hubtel
    
    Args:
        callback_data (dict): Callback data from Hubtel webhook
        
    Returns:
        dict: Processed payment information
        {
            'transaction_id': 'xxx',
            'status': 'success' | 'failed',
            'amount': 100.00,
            'reference': 'your-ref',
            'phone': '233244123456'
        }
    """
    try:
        # Extract relevant information
        return {
            'transaction_id': callback_data.get('TransactionId'),
            'status': 'success' if callback_data.get('Status') == 'Success' else 'failed',
            'amount': callback_data.get('Amount'),
            'reference': callback_data.get('ClientReference'),
            'phone': callback_data.get('CustomerMsisdn'),
            'network': callback_data.get('Channel'),
            'timestamp': callback_data.get('TransactionDate'),
            'raw_data': callback_data
        }
    except Exception as e:
        logger.error(f"Error processing Hubtel callback: {e}")
        return None


def refund_payment(transaction_id, amount=None, reason=''):
    """
    Refund a payment
    
    Args:
        transaction_id (str): Original transaction ID
        amount (optional): Partial refund amount. If None, full refund
        reason (str): Reason for refund
        
    Returns:
        tuple: (success: bool, response: dict/str)
    """
    if not is_hubtel_payment_available():
        return False, "Hubtel payment gateway not configured"
    
    try:
        payload = {
            'TransactionId': transaction_id,
            'Reason': reason[:100]
        }
        
        if amount:
            payload['Amount'] = float(format_amount(amount))
        
        url = f"{get_api_url()}/merchants/{HUBTEL_MERCHANT_ID}/refund"
        
        response = requests.post(
            url,
            json=payload,
            auth=(HUBTEL_API_KEY, HUBTEL_API_SECRET),
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('ResponseCode') == '0000':
                logger.info(f"Refund initiated for transaction {transaction_id}")
                return True, {
                    'refund_id': data.get('RefundId'),
                    'status': 'processing',
                    'amount': data.get('Amount')
                }
            else:
                return False, data.get('Message', 'Refund failed')
        else:
            return False, f"API error: {response.status_code}"
            
    except Exception as e:
        logger.error(f"Exception processing refund: {e}")
        return False, str(e)


# Supported mobile networks in Ghana
SUPPORTED_NETWORKS = {
    'mtn': 'MTN Mobile Money',
    'vodafone': 'Vodafone Cash',
    'airtel-tigo': 'AirtelTigo Money'
}


def get_supported_networks():
    """Get list of supported mobile money networks"""
    return SUPPORTED_NETWORKS


# Example usage
if __name__ == '__main__':
    print("Hubtel Payment Gateway Integration")
    print("=" * 50)
    print("\nSupported Networks:")
    for code, name in SUPPORTED_NETWORKS.items():
        print(f"  - {code}: {name}")
    
    print("\n" + "=" * 50)
    print("To use Hubtel payments, configure:")
    print("HUBTEL_MERCHANT_ID=your_merchant_id")
    print("HUBTEL_API_KEY=your_api_key")
    print("HUBTEL_API_SECRET=your_api_secret")
    print("HUBTEL_PAYMENT_ENABLED=True")
    print("HUBTEL_SANDBOX=True  # Set to False for production")
    print("=" * 50)
