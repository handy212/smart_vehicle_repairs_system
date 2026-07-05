"""Tests for Phase 3 operations reporting endpoints."""
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.branches.models import Branch


class OperationsReportingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='ops-reports',
            email='ops-reports@example.com',
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
            slug='reports',
            defaults={'name': 'Reports', 'is_enabled': True},
        )
        self.client.force_authenticate(self.user)

    def test_capacity_planning_returns_200(self):
        response = self.client.get(
            '/api/reporting/capacity-planning/',
            {'start_date': '2026-05-01', 'end_date': '2026-05-22'},
        )
        self.assertEqual(response.status_code, 200)

    def test_exception_log_returns_200(self):
        response = self.client.get('/api/reporting/exception-log/')
        self.assertEqual(response.status_code, 200)

    def test_revenue_report_returns_200(self):
        response = self.client.get(
            '/api/reporting/revenue-report/',
            {'start_date': '2026-05-01', 'end_date': '2026-05-22'},
        )
        self.assertEqual(response.status_code, 200)

    def test_catalog_includes_dashboard_overview(self):
        response = self.client.get('/api/reporting/catalog/')
        self.assertEqual(response.status_code, 200)
        keys = {item['key'] for item in response.data['reports']}
        self.assertIn('dashboard_overview', keys)
        self.assertIn('ap_cycle_time', keys)


class OperationsAIEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='ops-ai',
            email='ops-ai@example.com',
            password='password',
            role='admin',
            is_staff=True,
            is_superuser=True,
        )
        SystemModule.objects.get_or_create(
            slug='reports',
            defaults={'name': 'Reports', 'is_enabled': True},
        )
        self.client.force_authenticate(self.user)

    def test_daily_briefing_returns_503_without_gemini(self):
        response = self.client.post(
            '/api/reporting/operations/daily-briefing/',
            {'start_date': '2026-05-01', 'end_date': '2026-05-22'},
            format='json',
        )
        self.assertEqual(response.status_code, 503)

    def test_triage_exceptions_returns_503_without_gemini(self):
        response = self.client.post('/api/reporting/operations/triage-exceptions/')
        self.assertEqual(response.status_code, 503)

    def test_traceability_qa_requires_question(self):
        with self.settings(GEMINI_API_KEY='test-key'):
            response = self.client.post(
                '/api/reporting/operations/traceability-qa/',
                {'work_order_id': 1},
                format='json',
            )
        self.assertEqual(response.status_code, 400)
