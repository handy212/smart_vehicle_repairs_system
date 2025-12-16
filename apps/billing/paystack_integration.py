"""
Paystack Payment Gateway Integration
Handles payment processing via Paystack for Ghana
Using pypaystack2 library
"""
import logging
import os
import re
from decimal import Decimal
from django.conf import settings

logger = logging.getLogger(__name__)

# In this codebase, `.env` is read once at Django startup (see `config/settings/base.py`).
# The dev autoreloader does NOT watch `.env`, so updated env values (like PAYSTACK_SECRET_KEY)
# won't take effect until a full restart. To make development smoother (and avoid confusing
# "Invalid key" errors when `.env` was updated), we optionally re-read `.env` at runtime.
def _get_paystack_secret_key() -> str:
    key = str(getattr(settings, "PAYSTACK_SECRET_KEY", "") or "").strip()

    # Treat obvious placeholder keys as "missing"
    if key and not key.lower().startswith("your-paystack"):
        return key

    # Dev fallback: read `.env` directly (django-environ won't overwrite existing os.environ by default)
    try:
        base_dir = getattr(settings, "BASE_DIR", None)
        if base_dir:
            env_path = os.path.join(str(base_dir), ".env")
            if os.path.exists(env_path):
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        if k.strip() == "PAYSTACK_SECRET_KEY":
                            v = v.strip().strip('"').strip("'")
                            if v:
                                return v
    except Exception:
        pass

    return key

# Try to import PaystackClient - handle different versions
try:
    from pypaystack2 import PaystackClient
except ImportError:
    try:
        from pypaystack2.paystack import PaystackClient
    except ImportError:
        PaystackClient = None
        logger.warning("PaystackClient could not be imported. Paystack functionality will be disabled.")


def get_paystack_client():
    """Get configured Paystack client"""
    if PaystackClient is None:
        logger.error("PaystackClient is not available")
        return None
    
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
    # Get secret key with validation
    secret_key = _get_paystack_secret_key()
    
    # Debug logging (avoid printing the full key)
    logger.debug(f"PAYSTACK_SECRET_KEY present: {bool(secret_key)}")
    if secret_key:
        logger.debug(f"PAYSTACK_SECRET_KEY length: {len(secret_key)}")
        logger.debug(f"PAYSTACK_SECRET_KEY prefix: {secret_key[:10]}...")

    if not secret_key:
        logger.error("PAYSTACK_SECRET_KEY not found in settings")
        return False, "Paystack secret key not configured. Please set PAYSTACK_SECRET_KEY in your .env file."
    # `_get_paystack_secret_key()` already strips whitespace
    
    # Validate key format (Paystack keys start with sk_live_ or sk_test_)
    if not (secret_key.startswith('sk_live_') or secret_key.startswith('sk_test_')):
        logger.warning(f"Paystack secret key format may be invalid (should start with sk_live_ or sk_test_). Got: {secret_key[:15]}...")
        # Continue anyway - let Paystack API validate it
    
    try:
        # Validate email
        if not email or not email.strip():
            return False, "Email is required for Paystack payment initialization"
        
        email = email.strip()
        
        # Validate amount
        if amount <= 0:
            return False, "Payment amount must be greater than zero"
        
        # Convert amount to kobo (smallest currency unit)
        # 1 GHS = 100 kobo
        amount_kobo = int(Decimal(str(amount)) * 100)
        
        if amount_kobo <= 0:
            return False, "Payment amount is too small (must be at least 1 kobo = 0.01 GHS)"
        
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
        
        # Use direct HTTP requests to Paystack API (more reliable than library)
        import requests
        headers = {
            'Authorization': f'Bearer {secret_key}',
            'Content-Type': 'application/json'
        }
        
        # Log request details (without exposing full key)
        logger.info(f"Initializing Paystack payment: email={email}, amount={amount_kobo} kobo, reference={reference}")
        logger.debug(f"Using Paystack key: {secret_key[:15]}... (length: {len(secret_key)})")
        logger.debug(f"Request params: {params}")
        
        try:
            response = requests.post(
                'https://api.paystack.co/transaction/initialize',
                json=params,
                headers=headers,
                timeout=30
            )
        except requests.exceptions.RequestException as e:
            logger.error(f"Network error connecting to Paystack: {e}")
            return False, f"Network error: Unable to connect to Paystack API"
        
        # Log response for debugging
        logger.debug(f"Paystack response status: {response.status_code}")
        logger.debug(f"Paystack response headers: {dict(response.headers)}")
        
        # Check HTTP status
        if response.status_code != 200:
            try:
                error_data = response.json() if response.content else {}
                error_msg = error_data.get('message', f'HTTP {response.status_code}')
                
                # Log full error response for debugging
                logger.error(f"Paystack API error ({response.status_code}): Full response: {error_data}")
                
                # Check if it's actually an authorization error vs other error
                # Sometimes Paystack returns "Invalid key" for other issues too
                if response.status_code == 401:
                    # This is definitely an auth issue
                    error_msg = (
                        "Paystack authentication failed. The secret key may be invalid, expired, or revoked. "
                        "Please verify your PAYSTACK_SECRET_KEY in the Paystack dashboard."
                    )
                elif 'Invalid key' in error_msg or 'Invalid API key' in error_msg or 'Invalid authorization' in error_msg:
                    # Could be auth issue or could be something else
                    error_msg = (
                        f"Paystack returned 'Invalid key' error. This could mean: "
                        "1) Key is invalid/expired, 2) Key doesn't have transaction permissions, "
                        "3) There's an issue with the request format. "
                        f"Full error: {error_data}"
                    )
            except Exception as e:
                error_msg = f'HTTP {response.status_code}: {response.text[:500]}'
                logger.error(f"Error parsing Paystack response: {e}, Raw response: {response.text[:500]}")
            logger.error(f"Paystack API error ({response.status_code}): {error_msg}")
            return False, f"Payment initialization failed: {error_msg}"
        
        try:
            response_data = response.json()
        except Exception as e:
            logger.error(f"Failed to parse Paystack response as JSON: {e}, Response text: {response.text[:500]}")
            return False, f"Payment initialization failed: Invalid response from Paystack API"
        
        # Check response status 
        if response_data.get('status'):
            # Get payment details from response data
            data = response_data.get('data', {})
            logger.info(f"Paystack payment initialized: {reference} for GHS {amount}")
            return True, {
                'authorization_url': data.get('authorization_url'),
                'access_code': data.get('access_code'),
                'reference': data.get('reference'),
            }
        else:
            error_msg = response_data.get('message', '')
            # Log the full error response for debugging
            logger.error(f"Paystack API returned error: {response_data}")
            
            # Provide more helpful error messages
            if 'Invalid key' in error_msg or 'Invalid API key' in error_msg or 'Invalid authorization' in error_msg:
                # The key format is correct, so the issue is likely:
                # 1. Key is expired/revoked in Paystack dashboard
                # 2. Key is for wrong environment (test vs live)
                # 3. Key belongs to different Paystack account
                error_msg = (
                    "Invalid Paystack secret key. The key format is correct but Paystack rejected it. "
                    "Please verify: 1) Key is active in your Paystack dashboard, "
                    "2) You're using the correct key (test vs live), "
                    "3) Key hasn't been revoked or regenerated."
                )
            elif not error_msg:
                error_msg = f"Unknown error from Paystack: {response_data}"
            
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
    # Get secret key with validation
    secret_key = _get_paystack_secret_key()
    if not secret_key:
        logger.error("PAYSTACK_SECRET_KEY not configured in settings")
        return False, "Paystack secret key not configured. Please set PAYSTACK_SECRET_KEY in your settings."
    
    try:
        # Use direct HTTP requests to Paystack API (more reliable than library)
        import requests
        headers = {
            'Authorization': f'Bearer {secret_key}',
            'Content-Type': 'application/json'
        }
        
        response = requests.get(
            f'https://api.paystack.co/transaction/verify/{reference}',
            headers=headers,
            timeout=30
        )
        
        # Check HTTP status
        if response.status_code != 200:
            error_data = response.json() if response.content else {}
            error_msg = error_data.get('message', f'HTTP {response.status_code}')
            logger.error(f"Paystack API error: {error_msg}")
            return False, f"Verification failed: {error_msg}"
        
        response = response.json()
        
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
            error_msg = response.get('message') or str(response) or 'Unknown error'
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
