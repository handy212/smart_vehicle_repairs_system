from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Estimate, EstimateLineItem
from apps.billing.serializers import EstimateUpdateSerializer
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder, WorkOrderPart
from apps.diagnosis.models import Diagnosis, RepairRecommendation


class EstimateWorkOrderSyncTests(TestCase):
    def setUp(self):
        self.staff_user = User.objects.create_user(
            username="estimate-sync-staff",
            email="estimate-sync-staff@example.com",
            password="testpass",
            role="admin",
            is_staff=True,
        )
        self.customer_user = User.objects.create_user(
            username="estimate-sync-customer",
            email="estimate-sync-customer@example.com",
            password="testpass",
            role="customer",
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            year=2021,
            make="Toyota",
            model="Camry",
            vin="1HGBH41JXMN109186",
            license_plate="SYNC-001",
            current_mileage=45000,
        )
        self.work_order = WorkOrder.objects.create(
            work_order_number="WO-EST-SYNC",
            customer=self.customer,
            vehicle=self.vehicle,
            status="awaiting_approval",
            odometer_in=45000,
        )
        self.api_client = APIClient()

    def test_updating_labor_line_items_updates_linked_work_order_totals(self):
        estimate = Estimate.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=self.work_order,
            status="draft",
            valid_until=timezone.now().date() + timedelta(days=7),
            created_by=self.staff_user,
        )
        EstimateLineItem.objects.create(
            estimate=estimate,
            item_type="labor",
            description="Initial labor",
            quantity=Decimal("1.00"),
            unit_price=Decimal("0.00"),
            labor_hours=Decimal("1.00"),
            labor_rate=Decimal("0.00"),
        )
        estimate.calculate_totals()

        serializer = EstimateUpdateSerializer(
            estimate,
            data={
                "customer": self.customer.id,
                "vehicle": self.vehicle.id,
                "work_order": self.work_order.id,
                "estimate_date": timezone.now().date().isoformat(),
                "valid_until": (timezone.now().date() + timedelta(days=7)).isoformat(),
                "status": "draft",
                "line_items": [
                    {
                        "item_type": "labor",
                        "description": "Diagnostic labor",
                        "quantity": "2.00",
                        "unit_price": "75.00",
                        "labor_hours": "2.00",
                        "labor_rate": "75.00",
                        "is_taxable": True,
                        "order": 0,
                    }
                ],
            },
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        estimate.refresh_from_db()
        self.work_order.refresh_from_db()
        line_item = estimate.line_items.get()

        self.assertEqual(line_item.labor_hours, Decimal("2.00"))
        self.assertEqual(line_item.labor_rate, Decimal("75.00"))
        self.assertEqual(line_item.total, Decimal("150.00"))
        self.assertEqual(self.work_order.estimated_labor_hours, Decimal("2.00"))
        self.assertEqual(self.work_order.estimated_labor_cost, Decimal("150.00"))
        self.assertEqual(self.work_order.estimated_total, Decimal("150.00"))

    def test_estimate_part_lines_do_not_create_or_override_work_order_parts(self):
        WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name="Diagnosis Battery",
            part_number="BAT-001",
            quantity=Decimal("2.00"),
            unit_cost=Decimal("10.00"),
            status="pending",
        )

        estimate = Estimate.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=self.work_order,
            status="draft",
            valid_until=timezone.now().date() + timedelta(days=7),
            created_by=self.staff_user,
        )
        EstimateLineItem.objects.create(
            estimate=estimate,
            item_type="part",
            description="Estimate-only battery quote",
            part_number="BAT-001",
            quantity=Decimal("5.00"),
            unit_price=Decimal("99.00"),
        )
        EstimateLineItem.objects.create(
            estimate=estimate,
            item_type="labor",
            description="Diagnostic labor",
            quantity=Decimal("1.00"),
            unit_price=Decimal("75.00"),
            labor_hours=Decimal("1.00"),
            labor_rate=Decimal("75.00"),
        )

        estimate.sync_parts_to_work_order()

        self.work_order.refresh_from_db()
        parts = list(self.work_order.parts.all())

        self.assertEqual(len(parts), 1)
        self.assertEqual(parts[0].part_name, "Diagnosis Battery")
        self.assertEqual(parts[0].quantity, Decimal("2.00"))
        self.assertEqual(parts[0].selling_price, Decimal("20.00"))
        self.assertEqual(self.work_order.estimated_parts_cost, Decimal("20.00"))
        self.assertEqual(self.work_order.estimated_labor_cost, Decimal("75.00"))
        self.assertEqual(self.work_order.estimated_total, Decimal("95.00"))

    def test_diagnosis_quote_prunes_estimate_only_part_lines(self):
        WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name="Diagnosis Battery",
            part_number="BAT-001",
            quantity=Decimal("2.00"),
            unit_cost=Decimal("10.00"),
            status="pending",
        )

        estimate = Estimate.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=self.work_order,
            status="draft",
            valid_until=timezone.now().date() + timedelta(days=7),
            created_by=self.staff_user,
        )
        EstimateLineItem.objects.create(
            estimate=estimate,
            item_type="part",
            description="Diagnosis Battery",
            part_number="BAT-001",
            quantity=Decimal("2.00"),
            unit_price=Decimal("99.00"),
            notes="[DIAG-REC:1] Recommendation: replace battery",
        )
        EstimateLineItem.objects.create(
            estimate=estimate,
            item_type="part",
            description="Estimate-only add-on",
            part_number="ADD-ON",
            quantity=Decimal("1.00"),
            unit_price=Decimal("50.00"),
            notes="",
        )

        estimate.sync_parts_to_work_order()

        remaining_parts = list(estimate.line_items.filter(item_type="part"))
        self.assertEqual(len(remaining_parts), 1)
        self.assertEqual(remaining_parts[0].part_number, "BAT-001")

    def test_editing_released_estimate_does_not_accidentally_hide_it_from_customer(self):
        estimate = Estimate.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=self.work_order,
            status="sent",
            valid_until=timezone.now().date() + timedelta(days=7),
            created_by=self.staff_user,
        )
        EstimateLineItem.objects.create(
            estimate=estimate,
            item_type="labor",
            description="Initial labor",
            quantity=Decimal("1.00"),
            unit_price=Decimal("50.00"),
            labor_hours=Decimal("1.00"),
            labor_rate=Decimal("50.00"),
        )
        estimate.calculate_totals()

        serializer = EstimateUpdateSerializer(
            estimate,
            data={
                "customer": self.customer.id,
                "vehicle": self.vehicle.id,
                "work_order": self.work_order.id,
                "estimate_date": timezone.now().date().isoformat(),
                "valid_until": (timezone.now().date() + timedelta(days=7)).isoformat(),
                "status": "draft",
                "line_items": [
                    {
                        "item_type": "labor",
                        "description": "Updated labor",
                        "quantity": "1.00",
                        "unit_price": "75.00",
                        "labor_hours": "1.00",
                        "labor_rate": "75.00",
                        "is_taxable": True,
                    }
                ],
            },
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        estimate.refresh_from_db()
        self.assertEqual(estimate.status, "sent")

    def test_mark_ready_marks_linked_requested_recommendations_as_quoted(self):
        self.staff_user.role = "manager"
        self.staff_user.save(update_fields=["role"])
        diagnosis = Diagnosis.objects.create(
            work_order=self.work_order,
            status="in_progress",
            customer_complaint="Battery issue",
            diagnostic_notes="Waiting for pricing",
            requires_approval=True,
        )
        estimate = Estimate.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=self.work_order,
            status="draft",
            valid_until=timezone.now().date() + timedelta(days=7),
            created_by=self.staff_user,
        )
        recommendation = RepairRecommendation.objects.create(
            diagnosis=diagnosis,
            description="Replace battery",
            approval_status="approved",
            quotation_status="requested",
            quotation_estimate_id=estimate.id,
            quotation_estimate_number=estimate.estimate_number,
        )
        EstimateLineItem.objects.create(
            estimate=estimate,
            item_type="part",
            description="Battery replacement",
            part_number="BAT-001",
            quantity=Decimal("1.00"),
            unit_price=Decimal("120.00"),
            notes=f"[DIAG-REC:{recommendation.id}] Battery replacement",
        )
        estimate.calculate_totals()

        self.api_client.force_authenticate(self.staff_user)
        response = self.api_client.post(f"/api/billing/estimates/{estimate.id}/mark_ready/")

        self.assertEqual(response.status_code, 200)
        recommendation.refresh_from_db()
        self.work_order.refresh_from_db()

        self.assertEqual(recommendation.quotation_status, "quoted")
        self.assertEqual(self.work_order.get_current_quote_stage(), "quotation_ready")
