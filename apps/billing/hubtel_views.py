"""
Hubtel Payment API Views
Handles mobile money and card payments via Hubtel Gateway
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone
from decimal import Decimal
import logging

from .models import Invoice, Payment
from .hubtel_payment import (
    initiate_mobile_money_payment,
    check_payment_status,
    refund_payment,
    is_hubtel_payment_available
)

logger = logging.getLogger(__name__)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def initiate_payment(request):
    """
    Initiate payment via Hubtel (Mobile Money or Card)
    
    POST /api/payments/hubtel/initiate/
    
    Body:
    {
        "invoice_id": 123,
        "payment_type": "mobile_money",  // or "card"
        "phone_number": "0244123456",  // Required for mobile_money
        "network": "mtn",  // mtn, vodafone, airteltigo - Required for mobile_money
        "description": "Payment for invoice #INV-001"  // Optional
    }
    
    Response:
    {
        "success": true,
        "transaction_id": "xxx",
        "checkout_url": "https://...",
        "amount": 100.00,
        "status": "pending",
        "message": "Payment initiated successfully"
    }
    """
    if not is_hubtel_payment_available():
        return Response({
            'success': False,
            'error': 'Hubtel payment gateway is not configured'
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    
    # Get request data
    invoice_id = request.data.get('invoice_id')
    payment_type = request.data.get('payment_type', 'mobile_money')
    phone_number = request.data.get('phone_number')
    network = request.data.get('network', 'mtn')
    description = request.data.get('description', '')
    
    # Validate invoice
    if not invoice_id:
        return Response({
            'success': False,
            'error': 'Invoice ID is required'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    invoice = get_object_or_404(Invoice, id=invoice_id)
    
    # Check if user has permission to pay this invoice
    if invoice.customer.user != request.user and not request.user.is_staff:
        return Response({
            'success': False,
            'error': 'You do not have permission to pay this invoice'
        }, status=status.HTTP_403_FORBIDDEN)
    
    # Calculate amount due
    amount_due = invoice.total_amount - invoice.paid_amount
    if amount_due <= 0:
        return Response({
            'success': False,
            'error': 'Invoice is already fully paid'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Initiate payment based on type
    try:
        if payment_type == 'mobile_money':
            # Validate mobile money fields
            if not phone_number:
                return Response({
                    'success': False,
                    'error': 'Phone number is required for mobile money payment'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Initiate mobile money payment
            success, response = initiate_mobile_money_payment(
                phone_number=phone_number,
                amount=amount_due,
                description=description or f"Payment for {invoice.invoice_number}",
                client_reference=invoice.invoice_number,
                network=network,
                callback_url=request.build_absolute_uri('/api/payments/hubtel/callback/')
            )
            
        else:
            return Response({
                'success': False,
                'error': 'Invalid payment type. Only "mobile_money" is currently supported'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if success:
            # Create pending payment record
            payment_method_map = {
                'mtn': 'mtn_momo',
                'vodafone': 'vodafone_cash',
                'airteltigo': 'airteltigo_money',
                'airtel-tigo': 'airteltigo_money'
            }
            
            payment = Payment.objects.create(
                invoice=invoice,
                customer=invoice.customer,
                payment_method=payment_method_map.get(network.lower(), 'hubtel_card'),
                status='pending',
                amount=amount_due,
                payment_date=timezone.now(),
                transaction_id=response.get('transaction_id', ''),
                phone_number=phone_number if payment_type == 'mobile_money' else '',
                network_provider=network.title() if payment_type == 'mobile_money' else '',
                reference_number=response.get('transaction_id', ''),
                notes=f"Hubtel {payment_type.replace('_', ' ').title()} payment initiated",
                processed_by=request.user
            )
            
            logger.info(f"Hubtel payment initiated: {payment.payment_number} for invoice {invoice.invoice_number}")
            
            return Response({
                'success': True,
                'payment_id': payment.id,
                'payment_number': payment.payment_number,
                'transaction_id': response.get('transaction_id'),
                'checkout_url': response.get('checkout_url'),
                'amount': float(amount_due),
                'status': 'pending',
                'message': 'Payment initiated successfully. Please complete payment on your phone or at checkout URL.'
            }, status=status.HTTP_201_CREATED)
        else:
            logger.error(f"Hubtel payment initiation failed: {response}")
            return Response({
                'success': False,
                'error': response
            }, status=status.HTTP_400_BAD_REQUEST)
            
    except Exception as e:
        logger.error(f"Error initiating Hubtel payment: {str(e)}")
        return Response({
            'success': False,
            'error': f'Payment initiation failed: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])  # Hubtel will call this
def payment_callback(request):
    """
    Handle payment callback from Hubtel
    
    POST /api/payments/hubtel/callback/
    
    Hubtel sends payment status updates here.
    Security: Verifies HMAC-SHA256 signature using HUBTEL_API_SECRET.
    """
    import hashlib
    import hmac
    from django.conf import settings as django_settings

    # --- Webhook Signature Verification ---
    hubtel_secret = getattr(django_settings, 'HUBTEL_API_SECRET', '')
    hubtel_signature = request.headers.get('X-Hubtel-Signature', '') or request.headers.get('Authorization', '')

    if hubtel_secret:
        if not hubtel_signature:
            logger.warning("Hubtel callback received without signature header")
            return Response(
                {'message': 'Missing webhook signature'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Compute HMAC-SHA256 of the raw body
        raw_body = request.body
        expected_sig = hmac.new(
            hubtel_secret.encode('utf-8'),
            raw_body,
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(expected_sig, hubtel_signature):
            logger.warning("Invalid Hubtel webhook signature")
            return Response(
                {'message': 'Invalid webhook signature'},
                status=status.HTTP_400_BAD_REQUEST
            )
    else:
        logger.warning(
            "HUBTEL_API_SECRET not configured — webhook signature verification skipped. "
            "Set HUBTEL_API_SECRET in settings to enable verification."
        )

    logger.info(f"Hubtel payment callback received: {request.data}")
    
    try:
        # Extract callback data
        transaction_id = request.data.get('TransactionId') or request.data.get('transaction_id')
        status_code = request.data.get('ResponseCode') or request.data.get('status_code')
        client_reference = request.data.get('ClientReference') or request.data.get('client_reference')
        
        if not transaction_id:
            logger.warning("Hubtel callback missing transaction ID")
            return Response({'message': 'Missing transaction ID'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Find payment by transaction ID
        try:
            payment = Payment.objects.get(transaction_id=transaction_id)
        except Payment.DoesNotExist:
            logger.warning(f"Payment not found for transaction {transaction_id}")
            return Response({'message': 'Payment not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Update payment status based on response code
        # Hubtel response codes: "0000" = success
        if status_code in ['0000', '00', 'Success', 'success']:
            payment.status = 'completed'
            payment.payment_date = timezone.now()
            payment.notes += f"\nPayment completed via Hubtel at {timezone.now()}"
            
            # Update invoice paid amount
            invoice = payment.invoice
            invoice.paid_amount += payment.amount
            if invoice.paid_amount >= invoice.total_amount:
                invoice.status = 'paid'
                invoice.paid_date = timezone.now()
            elif invoice.paid_amount > 0:
                invoice.status = 'partial'
            invoice.save()
            
            logger.info(f"Payment {payment.payment_number} completed successfully")
            
        else:
            payment.status = 'failed'
            payment.notes += f"\nPayment failed via Hubtel: {request.data.get('ResponseText', 'Unknown error')}"
            logger.warning(f"Payment {payment.payment_number} failed: {status_code}")
        
        payment.save()
        
        return Response({'message': 'Callback processed successfully'}, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error processing Hubtel callback: {str(e)}")
        return Response({
            'message': f'Callback processing failed: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def verify_payment_status(request, transaction_id):
    """
    Verify payment status with Hubtel
    
    GET /api/payments/hubtel/verify/{transaction_id}/
    
    Response:
    {
        "success": true,
        "transaction_id": "xxx",
        "status": "completed",
        "amount": 100.00,
        "payment_number": "PAY-001"
    }
    """
    if not is_hubtel_payment_available():
        return Response({
            'success': False,
            'error': 'Hubtel payment gateway is not configured'
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    
    try:
        # Find payment in database
        payment = get_object_or_404(Payment, transaction_id=transaction_id)
        
        # Check permission
        if payment.customer.user != request.user and not request.user.is_staff:
            return Response({
                'success': False,
                'error': 'You do not have permission to view this payment'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Verify with Hubtel
        success, result = check_payment_status(transaction_id)
        
        if success:
            # Update payment status if needed
            hubtel_status = result.get('status', '').lower()
            
            if hubtel_status in ['success', 'completed', 'successful']:
                if payment.status != 'completed':
                    payment.status = 'completed'
                    payment.payment_date = timezone.now()
                    payment.save()
                    
                    # Update invoice
                    invoice = payment.invoice
                    invoice.paid_amount += payment.amount
                    if invoice.paid_amount >= invoice.total_amount:
                        invoice.status = 'paid'
                        invoice.paid_date = timezone.now()
                    elif invoice.paid_amount > 0:
                        invoice.status = 'partial'
                    invoice.save()
            
            elif hubtel_status in ['failed', 'cancelled']:
                if payment.status != 'failed':
                    payment.status = 'failed'
                    payment.save()
            
            return Response({
                'success': True,
                'transaction_id': transaction_id,
                'status': payment.status,
                'amount': float(payment.amount),
                'payment_number': payment.payment_number,
                'payment_date': payment.payment_date,
                'hubtel_status': result.get('status'),
                'message': result.get('message', '')
            })
        else:
            return Response({
                'success': False,
                'error': result
            }, status=status.HTTP_400_BAD_REQUEST)
            
    except Exception as e:
        logger.error(f"Error verifying payment: {str(e)}")
        return Response({
            'success': False,
            'error': f'Verification failed: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def check_payment_status(request, payment_id):
    """
    Check payment status from database
    
    GET /api/payments/hubtel/status/{payment_id}/
    
    Response:
    {
        "success": true,
        "payment_id": 123,
        "payment_number": "PAY-001",
        "status": "completed",
        "amount": 100.00,
        "transaction_id": "xxx",
        "invoice_number": "INV-001"
    }
    """
    try:
        payment = get_object_or_404(Payment, id=payment_id)
        
        # Check permission
        if payment.customer.user != request.user and not request.user.is_staff:
            return Response({
                'success': False,
                'error': 'You do not have permission to view this payment'
            }, status=status.HTTP_403_FORBIDDEN)
        
        return Response({
            'success': True,
            'payment_id': payment.id,
            'payment_number': payment.payment_number,
            'status': payment.status,
            'amount': float(payment.amount),
            'payment_method': payment.get_payment_method_display(),
            'transaction_id': payment.transaction_id,
            'phone_number': payment.phone_number,
            'network_provider': payment.network_provider,
            'payment_date': payment.payment_date,
            'invoice_id': payment.invoice.id,
            'invoice_number': payment.invoice.invoice_number,
            'notes': payment.notes
        })
        
    except Exception as e:
        logger.error(f"Error checking payment status: {str(e)}")
        return Response({
            'success': False,
            'error': f'Status check failed: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
