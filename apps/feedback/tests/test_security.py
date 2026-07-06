from django.test import TestCase, override_settings
from rest_framework.test import APIClient


@override_settings(
    REST_FRAMEWORK={
        'DEFAULT_AUTHENTICATION_CLASSES': [],
        'DEFAULT_PERMISSION_CLASSES': [],
        'DEFAULT_THROTTLE_CLASSES': [],
        'DEFAULT_THROTTLE_RATES': {},
    }
)
class FeedbackAnonymousSecurityTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_anonymous_cannot_set_status_or_internal_notes(self):
        response = self.client.post(
            '/api/feedback/',
            {
                'message': 'Security audit probe',
                'category': 'suggestion',
                'status': 'resolved',
                'internal_notes': 'INJECTED',
            },
            format='json',
        )
        self.assertIn(response.status_code, (201, 400, 503))
        if response.status_code == 201:
            data = response.json()
            self.assertEqual(data.get('status'), 'new')
            self.assertEqual(data.get('internal_notes'), '')
