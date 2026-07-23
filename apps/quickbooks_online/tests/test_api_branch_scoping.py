"""Branch scoping tests for QuickBooks manual API actions."""
from contextlib import ExitStack

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from rest_framework import status
from rest_framework.test import APIClient, APITestCase
from unittest.mock import patch

from apps.accounts.admin_models import SystemModule
from apps.accounts.permission_models import Permission, Role
from apps.billing.models import Invoice
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.quickbooks_online.models import QBOMapping


User = get_user_model()


class QBOManualApiBranchScopingTests(APITestCase):
    def setUp(self):
        SystemModule.objects.update_or_create(
            slug='billing',
            defaults={'name': 'Billing', 'is_enabled': True},
        )
        view_billing, _ = Permission.objects.update_or_create(
            code='view_billing',
            defaults={'name': 'View Billing', 'category': 'billing', 'is_active': True},
        )
        manager_role, _ = Role.objects.update_or_create(
            code='manager',
            defaults={'name': 'Manager', 'is_active': True},
        )
        manager_role.permissions.set([view_billing])

        self.admin = User.objects.create_user(
            username='qbo-branch-admin',
            email='qbo-branch-admin@test.example.com',
            password='password123',
            role='admin',
        )
        self.branch_a = Branch.objects.create(
            name='QBO Branch A',
            code='QBOA',
            is_active=True,
            created_by=self.admin,
        )
        self.branch_b = Branch.objects.create(
            name='QBO Branch B',
            code='QBOB',
            is_active=True,
            created_by=self.admin,
        )
        self.manager = User.objects.create_user(
            username='qbo-branch-manager',
            email='qbo-branch-manager@test.example.com',
            password='password123',
            role='manager',
            is_staff=True,
        )
        self.manager.managed_branches.add(self.branch_a)

        customer_user = User.objects.create_user(
            username='qbo-customer',
            email='qbo-customer@test.example.com',
            password='password123',
            role='customer',
        )
        self.customer = Customer.objects.create(
            user=customer_user,
            customer_number='C-QBO-API',
        )
        self.invoice_a = Invoice.objects.create(
            branch=self.branch_a,
            customer=self.customer,
            status='sent',
            created_by=self.admin,
        )
        self.invoice_b = Invoice.objects.create(
            branch=self.branch_b,
            customer=self.customer,
            status='sent',
            created_by=self.admin,
        )

        self.client = APIClient()
        self.client.force_authenticate(self.manager)

    def _qbo_available(self):
        stack = ExitStack()
        stack.enter_context(patch('apps.quickbooks_online.services.QuickBooksService.is_connected', return_value=True))
        stack.enter_context(patch('apps.quickbooks_online.services.QuickBooksService.sdk_available', return_value=True))
        stack.enter_context(patch('apps.quickbooks_online.services.QuickBooksService.get_client', return_value=object()))
        return stack

    def test_sync_outbound_rejects_invoice_outside_user_branches(self):
        with self._qbo_available(), patch(
            'apps.quickbooks_online.api_views.outbound_eligibility_reason',
            return_value=(True, ''),
        ), patch('apps.quickbooks_online.task_dispatch.schedule_entity_sync') as mock_schedule:
            response = self.client.post(
                '/api/quickbooks/sync-outbound/',
                {'entity_type': 'invoice', 'object_id': self.invoice_b.id},
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        mock_schedule.assert_not_called()

    def test_sync_outbound_allows_invoice_inside_user_branches(self):
        with self._qbo_available(), patch(
            'apps.quickbooks_online.api_views.outbound_eligibility_reason',
            return_value=(True, ''),
        ), patch('apps.quickbooks_online.task_dispatch.schedule_entity_sync') as mock_schedule:
            response = self.client.post(
                '/api/quickbooks/sync-outbound/',
                {'entity_type': 'invoice', 'object_id': self.invoice_a.id},
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_schedule.assert_called_once()

    def test_mapping_clear_rejects_invoice_outside_user_branches(self):
        QBOMapping.objects.create(
            content_type=ContentType.objects.get_for_model(self.invoice_b),
            object_id=self.invoice_b.id,
            qbo_id='qbo-branch-b',
            status='synced',
        )

        with self._qbo_available(), patch(
            'apps.quickbooks_online.services.QuickBooksService.clear_qbo_mapping',
            return_value=True,
        ) as mock_clear:
            response = self.client.post(
                '/api/quickbooks/mappings/clear/',
                {'entity_type': 'invoice', 'object_id': self.invoice_b.id, 'delete': True},
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        mock_clear.assert_not_called()
        self.assertTrue(
            QBOMapping.objects.filter(
                content_type=ContentType.objects.get_for_model(self.invoice_b),
                object_id=self.invoice_b.id,
                qbo_id='qbo-branch-b',
            ).exists()
        )
