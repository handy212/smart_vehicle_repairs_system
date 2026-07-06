from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.client_demo_data import ClientDemoDataService
from apps.accounts.seed_identity import SEED_EMAIL_DOMAIN, SEED_MARKER, SEED_TAG, seed_customers_qs, seed_invoices_qs, seed_users_qs, seed_vehicles_qs, seed_workorders_qs
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.billing.models import Invoice, Payment
from apps.diagnosis.models import DiagnosisFinding, RepairRecommendation
from apps.documents.models import Document
from apps.hr.models import Attendance, EmployeeTraining
from apps.inspections.models import InspectionResult
from apps.notifications_app.models import Notification, NotificationLog
from apps.quickbooks_online.models import QBOConfig, QBOSyncLog
from apps.reporting.models import ReportSchedule, SavedReport
from apps.workorders.models import ServiceTask, TechnicianTimeLog, WorkOrder, WorkOrderNote, WorkOrderPart


User = get_user_model()


class ClientDemoDataServiceTests(TestCase):
    def test_load_is_idempotent_and_preserves_real_data(self):
        real_user = User.objects.create_user(
            username="real_customer",
            email="real.customer@example.com",
            password="test123",
            role="customer",
        )
        real_customer = Customer.objects.create(user=real_user, customer_number="REAL-001")

        first = ClientDemoDataService(count=2).load(["customers", "vehicles", "billing"])
        second = ClientDemoDataService(count=2).load(["customers", "vehicles", "billing"])

        self.assertFalse(any(item["errors"] for item in first["modules"]))
        self.assertFalse(any(item["errors"] for item in second["modules"]))
        self.assertEqual(seed_customers_qs().count(), 2)
        self.assertEqual(seed_vehicles_qs().count(), 2)
        self.assertEqual(seed_invoices_qs().count(), 2)
        self.assertTrue(Customer.objects.filter(pk=real_customer.pk).exists())

    def test_purge_removes_demo_only(self):
        real_user = User.objects.create_user(
            username="real_customer_2",
            email="real.customer2@example.com",
            password="test123",
            role="customer",
        )
        real_customer = Customer.objects.create(user=real_user, customer_number="REAL-002")

        ClientDemoDataService(count=2).load(["customers", "vehicles", "billing"])
        result = ClientDemoDataService(count=2).purge(["billing"])

        self.assertFalse(any(item["errors"] for item in result["modules"]))
        self.assertEqual(seed_invoices_qs().count(), 0)
        self.assertEqual(seed_customers_qs().count(), 2)
        self.assertTrue(Customer.objects.filter(pk=real_customer.pk).exists())

    def test_sms_logs_are_not_seeded(self):
        ClientDemoDataService(count=2).load()
        self.assertFalse(Notification.objects.filter(channel="sms").exists())
        self.assertFalse(NotificationLog.objects.filter(details__icontains="sms").exists())

    def test_management_command_status_runs(self):
        call_command("seed_client_demo_data", count=2, status=True, verbosity=0)

    def test_status_includes_backend_module_metadata(self):
        result = ClientDemoDataService(count=2).status()
        modules = {item["module"]: item for item in result["modules"]}

        for module in ["accounts", "branches", "documents", "notifications_app", "reporting", "quickbooks_online", "portal"]:
            self.assertIn(module, modules)
            self.assertTrue(modules[module]["label"])
            self.assertIn("installed", modules[module])
            self.assertIn("seedable", modules[module])

    def test_full_load_creates_seedable_module_data(self):
        result = ClientDemoDataService(count=2).load()

        self.assertFalse(any(item["errors"] for item in result["modules"]))
        self.assertEqual(Document.objects.filter(document_number__startswith="DOC-").count(), 2)
        self.assertGreaterEqual(Notification.objects.filter(recipient__in=seed_users_qs()).count(), 2)
        self.assertGreaterEqual(ReportSchedule.objects.filter(parameters__seed=SEED_TAG).count(), 1)
        self.assertGreaterEqual(SavedReport.objects.filter(parameters__seed=SEED_TAG).count(), 1)
        self.assertEqual(QBOConfig.objects.filter(client_id="svr-seed-qbo").count(), 1)
        self.assertEqual(QBOSyncLog.objects.filter(error_message=SEED_MARKER).count(), 1)

    def test_refresh_rebuilds_demo_only_and_preserves_real_data(self):
        real_user = User.objects.create_user(
            username="real_refresh_customer",
            email="real.refresh@example.com",
            password="test123",
            role="customer",
        )
        real_customer = Customer.objects.create(user=real_user, customer_number="REAL-REFRESH")

        ClientDemoDataService(count=3).load(["customers", "vehicles", "workorders", "billing", "documents"])
        result = ClientDemoDataService(count=2).refresh(["customers", "vehicles", "workorders", "billing", "documents"])

        self.assertFalse(any(item["errors"] for item in result["modules"]))
        self.assertEqual(seed_customers_qs().count(), 2)
        self.assertEqual(seed_vehicles_qs().count(), 2)
        self.assertEqual(seed_workorders_qs().count(), 2)
        self.assertEqual(seed_invoices_qs().count(), 2)
        self.assertEqual(Document.objects.filter(document_number__startswith="DOC-").count(), 2)
        self.assertTrue(Customer.objects.filter(pk=real_customer.pk).exists())

    def test_repair_lifecycle_has_dependent_records(self):
        ClientDemoDataService(count=2).refresh()

        self.assertGreaterEqual(ServiceTask.objects.filter(work_order__in=seed_workorders_qs()).count(), 2)
        self.assertGreaterEqual(WorkOrderNote.objects.filter(work_order__in=seed_workorders_qs()).count(), 2)
        self.assertGreaterEqual(WorkOrderPart.objects.filter(work_order__in=seed_workorders_qs()).count(), 2)
        self.assertGreaterEqual(TechnicianTimeLog.objects.filter(work_order__in=seed_workorders_qs()).count(), 2)
        self.assertGreaterEqual(DiagnosisFinding.objects.filter(diagnosis__work_order__in=seed_workorders_qs()).count(), 2)
        self.assertGreaterEqual(RepairRecommendation.objects.filter(diagnosis__work_order__in=seed_workorders_qs()).count(), 2)
        self.assertGreaterEqual(InspectionResult.objects.filter(inspection__vehicle__in=seed_vehicles_qs()).count(), 2)
        self.assertGreaterEqual(Payment.objects.filter(invoice__in=seed_invoices_qs()).count(), 1)
        self.assertGreaterEqual(Attendance.objects.filter(employee__user__in=seed_users_qs().filter(role="technician")).count(), 2)
        self.assertGreaterEqual(EmployeeTraining.objects.filter(employee__user__in=seed_users_qs().filter(role="technician")).count(), 2)

    def test_seed_data_has_no_visible_demo_word(self):
        ClientDemoDataService(count=2).load(["customers", "vehicles", "workorders", "billing", "inventory"])

        for customer in seed_customers_qs():
            self.assertNotIn("demo", (customer.notes or "").lower())
            self.assertTrue(customer.user.email.endswith(f"@{SEED_EMAIL_DOMAIN}"))

        for vehicle in seed_vehicles_qs():
            self.assertNotIn("demo", (vehicle.notes or "").lower())

        for invoice in seed_invoices_qs():
            for field in (invoice.description, invoice.notes):
                self.assertNotIn("demo", (field or "").lower())


class ClientDemoDataAPITests(TestCase):
    def setUp(self):
        call_command("init_permissions", verbosity=0)
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="settings_admin",
            email="settings.admin@example.com",
            password="test123",
            role="admin",
            is_staff=True,
        )
        self.regular = User.objects.create_user(
            username="regular_tech",
            email="regular.tech@example.com",
            password="test123",
            role="technician",
        )

    def test_api_requires_manage_settings(self):
        response = self.client.get("/api/accounts/admin/demo-data/status/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(self.regular)
        response = self.client.get("/api/accounts/admin/demo-data/status/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_load_and_purge_by_module(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            "/api/accounts/admin/demo-data/load/",
            {"count": 2, "modules": ["customers", "vehicles"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(any(item["errors"] for item in response.data["modules"]))
        self.assertEqual(seed_customers_qs().count(), 2)

        response = self.client.post(
            "/api/accounts/admin/demo-data/purge/",
            {"modules": ["vehicles"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(any(item["errors"] for item in response.data["modules"]))
        self.assertEqual(seed_vehicles_qs().count(), 0)

    def test_admin_can_refresh_demo_data(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            "/api/accounts/admin/demo-data/refresh/",
            {"count": 2, "modules": ["customers", "vehicles", "documents"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["action"], "refreshed")
        self.assertFalse(any(item["errors"] for item in response.data["modules"]))
        self.assertEqual(Document.objects.filter(document_number__startswith="DOC-").count(), 2)

    def test_permanent_cleanup_requires_confirmation(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            "/api/accounts/admin/demo-data/purge/",
            {"modules": ["feedback"], "permanent": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
