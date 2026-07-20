from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.accounts.permission_models import Permission, Role
from apps.accounts.role_utils import clear_role_permission_cache
from apps.billing.models import Estimate, Invoice
from apps.branches.models import Branch
from apps.customers.models import Customer


class BillingBulkBranchScopeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        SystemModule.objects.update_or_create(
            slug="billing",
            defaults={"name": "Billing", "is_enabled": True},
        )
        cls.view_billing = cls._permission("view_billing", "View Billing")
        cls.edit_invoices = cls._permission("edit_invoices", "Edit Invoices")
        cls.edit_estimates = cls._permission("edit_estimates", "Edit Estimates")

        cls.manager_role, _ = Role.objects.update_or_create(
            code="manager",
            defaults={"name": "Manager", "is_active": True},
        )
        cls.manager_role.permissions.set(
            [cls.view_billing, cls.edit_invoices, cls.edit_estimates]
        )
        clear_role_permission_cache()

        cls.staff = User.objects.create_user(
            username="billing-branch-manager",
            email="billing-branch-manager@example.com",
            password="password",
            role="manager",
        )
        cls.other_staff = User.objects.create_user(
            username="billing-other-manager",
            email="billing-other-manager@example.com",
            password="password",
            role="manager",
        )
        cls.branch_a = Branch.objects.create(
            name="Kumasi Branch",
            code="KSI",
            created_by=cls.staff,
        )
        cls.branch_b = Branch.objects.create(
            name="Accra Branch",
            code="ACC",
            created_by=cls.other_staff,
        )
        cls.staff.managed_branches.add(cls.branch_a)
        cls.other_staff.managed_branches.add(cls.branch_b)

        customer_user = User.objects.create_user(
            username="billing-customer",
            email="billing-customer@example.com",
            password="password",
            role="customer",
        )
        cls.customer = Customer.objects.create(
            user=customer_user,
            customer_number="C-BULK",
        )

    @staticmethod
    def _permission(code, name):
        permission, _ = Permission.objects.update_or_create(
            code=code,
            defaults={"name": name, "category": "billing", "is_active": True},
        )
        return permission

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.staff)

    def _invoice(self, branch, status_value="draft"):
        return Invoice.objects.create(
            customer=self.customer,
            branch=branch,
            status=status_value,
            subtotal=Decimal("100.00"),
            tax_amount=Decimal("0.00"),
            total=Decimal("100.00"),
            amount_due=Decimal("100.00"),
            invoice_date=timezone.now().date(),
            created_by=self.staff,
        )

    def _estimate(self, branch, status_value="draft"):
        return Estimate.objects.create(
            customer=self.customer,
            branch=branch,
            status=status_value,
            subtotal=Decimal("100.00"),
            tax_amount=Decimal("0.00"),
            total=Decimal("100.00"),
            valid_until=timezone.now().date() + timezone.timedelta(days=7),
            created_by=self.staff,
        )

    @patch("apps.quickbooks_online.status_sync.schedule_syncs_after_bulk_status_update")
    def test_invoice_bulk_update_status_ignores_inaccessible_branch_ids(self, sync_mock):
        own_invoice = self._invoice(self.branch_a)
        other_invoice = self._invoice(self.branch_b)

        response = self.client.post(
            reverse("api_billing:invoice-bulk-update-status"),
            {"ids": [own_invoice.id, other_invoice.id], "status": "sent"},
            format="json",
            HTTP_X_BRANCH_ID=str(self.branch_a.id),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["updated_count"], 1)
        own_invoice.refresh_from_db()
        other_invoice.refresh_from_db()
        self.assertEqual(own_invoice.status, "sent")
        self.assertEqual(other_invoice.status, "draft")
        sync_mock.assert_called_once_with(Invoice, [own_invoice.id], "sent")

    def test_invoice_bulk_send_ignores_inaccessible_branch_ids(self):
        own_invoice = self._invoice(self.branch_a)
        other_invoice = self._invoice(self.branch_b)

        response = self.client.post(
            reverse("api_billing:invoice-bulk-send"),
            {"ids": [own_invoice.id, other_invoice.id]},
            format="json",
            HTTP_X_BRANCH_ID=str(self.branch_a.id),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["processed_count"], 1)
        own_invoice.refresh_from_db()
        other_invoice.refresh_from_db()
        self.assertEqual(own_invoice.status, "sent")
        self.assertEqual(other_invoice.status, "draft")

    def test_estimate_bulk_send_ignores_inaccessible_branch_ids(self):
        own_estimate = self._estimate(self.branch_a)
        other_estimate = self._estimate(self.branch_b)

        response = self.client.post(
            reverse("api_billing:estimate-bulk-send"),
            {"ids": [own_estimate.id, other_estimate.id]},
            format="json",
            HTTP_X_BRANCH_ID=str(self.branch_a.id),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["sent_count"], 1)
        own_estimate.refresh_from_db()
        other_estimate.refresh_from_db()
        self.assertEqual(own_estimate.status, "sent")
        self.assertEqual(other_estimate.status, "draft")

    def test_view_only_user_cannot_bulk_send_billing_documents(self):
        view_only_role, _ = Role.objects.update_or_create(
            code="billing_view_only",
            defaults={"name": "Billing View Only", "is_active": True},
        )
        view_only_role.permissions.set([self.view_billing])
        clear_role_permission_cache()
        view_only_user = User.objects.create_user(
            username="billing-view-only",
            email="billing-view-only@example.com",
            password="password",
            role="billing_view_only",
            branch=self.branch_a,
        )
        self.client.force_authenticate(user=view_only_user)

        invoice = self._invoice(self.branch_a)
        estimate = self._estimate(self.branch_a)

        invoice_response = self.client.post(
            reverse("api_billing:invoice-bulk-send"),
            {"ids": [invoice.id]},
            format="json",
            HTTP_X_BRANCH_ID=str(self.branch_a.id),
        )
        estimate_response = self.client.post(
            reverse("api_billing:estimate-bulk-send"),
            {"ids": [estimate.id]},
            format="json",
            HTTP_X_BRANCH_ID=str(self.branch_a.id),
        )

        self.assertEqual(invoice_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(estimate_response.status_code, status.HTTP_403_FORBIDDEN)
        invoice.refresh_from_db()
        estimate.refresh_from_db()
        self.assertEqual(invoice.status, "draft")
        self.assertEqual(estimate.status, "draft")
