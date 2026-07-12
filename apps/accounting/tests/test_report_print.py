"""Tests for accounting report HTML print and PDF export."""
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.branches.models import Branch


@override_settings(SKIP_MODULE_PERMISSION_CHECKS=True)
class AccountingReportPrintAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='print_reports',
            email='print@example.com',
            password='password',
            role='admin',
        )
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        self.client.force_authenticate(user=self.user)
        self.branch = Branch.objects.create(
            name='Print Branch',
            code='PRTB',
            phone='555-0099',
            address='9 Print St',
            city='City',
            region='ST',
            zip_code='00099',
            created_by=self.user,
        )

    def test_print_balance_sheet_returns_html(self):
        today = timezone.now().date().isoformat()
        response = self.client.get(
            f'/api/accounting/reports/balance-sheet/print/?date={today}'
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/html', response['Content-Type'])
        self.assertIn(b'Balance Sheet', response.content)
        self.assertIn(b'Assets', response.content)

    def test_print_unknown_slug_returns_404(self):
        response = self.client.get('/api/accounting/reports/not-a-report/print/')
        self.assertEqual(response.status_code, 404)

    def test_print_requires_authentication(self):
        client = APIClient()
        response = client.get('/api/accounting/reports/balance-sheet/print/')
        self.assertIn(response.status_code, (401, 403))

    def test_pdf_balance_sheet_returns_pdf(self):
        today = timezone.now().date().isoformat()
        response = self.client.get(
            f'/api/accounting/reports/balance-sheet/pdf/?date={today}'
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('application/pdf', response['Content-Type'])
        self.assertTrue(response.content[:4] == b'%PDF' or len(response.content) > 100)

    def test_print_trial_balance_with_date(self):
        today = timezone.now().date().isoformat()
        response = self.client.get(
            f'/api/accounting/reports/trial-balance/print/?date={today}'
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'Trial Balance', response.content)

    def test_print_management_tab(self):
        today = timezone.now().date()
        start = today.replace(day=1).isoformat()
        end = today.isoformat()
        response = self.client.get(
            f'/api/accounting/reports/management/print/?start_date={start}&end_date={end}&tab=scorecard'
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'Management', response.content)
