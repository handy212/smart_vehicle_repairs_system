"""Credit note application to open invoices."""

import pytest
from decimal import Decimal
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.billing.models import CreditNote, CreditNoteLineItem, CreditNoteApplication, Invoice
from apps.branches.models import Branch
from apps.customers.models import Customer


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture(autouse=True)
def billing_module(db):
    SystemModule.objects.update_or_create(
        slug="billing",
        defaults={"name": "Billing", "is_enabled": True},
    )


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="cn_apply_admin",
        email="cn_apply@example.com",
        password="password",
        role="super-admin",
        first_name="Admin",
        last_name="User",
    )


@pytest.fixture
def branch(db, user):
    b = Branch.objects.create(name="CN Branch", code="CNB", created_by=user)
    user.managed_branches.add(b)
    return b


@pytest.fixture
def branch_api_client(api_client, user, branch):
    api_client.force_authenticate(user=user)
    api_client.defaults['HTTP_X_BRANCH_ID'] = str(branch.id)
    return api_client


@pytest.fixture
def customer(db, branch):
    u = User.objects.create_user(
        username="cn_cust",
        email="cn_cust@example.com",
        password="password",
        role="customer",
        first_name="Jane",
        last_name="Buyer",
        branch=branch,
    )
    return Customer.objects.create(user=u)


@pytest.mark.django_db
class TestCreditNoteApply:
    def _issue_credit_note(self, user, branch, customer, total: Decimal):
        cn = CreditNote.objects.create(
            customer=customer,
            branch=branch,
            status="draft",
            created_by=user,
        )
        CreditNoteLineItem.objects.create(
            credit_note=cn,
            description="Return credit",
            quantity=Decimal("1"),
            unit_price=total,
            is_taxable=False,
        )
        cn.calculate_totals()
        cn.status = "issued"
        cn.save()
        return cn


    def test_apply_reduces_invoice_balance_and_unused(self, branch_api_client, user, branch, customer):
        invoice = Invoice.objects.create(
            customer=customer,
            branch=branch,
            status="sent",
            total=Decimal("100.00"),
            amount_paid=Decimal("0"),
            amount_due=Decimal("100.00"),
            invoice_date=timezone.now().date(),
            created_by=user,
        )

        cn = self._issue_credit_note(user, branch, customer, Decimal("40.00"))

        url = reverse("api_billing:credit-note-apply", args=[cn.id])
        response = branch_api_client.post(url, {"invoice": invoice.id}, format="json")
        assert response.status_code == status.HTTP_200_OK, response.data
        assert Decimal(str(response.data["unused_amount"])) == Decimal("0")
        assert response.data["status"] == "applied"

        invoice.refresh_from_db()
        assert invoice.amount_paid == Decimal("40.00")
        assert invoice.amount_due == Decimal("60.00")

        assert CreditNoteApplication.objects.filter(credit_note=cn, invoice=invoice).count() == 1

    def test_apply_partial_then_remainder(self, branch_api_client, user, branch, customer):
        invoice = Invoice.objects.create(
            customer=customer,
            branch=branch,
            status="sent",
            total=Decimal("100.00"),
            amount_paid=Decimal("0"),
            amount_due=Decimal("100.00"),
            invoice_date=branch.created_at.date(),
            created_by=user,
        )

        cn = self._issue_credit_note(user, branch, customer, Decimal("50.00"))

        url = reverse("api_billing:credit-note-apply", args=[cn.id])
        r1 = branch_api_client.post(url, {"invoice": invoice.id, "amount": "30"}, format="json")
        assert r1.status_code == status.HTTP_200_OK, r1.data
        assert r1.data["status"] == "issued"
        assert Decimal(str(r1.data["unused_amount"])) == Decimal("20.00")

        invoice.refresh_from_db()
        assert invoice.amount_paid == Decimal("30.00")

        r2 = branch_api_client.post(url, {"invoice": invoice.id}, format="json")
        assert r2.status_code == status.HTTP_200_OK, r2.data
        assert Decimal(str(r2.data["unused_amount"])) == Decimal("0")
        assert r2.data["status"] == "applied"

        invoice.refresh_from_db()
        assert invoice.amount_paid == Decimal("50.00")

    def test_apply_rejects_wrong_customer(self, branch_api_client, user, branch, customer):
        other = User.objects.create_user(
            username="cn_other",
            email="cn_other@example.com",
            password="password",
            role="customer",
            first_name="Other",
            last_name="Person",
            branch=branch,
        )
        other_customer = Customer.objects.create(user=other)

        invoice = Invoice.objects.create(
            customer=other_customer,
            branch=branch,
            status="sent",
            total=Decimal("50.00"),
            amount_paid=Decimal("0"),
            amount_due=Decimal("50.00"),
            invoice_date=branch.created_at.date(),
            created_by=user,
        )

        cn = self._issue_credit_note(user, branch, customer, Decimal("10.00"))
        url = reverse("api_billing:credit-note-apply", args=[cn.id])
        response = branch_api_client.post(url, {"invoice": invoice.id}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
