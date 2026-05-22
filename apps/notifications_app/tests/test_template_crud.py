"""
CRUD tests for NotificationTemplate API (email templates admin).
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.permission_models import Permission, Role
from apps.notifications_app.models import NotificationTemplate

User = get_user_model()


class NotificationTemplateCRUDTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        manage_perm = Permission.objects.create(
            code='manage_notification_templates',
            name='Manage Templates',
            category='notifications',
        )
        view_perm = Permission.objects.create(
            code='view_notifications',
            name='View Notifications',
            category='notifications',
        )
        admin_role = Role.objects.create(code='template_admin', name='Template Admin', is_active=True)
        admin_role.permissions.add(manage_perm, view_perm)

        self.user = User.objects.create_user(
            username='template_admin',
            email='admin@test.com',
            password='testpass123',
            role='template_admin',
        )
        self.client.force_authenticate(user=self.user)
        self.base_url = '/api/notifications/templates/'

        self.template = NotificationTemplate.objects.create(
            name='Test Invoice Email',
            template_type='invoice_generated',
            channel='email',
            subject='Invoice {invoice_number}',
            body='Amount: {total_display}',
            html_body='<p>{total_display}</p>',
            created_by=self.user,
        )

    def test_list_email_templates(self):
        response = self.client.get(self.base_url, {'channel': 'email'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        self.assertTrue(any(t['id'] == self.template.id for t in results))

    def test_retrieve_template(self):
        response = self.client.get(f'{self.base_url}{self.template.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Test Invoice Email')

    def test_create_template(self):
        payload = {
            'name': 'Custom Test Template',
            'template_type': 'custom',
            'channel': 'email',
            'subject': 'Hello {customer_name}',
            'body': 'Welcome {customer_name}',
            'html_body': '<p>Welcome</p>',
            'is_active': True,
        }
        response = self.client.post(self.base_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['created_by'], self.user.id)
        self.assertTrue(
            NotificationTemplate.objects.filter(name='Custom Test Template').exists()
        )

    def test_partial_update_template(self):
        response = self.client.patch(
            f'{self.base_url}{self.template.id}/',
            {'subject': 'Updated {invoice_number}', 'is_active': False},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.template.refresh_from_db()
        self.assertEqual(self.template.subject, 'Updated {invoice_number}')
        self.assertFalse(self.template.is_active)

    def test_delete_template(self):
        tid = self.template.id
        response = self.client.delete(f'{self.base_url}{tid}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(NotificationTemplate.objects.filter(pk=tid).exists())

    def test_preview_template(self):
        response = self.client.post(f'{self.base_url}{self.template.id}/preview/', {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('subject', response.data)
        self.assertIn('body', response.data)
        self.assertIn('total_display', response.data.get('context', {}))
        self.assertEqual(response.data.get('unresolved_variables'), [])

    def test_variable_hints_endpoint(self):
        response = self.client.get(
            f'{self.base_url}variable_hints/',
            {'template_type': 'invoice_generated'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('{total_display}', response.data['variables'])
        self.assertIn('{invoice_link}', response.data['variables'])

    def test_preview_resolves_money_variables(self):
        self.template.body = 'Due: {total_display}, raw: {total}'
        self.template.save()
        response = self.client.post(f'{self.base_url}{self.template.id}/preview/', {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('{total_display}', response.data['body'])
        self.assertNotIn('{total}', response.data['body'])

    def test_preview_flags_unknown_variables(self):
        self.template.body = 'Hello {unknown_field_xyz}'
        self.template.save()
        response = self.client.post(f'{self.base_url}{self.template.id}/preview/', {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('unknown_field_xyz', response.data['unresolved_variables'])

    def test_create_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(self.base_url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
