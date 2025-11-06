"""
Paystack Payment Gateway Integration
Handles payment processing via Paystack for Ghana
Using pypaystack2 library
"""
import logging
from decimal import Decimal
from django.conf import settings
from pypaystack2 import PaystackClient

logger = logging.getLogger(__name__)


def get_paystack_client():
    """Get configured Paystack client"""
    if not settings.PAYSTACK_SECRET_KEY:
        logger.error("Paystack secret key not configured")
        return None
    
    try:
        return PaystackClient(secret_key=settings.PAYSTACK_SECRET_KEY)
    except Exception as e:
        logger.error(f"Failed to create Paystack client: {e}")
        return None


def initialize_payment(email, amount, reference, callback_url=None, metadata=None):
    """
    Initialize a Paystack payment transaction
    
    Args:
        email (str): Customer email
        amount (Decimal/float): Amount in GHS
        reference (str): Unique transaction reference (e.g., invoice number)
        callback_url (str, optional): URL to redirect after payment
        metadata (dict, optional): Additional metadata (customer_name, invoice_id, etc.)
    
    Returns:
        tuple: (success: bool, response: dict/str)
        
    Response dict on success:
        {
            'authorization_url': 'https://checkout.paystack.com/xxx',
            'access_code': 'xxx',
            'reference': 'xxx'
        }
    """
    paystack_client = get_paystack_client()
    if not paystack_client:
        return False, "Paystack not configured"
    
    try:
        # Convert amount to kobo (smallest currency unit)
        # 1 GHS = 100 kobo
        amount_kobo = int(Decimal(str(amount)) * 100)
        
        # Prepare request parameters
        params = {
            'email': email,
            'amount': amount_kobo,
            'reference': reference,
        }
        
        if callback_url:
            params['callback_url'] = callback_url
        
        if metadata:
            params['metadata'] = metadata
        
        response = paystack_client.transaction.initialize(**params)
        
        # Check response status 
        if response.get('status'):
            # Get payment details from response data
            data = response.get('data', {})
            logger.info(f"Paystack payment initialized: {reference} for GHS {amount}")
            return True, {
                'authorization_url': data.get('authorization_url'),
                'access_code': data.get('access_code'),
                'reference': data.get('reference'),
            }
        else:
            error_msg = response.message or 'Unknown error'
            logger.error(f"Failed to initialize Paystack payment: {error_msg}")
            return False, f"Payment initialization failed: {error_msg}"
            
    except Exception as e:
        logger.error(f"Exception initializing Paystack payment: {e}")
        return False, f"Payment error: {str(e)}"


def verify_payment(reference):
    """
    Verify a Paystack payment transaction
    
    Args:
        reference (str): Transaction reference to verify
        
    Returns:
        tuple: (success: bool, data: dict/str)
        
    Data dict on success:
        {
            'status': 'success',
            'amount': 10000,  # in kobo
            'reference': 'xxx',
            'paid_at': '2025-01-01T12:00:00.000Z',
            'channel': 'card',
            'customer': {...}
        }
    """
    paystack_client = get_paystack_client()
    if not paystack_client:
        return False, "Paystack not configured"
    
    try:
        response = paystack_client.transaction.verify(reference=reference)
        
        # Check response status
        if response.get('status'):
            data = response.get('data', {})
            status = data.get('status')
            
            if status == 'success':
                logger.info(f"Paystack payment verified: {reference}")
                return True, {
                    'status': status,
                    'amount': data.get('amount'),  # in kobo
                    'amount_ghs': Decimal(data.get('amount', 0)) / 100,  # convert to GHS
                    'reference': data.get('reference'),
                    'paid_at': data.get('paid_at'),
                    'channel': data.get('channel'),
                    'customer': data.get('customer'),
                    'metadata': data.get('metadata', {}),
                }
            else:
                logger.warning(f"Paystack payment not successful: {reference} - Status: {status}")
                return False, f"Payment status: {status}"
        else:
            error_msg = response.message or 'Unknown error'
            logger.error(f"Failed to verify Paystack payment: {error_msg}")
            return False, f"Verification failed: {error_msg}"
            
    except Exception as e:
        logger.error(f"Exception verifying Paystack payment: {e}")
        return False, f"Verification error: {str(e)}"


def get_transaction_status(reference):
    """
    Get the status of a transaction
    
    Args:
        reference (str): Transaction reference
        
    Returns:
        str: Transaction status ('success', 'failed', 'abandoned', etc.)
    """
    success, data = verify_payment(reference)
    if success:
        return data.get('status')
    return 'unknown'


def refund_payment(transaction_id, amount=None):
    """
    Initiate a refund for a transaction
    
    Args:
        transaction_id (int): Paystack transaction ID
        amount (int, optional): Amount to refund in kobo (full refund if not specified)
        
    Returns:
        tuple: (success: bool, response: dict/str)
    """
    # Note: Refunds require special API access from Paystack
    # This is a placeholder for future implementation
    logger.warning("Paystack refunds require contacting Paystack support")
    return False, "Refunds must be processed through Paystack dashboard"


# Example usage and testing
if __name__ == '__main__':
    import os
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    
    # Test payment initialization
    print("Testing Paystack Integration")
    print("=" * 50)
    
    success, response = initialize_payment(
        email='customer@example.com',
        amount=100.50,
        reference='TEST-INV-001',
        metadata={
            'customer_name': 'John Doe',
            'invoice_number': 'INV-001'
        }
    )
    
    if success:
        print(f"Payment URL: {response['authorization_url']}")
    else:
        print(f"Error: {response}")
