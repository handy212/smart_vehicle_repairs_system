from django.test import TestCase, override_settings

from apps.accounts.admin_models import SystemSettings
from apps.accounts.settings_utils import clear_settings_cache, get_sms_settings


class SMSSettingsPrecedenceTests(TestCase):
    def tearDown(self):
        clear_settings_cache()
        super().tearDown()

    @override_settings(
        HUBTEL_CLIENT_ID='env-client-id',
        HUBTEL_CLIENT_SECRET='env-client-secret',
        HUBTEL_FROM='EnvSender',
        HUBTEL_SMS_ENABLED=True,
        TWILIO_ACCOUNT_SID='env-twilio-sid',
        TWILIO_AUTH_TOKEN='env-twilio-token',
        TWILIO_PHONE_NUMBER='+15550000000',
        INFOBIP_BASE_URL='https://env.api.infobip.com',
        INFOBIP_API_KEY='env-infobip-key',
        INFOBIP_SENDER_ID='EnvSender',
    )
    def test_sms_settings_use_database_values_before_environment(self):
        SystemSettings.objects.create(
            category='sms',
            key='hubtel_client_id',
            value='admin-client-id',
            is_secret=True,
        )
        SystemSettings.objects.create(
            category='sms',
            key='hubtel_client_secret',
            value='admin-client-secret',
            is_secret=True,
        )
        SystemSettings.objects.create(
            category='sms',
            key='hubtel_sender_id',
            value='AdminSender',
        )
        SystemSettings.objects.create(
            category='sms',
            key='sms_enabled',
            value='false',
        )
        SystemSettings.objects.create(
            category='sms',
            key='twilio_account_sid',
            value='admin-twilio-sid',
            is_secret=True,
        )
        SystemSettings.objects.create(
            category='sms',
            key='twilio_auth_token',
            value='admin-twilio-token',
            is_secret=True,
        )
        SystemSettings.objects.create(
            category='sms',
            key='twilio_phone_number',
            value='+15551112222',
        )
        SystemSettings.objects.create(
            category='sms',
            key='infobip_base_url',
            value='https://admin.api.infobip.com',
        )
        SystemSettings.objects.create(
            category='sms',
            key='infobip_api_key',
            value='admin-infobip-key',
            is_secret=True,
        )

        sms_settings = get_sms_settings()

        self.assertEqual(sms_settings['hubtel_client_id'], 'admin-client-id')
        self.assertEqual(sms_settings['hubtel_client_secret'], 'admin-client-secret')
        self.assertEqual(sms_settings['hubtel_sender_id'], 'AdminSender')
        self.assertEqual(sms_settings['sms_enabled'], 'false')
        self.assertEqual(sms_settings['twilio_account_sid'], 'admin-twilio-sid')
        self.assertEqual(sms_settings['twilio_auth_token'], 'admin-twilio-token')
        self.assertEqual(sms_settings['twilio_phone_number'], '+15551112222')
        self.assertEqual(
            sms_settings['infobip_base_url'],
            'https://admin.api.infobip.com',
        )
        self.assertEqual(sms_settings['infobip_api_key'], 'admin-infobip-key')

    @override_settings(
        HUBTEL_CLIENT_ID='env-client-id',
        HUBTEL_CLIENT_SECRET='env-client-secret',
        HUBTEL_SMS_ENABLED=True,
    )
    def test_sms_settings_fall_back_to_environment_when_database_row_is_missing(self):
        sms_settings = get_sms_settings()

        self.assertEqual(sms_settings['hubtel_client_id'], 'env-client-id')
        self.assertEqual(sms_settings['hubtel_client_secret'], 'env-client-secret')
        self.assertEqual(sms_settings['sms_enabled'], 'true')
