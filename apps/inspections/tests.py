from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inspections.models import (
    InspectionCategory,
    InspectionItem,
    InspectionResult,
    InspectionTemplate,
    VehicleInspection,
)
from apps.vehicles.models import Vehicle


class InspectionSystemTests(TestCase):
    def setUp(self):
        call_command("init_permissions", verbosity=0)
        self.client = APIClient()

        self.admin = User.objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="password123",
            first_name="Admin",
            last_name="User",
            role="admin",
        )
        self.manager_a = User.objects.create_user(
            username="manager_a",
            email="manager_a@example.com",
            password="password123",
            first_name="Manager",
            last_name="A",
            role="manager",
        )
        self.manager_b = User.objects.create_user(
            username="manager_b",
            email="manager_b@example.com",
            password="password123",
            first_name="Manager",
            last_name="B",
            role="manager",
        )

        self.branch_a = Branch.objects.create(name="Branch A", code="BRA", created_by=self.admin)
        self.branch_b = Branch.objects.create(name="Branch B", code="BRB", created_by=self.admin)
        self.manager_a.managed_branches.add(self.branch_a)
        self.manager_b.managed_branches.add(self.branch_b)

        customer_user = User.objects.create_user(
            username="customer",
            email="customer@example.com",
            password="password123",
            first_name="Customer",
            last_name="One",
            role="customer",
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number="CUST-001")
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            vin="1HGCM82633A004352",
            make="Honda",
            model="Accord",
            year=2020,
            license_plate="DVI-001",
            current_mileage=10000,
        )

        self.template = InspectionTemplate.objects.create(
            name="DVI Regression Template",
            created_by=self.admin,
            requires_technician_signature=True,
        )
        self.category = InspectionCategory.objects.create(
            template=self.template,
            name="Safety",
            order=1,
        )
        self.critical_item = InspectionItem.objects.create(
            category=self.category,
            name="Brake Pedal",
            item_type="pass_fail",
            is_critical=True,
            order=1,
        )
        self.noncritical_item = InspectionItem.objects.create(
            category=self.category,
            name="Wiper Blades",
            item_type="pass_fail",
            order=2,
        )

    def make_inspection(self, branch, performed_by=None):
        return VehicleInspection.objects.create(
            branch=branch,
            vehicle=self.vehicle,
            template=self.template,
            performed_by=performed_by or self.admin,
            odometer_reading=10000,
        )

    def response_results(self, response):
        if isinstance(response.data, dict) and "results" in response.data:
            return response.data["results"]
        return response.data

    def test_completion_percentage_excludes_unchecked_results(self):
        inspection = self.make_inspection(self.branch_a)
        InspectionResult.objects.create(
            inspection=inspection,
            inspection_item=self.critical_item,
            result="not_checked",
        )
        InspectionResult.objects.create(
            inspection=inspection,
            inspection_item=self.noncritical_item,
            result="pass",
        )

        self.assertEqual(inspection.completion_percentage, 50)

    def test_complete_requires_all_critical_items_checked(self):
        inspection = self.make_inspection(self.branch_a)
        InspectionResult.objects.create(
            inspection=inspection,
            inspection_item=self.noncritical_item,
            result="pass",
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/inspections/inspections/{inspection.id}/complete/",
            {"technician_signature": "data:image/png;base64,signature"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("critical items", response.data["error"])

        InspectionResult.objects.create(
            inspection=inspection,
            inspection_item=self.critical_item,
            result="pass",
        )
        response = self.client.post(
            f"/api/inspections/inspections/{inspection.id}/complete/",
            {"technician_signature": "data:image/png;base64,signature"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        inspection.refresh_from_db()
        self.assertEqual(inspection.status, "completed")

    def test_template_duplicate_creates_unique_full_copy(self):
        self.client.force_authenticate(user=self.admin)

        first_response = self.client.post(
            f"/api/inspections/templates/{self.template.id}/duplicate/",
            format="json",
        )
        second_response = self.client.post(
            f"/api/inspections/templates/{self.template.id}/duplicate/",
            format="json",
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 201)
        self.assertEqual(first_response.data["template"]["name"], "DVI Regression Template (Copy)")
        self.assertEqual(second_response.data["template"]["name"], "DVI Regression Template (Copy 2)")

        copied_template = InspectionTemplate.objects.get(id=first_response.data["template"]["id"])
        copied_category = copied_template.categories.get(name="Safety")
        copied_items = list(copied_category.items.order_by("order").values_list("name", "is_critical"))
        self.assertEqual(copied_items, [("Brake Pedal", True), ("Wiper Blades", False)])

    def test_template_odometer_setting_is_enforced_on_create(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/inspections/inspections/",
            {
                "branch": self.branch_a.id,
                "vehicle": self.vehicle.id,
                "template": self.template.id,
                "inspection_date": "2026-05-05T10:00:00Z",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("odometer_reading", response.data)

        self.template.requires_odometer = False
        self.template.save()
        response = self.client.post(
            "/api/inspections/inspections/",
            {
                "branch": self.branch_a.id,
                "vehicle": self.vehicle.id,
                "template": self.template.id,
                "inspection_date": "2026-05-05T10:00:00Z",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)

    def test_required_odometer_can_be_marked_unavailable(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/inspections/inspections/",
            {
                "branch": self.branch_a.id,
                "vehicle": self.vehicle.id,
                "template": self.template.id,
                "inspection_date": "2026-05-05T10:00:00Z",
                "odometer_unavailable": True,
                "odometer_unavailable_reason": "Accident vehicle, cluster unreadable",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        inspection = VehicleInspection.objects.get(id=response.data["id"])
        self.assertIsNone(inspection.odometer_reading)
        self.assertTrue(inspection.odometer_unavailable)
        self.assertEqual(inspection.odometer_unavailable_reason, "Accident vehicle, cluster unreadable")

    def test_complete_allows_required_odometer_when_marked_unavailable(self):
        inspection = self.make_inspection(self.branch_a)
        inspection.odometer_reading = None
        inspection.odometer_unavailable = True
        inspection.odometer_unavailable_reason = "Electrical issue"
        inspection.save()
        InspectionResult.objects.create(
            inspection=inspection,
            inspection_item=self.critical_item,
            result="pass",
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/inspections/inspections/{inspection.id}/complete/",
            {"technician_signature": "data:image/png;base64,signature"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)

    def test_template_customer_signature_setting_is_enforced_on_approval(self):
        self.template.requires_customer_signature = True
        self.template.save()
        inspection = self.make_inspection(self.branch_a)
        inspection.status = "completed"
        inspection.save()
        InspectionResult.objects.create(
            inspection=inspection,
            inspection_item=self.critical_item,
            result="pass",
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f"/api/inspections/inspections/{inspection.id}/approve/", format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("Customer signature", response.data["error"])

        response = self.client.post(
            f"/api/inspections/inspections/{inspection.id}/approve/",
            {"customer_signature": "data:image/png;base64,signature"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)

    def test_staff_can_approve_on_behalf_with_signature_and_reason(self):
        self.template.requires_customer_signature = True
        self.template.save()
        inspection = self.make_inspection(self.branch_a)
        inspection.status = "completed"
        inspection.save()
        InspectionResult.objects.create(
            inspection=inspection,
            inspection_item=self.critical_item,
            result="pass",
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/inspections/inspections/{inspection.id}/approve/",
            {
                "customer_signature": "data:image/png;base64,on-behalf",
                "approve_on_behalf_reason": "Customer authorized by phone",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        inspection.refresh_from_db()
        self.assertEqual(inspection.status, "approved")
        self.assertIn("Customer authorized by phone", inspection.notes)

    def test_template_photo_setting_blocks_photo_uploads(self):
        self.template.allows_photos = False
        self.template.save()
        inspection = self.make_inspection(self.branch_a)
        result = InspectionResult.objects.create(
            inspection=inspection,
            inspection_item=self.critical_item,
            result="pass",
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/inspections/results/{result.id}/add_photo/",
            {"caption": "Blocked photo"},
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Photos are not allowed", response.data["error"])

    def test_custom_inspection_endpoints_respect_branch_scope(self):
        inspection_a = self.make_inspection(self.branch_a, self.manager_a)
        inspection_b = self.make_inspection(self.branch_b, self.manager_b)
        result_a = InspectionResult.objects.create(
            inspection=inspection_a,
            inspection_item=self.critical_item,
            result="fail",
            needs_immediate_attention=True,
        )
        InspectionResult.objects.create(
            inspection=inspection_b,
            inspection_item=self.critical_item,
            result="fail",
            needs_immediate_attention=True,
        )

        self.client.force_authenticate(user=self.manager_a)

        by_vehicle = self.client.get(
            f"/api/inspections/inspections/by_vehicle/?vehicle_id={self.vehicle.id}"
        )
        self.assertEqual(by_vehicle.status_code, 200)
        inspection_ids = [item["id"] for item in self.response_results(by_vehicle)]
        self.assertIn(inspection_a.id, inspection_ids)
        self.assertNotIn(inspection_b.id, inspection_ids)

        critical = self.client.get("/api/inspections/results/critical/")
        self.assertEqual(critical.status_code, 200)
        result_ids = [item["id"] for item in self.response_results(critical)]
        self.assertEqual(result_ids, [result_a.id])

        needs_attention = self.client.get("/api/inspections/results/needs_attention/")
        self.assertEqual(needs_attention.status_code, 200)
        result_ids = [item["id"] for item in self.response_results(needs_attention)]
        self.assertEqual(result_ids, [result_a.id])
