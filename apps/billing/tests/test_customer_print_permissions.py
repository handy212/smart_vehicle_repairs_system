from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.billing.models import Estimate, Invoice
from apps.branches.models import Branch
from apps.customers.models import Customer


class CustomerBillingPrintPermissionTests(TestCase):
    def setUp(self):
        SystemModule.objects.get_or_create(
            slug="billing",
            defaults={"name": "Billing", "is_enabled": True},
        )
        self.staff_user = User.objects.create_user(
            username="print-admin",
            email="print-admin@example.com",
            password="password",
            role="admin",
        )
        self.branch = Branch.objects.create(name="Main Branch", code="MAIN", created_by=self.staff_user)
        self.customer_user = User.objects.create_user(
            username="customer-print",
            email="customer-print@example.com",
            password="password",
            role="customer",
            branch=self.branch,
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.customer_user)

    def test_customer_can_print_own_estimate(self):
        estimate = Estimate.objects.create(
            customer=self.customer,
            branch=self.branch,
            status="sent",
            total=Decimal("120.00"),
            valid_until=timezone.now().date() + timezone.timedelta(days=7),
            created_by=self.staff_user,
        )

        response = self.client.get(f"/api/billing/estimates/{estimate.id}/print/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("text/html", response["Content-Type"])
        self.assertIn(estimate.estimate_number, response.content.decode())

    def test_customer_can_print_own_invoice(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status="sent",
            total=Decimal("220.00"),
            amount_due=Decimal("220.00"),
            invoice_date=timezone.now().date(),
            created_by=self.staff_user,
        )

        response = self.client.get(f"/api/billing/invoices/{invoice.id}/print/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("text/html", response["Content-Type"])
        self.assertIn(invoice.invoice_number, response.content.decode())
