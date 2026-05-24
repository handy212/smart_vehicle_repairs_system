from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, APITestCase

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.billing.models import Estimate, Invoice
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder, WorkOrderPart
from apps.workorders.serializers import WorkOrderDetailSerializer


class CustomerPortalWorkOrderAPITests(APITestCase):
    def setUp(self):
        SystemModule.objects.update_or_create(
            slug="workorders",
            defaults={"name": "Work Orders", "is_enabled": True},
        )
        SystemModule.objects.update_or_create(
            slug="billing",
            defaults={"name": "Billing", "is_enabled": True},
        )
        self.staff_user = User.objects.create_user(
            username="service-advisor",
            email="advisor@example.com",
            password="testpass",
            role="admin",
            is_staff=True,
        )
        self.customer_user = User.objects.create_user(
            username="portal-customer",
            email="portal-customer@example.com",
            password="testpass",
            role="customer",
        )
        self.other_user = User.objects.create_user(
            username="other-customer",
            email="other-customer@example.com",
            password="testpass",
            role="customer",
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.other_customer = Customer.objects.create(user=self.other_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            year=2021,
            make="Toyota",
            model="Camry",
            vin="1HGBH41JXMN109186",
            license_plate="CUS-001",
            current_mileage=45000,
        )
        self.other_vehicle = Vehicle.objects.create(
            owner=self.other_customer,
            year=2020,
            make="Honda",
            model="Civic",
            vin="2HGBH41JXMN109186",
            license_plate="OTH-001",
            current_mileage=30000,
        )
        self.work_order = WorkOrder.objects.create(
            work_order_number="WO-PORTAL-001",
            customer=self.customer,
            vehicle=self.vehicle,
            status="awaiting_approval",
            requires_approval=True,
            customer_concerns="Brake vibration",
            estimated_total=Decimal("350.00"),
            odometer_in=45000,
        )
        self.other_work_order = WorkOrder.objects.create(
            work_order_number="WO-PORTAL-002",
            customer=self.other_customer,
            vehicle=self.other_vehicle,
            status="in_progress",
            customer_concerns="Oil leak",
            odometer_in=30000,
        )
        self.estimate = Estimate.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=self.work_order,
            status="sent",
            valid_until=timezone.now().date() + timedelta(days=14),
            total=Decimal("350.00"),
            created_by=self.staff_user,
        )
        self.invoice = Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=self.work_order,
            estimate=self.estimate,
            status="sent",
            due_date=timezone.now().date() + timedelta(days=7),
            total=Decimal("350.00"),
            amount_paid=Decimal("50.00"),
            created_by=self.staff_user,
        )

    def test_customer_work_order_list_is_owned_and_includes_billing_summaries(self):
        self.client.force_authenticate(self.customer_user)

        response = self.client.get("/api/workorders/work-orders/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], self.work_order.id)
        self.assertEqual(results[0]["estimate_summary"]["id"], self.estimate.id)
        self.assertEqual(results[0]["invoice_summary"]["id"], self.invoice.id)
        self.assertEqual(results[0]["invoice_summary"]["amount_due"], "300.00")

    def test_customer_work_order_detail_includes_billing_summaries(self):
        self.client.force_authenticate(self.customer_user)

        response = self.client.get(f"/api/workorders/work-orders/{self.work_order.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["estimate_summary"]["id"], self.estimate.id)
        self.assertEqual(response.data["invoice_summary"]["id"], self.invoice.id)
        self.assertEqual(response.data["customer_concerns"], "Brake vibration")

    def test_staff_work_order_summary_tracks_draft_invoice(self):
        self.invoice.status = "draft"
        self.invoice.amount_paid = Decimal("0.00")
        self.invoice.save(update_fields=["status", "amount_paid", "updated_at"])
        factory = APIRequestFactory()
        drf_request = Request(factory.get("/api/workorders/work-orders/"))
        drf_request.user = self.staff_user

        data = WorkOrderDetailSerializer(
            self.work_order,
            context={"request": drf_request},
        ).data

        self.assertEqual(data["invoice_summary"]["id"], self.invoice.id)
        self.assertEqual(data["invoice_summary"]["status"], "draft")

    def test_customer_work_order_summary_hides_draft_invoice(self):
        self.invoice.status = "draft"
        self.invoice.amount_paid = Decimal("0.00")
        self.invoice.save(update_fields=["status", "amount_paid", "updated_at"])
        factory = APIRequestFactory()
        drf_request = Request(factory.get("/api/workorders/work-orders/"))
        drf_request.user = self.customer_user

        data = WorkOrderDetailSerializer(
            self.work_order,
            context={"request": drf_request},
        ).data

        self.assertIsNone(data["invoice_summary"])

    def test_customer_cannot_probe_other_work_order_detail(self):
        self.client.force_authenticate(self.customer_user)

        response = self.client.get(f"/api/workorders/work-orders/{self.other_work_order.id}/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_work_order_list_is_not_allowed(self):
        response = self.client.get("/api/workorders/public/")

        self.assertIn(
            response.status_code,
            [status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED],
        )

    def test_public_token_cannot_approve_completed_work_order(self):
        self.work_order.status = "completed"
        self.work_order.save(update_fields=["status"])

        response = self.client.post(f"/api/workorders/public/{self.work_order.access_token}/approve/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no longer waiting", response.data["error"])
        self.work_order.refresh_from_db()
        self.assertFalse(self.work_order.approved_by_customer)

    def test_public_token_approval_approves_linked_estimate(self):
        response = self.client.post(
            f"/api/workorders/public/{self.work_order.access_token}/approve/",
            {"approval_notes": "Customer approved portal quote"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.work_order.refresh_from_db()
        self.estimate.refresh_from_db()
        self.assertEqual(self.work_order.status, "approved")
        self.assertTrue(self.work_order.approved_by_customer)
        self.assertEqual(self.estimate.status, "approved")
        self.assertIsNotNone(self.estimate.approved_date)

    def test_completed_and_closed_work_orders_cannot_reopen_directly_to_repairs(self):
        self.work_order.status = "completed"
        self.work_order.save(update_fields=["status"])

        can_transition, error = self.work_order.can_transition_to("in_progress")

        self.assertFalse(can_transition)
        self.assertIn("Cannot transition", error)

        self.work_order.status = "closed"
        self.work_order.save(update_fields=["status"])

        can_transition, error = self.work_order.can_transition_to("in_progress")

        self.assertFalse(can_transition)
        self.assertIn("Cannot transition", error)

    def test_customer_parts_list_is_restricted_to_owned_work_orders(self):
        WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name="Brake Pads",
            quantity=Decimal("1"),
        )
        WorkOrderPart.objects.create(
            work_order=self.other_work_order,
            part_name="Oil Pan",
            quantity=Decimal("1"),
        )
        self.client.force_authenticate(self.customer_user)

        response = self.client.get("/api/workorders/parts/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["part_name"], "Brake Pads")
