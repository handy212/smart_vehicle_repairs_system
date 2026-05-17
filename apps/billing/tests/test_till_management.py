from decimal import Decimal

import pytest

pytestmark = pytest.mark.legacy_integration

from django.urls import reverse
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.accounts.permission_models import Permission
from apps.billing.models import CashierTill, Invoice, Payment, Refund
from apps.accounting.models import JournalEntry
from apps.branches.models import Branch
from apps.customers.models import Customer


@pytest.fixture(autouse=True)
def billing_module(db):
    SystemModule.objects.update_or_create(
        slug="billing",
        defaults={"name": "Billing", "is_enabled": True},
    )
    for code, name in [
        ("view_billing", "View Billing"),
        ("create_payments", "Create Payments"),
    ]:
        Permission.objects.update_or_create(
            code=code,
            defaults={
                "name": name,
                "category": "billing",
                "is_active": True,
            },
        )


@pytest.fixture
def branch(db):
    owner = User.objects.create_user(
        username="branch_owner",
        email="branch-owner@example.com",
        password="password",
        role="admin",
    )
    return Branch.objects.create(name="Main Branch", code="MBR", created_by=owner)


@pytest.fixture
def staff_user(db, branch):
    user = User.objects.create_user(
        username="cashier",
        email="cashier@example.com",
        password="password",
        role="admin",
        first_name="Cash",
        last_name="Ier",
        branch=branch,
    )
    user.managed_branches.add(branch)
    return user


@pytest.fixture
def other_staff(db, branch):
    user = User.objects.create_user(
        username="other_cashier",
        email="other-cashier@example.com",
        password="password",
        role="admin",
        first_name="Other",
        last_name="Cashier",
        branch=branch,
    )
    user.managed_branches.add(branch)
    return user


@pytest.fixture
def customer(db, branch):
    customer_user = User.objects.create_user(
        username="till_customer",
        email="till-customer@example.com",
        password="password",
        role="customer",
        first_name="Till",
        last_name="Customer",
        branch=branch,
    )
    return Customer.objects.create(user=customer_user)


def create_invoice(customer, branch, user, total=Decimal("200.00")):
    return Invoice.objects.create(
        customer=customer,
        branch=branch,
        status="sent",
        subtotal=total,
        total=total,
        amount_due=total,
        invoice_date=timezone.now().date(),
        created_by=user,
    )


@pytest.mark.django_db
def test_cash_payment_api_requires_open_till(branch, staff_user, customer):
    client = APIClient()
    client.force_authenticate(user=staff_user)
    invoice = create_invoice(customer, branch, staff_user)

    response = client.post(
        reverse("api_billing:payment-list"),
        {
            "invoice": invoice.id,
            "payment_method": "cash",
            "amount": "25.00",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Open a till" in str(response.data)


@pytest.mark.django_db
def test_cash_payment_api_assigns_current_open_till(branch, staff_user, customer):
    client = APIClient()
    client.force_authenticate(user=staff_user)
    till = CashierTill.objects.create(
        branch=branch,
        cashier=staff_user,
        opening_balance=Decimal("20.00"),
    )
    invoice = create_invoice(customer, branch, staff_user)

    response = client.post(
        reverse("api_billing:payment-list"),
        {
            "invoice": invoice.id,
            "payment_method": "cash",
            "amount": "25.00",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED, response.data
    payment = Payment.objects.get(invoice=invoice)
    assert payment.till_id == till.id

    entry = JournalEntry.objects.get(
        content_type=ContentType.objects.get_for_model(payment),
        object_id=payment.id,
    )
    debit = entry.transactions.get(transaction_type="debit")
    assert debit.account.code == "1020"


@pytest.mark.django_db
def test_till_close_uses_only_that_tills_cash_activity(
    branch,
    staff_user,
    other_staff,
    customer,
):
    client = APIClient()
    client.force_authenticate(user=staff_user)
    till = CashierTill.objects.create(
        branch=branch,
        cashier=staff_user,
        opening_balance=Decimal("50.00"),
    )
    other_till = CashierTill.objects.create(
        branch=branch,
        cashier=other_staff,
        opening_balance=Decimal("0.00"),
    )
    invoice = create_invoice(customer, branch, staff_user)
    other_invoice = create_invoice(customer, branch, other_staff)
    legacy_invoice = create_invoice(customer, branch, staff_user)

    payment = Payment.objects.create(
        invoice=invoice,
        customer=customer,
        payment_method="cash",
        amount=Decimal("100.00"),
        status="completed",
        processed_by=staff_user,
        till=till,
    )
    Payment.objects.create(
        invoice=other_invoice,
        customer=customer,
        payment_method="cash",
        amount=Decimal("25.00"),
        status="completed",
        processed_by=other_staff,
        till=other_till,
    )
    Payment.objects.create(
        invoice=legacy_invoice,
        customer=customer,
        payment_method="cash",
        amount=Decimal("75.00"),
        status="completed",
        processed_by=staff_user,
    )
    Refund.objects.create(
        original_payment=payment,
        invoice=invoice,
        customer=customer,
        amount=Decimal("10.00"),
        reason="Customer refund",
        refund_method="cash",
        status="completed",
        requested_by=staff_user,
        processed_by=staff_user,
        processed_at=timezone.now(),
        till=till,
    )

    response = client.post(
        reverse("api_billing:till-close", args=[till.id]),
        {
            "cash_counts": [
                {"denomination": "100.00", "quantity": 1},
                {"denomination": "20.00", "quantity": 2},
            ],
            "notes": "Balanced close",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK, response.data
    assert response.data["expected_balance"] == "140.00"
    assert response.data["closing_balance"] == "140.00"
    assert response.data["variance"] == "0.00"

    till.refresh_from_db()
    assert till.expected_balance == Decimal("140.00")
    assert till.is_balanced is True


@pytest.mark.django_db
def test_till_pay_in_increases_expected_balance_at_close(
    branch,
    staff_user,
    other_staff,
    customer,
):
    client = APIClient()
    client.force_authenticate(user=staff_user)
    till = CashierTill.objects.create(
        branch=branch,
        cashier=staff_user,
        opening_balance=Decimal("50.00"),
    )
    other_till = CashierTill.objects.create(
        branch=branch,
        cashier=other_staff,
        opening_balance=Decimal("0.00"),
    )
    invoice = create_invoice(customer, branch, staff_user)
    other_invoice = create_invoice(customer, branch, other_staff)
    legacy_invoice = create_invoice(customer, branch, staff_user)

    payment = Payment.objects.create(
        invoice=invoice,
        customer=customer,
        payment_method="cash",
        amount=Decimal("100.00"),
        status="completed",
        processed_by=staff_user,
        till=till,
    )
    Payment.objects.create(
        invoice=other_invoice,
        customer=customer,
        payment_method="cash",
        amount=Decimal("25.00"),
        status="completed",
        processed_by=other_staff,
        till=other_till,
    )
    Payment.objects.create(
        invoice=legacy_invoice,
        customer=customer,
        payment_method="cash",
        amount=Decimal("75.00"),
        status="completed",
        processed_by=staff_user,
    )
    Refund.objects.create(
        original_payment=payment,
        invoice=invoice,
        customer=customer,
        amount=Decimal("10.00"),
        reason="Customer refund",
        refund_method="cash",
        status="completed",
        requested_by=staff_user,
        processed_by=staff_user,
        processed_at=timezone.now(),
        till=till,
    )

    r_in = client.post(
        reverse("api_billing:till-record-movement", args=[till.id]),
        {"movement_type": "pay_in", "amount": "30.00", "reason": "Extra float from safe"},
        format="json",
    )
    assert r_in.status_code == status.HTTP_201_CREATED, r_in.data

    response = client.post(
        reverse("api_billing:till-close", args=[till.id]),
        {
            "cash_counts": [
                {"denomination": "100.00", "quantity": 1},
                {"denomination": "50.00", "quantity": 1},
                {"denomination": "20.00", "quantity": 1},
            ],
            "notes": "Balanced close with pay-in",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK, response.data
    assert response.data["expected_balance"] == "170.00"
    assert response.data["closing_balance"] == "170.00"
    assert response.data["variance"] == "0.00"


@pytest.mark.django_db
def test_till_pay_out_rejected_when_exceeds_expected_balance(branch, staff_user):
    client = APIClient()
    client.force_authenticate(user=staff_user)
    till = CashierTill.objects.create(
        branch=branch,
        cashier=staff_user,
        opening_balance=Decimal("10.00"),
    )
    response = client.post(
        reverse("api_billing:till-record-movement", args=[till.id]),
        {"movement_type": "pay_out", "amount": "50.00", "reason": "Safe drop"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "amount" in response.data


@pytest.mark.django_db
def test_till_movement_posts_gl_entry(branch, staff_user):
    client = APIClient()
    client.force_authenticate(user=staff_user)
    till = CashierTill.objects.create(
        branch=branch,
        cashier=staff_user,
        opening_balance=Decimal("20.00"),
    )
    response = client.post(
        reverse("api_billing:till-record-movement", args=[till.id]),
        {"movement_type": "pay_in", "amount": "15.00", "reason": "Change from bank"},
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED, response.data
    movement_id = response.data["id"]
    ref = f"TILL-{till.id}-MOV-{movement_id}"
    assert JournalEntry.objects.filter(reference=ref).exists()


@pytest.mark.django_db
def test_till_record_movement_forbidden_for_other_cashiers_till(
    branch, staff_user, other_staff
):
    client = APIClient()
    client.force_authenticate(user=other_staff)
    till = CashierTill.objects.create(
        branch=branch,
        cashier=staff_user,
        opening_balance=Decimal("100.00"),
    )
    response = client.post(
        reverse("api_billing:till-record-movement", args=[till.id]),
        {"movement_type": "pay_out", "amount": "10.00"},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_till_movements_list_empty(branch, staff_user):
    client = APIClient()
    client.force_authenticate(user=staff_user)
    till = CashierTill.objects.create(
        branch=branch,
        cashier=staff_user,
        opening_balance=Decimal("10.00"),
    )
    r = client.get(reverse("api_billing:till-movements", args=[till.id]))
    assert r.status_code == status.HTTP_200_OK
    assert r.data == []


@pytest.mark.django_db
def test_till_movements_list_after_record(branch, staff_user):
    client = APIClient()
    client.force_authenticate(user=staff_user)
    till = CashierTill.objects.create(
        branch=branch,
        cashier=staff_user,
        opening_balance=Decimal("25.00"),
    )
    rec = client.post(
        reverse("api_billing:till-record-movement", args=[till.id]),
        {"movement_type": "pay_in", "amount": "5.00", "reason": "Coins"},
        format="json",
    )
    assert rec.status_code == status.HTTP_201_CREATED, rec.data
    r = client.get(reverse("api_billing:till-movements", args=[till.id]))
    assert r.status_code == status.HTTP_200_OK
    assert len(r.data) == 1
    assert r.data[0]["movement_type"] == "pay_in"
    assert r.data[0]["reason"] == "Coins"


@pytest.mark.django_db
def test_till_movements_list_visible_to_other_billing_user(
    branch, staff_user, other_staff
):
    client = APIClient()
    client.force_authenticate(user=staff_user)
    till = CashierTill.objects.create(
        branch=branch,
        cashier=staff_user,
        opening_balance=Decimal("40.00"),
    )
    client.post(
        reverse("api_billing:till-record-movement", args=[till.id]),
        {"movement_type": "pay_out", "amount": "10.00", "reason": "Safe drop"},
        format="json",
    )
    client.force_authenticate(user=other_staff)
    r = client.get(reverse("api_billing:till-movements", args=[till.id]))
    assert r.status_code == status.HTTP_200_OK
    assert len(r.data) == 1
    assert r.data[0]["movement_type"] == "pay_out"
