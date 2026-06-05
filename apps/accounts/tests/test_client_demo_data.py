from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.client_demo_data import ClientDemoDataService, DEMO_MARKER
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
        self.assertEqual(Customer.objects.filter(user__email__startswith="client.demo.customer").count(), 2)
        self.assertEqual(Vehicle.objects.filter(notes__contains=DEMO_MARKER).count(), 2)
        self.assertEqual(Invoice.objects.filter(description__contains=DEMO_MARKER).count(), 2)
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
        self.assertEqual(Invoice.objects.filter(description__contains=DEMO_MARKER).count(), 0)
        self.assertEqual(Customer.objects.filter(user__email__startswith="client.demo.customer").count(), 2)
        self.assertTrue(Customer.objects.filter(pk=real_customer.pk).exists())

    def test_sms_logs_are_not_seeded(self):
        ClientDemoDataService(count=2).load()
        self.assertFalse(Notification.objects.filter(channel="sms", message__contains=DEMO_MARKER).exists())
        self.assertFalse(NotificationLog.objects.filter(details__icontains="sms", details__contains=DEMO_MARKER).exists())

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
        self.assertEqual(Document.objects.filter(document_number__startswith="CDDOC").count(), 2)
        self.assertEqual(Notification.objects.filter(message__contains=DEMO_MARKER).count(), 2)
        self.assertGreaterEqual(ReportSchedule.objects.filter(parameters__marker=DEMO_MARKER).count(), 1)
        self.assertGreaterEqual(SavedReport.objects.filter(parameters__marker=DEMO_MARKER).count(), 1)
        self.assertEqual(QBOConfig.objects.filter(client_id="client-demo-qbo").count(), 1)
        self.assertEqual(QBOSyncLog.objects.filter(error_message=DEMO_MARKER).count(), 1)

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
        self.assertEqual(Customer.objects.filter(user__email__startswith="client.demo.customer").count(), 2)
        self.assertEqual(Vehicle.objects.filter(notes__contains=DEMO_MARKER).count(), 2)
        self.assertEqual(WorkOrder.objects.filter(customer_concerns__contains=DEMO_MARKER).count(), 2)
        self.assertEqual(Invoice.objects.filter(description__contains=DEMO_MARKER).count(), 2)
        self.assertEqual(Document.objects.filter(document_number__startswith="CDDOC").count(), 2)
        self.assertTrue(Customer.objects.filter(pk=real_customer.pk).exists())

    def test_repair_lifecycle_has_dependent_records(self):
        ClientDemoDataService(count=2).refresh()

        self.assertGreaterEqual(ServiceTask.objects.filter(description__contains=DEMO_MARKER).count(), 2)
        self.assertGreaterEqual(WorkOrderNote.objects.filter(note__contains=DEMO_MARKER).count(), 2)
        self.assertGreaterEqual(WorkOrderPart.objects.filter(description__contains=DEMO_MARKER).count(), 2)
        self.assertGreaterEqual(TechnicianTimeLog.objects.filter(description__contains=DEMO_MARKER).count(), 2)
        self.assertGreaterEqual(DiagnosisFinding.objects.filter(description__contains=DEMO_MARKER).count(), 2)
        self.assertGreaterEqual(RepairRecommendation.objects.filter(description__contains=DEMO_MARKER).count(), 2)
        self.assertGreaterEqual(InspectionResult.objects.filter(notes__contains=DEMO_MARKER).count(), 2)
        self.assertGreaterEqual(Payment.objects.filter(notes=DEMO_MARKER).count(), 1)
        self.assertGreaterEqual(Attendance.objects.filter(notes__contains=DEMO_MARKER).count(), 2)
        self.assertGreaterEqual(EmployeeTraining.objects.filter(notes__contains=DEMO_MARKER).count(), 2)


class ClientDemoDataAPITests(TestCase):
    def setUp(self):
        call_command("init_permissions", verbosity=0)
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="demo_admin",
            email="demo.admin@example.com",
            password="test123",
            role="admin",
            is_staff=True,
        )
        self.regular = User.objects.create_user(
            username="demo_regular",
            email="demo.regular@example.com",
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
        self.assertEqual(Customer.objects.filter(user__email__startswith="client.demo.customer").count(), 2)

        response = self.client.post(
            "/api/accounts/admin/demo-data/purge/",
            {"modules": ["vehicles"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(any(item["errors"] for item in response.data["modules"]))
        self.assertEqual(Vehicle.objects.filter(notes__contains=DEMO_MARKER).count(), 0)

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
        self.assertEqual(Document.objects.filter(document_number__startswith="CDDOC").count(), 2)

    def test_permanent_cleanup_requires_confirmation(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            "/api/accounts/admin/demo-data/purge/",
            {"modules": ["feedback"], "permanent": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
