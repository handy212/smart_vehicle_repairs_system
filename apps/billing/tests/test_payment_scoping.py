from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.accounts.permission_models import Permission, Role
from apps.accounts.role_utils import clear_role_permission_cache
from apps.billing.models import Invoice, Payment, PaymentAllocation
from apps.billing.views import PaymentAllocationViewSet, PaymentViewSet
from apps.branches.models import Branch
from apps.customers.models import Customer


class PaymentScopingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        SystemModule.objects.update_or_create(
            slug="billing",
            defaults={"name": "Billing", "is_enabled": True},
        )
        cls.view_billing_permission, _ = Permission.objects.update_or_create(
            code="view_billing",
            defaults={
                "name": "View Billing",
                "category": "billing",
                "is_active": True,
            },
        )
        cls.billing_role = Role.objects.create(
            code="branch_billing_reader",
            name="Branch Billing Reader",
            is_active=True,
        )
        cls.billing_role.permissions.add(cls.view_billing_permission)
        clear_role_permission_cache()

        cls.admin = User.objects.create_user(
            username="payment-scope-admin",
            email="payment-scope-admin@example.com",
            password="password",
            role="admin",
            first_name="Payment",
            last_name="Admin",
        )
        cls.branch_a = Branch.objects.create(
            name="Scope Branch A",
            code="SBA",
            created_by=cls.admin,
        )
        cls.branch_b = Branch.objects.create(
            name="Scope Branch B",
            code="SBB",
            created_by=cls.admin,
        )
        cls.branch_user = User.objects.create_user(
            username="payment-scope-reader",
            email="payment-scope-reader@example.com",
            password="password",
            role=cls.billing_role.code,
            branch=cls.branch_a,
            first_name="Branch",
            last_name="Reader",
        )
        cls.customer_user = User.objects.create_user(
            username="payment-scope-customer",
            email="payment-scope-customer@example.com",
            password="password",
            role="customer",
            first_name="Scope",
            last_name="Customer",
        )
        cls.customer = Customer.objects.create(
            user=cls.customer_user,
            customer_number="C-SCOPE",
        )

    def setUp(self):
        self.factory = APIRequestFactory()

    def _get_viewset_response(self, view, user, path="/", data=None):
        request = self.factory.get(path, data or {})
        force_authenticate(request, user=user)
        return view(request)

    def _create_invoice(self, branch, total="100.00"):
        return Invoice.objects.create(
            customer=self.customer,
            branch=branch,
            status="sent",
            subtotal=Decimal(total),
            tax_amount=Decimal("0.00"),
            total=Decimal(total),
            amount_due=Decimal(total),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )

    def _create_completed_payment(self, invoice, amount="25.00", method="cash"):
        payment = Payment.objects.create(
            invoice=invoice,
            customer=invoice.customer,
            payment_method=method,
            amount=Decimal(amount),
            status="pending",
            processed_by=self.admin,
        )
        Payment.objects.filter(pk=payment.pk).update(status="completed")
        payment.status = "completed"
        return payment

    def test_recent_payments_requires_billing_view_permission(self):
        invoice = self._create_invoice(self.branch_b)
        self._create_completed_payment(invoice)

        view = PaymentViewSet.as_view({"get": "recent"})
        response = self._get_viewset_response(view, self.customer_user, "/payments/recent/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_recent_payments_uses_branch_scoped_queryset(self):
        visible_invoice = self._create_invoice(self.branch_a)
        hidden_invoice = self._create_invoice(self.branch_b)
        visible_payment = self._create_completed_payment(visible_invoice)
        hidden_payment = self._create_completed_payment(hidden_invoice)

        view = PaymentViewSet.as_view({"get": "recent"})
        response = self._get_viewset_response(view, self.branch_user, "/payments/recent/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payment_ids = {item["id"] for item in response.data}
        self.assertIn(visible_payment.id, payment_ids)
        self.assertNotIn(hidden_payment.id, payment_ids)

    def test_payment_method_summary_uses_branch_scoped_queryset(self):
        visible_invoice = self._create_invoice(self.branch_a)
        hidden_invoice = self._create_invoice(self.branch_b)
        self._create_completed_payment(visible_invoice, amount="30.00", method="cash")
        self._create_completed_payment(hidden_invoice, amount="70.00", method="cash")

        view = PaymentViewSet.as_view({"get": "by_method"})
        response = self._get_viewset_response(view, self.branch_user, "/payments/by_method/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["Cash"]["count"], 1)
        self.assertEqual(response.data["Cash"]["total"], "30")

    def test_payment_list_empty_branch_scope_does_not_fail_open(self):
        hidden_invoice = self._create_invoice(self.branch_b)
        hidden_payment = self._create_completed_payment(hidden_invoice)

        view = PaymentViewSet.as_view({"get": "list"})
        response = self._get_viewset_response(view, self.branch_user, "/payments/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payment_ids = {item["id"] for item in response.data}
        self.assertNotIn(hidden_payment.id, payment_ids)
        self.assertEqual(payment_ids, set())

    def test_payment_allocation_list_empty_branch_scope_does_not_fail_open(self):
        hidden_invoice = self._create_invoice(self.branch_b)
        hidden_payment = self._create_completed_payment(hidden_invoice)
        allocation = PaymentAllocation.objects.create(
            payment=hidden_payment,
            invoice=hidden_invoice,
            amount=Decimal("10.00"),
            allocated_by=self.admin,
        )

        view = PaymentAllocationViewSet.as_view({"get": "list"})
        response = self._get_viewset_response(view, self.branch_user, "/payment-allocations/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        allocation_ids = {item["id"] for item in response.data}
        self.assertNotIn(allocation.id, allocation_ids)
        self.assertEqual(allocation_ids, set())
