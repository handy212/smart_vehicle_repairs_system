from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APIClient

from django.test import TestCase, override_settings

from apps.accounting.management_reports import (
    ManagementReportingService,
    compute_expected_payment_date,
)
from apps.accounting.models import Account, Budget, BudgetLine
from apps.accounting.services import AccountingService
from apps.accounts.models import User
from apps.billing.models import Bill
from apps.branches.models import Branch
from apps.inventory.models import Supplier


class ManagementReportsServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='mgmt_reports',
            email='mgmt@example.com',
            password='password',
            role='admin',
        )
        self.branch = Branch.objects.create(
            name='Main',
            code='MAIN',
            phone='555-0001',
            address='1 Main St',
            city='City',
            region='ST',
            zip_code='00001',
            created_by=self.user,
        )
        self.income = AccountingService.get_or_create_account('4000', 'Revenue', 'income', 'credit')
        self.expense = AccountingService.get_or_create_account('5400', 'Rent', 'expense', 'debit')

    def test_compute_expected_payment_date_net_30(self):
        bill_date = timezone.now().date()
        expected = compute_expected_payment_date(bill_date, 'Net 30')
        self.assertEqual((expected - bill_date).days, 30)

    def test_branch_pl_scorecard_returns_ranked_rows(self):
        report = ManagementReportingService.get_branch_pl_scorecard(
            timezone.now().date().replace(day=1),
            timezone.now().date(),
        )
        self.assertIn('branches', report)
        self.assertTrue(len(report['branches']) >= 1)
        if report['branches']:
            self.assertEqual(report['branches'][0]['rank'], 1)

    def test_consolidated_profit_loss_structure(self):
        today = timezone.now().date()
        report = ManagementReportingService.get_consolidated_profit_loss(
            today.replace(day=1), today
        )
        self.assertIn('consolidated', report)
        self.assertIn('branches', report)


@override_settings(SKIP_MODULE_PERMISSION_CHECKS=True)
class ManagementReportsAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='mgmt_api',
            email='mgmtapi@example.com',
            password='password',
            role='admin',
        )
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        self.client.force_authenticate(user=self.user)
        self.branch = Branch.objects.create(
            name='API Branch',
            code='APIB',
            phone='555-0002',
            address='2 API St',
            city='City',
            region='ST',
            zip_code='00002',
            created_by=self.user,
        )
        self.supplier = Supplier.objects.create(
            name='Parts Co',
            supplier_code='SUP001',
            payment_terms='Net 30',
            created_by=self.user,
        )

    def test_profit_loss_comparative_endpoint(self):
        today = timezone.now().date()
        start = today.replace(day=1)
        response = self.client.get(
            '/api/accounting/reports/profit-loss-comparative/',
            {'start_date': start.isoformat(), 'end_date': today.isoformat(), 'comparison': 'mom'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('variance', response.data)

    def test_supplier_ap_aging_endpoint(self):
        response = self.client.get('/api/accounting/reports/supplier-ap-aging/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('suppliers', response.data)
        self.assertIn('summary', response.data)

    def test_cash_collection_endpoint(self):
        today = timezone.now().date()
        response = self.client.get(
            '/api/accounting/reports/cash-collection/',
            {'start_date': today.replace(day=1).isoformat(), 'end_date': today.isoformat()},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('segments', response.data)

    def test_revenue_mix_endpoint(self):
        today = timezone.now().date()
        response = self.client.get(
            '/api/accounting/reports/revenue-mix/',
            {'start_date': today.replace(day=1).isoformat(), 'end_date': today.isoformat()},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('by_product', response.data)

    def test_cost_control_endpoint(self):
        today = timezone.now().date()
        response = self.client.get(
            '/api/accounting/reports/cost-control/',
            {'start_date': today.replace(day=1).isoformat(), 'end_date': today.isoformat()},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('expense_breakdown', response.data)
        self.assertIn('return_jobs', response.data)

    def test_consolidated_profit_loss_endpoint(self):
        today = timezone.now().date()
        response = self.client.get(
            '/api/accounting/reports/consolidated-profit-loss/',
            {'start_date': today.replace(day=1).isoformat(), 'end_date': today.isoformat()},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('consolidated', response.data)

    def test_management_dashboard_returns_200(self):
        today = timezone.now().date()
        response = self.client.get(
            '/api/accounting/reports/management-dashboard/',
            {'start_date': today.replace(day=1).isoformat(), 'end_date': today.isoformat()},
            HTTP_X_BRANCH_ID=str(self.branch.id),
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('kpis', response.data)

    def test_command_center_dashboard_returns_expected_sections(self):
        today = timezone.now().date()
        response = self.client.get(
            '/api/accounting/dashboard/command-center/',
            {'start_date': today.replace(day=1).isoformat(), 'end_date': today.isoformat()},
            HTTP_X_BRANCH_ID=str(self.branch.id),
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('financial_position', response.data)
        self.assertIn('revenue_analytics', response.data)
        self.assertIn('expense_analytics', response.data)
        self.assertIn('receivables', response.data)
        self.assertIn('payables', response.data)
        self.assertIn('cash_bank', response.data)
        self.assertIn('till_management', response.data)
        self.assertIn('tax', response.data)
        self.assertIn('statements', response.data)
        self.assertIn('alerts', response.data)
        self.assertIn('monitoring', response.data)
        self.assertTrue(any(group['id'] == 'critical' for group in response.data['monitoring']))
        self.assertTrue(any(group['id'] == 'warning' for group in response.data['monitoring']))
        self.assertTrue(any(group['id'] == 'information' for group in response.data['monitoring']))
        self.assertIn('open_tills', response.data['till_management']['totals'])
        self.assertIn('closed_tills_today', response.data['till_management']['totals'])
        self.assertIn('pending_closures', response.data['till_management']['totals'])

    def test_analytics_dashboard_invalid_date_returns_400(self):
        response = self.client.get(
            '/api/accounting/analytics/dashboard/',
            {'start_date': 'not-a-date'},
        )
        self.assertEqual(response.status_code, 400)

    def test_budgets_list_returns_200(self):
        Budget.objects.create(
            name='FY Test',
            fiscal_year=2026,
            start_date=timezone.now().date().replace(month=1, day=1),
            end_date=timezone.now().date().replace(month=12, day=31),
            branch=self.branch,
            created_by=self.user,
        )
        response = self.client.get(
            '/api/accounting/budgets/',
            HTTP_X_BRANCH_ID=str(self.branch.id),
        )
        self.assertEqual(response.status_code, 200)
