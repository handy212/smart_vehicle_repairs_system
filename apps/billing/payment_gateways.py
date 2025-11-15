"""
Payment Gateway Integration
Supports Paystack, Stripe, Square, and other payment processors
"""
import logging
from decimal import Decimal
from typing import Dict, Optional, Tuple
from django.conf import settings

logger = logging.getLogger(__name__)


class PaymentGateway:
    """Base class for payment gateway integrations"""
    
    def __init__(self):
        self.name = "Base Gateway"
    
    def create_payment_intent(self, amount: Decimal, currency: str = "USD", metadata: Optional[Dict] = None, email: Optional[str] = None, callback_url: Optional[str] = None) -> Tuple[bool, Dict]:
        """
        Create a payment intent
        
        Args:
            amount: Payment amount
            currency: Currency code (USD, GHS, etc.)
            metadata: Additional metadata
            email: Customer email (required for some gateways like Paystack)
            callback_url: Callback URL for redirect-based payments
            
        Returns:
            Tuple of (success, data_dict or error_message)
        """
        raise NotImplementedError
    
    def confirm_payment(self, payment_intent_id: str) -> Tuple[bool, Dict]:
        """
        Confirm a payment
        
        Args:
            payment_intent_id: Payment intent ID from gateway
            
        Returns:
            Tuple of (success, data_dict or error_message)
        """
        raise NotImplementedError
    
    def refund_payment(self, payment_intent_id: str, amount: Optional[Decimal] = None) -> Tuple[bool, Dict]:
        """
        Refund a payment
        
        Args:
            payment_intent_id: Payment intent ID from gateway
            amount: Refund amount (None for full refund)
            
        Returns:
            Tuple of (success, data_dict or error_message)
        """
        raise NotImplementedError


class PaystackGateway(PaymentGateway):
    """Paystack payment gateway integration (Ghana)"""
    
    def __init__(self):
        super().__init__()
        self.name = "Paystack"
        try:
            from apps.billing.paystack_integration import initialize_payment, verify_payment, get_paystack_client
            self.initialize_payment = initialize_payment
            self.verify_payment = verify_payment
            self.get_paystack_client = get_paystack_client
            self.client = get_paystack_client()
        except ImportError:
            logger.error("Paystack integration not available")
            self.client = None
    
    def create_payment_intent(self, amount: Decimal, currency: str = "GHS", metadata: Optional[Dict] = None, email: Optional[str] = None, callback_url: Optional[str] = None) -> Tuple[bool, Dict]:
        """Create Paystack payment"""
        if not self.client:
            return False, "Paystack client not configured"
        
        if not email:
            return False, "Email is required for Paystack payments"
        
        try:
            # Generate reference from metadata if available
            reference = metadata.get('reference') if metadata else None
            if not reference and metadata:
                invoice_id = metadata.get('invoice_id')
                invoice_number = metadata.get('invoice_number', 'INV')
                reference = f"INV-{invoice_number}-{invoice_id}" if invoice_id else None
            
            if not reference:
                return False, "Reference is required for Paystack payments"
            
            success, result = self.initialize_payment(
                email=email,
                amount=amount,
                reference=reference,
                callback_url=callback_url,
                metadata=metadata
            )
            
            if success:
                return True, {
                    'payment_intent_id': result.get('reference'),
                    'authorization_url': result.get('authorization_url'),
                    'access_code': result.get('access_code'),
                    'reference': result.get('reference'),
                }
            else:
                return False, result
        except Exception as e:
            logger.error(f"Paystack payment creation failed: {str(e)}")
            return False, str(e)
    
    def confirm_payment(self, payment_intent_id: str) -> Tuple[bool, Dict]:
        """Verify Paystack payment"""
        if not self.client:
            return False, "Paystack client not configured"
        
        try:
            success, result = self.verify_payment(payment_intent_id)
            
            if success:
                return True, {
                    'status': result.get('status', 'success'),
                    'amount': result.get('amount_ghs'),
                    'currency': 'GHS',
                    'reference': result.get('reference'),
                    'paid_at': result.get('paid_at'),
                    'channel': result.get('channel'),
                }
            else:
                return False, result
        except Exception as e:
            logger.error(f"Paystack payment verification failed: {str(e)}")
            return False, str(e)
    
    def refund_payment(self, payment_intent_id: str, amount: Optional[Decimal] = None) -> Tuple[bool, Dict]:
        """Refund Paystack payment"""
        # Paystack refunds require special API access
        logger.warning("Paystack refunds require contacting Paystack support or using their dashboard")
        return False, "Refunds must be processed through Paystack dashboard or require special API access"


class StripeGateway(PaymentGateway):
    """Stripe payment gateway integration"""
    
    def __init__(self):
        super().__init__()
        self.name = "Stripe"
        try:
            import stripe
            self.stripe = stripe
            # Initialize Stripe with API key from settings
            stripe.api_key = getattr(settings, 'STRIPE_SECRET_KEY', '')
        except ImportError:
            logger.error("Stripe library not installed. Install with: pip install stripe")
            self.stripe = None
    
    def create_payment_intent(self, amount: Decimal, currency: str = "USD", metadata: Optional[Dict] = None) -> Tuple[bool, Dict]:
        """Create Stripe payment intent"""
        if not self.stripe:
            return False, "Stripe library not installed"
        
        try:
            # Convert Decimal to cents (Stripe uses smallest currency unit)
            amount_cents = int(float(amount) * 100)
            
            intent = self.stripe.PaymentIntent.create(
                amount=amount_cents,
                currency=currency.lower(),
                metadata=metadata or {},
                automatic_payment_methods={
                    'enabled': True,
                },
            )
            
            return True, {
                'payment_intent_id': intent.id,
                'client_secret': intent.client_secret,
                'status': intent.status,
            }
        except Exception as e:
            logger.error(f"Stripe payment intent creation failed: {str(e)}")
            return False, str(e)
    
    def confirm_payment(self, payment_intent_id: str) -> Tuple[bool, Dict]:
        """Confirm Stripe payment"""
        if not self.stripe:
            return False, "Stripe library not installed"
        
        try:
            intent = self.stripe.PaymentIntent.retrieve(payment_intent_id)
            
            return True, {
                'status': intent.status,
                'amount': Decimal(intent.amount) / 100,
                'currency': intent.currency.upper(),
                'payment_method': intent.payment_method,
                'charges': intent.charges.data[0].id if intent.charges.data else None,
            }
        except Exception as e:
            logger.error(f"Stripe payment confirmation failed: {str(e)}")
            return False, str(e)
    
    def refund_payment(self, payment_intent_id: str, amount: Optional[Decimal] = None) -> Tuple[bool, Dict]:
        """Refund Stripe payment"""
        if not self.stripe:
            return False, "Stripe library not installed"
        
        try:
            # Get the charge ID from payment intent
            intent = self.stripe.PaymentIntent.retrieve(payment_intent_id)
            if not intent.charges.data:
                return False, "No charge found for this payment intent"
            
            charge_id = intent.charges.data[0].id
            
            # Create refund
            refund_params = {'charge': charge_id}
            if amount:
                refund_params['amount'] = int(float(amount) * 100)
            
            refund = self.stripe.Refund.create(**refund_params)
            
            return True, {
                'refund_id': refund.id,
                'amount': Decimal(refund.amount) / 100,
                'status': refund.status,
            }
        except Exception as e:
            logger.error(f"Stripe refund failed: {str(e)}")
            return False, str(e)


class SquareGateway(PaymentGateway):
    """Square payment gateway integration"""
    
    def __init__(self):
        super().__init__()
        self.name = "Square"
        try:
            from square.client import Client
            from square.http.auth.o_auth_2 import BearerAuthCredentials
            
            access_token = getattr(settings, 'SQUARE_ACCESS_TOKEN', '')
            environment = getattr(settings, 'SQUARE_ENVIRONMENT', 'sandbox')
            
            if access_token:
                self.client = Client(
                    bearer_auth_credentials=BearerAuthCredentials(access_token=access_token),
                    environment=environment
                )
            else:
                self.client = None
        except ImportError:
            logger.error("Square library not installed. Install with: pip install squareup")
            self.client = None
    
    def create_payment_intent(self, amount: Decimal, currency: str = "USD", metadata: Optional[Dict] = None, email: Optional[str] = None, callback_url: Optional[str] = None) -> Tuple[bool, Dict]:
        """Create Square payment"""
        if not self.client:
            return False, "Square client not configured"
        
        try:
            from square.utilities import ApiHelper
            
            # Convert Decimal to smallest currency unit
            amount_money = {
                'amount': int(float(amount) * 100),
                'currency': currency.upper(),
            }
            
            # Create payment request
            body = {
                'source_id': 'CARD',  # This should be replaced with actual card token
                'amount_money': amount_money,
                'idempotency_key': metadata.get('idempotency_key', '') if metadata else '',
            }
            
            result = self.client.payments.create_payment(body)
            
            if result.is_success():
                payment = result.body['payment']
                return True, {
                    'payment_intent_id': payment['id'],
                    'status': payment['status'],
                    'amount': Decimal(payment['amount_money']['amount']) / 100,
                }
            else:
                errors = result.errors
                error_msg = errors[0]['detail'] if errors else "Unknown error"
                return False, error_msg
        except Exception as e:
            logger.error(f"Square payment creation failed: {str(e)}")
            return False, str(e)
    
    def confirm_payment(self, payment_intent_id: str) -> Tuple[bool, Dict]:
        """Confirm Square payment"""
        if not self.client:
            return False, "Square client not configured"
        
        try:
            result = self.client.payments.get_payment(payment_id=payment_intent_id)
            
            if result.is_success():
                payment = result.body['payment']
                return True, {
                    'status': payment['status'],
                    'amount': Decimal(payment['amount_money']['amount']) / 100,
                    'currency': payment['amount_money']['currency'],
                }
            else:
                errors = result.errors
                error_msg = errors[0]['detail'] if errors else "Unknown error"
                return False, error_msg
        except Exception as e:
            logger.error(f"Square payment confirmation failed: {str(e)}")
            return False, str(e)
    
    def refund_payment(self, payment_intent_id: str, amount: Optional[Decimal] = None) -> Tuple[bool, Dict]:
        """Refund Square payment"""
        if not self.client:
            return False, "Square client not configured"
        
        try:
            # Get payment first to get the amount
            payment_result = self.client.payments.get_payment(payment_id=payment_intent_id)
            if not payment_result.is_success():
                return False, "Payment not found"
            
            payment = payment_result.body['payment']
            refund_amount = amount or Decimal(payment['amount_money']['amount']) / 100
            
            body = {
                'idempotency_key': f"refund_{payment_intent_id}",
                'amount_money': {
                    'amount': int(float(refund_amount) * 100),
                    'currency': payment['amount_money']['currency'],
                },
                'payment_id': payment_intent_id,
            }
            
            result = self.client.refunds.refund_payment(body)
            
            if result.is_success():
                refund = result.body['refund']
                return True, {
                    'refund_id': refund['id'],
                    'amount': Decimal(refund['amount_money']['amount']) / 100,
                    'status': refund['status'],
                }
            else:
                errors = result.errors
                error_msg = errors[0]['detail'] if errors else "Unknown error"
                return False, error_msg
        except Exception as e:
            logger.error(f"Square refund failed: {str(e)}")
            return False, str(e)


def get_payment_gateway(gateway_name: str = None) -> PaymentGateway:
    """
    Get payment gateway instance
    
    Args:
        gateway_name: Name of gateway ('paystack', 'stripe', 'square', etc.)
                     If None, uses default from settings
        
    Returns:
        PaymentGateway instance
    """
    if not gateway_name:
        gateway_name = getattr(settings, 'DEFAULT_PAYMENT_GATEWAY', 'paystack').lower()
    
    if gateway_name == 'paystack':
        return PaystackGateway()
    elif gateway_name == 'stripe':
        return StripeGateway()
    elif gateway_name == 'square':
        return SquareGateway()
    else:
        # Default to Paystack (since it's already in use)
        logger.warning(f"Unknown gateway '{gateway_name}', defaulting to Paystack")
        return PaystackGateway()

