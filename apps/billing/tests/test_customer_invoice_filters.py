from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.billing.models import Invoice
from apps.customers.models import Customer


class CustomerInvoiceFilterTests(APITestCase):
    def setUp(self):
        SystemModule.objects.update_or_create(
            slug="billing",
            defaults={"name": "Billing", "is_enabled": True},
        )
        self.staff_user = User.objects.create_user(
            username="billing-user",
            email="billing@example.com",
            password="testpass",
            role="admin",
            is_staff=True,
            is_superuser=True,
        )
        self.customer_user = User.objects.create_user(
            username="invoice-customer",
            email="invoice-customer@example.com",
            password="testpass",
            role="customer",
            first_name="Olivia",
            last_name="Owner",
        )
        self.other_user = User.objects.create_user(
            username="other-invoice-customer",
            email="other-invoice-customer@example.com",
            password="testpass",
            role="customer",
            first_name="Miles",
            last_name="Other",
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.other_customer = Customer.objects.create(user=self.other_user)

        self.sent_invoice = self._create_invoice(self.customer, "sent", "120.00")
        self.viewed_invoice = self._create_invoice(self.customer, "viewed", "90.00")
        self.draft_invoice = self._create_invoice(self.customer, "draft", "50.00")
        self.void_invoice = self._create_invoice(self.customer, "void", "40.00")
        self.other_invoice = self._create_invoice(self.other_customer, "sent", "200.00")

    def _create_invoice(self, customer, invoice_status, total, amount_paid="0.00"):
        return Invoice.objects.create(
            customer=customer,
            status=invoice_status,
            due_date=timezone.now().date() + timedelta(days=7),
            total=Decimal(total),
            amount_paid=Decimal(amount_paid),
            created_by=self.staff_user,
        )

    def test_customer_invoice_list_excludes_other_customers_drafts_and_voids(self):
        self.client.force_authenticate(self.customer_user)

        response = self.client.get("/api/billing/invoices/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        invoice_ids = {row["id"] for row in response.data["results"]}
        self.assertEqual(invoice_ids, {self.sent_invoice.id, self.viewed_invoice.id})
        self.assertNotIn(self.other_invoice.id, invoice_ids)
        self.assertNotIn(self.draft_invoice.id, invoice_ids)
        self.assertNotIn(self.void_invoice.id, invoice_ids)

    def test_customer_invoice_status_filter_is_applied_server_side(self):
        self.client.force_authenticate(self.customer_user)

        response = self.client.get("/api/billing/invoices/", {"status": "sent"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row["id"] for row in response.data["results"]], [self.sent_invoice.id])

    def test_invoice_search_matches_customer_user_fields(self):
        self.client.force_authenticate(self.staff_user)

        response = self.client.get("/api/billing/invoices/", {"page": 1, "search": "olivia"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        invoice_ids = {row["id"] for row in response.data["results"]}
        self.assertIn(self.sent_invoice.id, invoice_ids)
        self.assertIn(self.viewed_invoice.id, invoice_ids)
        self.assertNotIn(self.other_invoice.id, invoice_ids)
