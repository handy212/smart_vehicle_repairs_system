"""
Paystack Payment Views
Handles payment initialization, verification, and webhooks
"""
import logging
import json
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.urls import reverse
from apps.customers.portal_views import customer_login_required
from apps.billing.models import Invoice, Payment
from apps.billing.paystack_integration import initialize_payment, verify_payment
from apps.notifications_app.triggers import NotificationTriggers

logger = logging.getLogger(__name__)


@customer_login_required
def initiate_paystack_payment(request, invoice_id):
    """Initialize Paystack payment for an invoice"""
    customer = request.user.customer_profile
    
    # Get invoice
    invoice = get_object_or_404(Invoice, id=invoice_id, customer=customer)
    
    # Check if invoice can be paid
    if invoice.status in ['draft', 'void', 'paid']:
        messages.error(request, 'This invoice cannot be paid.')
        return redirect('portal:my-invoices')
    
    # Generate unique reference
    reference = f"INV-{invoice.invoice_number}-{invoice.id}"
    
    # Prepare callback URL
    callback_url = request.build_absolute_uri(
        reverse('billing:paystack-callback')
    )
    
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
        email=customer.email,
        amount=invoice.amount_due,
        reference=reference,
        callback_url=callback_url,
        metadata=metadata
    )
    
    if success:
        # Redirect to Paystack payment page
        return redirect(response['authorization_url'])
    else:
        messages.error(request, f'Payment initialization failed: {response}')
        return redirect('portal:make-payment', invoice_id=invoice.id)


@customer_login_required
def paystack_callback(request):
    """Handle Paystack payment callback"""
    reference = request.GET.get('reference')
    
    if not reference:
        messages.error(request, 'Invalid payment reference')
        return redirect('portal:my-invoices')
    
    # Verify payment
    success, data = verify_payment(reference)
    
    if not success:
        messages.error(request, f'Payment verification failed: {data}')
        return redirect('portal:my-invoices')
    
    # Check payment status
    if data['status'] != 'success':
        messages.warning(request, f'Payment was not successful. Status: {data["status"]}')
        return redirect('portal:my-invoices')
    
    # Extract invoice ID from metadata
    metadata = data.get('metadata', {})
    invoice_id = metadata.get('invoice_id')
    
    if not invoice_id:
        messages.error(request, 'Invoice information not found in payment')
        return redirect('portal:my-invoices')
    
    # Get invoice
    try:
        invoice = Invoice.objects.get(id=invoice_id, customer=request.user.customer_profile)
    except Invoice.DoesNotExist:
        messages.error(request, 'Invoice not found')
        return redirect('portal:my-invoices')
    
    # Check if payment already recorded
    existing_payment = Payment.objects.filter(
        invoice=invoice,
        transaction_id=reference
    ).first()
    
    if existing_payment:
        messages.info(request, 'This payment has already been recorded')
        return redirect('portal:my-invoices')
    
    # Record payment
    amount_ghs = data['amount_ghs']
    
    payment = Payment.objects.create(
        invoice=invoice,
        customer=invoice.customer,
        amount=amount_ghs,
        payment_method='paystack',
        transaction_id=reference,
        payment_date=data.get('paid_at'),
        notes=f"Paystack payment via {data.get('channel', 'online')}",
        processed_by=request.user
    )
    
    # Update invoice status
    invoice.amount_paid += amount_ghs
    invoice.amount_due = invoice.total - invoice.amount_paid
    
    if invoice.amount_due <= 0:
        invoice.status = 'paid'
    elif invoice.amount_paid > 0:
        invoice.status = 'partial'
    
    invoice.save()
    
    # Send payment notification
    try:
        NotificationTriggers().payment_received(payment)
    except Exception as e:
        logger.error(f"Failed to send payment notification: {e}")
    
    messages.success(request, f'Payment of GH₵ {amount_ghs} received successfully!')
    return redirect('portal:my-invoices')


@csrf_exempt
@require_POST
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
