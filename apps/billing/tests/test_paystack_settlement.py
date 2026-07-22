"""Paystack / gateway payment settlement account coverage."""
import hashlib
import hmac
import json
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.contenttypes.models import ContentType
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounting.models import AccountingControl, JournalEntry
from apps.accounts.models import User
from apps.billing.gateway_payments import record_gateway_payment
from apps.billing.models import Invoice, Payment
from apps.branches.models import Branch
from apps.customers.models import Customer


def _signed_paystack_body(settings, payload):
    settings.PAYSTACK_SECRET_KEY = 'paystack-test-secret'
    body = json.dumps(payload).encode('utf-8')
    signature = hmac.new(
        settings.PAYSTACK_SECRET_KEY.encode('utf-8'),
        body,
        hashlib.sha512,
    ).hexdigest()
    return body, signature


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        username='paystack_staff',
        email='paystack-staff@example.com',
        password='password',
        role='admin',
        first_name='Pay',
        last_name='Staff',
        is_staff=True,
    )


@pytest.fixture
def branch(db, staff_user):
    return Branch.objects.create(name='Paystack Branch', code='PSK', created_by=staff_user)


@pytest.fixture
def customer(db, branch):
    customer_user = User.objects.create_user(
        username='paystack_customer',
        email='paystack-customer@example.com',
        password='password',
        role='customer',
        first_name='Pay',
        last_name='Customer',
        branch=branch,
    )
    return Customer.objects.create(user=customer_user)


@pytest.fixture
def open_invoice(db, customer, branch, staff_user):
    return Invoice.objects.create(
        customer=customer,
        branch=branch,
        status='sent',
        total=Decimal('150.00'),
        amount_paid=Decimal('0.00'),
        amount_due=Decimal('150.00'),
        invoice_date=timezone.now().date(),
        created_by=staff_user,
    )


@pytest.mark.django_db
class TestGatewayPaymentSettlement:
    def test_record_gateway_payment_sets_default_bank_account(self, open_invoice):
        bank = AccountingControl.get_settings().default_bank_account
        assert bank is not None

        payment, created = record_gateway_payment(
            invoice=open_invoice,
            amount=Decimal('150.00'),
            payment_method='paystack',
            transaction_id='PSK-TEST-REF-001',
            notes='test',
        )

        assert created is True
        assert payment.bank_account_id == bank.id
        assert payment.status == 'completed'

        payment_type = ContentType.objects.get_for_model(Payment)
        assert JournalEntry.objects.filter(
            content_type=payment_type,
            object_id=payment.id,
        ).exists()

    def test_record_gateway_payment_is_idempotent(self, open_invoice):
        first, created_first = record_gateway_payment(
            invoice=open_invoice,
            amount=Decimal('150.00'),
            payment_method='paystack',
            transaction_id='PSK-TEST-REF-002',
        )
        second, created_second = record_gateway_payment(
            invoice=open_invoice,
            amount=Decimal('150.00'),
            payment_method='paystack',
            transaction_id='PSK-TEST-REF-002',
        )

        assert created_first is True
        assert created_second is False
        assert first.id == second.id
        assert Payment.objects.filter(transaction_id='PSK-TEST-REF-002').count() == 1

    def test_record_gateway_payment_requires_default_bank(self, open_invoice):
        controls = AccountingControl.get_settings()
        previous = controls.default_bank_account
        controls.default_bank_account = None
        controls.save(update_fields=['default_bank_account'])

        try:
            with pytest.raises(ValueError, match='default_bank_account'):
                record_gateway_payment(
                    invoice=open_invoice,
                    amount=Decimal('150.00'),
                    payment_method='paystack',
                    transaction_id='PSK-TEST-REF-003',
                )
        finally:
            controls.default_bank_account = previous
            controls.save(update_fields=['default_bank_account'])

    def test_callback_records_payment_with_settlement_account(
        self, api_client, open_invoice, customer
    ):
        reference = f'PSK-CB-{open_invoice.id}-001'
        bank = AccountingControl.get_settings().default_bank_account

        verify_payload = {
            'status': 'success',
            'amount': 15000,
            'amount_ghs': Decimal('150.00'),
            'reference': reference,
            'paid_at': '2026-07-18T12:00:00.000Z',
            'channel': 'card',
            'metadata': {
                'invoice_id': open_invoice.id,
                'invoice_number': open_invoice.invoice_number,
                'customer_id': customer.id,
            },
        }

        with patch(
            'apps.billing.paystack_views.verify_payment',
            return_value=(True, verify_payload),
        ):
            url = reverse('api_billing:paystack-payment-callback')
            response = api_client.get(url, {'reference': reference})

        assert response.status_code == status.HTTP_302_FOUND
        assert 'status=success' in response.url

        payment = Payment.objects.get(transaction_id=reference)
        assert payment.bank_account_id == bank.id
        assert payment.amount == Decimal('150.00')
        assert payment.payment_method == 'paystack'

    def test_callback_records_verified_charge_when_invoice_was_paid_after_checkout(
        self, api_client, open_invoice, customer, staff_user
    ):
        bank = AccountingControl.get_settings().default_bank_account
        Payment.objects.create(
            invoice=open_invoice,
            customer=customer,
            amount=Decimal('150.00'),
            payment_method='check',
            status='completed',
            processed_by=staff_user,
            bank_account=bank,
        )
        open_invoice.refresh_from_db()
        assert open_invoice.status == 'paid'

        reference = f'PSK-LATE-{open_invoice.id}-001'
        verify_payload = {
            'status': 'success',
            'amount': 15000,
            'amount_ghs': Decimal('150.00'),
            'reference': reference,
            'paid_at': '2026-07-18T12:00:00.000Z',
            'channel': 'card',
            'metadata': {
                'invoice_id': open_invoice.id,
                'invoice_number': open_invoice.invoice_number,
                'customer_id': customer.id,
            },
        }

        with patch(
            'apps.billing.paystack_views.verify_payment',
            return_value=(True, verify_payload),
        ):
            url = reverse('api_billing:paystack-payment-callback')
            response = api_client.get(url, {'reference': reference})

        assert response.status_code == status.HTTP_302_FOUND
        assert 'status=success' in response.url

        payment = Payment.objects.get(transaction_id=reference)
        assert payment.invoice_id == open_invoice.id
        assert payment.amount == Decimal('150.00')

        open_invoice.refresh_from_db()
        assert open_invoice.amount_paid == Decimal('150.00')
        assert open_invoice.amount_due == Decimal('0.00')

    def test_webhook_returns_500_when_charge_verification_fails(
        self, api_client, settings
    ):
        payload = {
            'event': 'charge.success',
            'data': {
                'reference': 'PSK-WEBHOOK-VERIFY-TIMEOUT',
            },
        }
        body, signature = _signed_paystack_body(settings, payload)

        with patch(
            'apps.billing.paystack_views.verify_payment',
            return_value=(False, {'error': 'timeout'}),
        ):
            response = api_client.post(
                reverse('api_billing:paystack-payment-webhook'),
                data=body,
                content_type='application/json',
                HTTP_X_PAYSTACK_SIGNATURE=signature,
            )

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert not Payment.objects.filter(
            transaction_id='PSK-WEBHOOK-VERIFY-TIMEOUT',
        ).exists()
