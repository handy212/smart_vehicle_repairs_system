"""
Initialize System Settings with predefined values
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.accounts.admin_models import SystemSettings


class Command(BaseCommand):
    help = 'Initialize system settings with predefined defaults'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Initializing system settings...'))
        
        with transaction.atomic():
            settings_config = [
                # COMPANY INFO
                ('company_name', 'Smart Vehicle Repairs', 'company', 'Company/business name', False),
                ('company_tagline', 'Your Trusted Auto Service Partner', 'company', 'Company tagline/slogan', False),
                ('company_email', 'info@smartvehiclerepairs.com', 'company', 'Primary company email', False),
                ('company_phone', '+1-555-0100', 'company', 'Primary company phone', False),
                ('company_address', '123 Auto Street', 'company', 'Street address', False),
                ('company_city', 'New York', 'company', 'City', False),
                ('company_state', 'NY', 'company', 'State/Province', False),
                ('company_zip', '10001', 'company', 'ZIP/Postal code', False),
                ('company_country', 'United States', 'company', 'Country', False),
                ('company_website', 'https://smartvehiclerepairs.com', 'company', 'Company website URL', False),
                ('company_tax_id', '', 'company', 'Tax ID/EIN number', True),
                ('company_registration', '', 'company', 'Business registration number', False),
                
                # BRANDING
                ('site_name', 'Smart Vehicle Repairs', 'branding', 'Site name shown in browser', False),
                ('site_description', 'Professional auto repair and maintenance services', 'branding', 'Site meta description', False),
                ('logo_path', '', 'branding', 'Path to company logo (upload via media)', False),
                ('logo_dark_path', '', 'branding', 'Path to logo for dark backgrounds', False),
                ('favicon_path', '', 'branding', 'Path to favicon icon', False),
                ('login_background', '', 'branding', 'Path to login page background image', False),
                ('primary_color', '#0d6efd', 'branding', 'Primary brand color (hex)', False),
                ('secondary_color', '#6c757d', 'branding', 'Secondary brand color (hex)', False),
                ('success_color', '#198754', 'branding', 'Success color (hex)', False),
                ('danger_color', '#dc3545', 'branding', 'Danger color (hex)', False),
                ('theme_mode', 'light', 'branding', 'Default theme: light, dark, or auto', False),
                
                # EMAIL SETTINGS
                ('email_enabled', 'true', 'email', 'Enable email notifications', False),
                ('email_backend', 'smtp', 'email', 'Email backend: smtp, sendgrid, mailgun, ses', False),
                ('smtp_host', 'smtp.gmail.com', 'email', 'SMTP server hostname', False),
                ('smtp_port', '587', 'email', 'SMTP server port', False),
                ('smtp_username', '', 'email', 'SMTP username/email', False),
                ('smtp_password', '', 'email', 'SMTP password', True),
                ('smtp_use_tls', 'true', 'email', 'Use TLS encryption', False),
                ('smtp_use_ssl', 'false', 'email', 'Use SSL encryption', False),
                ('email_from_name', 'Smart Vehicle Repairs', 'email', 'From name in emails', False),
                ('email_from_address', 'noreply@smartvehiclerepairs.com', 'email', 'From email address', False),
                ('email_reply_to', 'support@smartvehiclerepairs.com', 'email', 'Reply-to email address', False),
                ('email_signature', 'Best regards,\nSmart Vehicle Repairs Team', 'email', 'Email signature', False),
                
                # SMS SETTINGS (Hubtel Integration)
                ('sms_enabled', 'true', 'sms', 'Enable SMS notifications', False),
                ('sms_provider', 'hubtel', 'sms', 'SMS provider: hubtel, twilio, africastalking', False),
                ('hubtel_client_id', '', 'sms', 'Hubtel API Client ID', False),
                ('hubtel_client_secret', '', 'sms', 'Hubtel API Client Secret', True),
                ('hubtel_sender_id', 'SmartAuto', 'sms', 'Hubtel Sender ID (max 11 chars)', False),
                ('hubtel_api_url', 'https://smsc.hubtel.com/v1/messages/send', 'sms', 'Hubtel API endpoint', False),
                ('sms_signature', '\n- Smart Vehicle Repairs', 'sms', 'SMS signature appended to messages', False),
                ('sms_test_number', '', 'sms', 'Test phone number for SMS testing', False),
                
                # PAYMENT SETTINGS
                ('currency', 'USD', 'payment', 'Default currency code', False),
                ('currency_symbol', '$', 'payment', 'Currency symbol', False),
                ('tax_rate', '0.00', 'payment', 'Default tax rate (percentage)', False),
                ('tax_name', 'VAT', 'payment', 'Tax name (VAT, GST, Sales Tax)', False),
                ('payment_terms_days', '30', 'payment', 'Default payment terms (days)', False),
                ('late_fee_enabled', 'false', 'payment', 'Enable late payment fees', False),
                ('late_fee_percentage', '0', 'payment', 'Late fee percentage', False),
                ('payment_gateway_enabled', 'false', 'payment', 'Enable online payments', False),
                ('payment_gateway', 'stripe', 'payment', 'Payment gateway: stripe, paypal, square', False),
                ('stripe_public_key', '', 'payment', 'Stripe publishable key', False),
                ('stripe_secret_key', '', 'payment', 'Stripe secret key', True),
                ('paypal_client_id', '', 'payment', 'PayPal client ID', False),
                ('paypal_secret', '', 'payment', 'PayPal secret', True),
                
                # NOTIFICATION SETTINGS
                ('notification_email_enabled', 'true', 'notification', 'Send email notifications', False),
                ('notification_sms_enabled', 'true', 'notification', 'Send SMS notifications', False),
                ('notification_push_enabled', 'true', 'notification', 'Send push notifications', False),
                ('notify_appointment_created', 'true', 'notification', 'Notify on appointment creation', False),
                ('notify_appointment_reminder', 'true', 'notification', 'Send appointment reminders', False),
                ('notify_workorder_status', 'true', 'notification', 'Notify on work order status change', False),
                ('notify_invoice_created', 'true', 'notification', 'Notify on invoice creation', False),
                ('notify_payment_received', 'true', 'notification', 'Notify on payment received', False),
                ('appointment_reminder_hours', '24', 'notification', 'Hours before appointment to send reminder', False),
                ('notification_quiet_hours_start', '22:00', 'notification', 'Start of quiet hours (24h format)', False),
                ('notification_quiet_hours_end', '08:00', 'notification', 'End of quiet hours (24h format)', False),
                
                # SECURITY SETTINGS
                ('password_min_length', '8', 'security', 'Minimum password length', False),
                ('password_require_uppercase', 'true', 'security', 'Require uppercase letter', False),
                ('password_require_lowercase', 'true', 'security', 'Require lowercase letter', False),
                ('password_require_number', 'true', 'security', 'Require number', False),
                ('password_require_special', 'false', 'security', 'Require special character', False),
                ('session_timeout_minutes', '1440', 'security', 'Session timeout in minutes (24 hours)', False),
                ('max_login_attempts', '5', 'security', 'Max failed login attempts before lockout', False),
                ('lockout_duration_minutes', '30', 'security', 'Account lockout duration', False),
                ('require_2fa', 'false', 'security', 'Require two-factor authentication', False),
                ('allowed_file_types', 'jpg,jpeg,png,pdf,doc,docx,xls,xlsx', 'security', 'Allowed upload file types', False),
                ('max_file_size_mb', '10', 'security', 'Maximum file upload size (MB)', False),
                
                # BUSINESS SETTINGS
                ('business_hours_weekday', '08:00-18:00', 'business', 'Weekday business hours', False),
                ('business_hours_saturday', '09:00-15:00', 'business', 'Saturday business hours', False),
                ('business_hours_sunday', 'closed', 'business', 'Sunday business hours', False),
                ('appointment_duration_minutes', '60', 'business', 'Default appointment duration', False),
                ('appointment_buffer_minutes', '15', 'business', 'Buffer between appointments', False),
                ('max_appointments_per_day', '20', 'business', 'Maximum appointments per day', False),
                ('allow_online_booking', 'true', 'business', 'Allow customers to book online', False),
                ('require_deposit', 'false', 'business', 'Require deposit for appointments', False),
                ('deposit_percentage', '0', 'business', 'Deposit percentage required', False),
                ('cancellation_hours', '24', 'business', 'Minimum hours before cancellation allowed', False),
                
                # MAINTENANCE SETTINGS
                ('maintenance_mode', 'false', 'maintenance', 'Enable maintenance mode', False),
                ('maintenance_message', 'System under maintenance. Please check back soon.', 'maintenance', 'Maintenance mode message', False),
                ('maintenance_allowed_ips', '', 'maintenance', 'Comma-separated IPs allowed during maintenance', False),
                ('debug_mode', 'false', 'maintenance', 'Enable debug mode (development only)', False),
                ('log_level', 'INFO', 'maintenance', 'Logging level: DEBUG, INFO, WARNING, ERROR', False),
                ('backup_enabled', 'true', 'maintenance', 'Enable automatic backups', False),
                ('backup_frequency', 'daily', 'maintenance', 'Backup frequency: daily, weekly, monthly', False),
                ('backup_retention_days', '30', 'maintenance', 'Days to retain backups', False),
                
                # INTEGRATION SETTINGS
                ('google_maps_api_key', '', 'integration', 'Google Maps API key', True),
                ('google_analytics_id', '', 'integration', 'Google Analytics tracking ID', False),
                ('facebook_pixel_id', '', 'integration', 'Facebook Pixel ID', False),
                ('whatsapp_business_number', '', 'integration', 'WhatsApp Business number', False),
                ('slack_webhook_url', '', 'integration', 'Slack webhook URL for alerts', True),
                ('zapier_webhook_url', '', 'integration', 'Zapier webhook URL', True),
            ]
            
            created_count = 0
            updated_count = 0
            
            for key, default_value, category, description, is_secret in settings_config:
                setting, created = SystemSettings.objects.get_or_create(
                    key=key,
                    defaults={
                        'value': default_value,
                        'category': category,
                        'description': description,
                        'is_secret': is_secret,
                        'is_active': True,
                    }
                )
                
                if created:
                    self.stdout.write(f'  ✅ Created: {key}')
                    created_count += 1
                else:
                    # Update description and is_secret if changed
                    if setting.description != description or setting.is_secret != is_secret:
                        setting.description = description
                        setting.is_secret = is_secret
                        setting.save()
                        self.stdout.write(f'  ♻️  Updated: {key}')
                        updated_count += 1
        
        self.stdout.write(self.style.SUCCESS(f'\n✅ Settings initialization complete!'))
        self.stdout.write(self.style.SUCCESS(f'   - Created: {created_count} settings'))
        self.stdout.write(self.style.SUCCESS(f'   - Updated: {updated_count} settings'))
        self.stdout.write(self.style.SUCCESS(f'   - Total: {len(settings_config)} settings'))
        
        # Show categories
        categories = set(cat for _, _, cat, _, _ in settings_config)
        self.stdout.write(self.style.SUCCESS(f'\n📁 Categories ({len(categories)}):'))
        for cat in sorted(categories):
            count = sum(1 for _, _, c, _, _ in settings_config if c == cat)
            self.stdout.write(f'   - {cat.title()}: {count} settings')
