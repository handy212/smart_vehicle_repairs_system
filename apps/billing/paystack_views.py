"""
Paystack Payment Views
Handles payment initialization, verification, and webhooks
"""
import logging
import json
from urllib.parse import urlencode
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.urls import reverse
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from apps.customers.portal_views import customer_login_required
from apps.billing.models import Invoice, Payment
from apps.billing.paystack_integration import initialize_payment, verify_payment
from apps.notifications_app.triggers import NotificationTriggers

logger = logging.getLogger(__name__)


@csrf_exempt
@api_view(['POST', 'GET'])
@permission_classes([IsAuthenticated])
def initiate_paystack_payment(request, invoice_id):
    """Initialize Paystack payment for an invoice"""
    # Check if this is an API request (always true for this API endpoint)
    is_api_request = True
    
    # Get customer - handle both API and frontend
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Check if user is a customer
    if hasattr(request.user, 'customer_profile'):
        customer = request.user.customer_profile
    elif request.user.role == 'customer' and hasattr(request.user, 'customer_profile'):
        customer = request.user.customer_profile
    else:
        # Allow admins/managers to initiate payments on behalf of customers
        # In this case, we need to get the customer from the invoice
        try:
            invoice = Invoice.objects.get(id=invoice_id)
            customer = invoice.customer
        except Invoice.DoesNotExist:
            return Response({'error': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # Get invoice
    try:
        # For customers, ensure they own the invoice
        if request.user.role == 'customer':
            invoice = Invoice.objects.get(id=invoice_id, customer=customer)
        else:
            # For admins/managers, allow access to any invoice
            invoice = Invoice.objects.get(id=invoice_id)
            customer = invoice.customer  # Use invoice's customer
    except Invoice.DoesNotExist:
        return Response({'error': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # Check if invoice can be paid
    if invoice.status in ['draft', 'void', 'paid']:
        return Response({'error': 'This invoice cannot be paid'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Generate unique reference (invoice_number can be blank in some legacy/dev data)
    # Add timestamp to ensure uniqueness for multiple payment attempts
    import time
    import random
    invoice_no = (invoice.invoice_number or "").strip() or f"{invoice.id}"
    timestamp = int(time.time())
    random_suffix = random.randint(1000, 9999)
    reference = f"INV-{invoice_no}-{invoice.id}-{timestamp}-{random_suffix}"
    
    # Ensure reference is truly unique by checking existing payments
    while Payment.objects.filter(transaction_id=reference).exists():
        timestamp = int(time.time())
        random_suffix = random.randint(1000, 9999)
        reference = f"INV-{invoice_no}-{invoice.id}-{timestamp}-{random_suffix}"
    
    # Prepare callback URL - use API callback URL for API requests
    callback_url = request.build_absolute_uri(
        reverse('api_billing:paystack-payment-callback')
    )
    
    # Get customer email - ensure it's valid
    customer_email = customer.email
    if not customer_email or not customer_email.strip():
        # Try to get email from user account if customer email is missing
        if hasattr(customer, 'user') and customer.user and customer.user.email:
            customer_email = customer.user.email
        else:
            return Response(
                {'error': 'Customer email is required for Paystack payments. Please update customer profile with a valid email address.'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    customer_email = customer_email.strip()
    
    # Prepare metadata
    metadata = {
        'invoice_id': invoice.id,
        'invoice_number': invoice.invoice_number,
        'customer_id': customer.id,
        'customer_name': customer.full_name,
        'vehicle': f"{invoice.vehicle.year} {invoice.vehicle.make} {invoice.vehicle.model}" if invoice.vehicle else None,
    }
    
    # Initialize payment
    success, response = initialize_payment(
        email=customer_email,
        amount=invoice.amount_due,
        reference=reference,
        callback_url=callback_url,
        metadata=metadata
    )
    
    if success:
        # Return JSON response for API
        return Response({
            'success': True,
            'authorization_url': response['authorization_url'],
            'reference': reference,
            'invoice_id': invoice.id,
            'amount': float(invoice.amount_due)
        }, status=status.HTTP_200_OK)
    else:
        return Response({'error': f'Payment initialization failed: {response}'}, status=status.HTTP_400_BAD_REQUEST)


@csrf_exempt
@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def paystack_callback(request):
    """Handle Paystack payment callback"""
    # Check if this is an API request (always true for this API endpoint)
    is_api_request = True
    
    reference = request.GET.get('reference') or (request.data.get('reference') if hasattr(request, 'data') else None)
    
    if not reference:
        # Browser-friendly redirect
        frontend = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3001").rstrip("/")
        return redirect(f"{frontend}/portal/payment/success?status=failed&reason=missing_reference")
    
    # Verify payment
    success, data = verify_payment(reference)
    
    if not success:
        frontend = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3001").rstrip("/")
        return redirect(f"{frontend}/portal/payment/success?status=failed&reference={reference}")
    
    # Check payment status
    if data['status'] != 'success':
        frontend = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3001").rstrip("/")
        qs = urlencode({"status": "failed", "reference": reference, "paystack_status": data.get("status")})
        return redirect(f"{frontend}/portal/payment/success?{qs}")
    
    # Extract invoice ID from metadata
    metadata = data.get('metadata', {})
    invoice_id = metadata.get('invoice_id')
    
    if not invoice_id:
        frontend = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3001").rstrip("/")
        qs = urlencode({"status": "failed", "reference": reference, "reason": "missing_invoice_id"})
        return redirect(f"{frontend}/portal/payment/success?{qs}")
    
    # Get invoice (callback is public; do NOT require logged-in customer)
    try:
        invoice = Invoice.objects.get(id=invoice_id)
        customer = invoice.customer
    except Invoice.DoesNotExist:
        frontend = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3001").rstrip("/")
        qs = urlencode({"status": "failed", "reference": reference, "invoice_id": invoice_id, "reason": "invoice_not_found"})
        return redirect(f"{frontend}/portal/payment/success?{qs}")
    
    # Check if payment already recorded
    existing_payment = Payment.objects.filter(
        invoice=invoice,
        transaction_id=reference
    ).first()
    
    if existing_payment:
        frontend = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3001").rstrip("/")
        qs = urlencode({"status": "success", "invoice_id": invoice.id, "reference": reference})
        return redirect(f"{frontend}/portal/payment/success?{qs}")
    
    # Record payment
    amount_ghs = data['amount_ghs']
    
    # Get user for processed_by (use customer's user if available, otherwise system)
    processed_by = None
    if hasattr(customer, 'user') and customer.user:
        processed_by = customer.user
    
    payment = Payment.objects.create(
        invoice=invoice,
        customer=invoice.customer,
        amount=amount_ghs,
        payment_method='paystack',
        transaction_id=reference,
        payment_date=data.get('paid_at'),
        notes=f"Paystack payment via {data.get('channel', 'online')}",
        processed_by=processed_by
    )
    
    # Update invoice status
    invoice.amount_paid += amount_ghs
    invoice.amount_due = invoice.total - invoice.amount_paid
    
    if invoice.amount_due <= 0:
        invoice.status = 'paid'
    elif invoice.amount_paid > 0:
        invoice.status = 'partial'
    
    invoice.save()
    
    # Activate subscription if this is a subscription invoice
    if 'subscription' in invoice.description.lower():
        from apps.subscriptions.services import SubscriptionService
        try:
            # Find subscription by matching invoice description with package name
            # Invoice description format: "Subscription: {package.name} ({duration} months)"
            subscriptions = invoice.customer.subscriptions.filter(
                status__in=['pending'],
                payment_status='pending'
            ).order_by('-created_at')
            
            subscription = None
            # Try to match by package name in invoice description
            for sub in subscriptions:
                package_name_in_desc = sub.package.name.lower() in invoice.description.lower()
                if package_name_in_desc:
                    subscription = sub
                    break
            
            # Fallback: use most recent pending subscription if no match
            if not subscription:
                subscription = subscriptions.first()
            
            if subscription:
                SubscriptionService.activate_subscription(subscription, invoice)
                logger.info(f"Activated subscription {subscription.subscription_number} after payment for invoice {invoice.id}")
            else:
                logger.warning(f"Could not find subscription for invoice {invoice.id} (description: {invoice.description})")
        except Exception as e:
            logger.error(f"Failed to activate subscription on payment: {e}", exc_info=True)
    
    # Send payment notification
    try:
        NotificationTriggers().payment_received(payment)
    except Exception as e:
        logger.error(f"Failed to send payment notification: {e}")
    
    # Redirect user to frontend success page (better UX than JSON)
    frontend = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3001").rstrip("/")
    qs = urlencode({"status": "success", "invoice_id": invoice.id, "reference": reference})
    return redirect(f"{frontend}/portal/payment/success?{qs}")


@csrf_exempt
@require_POST
@permission_classes([AllowAny])
@authentication_classes([])
def paystack_webhook(request):
    """
    Handle Paystack webhooks for payment events
    
    Paystack sends webhooks for events like:
    - charge.success
    - transfer.success
    - transfer.failed
    """
    # Verify webhook signature
    paystack_signature = request.headers.get('X-Paystack-Signature')
    
    if not paystack_signature:
        logger.warning("Paystack webhook received without signature")
        return HttpResponse(status=400)
    
    # Verify signature (important for security)
    import hashlib
    import hmac
    
    body = request.body
    secret = settings.PAYSTACK_SECRET_KEY.encode('utf-8')
    
    hash_value = hmac.new(secret, body, hashlib.sha512).hexdigest()
    
    if hash_value != paystack_signature:
        logger.warning("Invalid Paystack webhook signature")
        return HttpResponse(status=400)
    
    # Parse webhook data
    try:
        data = json.loads(body)
        event = data.get('event')
        event_data = data.get('data', {})
        
        logger.info(f"Paystack webhook received: {event}")
        
        if event == 'charge.success':
            # Payment successful
            reference = event_data.get('reference')
            
            if reference:
                # Process payment (similar to callback)
                # This is a backup in case callback fails
                logger.info(f"Processing successful charge webhook for {reference}")
                # Implementation can be similar to callback view
        
        elif event == 'transfer.success':
            # Refund/transfer successful
            logger.info(f"Transfer successful: {event_data.get('reference')}")
        
        elif event == 'transfer.failed':
            # Transfer failed
            logger.warning(f"Transfer failed: {event_data.get('reference')}")
        
        return HttpResponse(status=200)
        
    except json.JSONDecodeError:
        logger.error("Invalid JSON in Paystack webhook")
        return HttpResponse(status=400)
    except Exception as e:
        logger.error(f"Error processing Paystack webhook: {e}")
        return HttpResponse(status=500)
