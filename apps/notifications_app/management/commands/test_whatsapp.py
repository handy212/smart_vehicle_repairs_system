"""
Management command to test WhatsApp integration
Usage: python manage.py test_whatsapp <phone_number> [--message "Your message"]
"""
from django.core.management.base import BaseCommand
from apps.notifications_app.whatsapp_service import get_whatsapp_service
from apps.accounts.settings_utils import get_whatsapp_settings


class Command(BaseCommand):
    help = 'Test WhatsApp integration by sending a test message'

    def add_arguments(self, parser):
        parser.add_argument(
            'phone_number',
            type=str,
            help='Phone number to send test message to (E.164 format without +, e.g., 233244123456)'
        )
        parser.add_argument(
            '--message',
            type=str,
            default='Hello! This is a test message from Smart Vehicle Repairs System.',
            help='Message to send (default: test message)'
        )
        parser.add_argument(
            '--template',
            type=str,
            help='Name of the template to send (e.g. hello_world). If provided, sends a template message instead of text.'
        )
        parser.add_argument(
            '--check-config',
            action='store_true',
            help='Only check WhatsApp configuration without sending'
        )

    def handle(self, *args, **options):
        phone_number = options['phone_number']
        message = options['message']
        template = options['template']
        check_only = options['check_config']

        # Display current configuration
        self.stdout.write(self.style.WARNING('\n=== WhatsApp Configuration ==='))
        settings = get_whatsapp_settings()
        
        self.stdout.write(f"Enabled: {settings.get('whatsapp_enabled')}")
        self.stdout.write(f"Phone Number ID: {settings.get('whatsapp_phone_number_id', 'NOT SET')[:20]}...")
        self.stdout.write(f"Access Token: {'SET' if settings.get('whatsapp_access_token') else 'NOT SET'}")
        self.stdout.write(f"API Version: {settings.get('whatsapp_api_version')}")
        
        # Get service instance
        service = get_whatsapp_service()
        
        if not service.is_available():
            self.stdout.write(self.style.ERROR('\n✗ WhatsApp service is NOT available!'))
            self.stdout.write(self.style.ERROR('Please configure the following in System Settings or .env:'))
            self.stdout.write('  - whatsapp_enabled = true')
            self.stdout.write('  - whatsapp_access_token = <your_token>')
            self.stdout.write('  - whatsapp_phone_number_id = <your_phone_number_id>')
            return
        
        self.stdout.write(self.style.SUCCESS('\n✓ WhatsApp service is configured'))
        
        if check_only:
            return
        
        # Send test message
        self.stdout.write(f'\n=== Sending Test Message ===')
        self.stdout.write(f'To: {phone_number}')
        
        if template:
            self.stdout.write(f'Template: {template}')
            
            components = []
            # Add dummy variables for invoice_generated template
            if template == 'invoice_generated':
                # Body variables: {{1}} Name, {{2}} Invoice #, {{3}} Vehicle, {{4}} Amount
                components.append({
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": "John Doe"},
                        {"type": "text", "text": "INV-001"},
                        {"type": "text", "text": "Toyota Camry"},
                        {"type": "text", "text": "150.00"}
                    ]
                })
                # Button variable: {{1}} URL suffix (Invoice ID)
                components.append({
                    "type": "button",
                    "sub_type": "url",
                    "index": "0",
                    "parameters": [
                        {"type": "text", "text": "123"}
                    ]
                })
                
            success, result = service.send_template_message(phone_number, template, components=components)
        else:
            self.stdout.write(f'Message: {message}')
            success, result = service.send_message(phone_number, message)
        
        if success:
            self.stdout.write(self.style.SUCCESS(f'\n✓ Message sent successfully!'))
            self.stdout.write(f'Message ID: {result}')
        else:
            self.stdout.write(self.style.ERROR(f'\n✗ Failed to send message'))
            self.stdout.write(self.style.ERROR(f'Error: {result}'))
