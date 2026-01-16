import os
import django
import sys

# Add project root to path
sys.path.append('/home/dev/smart_vehicle_repairs_system')

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.notifications_app.models import NotificationTemplate

# Create Custom WhatsApp Template
template, created = NotificationTemplate.objects.get_or_create(
    template_type='custom',
    channel='whatsapp_manual',
    defaults={
        'name': 'Default Custom WhatsApp',
        'body': 'Hello {customer_name}, \n\n',
        'sms_body': 'Hello {customer_name}, \n\n',
        'is_active': True
    }
)

if created:
    print(f"Created template: {template}")
else:
    print(f"Template already exists: {template}")

# Also create one for 'customer' type if generic
NotificationTemplate.objects.get_or_create(
    template_type='user_welcome',
    channel='whatsapp_manual',
    defaults={
        'name': 'Welcome WhatsApp',
        'body': 'Hello {customer_name}, welcome to our shop!',
        'sms_body': 'Hello {customer_name}, welcome to our shop!',
        'is_active': True
    }
)
