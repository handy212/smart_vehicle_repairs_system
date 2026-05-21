import pytest
from decimal import Decimal

pytestmark = pytest.mark.legacy_integration

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Invoice
from apps.billing.serializers import InvoiceCreateSerializer
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder, ServiceTask


class DiscontinueJobFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = User.objects.create_user(
            username="mgr_disc",
            email="mgr_disc@example.com",
            password="password",
            role="manager",
        )
        self.branch = Branch.objects.create(name="Main", code="MAIN", created_by=self.manager)
        self.manager.managed_branches.add(self.branch)

        self.customer_user = User.objects.create_user(
            username="customer_disc",
            email="customer_disc@example.com",
            password="password",
            role="customer",
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            customer_number="CUST-DISC-001",
            customer_type="individual",
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            vin="DISCONTINUETEST1234",
            year=2021,
            make="Toyota",
            model="Corolla",
            license_plate="DISC-001",
            current_mileage=50000,
        )
        self.client.force_authenticate(user=self.manager)

    def _create_work_order(self, status="in_progress"):
        return WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns="Investigate engine noise",
            odometer_in=50000,
            odometer_out=50020,
            status=status,
            priority="normal",
            service_coordinator=self.manager,
            created_by=self.manager,
        )

    def test_discontinue_job_action_sets_status_and_metadata(self):
        work_order = self._create_work_order(status="in_progress")
        ServiceTask.objects.create(
            work_order=work_order,
            task_type="repair",
            description="Initial diagnosis labor",
            status="in_progress",
            is_workflow_task=False,
            sequence_order=1,
            actual_hours=Decimal("1.00"),
            labor_rate=Decimal("120.00"),
            labor_cost=Decimal("120.00"),
        )

        url = reverse("api_workorders:workorder-discontinue-job", args=[work_order.id])
        response = self.client.post(
            url,
            {
                "reason_code": "stopped_mid_repair",
                "notes": "Customer requested to stop after initial findings.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        work_order.refresh_from_db()
        self.assertEqual(work_order.status, "discontinued_pending_bill")
        self.assertEqual(work_order.customer_discontinuation_reason, "stopped_mid_repair")
        self.assertTrue(work_order.customer_discontinued_at is not None)
        self.assertEqual(work_order.customer_discontinued_by_id, self.manager.id)

    def test_invoice_create_serializer_allows_discontinued_work_order(self):
        work_order = self._create_work_order(status="discontinued_pending_bill")
        work_order.customer_discontinuation_reason = "declined_estimate_or_work"
        work_order.customer_discontinuation_notes = "Customer declined quote."
        work_order.customer_discontinued_by = self.manager
        work_order.customer_discontinued_at = work_order.created_at
        work_order.save(
            update_fields=[
                "customer_discontinuation_reason",
                "customer_discontinuation_notes",
                "customer_discontinued_by",
                "customer_discontinued_at",
            ]
        )

        factory = APIRequestFactory()
        drf_request = Request(factory.post("/api/billing/invoices/"))
        drf_request.user = self.manager
        serializer = InvoiceCreateSerializer(
            data={
                "work_order": work_order.id,
                "invoice_date": "2026-05-20",
                "due_date": "2026-06-20",
                "line_items": [],
            },
            context={"request": drf_request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_discontinued_invoice_totals_only_bill_completed_or_skipped_labor(self):
        work_order = self._create_work_order(status="discontinued_pending_bill")
        work_order.customer_discontinuation_reason = "stopped_mid_repair"
        work_order.customer_discontinued_by = self.manager
        work_order.customer_discontinued_at = work_order.created_at
        work_order.save(
            update_fields=[
                "customer_discontinuation_reason",
                "customer_discontinued_by",
                "customer_discontinued_at",
            ]
        )

        ServiceTask.objects.create(
            work_order=work_order,
            task_type="repair",
            description="Completed labor",
            status="completed",
            is_workflow_task=False,
            sequence_order=1,
            labor_cost=Decimal("100.00"),
        )
        ServiceTask.objects.create(
            work_order=work_order,
            task_type="repair",
            description="Skipped labor",
            status="skipped",
            is_workflow_task=False,
            sequence_order=2,
            labor_cost=Decimal("50.00"),
        )
        ServiceTask.objects.create(
            work_order=work_order,
            task_type="repair",
            description="Pending labor should not bill",
            status="pending",
            is_workflow_task=False,
            sequence_order=3,
            labor_cost=Decimal("999.00"),
        )

        work_order.parts.create(
            part_name="Installed pad",
            part_number="PAD-1",
            quantity=1,
            unit_cost=Decimal("80.00"),
            total_cost=Decimal("80.00"),
            selling_price=Decimal("80.00"),
            status="installed",
        )
        work_order.parts.create(
            part_name="Draft part",
            part_number="PAD-2",
            quantity=1,
            unit_cost=Decimal("10.00"),
            total_cost=Decimal("10.00"),
            selling_price=Decimal("500.00"),
            status="draft",
        )

        invoice = Invoice.objects.create(
            customer=work_order.customer,
            vehicle=work_order.vehicle,
            work_order=work_order,
            branch=work_order.branch,
            status="sent",
            created_by=self.manager,
        )
        invoice.calculate_totals_from_work_order()
        self.assertEqual(invoice.labor_subtotal, Decimal("150.00"))
        self.assertEqual(invoice.parts_subtotal, Decimal("80.00"))

    def test_invoice_create_saves_line_items_for_discontinued_work_order(self):
        work_order = self._create_work_order(status="discontinued_pending_bill")
        work_order.customer_discontinuation_reason = "stopped_mid_repair"
        work_order.customer_discontinued_by = self.manager
        work_order.customer_discontinued_at = work_order.created_at
        work_order.save(
            update_fields=[
                "customer_discontinuation_reason",
                "customer_discontinued_by",
                "customer_discontinued_at",
            ]
        )
        ServiceTask.objects.create(
            work_order=work_order,
            task_type="repair",
            description="Brake inspection",
            status="completed",
            is_workflow_task=False,
            sequence_order=1,
            actual_hours=Decimal("1.00"),
            labor_rate=Decimal("100.00"),
            labor_cost=Decimal("100.00"),
        )
        work_order.parts.create(
            part_name="Washer fluid",
            part_number="WF-1",
            quantity=2,
            unit_cost=Decimal("5.00"),
            total_cost=Decimal("10.00"),
            selling_price=Decimal("24.00"),
            status="installed",
        )

        factory = APIRequestFactory()
        drf_request = Request(factory.post("/api/billing/invoices/"))
        drf_request.user = self.manager
        serializer = InvoiceCreateSerializer(
            data={
                "work_order": work_order.id,
                "invoice_date": "2026-05-20",
                "due_date": "2026-06-20",
                "line_items": [],
            },
            context={"request": drf_request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        invoice = serializer.save()
        lines = list(invoice.line_items.order_by("order", "id"))
        self.assertGreaterEqual(len(lines), 2)
        labor = [li for li in lines if li.item_type == "labor"]
        parts = [li for li in lines if li.item_type == "part"]
        self.assertTrue(any("Brake inspection" in li.description for li in labor))
        self.assertTrue(any("Washer fluid" in li.description for li in parts))

    def test_invoice_create_with_submitted_line_items_keeps_staff_amounts(self):
        """Non-empty payload lines must persist; do not overwrite with WO-derived rows."""
        work_order = self._create_work_order(status="discontinued_pending_bill")
        work_order.customer_discontinuation_reason = "stopped_mid_repair"
        work_order.customer_discontinued_by = self.manager
        work_order.customer_discontinued_at = work_order.created_at
        work_order.save(
            update_fields=[
                "customer_discontinuation_reason",
                "customer_discontinued_by",
                "customer_discontinued_at",
            ]
        )
        factory = APIRequestFactory()
        drf_request = Request(factory.post("/api/billing/invoices/"))
        drf_request.user = self.manager
        serializer = InvoiceCreateSerializer(
            data={
                "work_order": work_order.id,
                "invoice_date": "2026-05-20",
                "due_date": "2026-06-20",
                "line_items": [
                    {
                        "item_type": "labor",
                        "description": "Shop adjustment — WO test",
                        "quantity": "1",
                        "unit_price": "275.50",
                        "discount_percentage": "0",
                        "is_taxable": True,
                    }
                ],
            },
            context={"request": drf_request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        invoice = serializer.save()
        lines = list(invoice.line_items.order_by("order", "id"))
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0].total, Decimal("275.50"))
        self.assertEqual(invoice.labor_subtotal, Decimal("275.50"))
