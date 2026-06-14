import pytest
from decimal import Decimal

from django.test import TestCase

from apps.accounts.models import User
from apps.accounting.models import AccountingControl
from apps.billing.models import Invoice, Payment
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder


class WorkOrderAutoInvoicedOnPaymentTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username="mgr_autoinv",
            email="mgr_autoinv@example.com",
            password="password",
            role="manager",
        )
        self.branch = Branch.objects.create(name="Main", code="MAIN2", created_by=self.manager)
        self.manager.managed_branches.add(self.branch)

        self.customer_user = User.objects.create_user(
            username="cust_autoinv",
            email="cust_autoinv@example.com",
            password="password",
            role="customer",
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            customer_number="CUST-AUTOINV-001",
            customer_type="individual",
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            vin="1HGBH41JXMN109186",
            year=2022,
            make="Honda",
            model="Civic",
            license_plate="AUTO-001",
            current_mileage=40000,
        )

    def _work_order_discontinued(self):
        return WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns="Noise",
            odometer_in=40000,
            status="discontinued_pending_bill",
            priority="normal",
            created_by=self.manager,
        )

    def test_full_payment_auto_marks_work_order_invoiced(self):
        work_order = self._work_order_discontinued()
        invoice = Invoice.objects.create(
            customer=work_order.customer,
            vehicle=work_order.vehicle,
            work_order=work_order,
            branch=work_order.branch,
            status="sent",
            total=Decimal("200.00"),
            amount_paid=Decimal("0"),
            amount_due=Decimal("200.00"),
            created_by=self.manager,
        )
        Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method="check",
            bank_account=AccountingControl.get_settings().default_bank_account,
            status="completed",
            amount=Decimal("200.00"),
            processed_by=self.manager,
        )
        work_order.refresh_from_db()
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, "paid")
        self.assertEqual(work_order.status, "invoiced")
        self.assertEqual(work_order.odometer_out, 40000)

    def test_partial_payment_does_not_auto_mark(self):
        work_order = self._work_order_discontinued()
        invoice = Invoice.objects.create(
            customer=work_order.customer,
            vehicle=work_order.vehicle,
            work_order=work_order,
            branch=work_order.branch,
            status="sent",
            total=Decimal("200.00"),
            amount_paid=Decimal("0"),
            amount_due=Decimal("200.00"),
            created_by=self.manager,
        )
        Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method="check",
            bank_account=AccountingControl.get_settings().default_bank_account,
            status="completed",
            amount=Decimal("50.00"),
            processed_by=self.manager,
        )
        work_order.refresh_from_db()
        self.assertEqual(work_order.status, "discontinued_pending_bill")

    def test_list_total_cost_reflects_invoice_not_shop_totals(self):
        from rest_framework.test import APIRequestFactory

        from apps.workorders.serializers import WorkOrderListSerializer

        work_order = self._work_order_discontinued()
        work_order.estimated_total = Decimal("999.00")
        work_order.actual_total = Decimal("888.00")
        work_order.save(update_fields=["estimated_total", "actual_total"])

        Invoice.objects.create(
            customer=work_order.customer,
            vehicle=work_order.vehicle,
            work_order=work_order,
            branch=work_order.branch,
            status="sent",
            total=Decimal("250.00"),
            amount_paid=Decimal("0"),
            amount_due=Decimal("250.00"),
            created_by=self.manager,
        )

        request = APIRequestFactory().get("/api/workorders/work-orders/")
        request.user = self.manager
        data = WorkOrderListSerializer(work_order, context={"request": request}).data

        self.assertEqual(data["total_cost"], "250.00")
        self.assertEqual(data["invoice_summary"]["total"], "250.00")

    def test_list_total_cost_null_without_invoice(self):
        from rest_framework.test import APIRequestFactory

        from apps.workorders.serializers import WorkOrderListSerializer

        work_order = self._work_order_discontinued()
        work_order.estimated_total = Decimal("500.00")
        work_order.save(update_fields=["estimated_total"])

        request = APIRequestFactory().get("/api/workorders/work-orders/")
        request.user = self.manager
        data = WorkOrderListSerializer(work_order, context={"request": request}).data

        self.assertIsNone(data["total_cost"])
        self.assertIsNone(data["invoice_summary"])

    def test_can_create_revision_after_void_invoice(self):
        work_order = self._work_order_discontinued()
        Invoice.objects.create(
            customer=work_order.customer,
            vehicle=work_order.vehicle,
            work_order=work_order,
            branch=work_order.branch,
            status="void",
            total=Decimal("100.00"),
            amount_paid=Decimal("0"),
            amount_due=Decimal("0"),
            created_by=self.manager,
        )
        from apps.billing.work_order_invoices import active_invoice_exists_for_work_order

        self.assertFalse(active_invoice_exists_for_work_order(work_order))

        revision = Invoice.objects.create(
            customer=work_order.customer,
            vehicle=work_order.vehicle,
            work_order=work_order,
            branch=work_order.branch,
            status="draft",
            total=Decimal("150.00"),
            amount_paid=Decimal("0"),
            amount_due=Decimal("150.00"),
            created_by=self.manager,
        )
        self.assertEqual(revision.work_order_id, work_order.id)
        self.assertTrue(active_invoice_exists_for_work_order(work_order))
