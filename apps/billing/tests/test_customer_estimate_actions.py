from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.billing.models import Estimate
from apps.customers.models import Customer
from apps.diagnosis.models import Diagnosis
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder


class CustomerEstimateActionTests(APITestCase):
    def setUp(self):
        SystemModule.objects.update_or_create(
            slug="billing",
            defaults={"name": "Billing", "is_enabled": True},
        )
        SystemModule.objects.update_or_create(
            slug="workorders",
            defaults={"name": "Work Orders", "is_enabled": True},
        )
        self.staff_user = User.objects.create_user(
            username="estimate-staff",
            email="estimate-staff@example.com",
            password="testpass",
            role="admin",
            is_staff=True,
            is_superuser=True,
        )
        self.customer_user = User.objects.create_user(
            username="estimate-customer",
            email="estimate-customer@example.com",
            password="testpass",
            role="customer",
        )
        self.other_user = User.objects.create_user(
            username="other-estimate-customer",
            email="other-estimate-customer@example.com",
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
            license_plate="EST-001",
            current_mileage=45000,
        )

    def _create_estimate(self, customer):
        return Estimate.objects.create(
            customer=customer,
            status="sent",
            total=Decimal("250.00"),
            valid_until=timezone.now().date() + timedelta(days=7),
            created_by=self.staff_user,
        )

    def test_customer_can_approve_own_sent_estimate(self):
        estimate = self._create_estimate(self.customer)
        self.client.force_authenticate(self.customer_user)

        response = self.client.post(
            f"/api/billing/estimates/{estimate.id}/approve/",
            {"accepted_terms": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        estimate.refresh_from_db()
        self.assertEqual(estimate.status, "approved")
        self.assertEqual(estimate.approved_by, self.customer_user)
        self.assertIsNotNone(estimate.approved_date)

    def test_customer_cannot_approve_another_customers_estimate(self):
        estimate = self._create_estimate(self.other_customer)
        self.client.force_authenticate(self.customer_user)

        response = self.client.post(
            f"/api/billing/estimates/{estimate.id}/approve/",
            {"accepted_terms": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        estimate.refresh_from_db()
        self.assertEqual(estimate.status, "sent")

    def test_customer_cannot_list_or_retrieve_draft_estimate(self):
        estimate = Estimate.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            status="draft",
            total=Decimal("250.00"),
            valid_until=timezone.now().date() + timedelta(days=7),
            created_by=self.staff_user,
        )
        self.client.force_authenticate(self.customer_user)

        list_response = self.client.get("/api/billing/estimates/")
        detail_response = self.client.get(f"/api/billing/estimates/{estimate.id}/")

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data["count"], 0)
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_cannot_approve_estimate_for_completed_work_order(self):
        work_order = WorkOrder.objects.create(
            work_order_number="WO-EST-COMPLETE",
            customer=self.customer,
            vehicle=self.vehicle,
            status="completed",
            odometer_in=45000,
            completed_at=timezone.now(),
        )
        estimate = self._create_estimate(self.customer)
        estimate.work_order = work_order
        estimate.save(update_fields=["work_order"])
        self.client.force_authenticate(self.customer_user)

        response = self.client.post(
            f"/api/billing/estimates/{estimate.id}/approve/",
            {"accepted_terms": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no longer actionable", response.data["error"])
        estimate.refresh_from_db()
        work_order.refresh_from_db()
        self.assertEqual(estimate.status, "sent")
        self.assertEqual(work_order.status, "completed")

    def test_customer_approving_current_estimate_approves_linked_work_order(self):
        work_order = WorkOrder.objects.create(
            work_order_number="WO-EST-AWAITING",
            customer=self.customer,
            vehicle=self.vehicle,
            status="awaiting_approval",
            requires_approval=True,
            odometer_in=45000,
        )
        estimate = self._create_estimate(self.customer)
        estimate.work_order = work_order
        estimate.save(update_fields=["work_order"])
        self.client.force_authenticate(self.customer_user)

        response = self.client.post(
            f"/api/billing/estimates/{estimate.id}/approve/",
            {"accepted_terms": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        estimate.refresh_from_db()
        work_order.refresh_from_db()
        self.assertEqual(estimate.status, "approved")
        self.assertEqual(work_order.status, "approved")
        self.assertTrue(work_order.approved_by_customer)

    def test_customer_declining_current_estimate_reopens_diagnosis(self):
        work_order = WorkOrder.objects.create(
            work_order_number="WO-EST-DECLINE",
            customer=self.customer,
            vehicle=self.vehicle,
            status="awaiting_approval",
            requires_approval=True,
            diagnosis_notes="Needs brake pads",
            odometer_in=45000,
        )
        diagnosis = Diagnosis.objects.create(
            work_order=work_order,
            status="awaiting_approval",
            customer_complaint="Brake vibration",
            diagnostic_notes="Needs brake pads",
            requires_approval=True,
        )
        estimate = self._create_estimate(self.customer)
        estimate.work_order = work_order
        estimate.save(update_fields=["work_order"])
        self.client.force_authenticate(self.customer_user)

        response = self.client.post(
            f"/api/billing/estimates/{estimate.id}/decline/",
            {"reason": "Not now"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        estimate.refresh_from_db()
        work_order.refresh_from_db()
        diagnosis.refresh_from_db()
        self.assertEqual(estimate.status, "declined")
        self.assertEqual(work_order.status, "diagnosis")
        self.assertFalse(work_order.approved_by_customer)
        self.assertEqual(diagnosis.status, "in_progress")

    def test_approved_estimate_can_convert_to_valid_draft_work_order(self):
        estimate = Estimate.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            status="approved",
            title="Brake repair",
            description="Brake vibration repair",
            total=Decimal("250.00"),
            labor_subtotal=Decimal("100.00"),
            parts_subtotal=Decimal("150.00"),
            valid_until=timezone.now().date() + timedelta(days=7),
            created_by=self.staff_user,
        )
        self.client.force_authenticate(self.staff_user)

        response = self.client.post(f"/api/billing/estimates/{estimate.id}/convert_to_work_order/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        estimate.refresh_from_db()
        work_order = estimate.work_order
        self.assertIsNotNone(work_order)
        self.assertEqual(work_order.status, "draft")
        self.assertEqual(work_order.customer_concerns, "Brake vibration repair")
        self.assertEqual(work_order.odometer_in, self.vehicle.current_mileage)
