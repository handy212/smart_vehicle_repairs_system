"""Additional reporting API coverage."""
from datetime import date, timedelta

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.branches.models import Branch
from apps.reporting.models import SavedReport


class ReportingCatalogAndTraceabilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='reports-staff',
            email='reports-staff@example.com',
            password='password',
            role='admin',
            is_staff=True,
            is_superuser=True,
        )
        self.branch = Branch.objects.create(
            name='Report Branch',
            code='RPT',
            phone='1234567890',
            address='Main Street',
            city='Accra',
            region='Greater Accra',
            zip_code='00000',
            created_by=self.user,
        )
        self.user.branch = self.branch
        self.user.save(update_fields=['branch'])
        SystemModule.objects.get_or_create(
            slug='reports',
            defaults={'name': 'Reports', 'is_enabled': True},
        )
        self.client.force_authenticate(self.user)

    def test_traceability_requires_params(self):
        response = self.client.get('/api/reporting/traceability/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', response.data)

    def test_revenue_report_rejects_invalid_period(self):
        today = date.today()
        response = self.client.get('/api/reporting/revenue-report/', {
            'start_date': (today - timedelta(days=7)).isoformat(),
            'end_date': today.isoformat(),
            'period': 'yearly',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_catalog_lists_report_keys(self):
        response = self.client.get('/api/reporting/catalog/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('reports', response.data)
        self.assertGreater(len(response.data['reports']), 0)

    def test_saved_report_update_denied_for_non_owner(self):
        from django.core.management import call_command

        call_command('init_permissions', verbosity=0)
        owner = User.objects.create_user(
            username='report-owner',
            email='report-owner@example.com',
            password='password',
            role='admin',
            is_staff=True,
        )
        receptionist = User.objects.create_user(
            username='report-other',
            email='report-other@example.com',
            password='password',
            role='receptionist',
            is_staff=True,
            branch=self.branch,
        )
        saved = SavedReport.objects.create(
            name='Owner report',
            report_type='revenue',
            parameters={'period': 'monthly'},
            created_by=owner,
            is_public=True,
        )
        self.client.force_authenticate(receptionist)
        response = self.client.patch(
            f'/api/reporting/saved-reports/{saved.id}/',
            {'name': 'Hijacked'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_dashboard_overview_returns_core_sections(self):
        response = self.client.get('/api/reporting/dashboard-overview/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for key in ('today', 'week', 'month', 'alerts', 'recent_activity'):
            self.assertIn(key, response.data)
