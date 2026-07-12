"""Tests for QBO-style inventory operational reports."""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.branches.models import Branch
from apps.inventory.models import Part, PartCategory, PurchaseOrder, PurchaseOrderItem, StockItem, Supplier
from apps.inventory.qbo_style_reports import QboStyleInventoryReports


class QboStyleInventoryReportsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="qbo-inv-reports",
            email="qbo-inv-reports@example.com",
            password="password",
            role="admin",
            is_staff=True,
            is_superuser=True,
        )
        self.branch = Branch.objects.create(
            name="Main",
            code="MAIN",
            phone="1",
            address="A",
            city="C",
            region="S",
            zip_code="0",
            created_by=self.user,
        )
        SystemModule.objects.get_or_create(
            slug="inventory",
            defaults={"name": "Inventory", "is_enabled": True},
        )
        self.client.force_authenticate(self.user)
        self.client.defaults["HTTP_X_BRANCH_ID"] = str(self.branch.id)

        category = PartCategory.objects.create(name="Filters")
        self.supplier = Supplier.objects.create(
            name="Parts Co",
            supplier_code="PC1",
            created_by=self.user,
        )
        self.part = Part.objects.create(
            name="Oil Filter",
            part_number="OF-100",
            category=category,
            cost_price=Decimal("12.50"),
            selling_price=Decimal("25.00"),
            item_type="inventory",
            preferred_supplier=self.supplier,
            description="Spin-on oil filter",
            created_by=self.user,
        )
        StockItem.objects.create(
            part=self.part,
            branch=self.branch,
            quantity_in_stock=4,
            bin_location="A-1",
        )
        self.po = PurchaseOrder.objects.create(
            supplier=self.supplier,
            branch=self.branch,
            status="approved",
            created_by=self.user,
            subtotal=Decimal("50.00"),
            total=Decimal("50.00"),
            notes="Rush order",
        )
        PurchaseOrderItem.objects.create(
            purchase_order=self.po,
            part=self.part,
            quantity=Decimal("10"),
            quantity_received=Decimal("2"),
            unit_cost=Decimal("12.50"),
        )

    def test_valuation_detail_and_summary(self):
        detail = QboStyleInventoryReports.inventory_valuation_detail(branch_id=self.branch.id)
        self.assertEqual(detail["summary"]["group_count"], 1)
        group = detail["groups"][0]
        self.assertEqual(group["product_service"], "Oil Filter")
        self.assertEqual(group["lines"][0]["transaction_type"], "Inventory Starting Value")
        self.assertEqual(group["lines"][0]["number"], "START")
        self.assertEqual(group["lines"][0]["qty"], 4.0)
        self.assertEqual(group["lines"][0]["asset_value"], 50.0)

        summary = QboStyleInventoryReports.inventory_valuation_summary(branch_id=self.branch.id)
        self.assertEqual(summary["rows"][0]["sku"], "OF-100")
        self.assertEqual(summary["rows"][0]["qty"], 4.0)
        self.assertEqual(summary["rows"][0]["asset_value"], 50.0)
        self.assertEqual(summary["rows"][0]["calc_avg"], 12.5)

    def test_open_po_list_and_detail(self):
        listing = QboStyleInventoryReports.open_purchase_order_list(branch_id=self.branch.id)
        self.assertEqual(listing["summary"]["po_count"], 1)
        group = listing["groups"][0]
        self.assertEqual(group["supplier_display_name"], "Parts Co")
        self.assertEqual(group["rows"][0]["number"], self.po.po_number)
        self.assertEqual(group["rows"][0]["open_balance"], 100.0)
        self.assertEqual(group["rows"][0]["memo"], "Rush order")

        detail = QboStyleInventoryReports.open_purchase_order_detail(branch_id=self.branch.id)
        self.assertEqual(detail["summary"]["line_count"], 1)
        line = detail["lines"][0]
        self.assertEqual(line["supplier_display_name"], "Parts Co")
        self.assertEqual(line["quantity"], 10.0)
        self.assertEqual(line["billed_quantity"], 2.0)
        self.assertEqual(line["backordered_quantity"], 8.0)
        self.assertEqual(line["po_open_balance"], 100.0)
        self.assertEqual(line["account_name"], "Inventory Asset")

    def test_stock_take_worksheet(self):
        sheet = QboStyleInventoryReports.stock_take_worksheet(branch_id=self.branch.id)
        self.assertEqual(sheet["summary"]["line_count"], 1)
        line = sheet["lines"][0]
        self.assertEqual(line["product_service"], "Oil Filter")
        self.assertEqual(line["memo_description"], "Spin-on oil filter")
        self.assertEqual(line["category"], "Filters")
        self.assertEqual(line["preferred_supplier_name"], "Parts Co")
        self.assertEqual(line["quantity_on_hand"], 4.0)
        self.assertIsNone(line["physical_count"])

    def test_api_endpoints_return_200(self):
        endpoints = [
            "/api/inventory/reports/valuation-detail/",
            "/api/inventory/reports/valuation-summary/",
            "/api/inventory/reports/open-purchase-orders/",
            "/api/inventory/reports/open-purchase-order-detail/",
            "/api/inventory/reports/stock-take-worksheet/",
        ]
        for url in endpoints:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200, url)
            self.assertIn("summary", response.data)

    def test_from_stock_take_creates_seeded_session(self):
        response = self.client.post(
            "/api/inventory/physical-counts/from-stock-take/",
            {
                "branch": self.branch.id,
                "include_zero": False,
                "start": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["status"], "in_progress")
        self.assertEqual(response.data["total_items_counted"], 1)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["system_quantity"], 4)
        self.assertEqual(response.data["items"][0]["physical_quantity"], 4)
