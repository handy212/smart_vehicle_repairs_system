"""Tests for AI operations infrastructure."""
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings

from apps.core.services.ai_audit import is_ai_enabled, summarize_for_audit
from apps.core.services.ai_service import AIService


@override_settings(GEMINI_API_KEY='')
class AIEnabledTests(TestCase):
    def test_ai_disabled_without_api_key(self):
        self.assertFalse(is_ai_enabled())
        self.assertFalse(is_ai_enabled('ops_briefing'))

    @override_settings(GEMINI_API_KEY='test-key')
    @patch('apps.core.services.ai_audit.SystemSettings')
    def test_ai_enabled_with_key_and_setting(self, mock_settings):
        mock_settings.get_setting.return_value = 'true'
        self.assertTrue(is_ai_enabled())
        self.assertTrue(is_ai_enabled('comms'))

    def test_summarize_for_audit_truncates(self):
        text = summarize_for_audit({'key': 'x' * 1000}, max_len=50)
        self.assertLessEqual(len(text), 50)


class AIServiceFallbackTests(TestCase):
    def test_inspection_summary_rule_fallback(self):
        inspection = MagicMock()
        inspection.vehicle.year = 2020
        inspection.vehicle.make = 'Toyota'
        inspection.vehicle.model = 'Corolla'
        results = MagicMock()
        results.filter.return_value.count.side_effect = [5, 1, 2]
        results.filter.return_value.select_related.return_value.values_list.return_value = ['Brakes']
        inspection.results = results

        with patch('apps.core.services.ai_service.is_ai_enabled', return_value=False):
            out = AIService.analyze_inspection_results(inspection)
        self.assertIn('notes', out)
        self.assertIn('Brakes', out['recommendations'])

    def test_get_suggested_message_template_fallback(self):
        obj = MagicMock()
        obj.customer = None
        obj.status = 'confirmed'
        obj.appointment_number = 'APT-1'
        obj.appointment_date.strftime.return_value = 'January 01, 2026'
        obj.appointment_time.strftime.return_value = '09:00 AM'
        obj.get_service_type_display.return_value = 'Oil Change'
        obj.branch.name = 'Main'

        with patch('apps.core.services.ai_service.is_ai_enabled', return_value=False):
            msg = AIService.get_suggested_message(obj, channel='sms', context_type='appointment')
        self.assertIn('subject', msg)
        self.assertIn('message', msg)
