"""Tests for inventory management report endpoints."""
from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.accounting.models import JournalEntry
from apps.branches.models import Branch
from apps.inventory.management_reports import InventoryManagementReports
from apps.inventory.models import Part, PhysicalCountItem, PhysicalCountSession, StockItem


class InventoryManagementReportsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='inv-reports',
            email='inv-reports@example.com',
            password='password',
            role='admin',
            is_staff=True,
            is_superuser=True,
        )
        self.branch = Branch.objects.create(
            name='Main',
            code='MAIN',
            phone='1',
            address='A',
            city='C',
            state='S',
            zip_code='0',
            created_by=self.user,
        )
        SystemModule.objects.get_or_create(
            slug='inventory',
            defaults={'name': 'Inventory', 'is_enabled': True},
        )
        self.client.force_authenticate(self.user)
        self.date_range = {'start_date': '2026-05-01', 'end_date': '2026-05-22'}

    def test_inventory_accuracy_branch_filter_before_slice(self):
        other = Branch.objects.create(
            name='Other',
            code='OTHR',
            phone='1',
            address='B',
            city='C',
            state='S',
            zip_code='0',
            created_by=self.user,
        )
        PhysicalCountSession.objects.create(
            branch=self.branch,
            status='completed',
            count_date=date.today(),
            created_by=self.user,
        )
        PhysicalCountSession.objects.create(
            branch=other,
            status='completed',
            count_date=date.today(),
            created_by=self.user,
        )
        report = InventoryManagementReports.get_inventory_accuracy(branch_id=self.branch.id)
        self.assertIn('meta', report)
        session_ids = {line['session_id'] for line in report['lines']}
        for sid in session_ids:
            self.assertEqual(
                PhysicalCountSession.objects.get(pk=sid).branch_id,
                self.branch.id,
            )

    def test_all_compliance_report_endpoints_return_200(self):
        endpoints = [
            ('/api/inventory/reports/availability-top-100/', {}),
            ('/api/inventory/reports/inventory-accuracy/', {}),
            ('/api/inventory/reports/shrinkage/', self.date_range),
            ('/api/inventory/reports/obsolescence/', {'days_unused': 180}),
            ('/api/inventory/reports/p2p-compliance/', self.date_range),
            ('/api/inventory/reports/orphan-supply/', self.date_range),
            ('/api/inventory/reports/unbilled-delivered/', self.date_range),
            ('/api/inventory/reports/inventory-control/', self.date_range),
        ]
        for path, params in endpoints:
            with self.subTest(path=path):
                response = self.client.get(path, params)
                self.assertEqual(response.status_code, 200, response.content[:200])

    def test_physical_count_reconcile_posts_gl_correction(self):
        from apps.inventory.models import PartCategory

        category = PartCategory.objects.create(name='Test Cat')
        part = Part.objects.create(
            name='Filter',
            part_number='FLT-001',
            category=category,
            branch=self.branch,
            cost_price=Decimal('10.00'),
            selling_price=Decimal('15.00'),
            created_by=self.user,
        )
        stock = StockItem.objects.create(
            part=part,
            branch=self.branch,
            quantity_in_stock=10,
        )
        session = PhysicalCountSession.objects.create(
            branch=self.branch,
            status='completed',
            count_date=date.today(),
            created_by=self.user,
        )
        item = PhysicalCountItem.objects.create(
            session=session,
            part=part,
            stock_item=stock,
            system_quantity=Decimal('10'),
            physical_quantity=Decimal('8'),
        )
        item.reconcile(self.user, create_adjustment=True)

        self.assertTrue(
            JournalEntry.objects.filter(reference__startswith='INVADJ-').exists()
        )
