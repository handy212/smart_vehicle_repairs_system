# System Settings - Complete Implementation

## Overview
Comprehensive system settings management with 102 predefined settings across 11 categories, providing full control over company information, branding, communications, payments, security, and operations.

## Features

### ✅ 11 Setting Categories
1. **General** - Basic system settings
2. **Company Info** - Business identity and contact information
3. **Branding & Theme** - Visual identity and styling
4. **Email Settings** - SMTP configuration and email templates
5. **SMS Settings** - Hubtel integration for text messaging
6. **Payment & Billing** - Currency, tax, and payment gateways
7. **Notifications** - Email/SMS triggers and schedules
8. **Security** - Password policies and access control
9. **Business Settings** - Operational hours and policies
10. **Integrations** - Third-party service connections
11. **Maintenance** - System maintenance and debugging

### ✅ 102 Predefined Settings
- **Company Info (12)**: Name, tagline, email, phone, address, tax ID, etc.
- **Branding (11)**: Logo, favicon, colors, theme mode, login background
- **Email (12)**: SMTP host/port/credentials, from/reply-to addresses
- **SMS (8)**: Hubtel client ID/secret, sender ID, API URL
- **Payment (13)**: Currency, tax rate, Stripe/PayPal credentials
- **Notification (11)**: Email/SMS triggers, reminders, quiet hours
- **Security (11)**: Password requirements, session timeout, 2FA, file uploads
- **Business (10)**: Operating hours, appointment settings, policies
- **Maintenance (8)**: Backup, debug mode, maintenance mode
- **Integration (6)**: Google Maps/Analytics, Facebook, WhatsApp, Slack, Zapier

### ✅ Enhanced UI Features
- **Category Navigation**: Quick-access pills for all categories
- **Smart Input Types**: 
  - Color pickers for color settings
  - Toggle switches for boolean settings
  - Password fields with show/hide for secrets
  - Time pickers for hours
  - Number inputs for rates and amounts
  - Textareas for messages and descriptions
- **File Upload**: Dedicated interface for logo, favicon, and login background
- **Test Functions**: Built-in email and SMS testing
- **Bulk Updates**: Save all settings in a category at once
- **Active/Inactive Toggle**: Enable/disable settings individually
- **Secret Masking**: Automatic masking of passwords and API keys

### ✅ Utility Functions
- `get_setting(key, default)` - Retrieve single setting
- `get_settings(keys, defaults)` - Retrieve multiple settings
- `get_company_info()` - Get all company information
- `get_branding_settings()` - Get all branding settings
- `get_email_settings()` - Get all email configuration
- `get_sms_settings()` - Get all SMS configuration
- `get_payment_settings()` - Get all payment settings
- `get_business_settings()` - Get all business settings
- `get_security_settings()` - Get all security settings

### ✅ Validation
- Email format validation
- URL format validation
- Phone number validation
- Hex color validation
- Numeric value validation
- Boolean value validation

## Quick Start

### 1. Initialize Settings
```bash
python manage.py init_settings
```

This creates all 102 predefined settings with sensible defaults.

### 2. Access Settings UI
Navigate to: `http://localhost:8000/admin-panel/settings/`

### 3. Configure Settings by Category

#### Company Information
```
Category: company
- company_name: Your business name
- company_tagline: Your slogan
- company_email: info@yourbusiness.com
- company_phone: +1234567890
- company_address: Street address
- company_city, state, zip, country
- company_website: https://yourbusiness.com
- company_tax_id: Tax identification number
- company_registration: Business registration number
```

#### Branding
```
Category: branding
- site_name: Site title
- logo_path: Upload via file upload interface
- logo_dark_path: Logo for dark backgrounds
- favicon_path: Site favicon (32x32 or 64x64)
- login_background: Login page background image
- primary_color: #0d6efd (Bootstrap primary)
- secondary_color: #6c757d
- success_color: #198754
- danger_color: #dc3545
- theme_mode: light (or dark)
```

#### Email Configuration
```
Category: email
- email_enabled: true/false
- email_backend: smtp
- email_host: smtp.gmail.com (or your SMTP server)
- email_port: 587
- email_username: your-email@gmail.com
- email_password: your-app-password
- email_use_tls: true
- email_use_ssl: false
- email_from_name: Your Business Name
- email_from_address: noreply@yourbusiness.com
- email_reply_to: support@yourbusiness.com
- email_signature: Email signature text
```

**Gmail Setup:**
1. Enable 2FA on your Google account
2. Generate an App Password
3. Use smtp.gmail.com:587 with TLS

**Outlook Setup:**
1. Use smtp-mail.outlook.com:587
2. Enable "Let less secure apps access your account"

**SendGrid Setup:**
1. Get API key from SendGrid
2. Use smtp.sendgrid.net:587
3. Username: apikey, Password: your-api-key

#### SMS Configuration (Hubtel)
```
Category: sms
- sms_enabled: true/false
- sms_provider: hubtel
- hubtel_client_id: Your Hubtel Client ID
- hubtel_client_secret: Your Hubtel Client Secret (secret)
- hubtel_sender_id: Your registered sender ID (max 11 chars)
- hubtel_api_url: https://api.hubtel.com/v1/messages/send
- sms_signature: Footer text for SMS
- sms_test_number: +233XXXXXXXXX (for testing)
```

**Hubtel Setup:**
1. Sign up at https://developers.hubtel.com
2. Navigate to API Keys section
3. Create new API credentials (Client ID & Secret)
4. Register a Sender ID (alphanumeric, max 11 characters)
5. Wait for sender ID approval (usually 24-48 hours)

#### Payment Settings
```
Category: payment
- currency: USD, GHS, EUR, etc.
- currency_symbol: $, ¢, €, etc.
- tax_rate: 10.00 (percentage)
- tax_name: VAT, Sales Tax, etc.
- payment_terms: 30 (days)
- late_fee_enabled: true/false
- late_fee_amount: 50.00 or 5.00 (based on type)
- late_fee_type: fixed or percentage
- payment_gateway: stripe, paypal, both
- stripe_public_key: pk_live_...
- stripe_secret_key: sk_live_... (secret)
- paypal_client_id: Your PayPal client ID
- paypal_secret: Your PayPal secret (secret)
```

#### Security Settings
```
Category: security
- password_min_length: 8
- password_require_uppercase: true
- password_require_lowercase: true
- password_require_number: true
- password_require_special: false
- session_timeout: 30 (minutes)
- max_login_attempts: 5
- lockout_duration: 30 (minutes)
- two_factor_enabled: true/false
- allowed_file_types: pdf,jpg,jpeg,png,doc,docx
- max_file_size: 10 (MB)
```

#### Business Settings
```
Category: business
- business_hours_weekday: 08:00-18:00
- business_hours_saturday: 09:00-15:00
- business_hours_sunday: Closed
- appointment_duration: 60 (minutes)
- appointment_buffer: 15 (minutes between appointments)
- max_appointments_per_day: 20
- online_booking_enabled: true/false
- deposit_required: true/false
- deposit_percentage: 20.00
- cancellation_policy: Text describing policy
```

### 4. Upload Branding Assets

Navigate to Branding category and use the upload form:
- **Logo**: 200x50px PNG with transparent background
- **Dark Logo**: Optional, for dark theme
- **Favicon**: 32x32 or 64x64 ICO/PNG
- **Login Background**: 1920x1080 high-res image

### 5. Test Configuration

**Test Email:**
Click "Test Email" button in settings header. Sends to your user email.

**Test SMS:**
Click "Test SMS" button, enter phone number with country code (e.g., +1234567890).

## Code Usage

### In Views
```python
from apps.accounts.settings_utils import get_company_info, get_payment_settings

def invoice_view(request):
    company = get_company_info()
    payment = get_payment_settings()
    
    context = {
        'company_name': company['company_name'],
        'currency_symbol': payment['currency_symbol'],
        'tax_rate': payment['tax_rate'],
    }
    return render(request, 'invoice.html', context)
```

### In Templates
```django
{# Company info available via context processor #}
<h1>{{ COMPANY_NAME }}</h1>
<p>{{ COMPANY_EMAIL }}</p>

{# Or use the setting directly #}
{% load settings_tags %}
{% get_setting 'company_name' as company_name %}
<h1>{{ company_name }}</h1>
```

### Dynamic Email Configuration
```python
from apps.accounts.settings_utils import get_email_settings
from django.core.mail import send_mail
from django.conf import settings

def send_notification(to_email, subject, message):
    email_config = get_email_settings()
    
    if email_config['email_enabled'] == 'true':
        send_mail(
            subject=subject,
            message=message,
            from_email=email_config['email_from_address'],
            recipient_list=[to_email],
        )
```

### Dynamic SMS Sending
```python
from apps.accounts.settings_utils import get_sms_settings
import requests

def send_sms(phone_number, message):
    sms_config = get_sms_settings()
    
    if sms_config['sms_enabled'] == 'true':
        response = requests.post(
            sms_config['hubtel_api_url'],
            auth=(sms_config['hubtel_client_id'], sms_config['hubtel_client_secret']),
            json={
                'From': sms_config['hubtel_sender_id'],
                'To': phone_number,
                'Content': message
            }
        )
        return response.status_code == 200
```

## Management Commands

### Initialize Settings
```bash
python manage.py init_settings
```
Creates all 102 predefined settings. Safe to run multiple times (won't overwrite existing values).

## URL Endpoints

- `/admin-panel/settings/` - Main settings page
- `/admin-panel/settings/bulk-update/` - Bulk update endpoint
- `/admin-panel/settings/upload-branding/` - File upload endpoint
- `/admin-panel/settings/test-email/` - Test email configuration
- `/admin-panel/settings/test-sms/` - Test SMS configuration

## Database Schema

### SystemSettings Model
```python
class SystemSettings(models.Model):
    category = CharField(max_length=50, choices=CATEGORY_CHOICES)
    key = CharField(max_length=100, unique=True)
    value = TextField(blank=True)
    description = TextField(blank=True)
    is_secret = BooleanField(default=False)  # For passwords, API keys
    is_active = BooleanField(default=True)
    updated_by = ForeignKey(User)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
```

## Files Modified/Created

### Created Files
- `templates/admin/settings_new.html` - Enhanced settings UI
- `apps/accounts/settings_utils.py` - Utility functions
- `apps/accounts/context_processors.py` - Template context processor
- `apps/accounts/management/commands/init_settings.py` - Settings initialization
- `test_settings.py` - Test suite

### Modified Files
- `apps/accounts/admin_models.py` - Updated CATEGORY_CHOICES (7 → 11)
- `apps/accounts/admin_views.py` - Added 4 new view functions
- `apps/accounts/admin_urls.py` - Added 4 new URL patterns

## Security Considerations

### Secret Settings
The following settings are marked as `is_secret=True`:
- `company_tax_id`
- `smtp_password`
- `hubtel_client_secret`
- `stripe_secret_key`
- `paypal_secret`
- `google_maps_api_key`
- `slack_webhook_url`
- `zapier_webhook_url`

Secret settings are:
- Masked in the UI (password field)
- Not exposed in API responses
- Should be stored in environment variables in production

### Best Practices
1. Never commit real API keys to version control
2. Use environment variables for production secrets
3. Rotate API keys regularly
4. Limit access to settings page to admin users only
5. Enable audit logging for settings changes

## Troubleshooting

### Email Not Sending
1. Check `email_enabled` is set to `true`
2. Verify SMTP credentials are correct
3. For Gmail, use App Password not regular password
4. Check firewall allows port 587/465
5. Use "Test Email" button to diagnose

### SMS Not Sending
1. Check `sms_enabled` is set to `true`
2. Verify Hubtel credentials are correct
3. Ensure sender ID is approved by Hubtel
4. Check phone number format (+233XXXXXXXXX)
5. Use "Test SMS" button to diagnose

### Branding Assets Not Showing
1. Ensure files uploaded successfully
2. Check `media/branding/` directory exists
3. Verify `MEDIA_URL` and `MEDIA_ROOT` in settings.py
4. Check file permissions
5. Clear browser cache

## Testing

Run the test suite:
```bash
python test_settings.py
```

Tests cover:
- Basic settings operations
- Grouped settings functions
- Validation functions
- Secret settings handling
- Active/inactive settings
- Settings by category
- URL configuration

## Next Steps

1. **Add Context Processor**: Add to settings.py TEMPLATES
```python
'context_processors': [
    # ... existing processors
    'apps.accounts.context_processors.settings_context',
],
```

2. **Environment Variables**: For production, override sensitive settings:
```bash
export HUBTEL_CLIENT_ID="your-client-id"
export HUBTEL_CLIENT_SECRET="your-secret"
export STRIPE_SECRET_KEY="sk_live_..."
```

3. **Cache Configuration**: Ensure Redis is running for optimal performance
```bash
redis-server
```

## Support

For issues or questions:
1. Check this documentation first
2. Review test output: `python test_settings.py`
3. Check audit log for settings changes
4. Verify settings in database: `SystemSettings.objects.all()`

## Changelog

### Version 1.0 (Current)
- ✅ 102 predefined settings across 11 categories
- ✅ Enhanced UI with smart input types
- ✅ File upload for branding assets
- ✅ Email and SMS testing
- ✅ Bulk update functionality
- ✅ Validation functions
- ✅ Utility functions with caching
- ✅ Context processor for templates
- ✅ Comprehensive test suite
- ✅ Full documentation
