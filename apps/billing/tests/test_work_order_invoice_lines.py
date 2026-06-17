"""Invoice line items and COGS integration for work-order billing."""
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.billing.models import Invoice
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inventory.models import Part, PartCategory
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder, WorkOrderPart


class WorkOrderInvoiceLineItemsTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username="wo_inv_lines_mgr",
            email="wo_inv_lines_mgr@example.com",
            password="password",
            role="manager",
        )
        self.branch = Branch.objects.create(name="Main", code="WOINV", created_by=self.manager)
        self.manager.managed_branches.add(self.branch)

        self.customer_user = User.objects.create_user(
            username="wo_inv_cust",
            email="wo_inv_cust@example.com",
            password="password",
            role="customer",
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            customer_number="CUST-WO-INV-001",
            customer_type="individual",
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            vin="1HGBH41JXMN109187",
            year=2020,
            make="Toyota",
            model="Corolla",
            license_plate="WO-INV-1",
            current_mileage=50000,
        )
        category = PartCategory.objects.create(name="Brakes", code="BRK")
        self.catalog_part = Part.objects.create(
            name="Brake Pad",
            part_number="BP-WO-1",
            category=category,
            cost_price=Decimal("20.00"),
            selling_price=Decimal("35.00"),
            quantity_in_stock=Decimal("10"),
        )
        self.work_order = WorkOrder.objects.create(
            work_order_number="WO-INV-LINES",
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status="completed",
            customer_concerns="Brake noise",
            created_by=self.manager,
            actual_parts_cost=Decimal("35.00"),
        )
        WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name="Brake Pad",
            part_number="BP-WO-1",
            inventory_part=self.catalog_part,
            quantity=Decimal("1"),
            selling_price=Decimal("35.00"),
            status="installed",
        )

    def test_populate_line_items_uses_installed_parts_with_inventory_link(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=self.work_order,
            branch=self.branch,
            status="draft",
            created_by=self.manager,
            invoice_date=timezone.now().date(),
        )
        invoice.populate_line_items_from_work_order()

        part_lines = [line for line in invoice.line_items.all() if line.item_type == "part"]
        self.assertEqual(len(part_lines), 1)
        self.assertEqual(part_lines[0].part_id, self.catalog_part.id)
        self.assertIn("installed", part_lines[0].description.lower())

    def test_can_transition_to_closed_uses_primary_invoice_after_void_revision(self):
        from apps.billing.work_order_invoices import get_primary_invoice

        Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=self.work_order,
            branch=self.branch,
            status="void",
            subtotal=Decimal("10.00"),
            total=Decimal("10.00"),
            created_by=self.manager,
            invoice_date=timezone.now().date(),
        )
        active_invoice = Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=self.work_order,
            branch=self.branch,
            status="sent",
            subtotal=Decimal("35.00"),
            total=Decimal("35.00"),
            created_by=self.manager,
            invoice_date=timezone.now().date(),
        )

        self.assertEqual(get_primary_invoice(self.work_order).id, active_invoice.id)

        can_close, error = self.work_order.can_transition_to("closed")
        self.assertTrue(can_close, error)
