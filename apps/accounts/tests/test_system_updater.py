"""Tests for bare-metal system updater helpers."""
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from apps.accounts.system_updater import (
    check_for_updates,
    is_bare_metal_layout,
    updater_status,
)


@override_settings(
    SYSTEM_UPDATE_SOURCE_DIR='/opt/smart_vehicle_repairs_system',
    SYSTEM_UPDATE_TARGET_DIR='/var/www/svr',
    SYSTEM_UPDATE_ENABLED=True,
)
class SystemUpdaterTests(SimpleTestCase):
    @patch('apps.accounts.system_updater.is_bare_metal_layout', return_value=True)
    @patch('apps.accounts.system_updater.deployed_commit', return_value='abc1234')
    @patch('apps.accounts.system_updater._remote_commit', return_value='def5678')
    @patch('apps.accounts.system_updater._git_log_message', return_value='message')
    @patch('apps.accounts.system_updater._commits_behind', return_value=2)
    def test_check_for_updates_available(self, *_mocks):
        result = check_for_updates()
        self.assertTrue(result.available)
        self.assertEqual(result.commits_behind, 2)
        self.assertEqual(result.deployed_short, 'abc1234')

    @patch('apps.accounts.system_updater.is_bare_metal_layout', return_value=True)
    @patch('apps.accounts.system_updater.deployed_commit', return_value='abc1234')
    @patch('apps.accounts.system_updater._remote_commit', return_value='abc1234')
    def test_check_for_updates_up_to_date(self, *_mocks):
        result = check_for_updates()
        self.assertFalse(result.available)

    @patch('apps.accounts.system_updater.target_dir')
    @patch('apps.accounts.system_updater.source_dir')
    def test_bare_metal_layout_detection(self, mock_source, mock_target):
        mock_source.return_value.is_dir.return_value = True
        mock_target.return_value.is_dir.return_value = True
        mock_source.return_value.__truediv__.return_value.is_file.return_value = True
        mock_target.return_value.__truediv__.return_value.is_file.return_value = True
        self.assertTrue(is_bare_metal_layout())

    @patch('apps.accounts.system_updater.sudo_runner_configured', return_value=False)
    @patch('apps.accounts.system_updater.is_bare_metal_layout', return_value=True)
    def test_updater_status_requires_sudo(self, *_mocks):
        status = updater_status()
        self.assertFalse(status['can_apply'])
