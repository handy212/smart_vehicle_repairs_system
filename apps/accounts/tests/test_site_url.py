from unittest.mock import patch

from django.test import TestCase, override_settings

from apps.accounts.settings_utils import get_company_info, get_site_url


@override_settings(DEBUG=False)
class GetSiteUrlTests(TestCase):
    @patch('apps.accounts.settings_utils.get_setting', return_value='')
    def test_uses_frontend_base_url_in_production(self, _mock_get_setting):
        with override_settings(FRONTEND_BASE_URL='https://app.example.com'):
            self.assertEqual(get_site_url(), 'https://app.example.com')

    @patch('apps.accounts.settings_utils.get_setting', return_value='')
    def test_uses_frontend_url_before_frontend_base_url(self, _mock_get_setting):
        with override_settings(
            FRONTEND_URL='https://portal.example.com',
            FRONTEND_BASE_URL='https://app.example.com',
        ):
            self.assertEqual(get_site_url(), 'https://portal.example.com')

    @patch('apps.accounts.settings_utils.get_setting', return_value='')
    def test_falls_back_to_cors_origin_when_frontend_env_missing(self, _mock_get_setting):
        with override_settings(
            FRONTEND_BASE_URL='http://localhost:3001',
            CORS_ALLOWED_ORIGINS=['https://aap.example.com'],
        ):
            self.assertEqual(get_site_url(), 'https://aap.example.com')

    @patch('apps.accounts.settings_utils.get_setting', return_value='http://localhost:3000')
    def test_ignores_localhost_db_value_outside_debug(self, _mock_get_setting):
        with override_settings(
            FRONTEND_BASE_URL='http://localhost:3001',
            CORS_ALLOWED_ORIGINS=['https://aap.example.com'],
        ):
            self.assertEqual(get_site_url(), 'https://aap.example.com')

    @patch('apps.accounts.settings_utils.get_setting', return_value='https://custom.example.com')
    def test_uses_explicit_db_site_url(self, _mock_get_setting):
        self.assertEqual(get_site_url(), 'https://custom.example.com')

    @override_settings(DEBUG=True, FRONTEND_BASE_URL='', FRONTEND_URL='')
    @patch('apps.accounts.settings_utils.get_setting', return_value='')
    def test_debug_defaults_to_localhost(self, _mock_get_setting):
        self.assertEqual(get_site_url(), 'http://localhost:3000')

    @patch('apps.accounts.settings_utils.get_setting', return_value='https://custom.example.com')
    def test_company_info_includes_site_url(self, _mock_get_setting):
        info = get_company_info()
        self.assertEqual(info['site_url'], 'https://custom.example.com')
