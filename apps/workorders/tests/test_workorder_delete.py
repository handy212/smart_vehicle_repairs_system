from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.accounts.permission_models import Permission, Role
from apps.billing.models import Invoice
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.gatepass.models import GatePass
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder


class WorkOrderDeleteAPITests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = self._create_user("manager", "manager")
        self.branch = Branch.objects.create(name="Main Branch", code="MAIN", created_by=self.manager)
        self.manager.managed_branches.add(self.branch)

        customer_user = self._create_user("customer", "customer")
        self.customer = Customer.objects.create(user=customer_user, customer_number="CUST-DEL-001")
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            vin="DEL1234567890123",
            year=2020,
            make="Toyota",
            model="Camry",
            license_plate="DEL-001",
            current_mileage=50000,
        )

        delete_perm, _ = Permission.objects.update_or_create(
            code="delete_workorders",
            defaults={"name": "Delete WO", "category": "workorders", "is_active": True},
        )
        view_perm, _ = Permission.objects.update_or_create(
            code="view_workorders",
            defaults={"name": "View WO", "category": "workorders", "is_active": True},
        )
        manager_role, _ = Role.objects.update_or_create(
            code="manager",
            defaults={"name": "Manager", "is_active": True},
        )
        manager_role.permissions.add(delete_perm, view_perm)

        self.client.force_authenticate(user=self.manager)

    def _create_user(self, username, role):
        from apps.accounts.models import User

        return User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="password",
            role=role,
        )

    def test_delete_closed_work_order_returns_user_facing_message(self):
        work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status="closed",
            customer_concerns="Completed brake service",
            odometer_in=50000,
        )
        Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=work_order,
            branch=self.branch,
            status="paid",
            total=Decimal("250.00"),
            created_by=self.manager,
        )
        GatePass.objects.create(
            work_order=work_order,
            branch=self.branch,
            vehicle=self.vehicle,
            customer=self.customer,
            issued_by=self.manager,
            status="completed",
        )

        url = reverse("api_workorders:workorder-detail", args=[work_order.id])
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)
        self.assertIn(work_order.work_order_number, response.data["detail"])
        self.assertIn("invoice", response.data["detail"].lower())
        self.assertIn("gate pass", response.data["detail"].lower())
        self.assertTrue(WorkOrder.objects.filter(pk=work_order.pk).exists())

    def test_delete_draft_work_order_succeeds(self):
        work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status="draft",
            customer_concerns="Oil change",
            odometer_in=50000,
        )

        url = reverse("api_workorders:workorder-detail", args=[work_order.id])
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(WorkOrder.objects.filter(pk=work_order.pk).exists())
