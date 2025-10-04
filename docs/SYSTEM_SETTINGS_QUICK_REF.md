# System Settings - Quick Reference

## 🚀 Quick Start

### Initialize Settings
```bash
python manage.py init_settings
```

### Access Settings
```
URL: http://localhost:8000/admin-panel/settings/
```

## 📋 Categories (11 Total)

| Category | Settings | Key Focus |
|----------|----------|-----------|
| Company Info | 12 | Business identity, contact info |
| Branding | 11 | Logo, colors, theme |
| Email | 12 | SMTP configuration |
| SMS | 8 | Hubtel integration |
| Payment | 13 | Currency, tax, gateways |
| Notification | 11 | Triggers, schedules |
| Security | 11 | Password, session, 2FA |
| Business | 10 | Hours, appointments |
| Maintenance | 8 | Backup, debug, logs |
| Integration | 6 | Google, Facebook, etc. |
| General | 0 | Miscellaneous |

## 🔧 Essential Settings

### Must Configure (Top 10)
1. `company_name` - Your business name
2. `company_email` - Contact email
3. `company_phone` - Contact phone
4. `currency` - USD, GHS, EUR, etc.
5. `currency_symbol` - $, ¢, €, etc.
6. `email_enabled` - Enable email notifications
7. `email_host` - SMTP server
8. `sms_enabled` - Enable SMS notifications
9. `business_hours_weekday` - Operating hours
10. `tax_rate` - Tax percentage

### Email Quick Setup (Gmail)
```
email_host = smtp.gmail.com
email_port = 587
email_username = your-email@gmail.com
email_password = your-app-password (not regular password!)
email_use_tls = true
email_from_address = noreply@yourbusiness.com
```

### SMS Quick Setup (Hubtel)
```
sms_provider = hubtel
hubtel_client_id = your-client-id
hubtel_client_secret = your-client-secret
hubtel_sender_id = YourBrand (max 11 chars)
hubtel_api_url = https://api.hubtel.com/v1/messages/send
```

## 💻 Code Examples

### Get Single Setting
```python
from apps.accounts.settings_utils import get_setting

company_name = get_setting('company_name', 'Default Name')
```

### Get Multiple Settings
```python
from apps.accounts.settings_utils import get_settings

settings = get_settings(['company_name', 'company_email', 'company_phone'])
print(settings['company_name'])
```

### Get Company Info
```python
from apps.accounts.settings_utils import get_company_info

company = get_company_info()
# Returns: {
#     'company_name': '...',
#     'company_email': '...',
#     'company_phone': '...',
#     # ... 9 more fields
# }
```

### Get Branding
```python
from apps.accounts.settings_utils import get_branding_settings

branding = get_branding_settings()
# Returns: logo_path, favicon_path, colors, theme_mode, etc.
```

### Get Email Config
```python
from apps.accounts.settings_utils import get_email_settings

email = get_email_settings()
# Returns all 12 email settings
```

### Get SMS Config
```python
from apps.accounts.settings_utils import get_sms_settings

sms = get_sms_settings()
# Returns all 8 SMS settings
```

### Use in Templates
```django
{# Available via context processor #}
{{ COMPANY_NAME }}
{{ COMPANY_EMAIL }}
{{ CURRENCY_SYMBOL }}
{{ LOGO_PATH }}
```

## 🎨 UI Features

### Smart Input Types
- **Colors**: Color picker + hex input
- **Booleans**: Toggle switch
- **Secrets**: Password field with show/hide
- **Times**: Time picker
- **Numbers**: Number input with step
- **Long Text**: Textarea
- **Regular**: Text input

### File Upload (Branding)
- Logo: 200x50px PNG
- Dark Logo: Optional
- Favicon: 32x32 or 64x64 ICO/PNG
- Login Background: 1920x1080px

### Test Functions
- **Test Email**: Click button → sends to your email
- **Test SMS**: Click button → enter phone → sends test

## 🔐 Secret Settings (8 Total)
- `company_tax_id`
- `smtp_password`
- `hubtel_client_secret`
- `stripe_secret_key`
- `paypal_secret`
- `google_maps_api_key`
- `slack_webhook_url`
- `zapier_webhook_url`

## 📱 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/admin-panel/settings/` | GET | View settings |
| `/admin-panel/settings/bulk-update/` | POST | Save all changes |
| `/admin-panel/settings/upload-branding/` | POST | Upload assets |
| `/admin-panel/settings/test-email/` | POST | Test email |
| `/admin-panel/settings/test-sms/` | POST | Test SMS |

## 🧪 Testing

```bash
# Run test suite
python test_settings.py

# Expected output:
# ✓ 102 settings created
# ✓ All categories populated
# ✓ Validation working
# ✓ URLs accessible
```

## 🐛 Troubleshooting

### Email Not Working
```
☑ Set email_enabled = true
☑ Check SMTP credentials
☑ Gmail: Use App Password
☑ Test firewall/port access
☑ Click "Test Email" button
```

### SMS Not Working
```
☑ Set sms_enabled = true
☑ Verify Hubtel credentials
☑ Check sender ID approved
☑ Phone format: +233XXXXXXXXX
☑ Click "Test SMS" button
```

### Branding Not Showing
```
☑ Check media/branding/ exists
☑ Verify file uploaded
☑ Check MEDIA_URL in settings
☑ Clear browser cache
```

## 📦 Files

### Created
- `templates/admin/settings_new.html` - UI
- `apps/accounts/settings_utils.py` - Utilities
- `apps/accounts/context_processors.py` - Context
- `apps/accounts/management/commands/init_settings.py` - Init command
- `test_settings.py` - Tests
- `docs/SYSTEM_SETTINGS_COMPLETE.md` - Full docs
- `docs/SYSTEM_SETTINGS_QUICK_REF.md` - This file

### Modified
- `apps/accounts/admin_models.py` - Categories: 7 → 11
- `apps/accounts/admin_views.py` - Added 4 views
- `apps/accounts/admin_urls.py` - Added 4 URLs

## 🔄 All 102 Settings

### Company (12)
company_name, company_tagline, company_email, company_phone, company_address, company_city, company_state, company_zip, company_country, company_website, company_tax_id, company_registration

### Branding (11)
site_name, logo_path, logo_dark_path, favicon_path, login_background, primary_color, secondary_color, success_color, danger_color, warning_color, theme_mode

### Email (12)
email_enabled, email_backend, email_host, email_port, email_username, email_password, email_use_tls, email_use_ssl, email_from_name, email_from_address, email_reply_to, email_signature

### SMS (8)
sms_enabled, sms_provider, hubtel_client_id, hubtel_client_secret, hubtel_sender_id, hubtel_api_url, sms_signature, sms_test_number

### Payment (13)
currency, currency_symbol, tax_rate, tax_name, payment_terms, late_fee_enabled, late_fee_amount, late_fee_type, payment_gateway, stripe_public_key, stripe_secret_key, paypal_client_id, paypal_secret

### Notification (11)
email_notifications_enabled, sms_notifications_enabled, push_notifications_enabled, notify_appointment_created, notify_appointment_reminder, notify_workorder_status, notify_invoice_created, notify_payment_received, reminder_hours_before, quiet_hours_start, quiet_hours_end

### Security (11)
password_min_length, password_require_uppercase, password_require_lowercase, password_require_number, password_require_special, session_timeout, max_login_attempts, lockout_duration, two_factor_enabled, allowed_file_types, max_file_size

### Business (10)
business_hours_weekday, business_hours_saturday, business_hours_sunday, appointment_duration, appointment_buffer, max_appointments_per_day, online_booking_enabled, deposit_required, deposit_percentage, cancellation_policy

### Maintenance (8)
maintenance_mode, maintenance_message, maintenance_allowed_ips, debug_mode, log_level, backup_enabled, backup_frequency, backup_retention

### Integration (6)
google_maps_api_key, google_analytics_id, facebook_pixel_id, whatsapp_business_number, slack_webhook_url, zapier_webhook_url

## 🎯 Common Tasks

### Change Company Name
1. Go to `/admin-panel/settings/?category=company`
2. Update `company_name`
3. Click "Save All Changes"

### Upload Logo
1. Go to `/admin-panel/settings/?category=branding`
2. Scroll to "Upload Branding Assets"
3. Select logo file (200x50 PNG)
4. Click "Upload Files"

### Configure Email
1. Go to `/admin-panel/settings/?category=email`
2. Set `email_enabled` = true
3. Fill in SMTP details
4. Click "Test Email" to verify
5. Click "Save All Changes"

### Set Business Hours
1. Go to `/admin-panel/settings/?category=business`
2. Set `business_hours_weekday` = "08:00-18:00"
3. Set `business_hours_saturday` = "09:00-15:00"
4. Set `business_hours_sunday` = "Closed"
5. Click "Save All Changes"

### Change Currency
1. Go to `/admin-panel/settings/?category=payment`
2. Set `currency` = "GHS" (or USD, EUR, etc.)
3. Set `currency_symbol` = "¢" (or $, €, etc.)
4. Update `tax_rate` as needed
5. Click "Save All Changes"

## 📚 Related Documentation
- [Full Documentation](SYSTEM_SETTINGS_COMPLETE.md)
- [Hubtel Integration Guide](HUBTEL_INTEGRATION_GUIDE.md)
- [Email Templates](PHASE14_EMAIL_TEMPLATES.md)
- [SMS Templates](PHASE14_SMS_TEMPLATES.md)

## ✅ Checklist for Production

- [ ] Initialize settings: `python manage.py init_settings`
- [ ] Configure company information (12 settings)
- [ ] Upload branding assets (logo, favicon)
- [ ] Configure email (SMTP + test)
- [ ] Configure SMS (Hubtel + test)
- [ ] Set currency and tax rate
- [ ] Define business hours
- [ ] Set security policies
- [ ] Configure notification triggers
- [ ] Add integration API keys
- [ ] Set backup schedule
- [ ] Test all critical settings
