"""
Paystack Payment Views
Handles payment initialization, verification, and webhooks
"""
import logging
import json
import time
import random
from urllib.parse import urlencode

from django.shortcuts import redirect
from django.http import HttpResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.urls import reverse
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status

from apps.billing.models import Invoice, Payment
from apps.billing.paystack_integration import initialize_payment, verify_payment
from apps.billing.gateway_payments import (
    ensure_payment_settlement_account,
    record_gateway_payment,
)
from apps.notifications_app.triggers import NotificationTriggers

logger = logging.getLogger(__name__)


def _frontend_payment_redirect(**params):
    frontend = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
    return redirect(f"{frontend}/portal/payment/success?{urlencode(params)}")


def _activate_subscription_if_needed(invoice):
    if not invoice.description or 'subscription' not in invoice.description.lower():
        return
    from apps.subscriptions.services import SubscriptionService

    try:
        subscriptions = invoice.customer.subscriptions.filter(
            status__in=['pending'],
            payment_status='pending',
        ).order_by('-created_at')

        subscription = None
        for sub in subscriptions:
            if sub.package.name.lower() in invoice.description.lower():
                subscription = sub
                break

        if not subscription:
            subscription = subscriptions.first()

        if subscription:
            SubscriptionService.activate_subscription(subscription, invoice)
            logger.info(
                "Activated subscription %s after payment for invoice %s",
                subscription.subscription_number,
                invoice.id,
            )
        else:
            logger.warning("Could not find subscription for invoice %s", invoice.id)
    except Exception as e:
        logger.error("Failed to activate subscription on payment: %s", e, exc_info=True)


def _record_verified_paystack_payment(*, invoice, reference, data):
    """
    Record a verified Paystack charge against an invoice.
    Returns (payment, created).
    """
    payment, created = record_gateway_payment(
        invoice=invoice,
        amount=data['amount_ghs'],
        payment_method='paystack',
        transaction_id=reference,
        notes=f"Paystack payment via {data.get('channel', 'online')}",
        paid_at=data.get('paid_at'),
    )

    if created:
        _activate_subscription_if_needed(invoice)
        try:
            NotificationTriggers().payment_received(payment)
        except Exception as e:
            logger.error("Failed to send payment notification: %s", e)
    else:
        # Heal payments created before settlement account was required.
        ensure_payment_settlement_account(payment)

    return payment, created


@csrf_exempt
@api_view(['POST', 'GET'])
@permission_classes([IsAuthenticated])
def initiate_paystack_payment(request, invoice_id):
    """Initialize Paystack payment for an invoice"""
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    # Check if user is a customer
    if hasattr(request.user, 'customer_profile'):
        customer = request.user.customer_profile
    elif request.user.role == 'customer' and hasattr(request.user, 'customer_profile'):
        customer = request.user.customer_profile
    else:
        # Allow admins/managers to initiate payments on behalf of customers
        try:
            invoice = Invoice.objects.get(id=invoice_id)
            customer = invoice.customer
        except Invoice.DoesNotExist:
            return Response({'error': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        if request.user.role == 'customer':
            invoice = Invoice.objects.get(id=invoice_id, customer=customer)
        else:
            invoice = Invoice.objects.get(id=invoice_id)
            customer = invoice.customer
    except Invoice.DoesNotExist:
        return Response({'error': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)

    if invoice.status in ['draft', 'void', 'paid']:
        return Response({'error': 'This invoice cannot be paid'}, status=status.HTTP_400_BAD_REQUEST)

    # Fail early if gateway settlement cannot be posted to the ledger.
    from apps.accounting.settlement_accounts import resolve_default_bank_settlement_account

    if resolve_default_bank_settlement_account() is None:
        return Response(
            {
                'error': (
                    'Online payments are temporarily unavailable: the default bank/cash-equivalent '
                    'settlement account is not configured. Contact the shop to complete payment.'
                )
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    # Generate unique reference (invoice_number can be blank in some legacy/dev data)
    invoice_no = (invoice.invoice_number or "").strip() or f"{invoice.id}"
    # Avoid INV-INV-... when invoice_number already includes the prefix
    if invoice_no.upper().startswith('INV-'):
        reference_base = invoice_no
    else:
        reference_base = f"INV-{invoice_no}"
    timestamp = int(time.time())
    random_suffix = random.randint(1000, 9999)
    reference = f"{reference_base}-{invoice.id}-{timestamp}-{random_suffix}"

    while Payment.objects.filter(transaction_id=reference).exists():
        timestamp = int(time.time())
        random_suffix = random.randint(1000, 9999)
        reference = f"{reference_base}-{invoice.id}-{timestamp}-{random_suffix}"

    callback_url = request.build_absolute_uri(
        reverse('api_billing:paystack-payment-callback')
    )

    customer_email = customer.email
    if not customer_email or not customer_email.strip():
        if hasattr(customer, 'user') and customer.user and customer.user.email:
            customer_email = customer.user.email
        else:
            return Response(
                {
                    'error': (
                        'Customer email is required for Paystack payments. '
                        'Please update customer profile with a valid email address.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    customer_email = customer_email.strip()

    metadata = {
        'invoice_id': invoice.id,
        'invoice_number': invoice.invoice_number,
        'customer_id': customer.id,
        'customer_name': customer.full_name,
        'vehicle': (
            f"{invoice.vehicle.year} {invoice.vehicle.make} {invoice.vehicle.model}"
            if invoice.vehicle
            else None
        ),
    }

    success, response = initialize_payment(
        email=customer_email,
        amount=invoice.amount_due,
        reference=reference,
        callback_url=callback_url,
        metadata=metadata,
    )

    if success:
        return Response({
            'success': True,
            'authorization_url': response['authorization_url'],
            'reference': reference,
            'invoice_id': invoice.id,
            'amount': float(invoice.amount_due),
        }, status=status.HTTP_200_OK)

    return Response(
        {'error': f'Payment initialization failed: {response}'},
        status=status.HTTP_400_BAD_REQUEST,
    )


@csrf_exempt
@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def paystack_callback(request):
    """Handle Paystack payment callback"""
    reference = request.GET.get('reference') or (
        request.data.get('reference') if hasattr(request, 'data') else None
    )

    if not reference:
        return _frontend_payment_redirect(status='failed', reason='missing_reference')

    success, data = verify_payment(reference)

    if not success:
        return _frontend_payment_redirect(status='failed', reference=reference)

    if data['status'] != 'success':
        return _frontend_payment_redirect(
            status='failed',
            reference=reference,
            paystack_status=data.get('status'),
        )

    metadata = data.get('metadata', {}) or {}
    invoice_id = metadata.get('invoice_id')

    if not invoice_id:
        return _frontend_payment_redirect(
            status='failed',
            reference=reference,
            reason='missing_invoice_id',
        )

    try:
        invoice = Invoice.objects.select_related('customer', 'customer__user', 'created_by').get(
            id=invoice_id
        )
    except Invoice.DoesNotExist:
        return _frontend_payment_redirect(
            status='failed',
            reference=reference,
            invoice_id=invoice_id,
            reason='invoice_not_found',
        )

    existing_payment = Payment.objects.filter(
        invoice=invoice,
        transaction_id=reference,
    ).first()

    if existing_payment:
        ensure_payment_settlement_account(existing_payment)
        return _frontend_payment_redirect(
            status='success',
            invoice_id=invoice.id,
            reference=reference,
        )

    try:
        _record_verified_paystack_payment(invoice=invoice, reference=reference, data=data)
    except ValueError as e:
        logger.error(
            "Paystack payment settlement misconfigured for reference %s: %s",
            reference,
            e,
        )
        return _frontend_payment_redirect(
            status='failed',
            reference=reference,
            reason='settlement_account_missing',
        )
    except Exception as e:
        logger.error(
            "Failed to record Paystack payment for reference %s: %s",
            reference,
            e,
            exc_info=True,
        )
        return _frontend_payment_redirect(
            status='failed',
            reference=reference,
            reason='recording_error',
        )

    return _frontend_payment_redirect(
        status='success',
        invoice_id=invoice.id,
        reference=reference,
    )


def _process_paystack_charge_success(event_data):
    """Record a charge.success webhook event. Returns True when handled."""
    reference = event_data.get('reference')
    if not reference:
        logger.warning("Paystack charge.success missing reference")
        return False

    # Prefer live verification over trusting webhook payload alone.
    success, data = verify_payment(reference)
    if not success or data.get('status') != 'success':
        logger.warning("Paystack webhook verify failed for %s: %s", reference, data)
        return False

    metadata = data.get('metadata', {}) or {}
    invoice_id = metadata.get('invoice_id')
    if not invoice_id:
        logger.warning("Paystack webhook missing invoice_id for %s", reference)
        return False

    try:
        invoice = Invoice.objects.select_related('customer', 'customer__user', 'created_by').get(
            id=invoice_id
        )
    except Invoice.DoesNotExist:
        logger.warning("Paystack webhook invoice %s not found for %s", invoice_id, reference)
        return False

    existing = Payment.objects.filter(transaction_id=reference).first()
    if existing:
        ensure_payment_settlement_account(existing)
        return True

    _record_verified_paystack_payment(invoice=invoice, reference=reference, data=data)
    return True


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
    paystack_signature = request.headers.get('X-Paystack-Signature')

    if getattr(settings, 'REQUIRE_WEBHOOK_SIGNATURES', False) and not settings.PAYSTACK_SECRET_KEY:
        logger.warning("Paystack webhook rejected: PAYSTACK_SECRET_KEY not configured")
        return HttpResponse(status=401)

    if not paystack_signature:
        logger.warning("Paystack webhook received without signature")
        return HttpResponse(status=400)

    import hashlib
    import hmac

    body = request.body
    if not settings.PAYSTACK_SECRET_KEY:
        logger.warning("Paystack webhook rejected: missing secret key")
        return HttpResponse(status=401)

    secret = settings.PAYSTACK_SECRET_KEY.encode('utf-8')
    hash_value = hmac.new(secret, body, hashlib.sha512).hexdigest()

    if not hmac.compare_digest(hash_value, paystack_signature):
        logger.warning("Invalid Paystack webhook signature")
        return HttpResponse(status=400)

    try:
        data = json.loads(body)
        event = data.get('event')
        event_data = data.get('data', {}) or {}

        logger.info("Paystack webhook received: %s", event)

        if event == 'charge.success':
            logger.info(
                "Processing successful charge webhook for %s",
                event_data.get('reference'),
            )
            try:
                handled = _process_paystack_charge_success(event_data)
            except Exception as e:
                logger.error("Error recording Paystack webhook payment: %s", e, exc_info=True)
                return HttpResponse(status=500)
            if not handled:
                return HttpResponse(status=500)

        elif event == 'transfer.success':
            logger.info("Transfer successful: %s", event_data.get('reference'))

        elif event == 'transfer.failed':
            logger.warning("Transfer failed: %s", event_data.get('reference'))

        return HttpResponse(status=200)

    except json.JSONDecodeError:
        logger.error("Invalid JSON in Paystack webhook")
        return HttpResponse(status=400)
    except Exception as e:
        logger.error("Error processing Paystack webhook: %s", e)
        return HttpResponse(status=500)
