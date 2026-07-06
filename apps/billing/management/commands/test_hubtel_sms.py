"""
Test Hubtel SMS integration
Sends a test SMS message
"""
from django.core.management.base import BaseCommand
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))

from apps.notifications_app.hubtel_sms import (
    send_sms,
    is_hubtel_available,
    format_phone_number,
    validate_phone_number
)


class Command(BaseCommand):
    help = 'Test Hubtel SMS integration by sending a test message'

    def add_arguments(self, parser):
        parser.add_argument(
            'phone_number',
            type=str,
            help='Phone number to send test SMS to (e.g., 0244123456 or 233244123456)'
        )
        parser.add_argument(
            '--message',
            type=str,
            default='Test SMS from Vehicle Repairs System via Hubtel',
            help='Custom message to send (default: test message)'
        )

    def handle(self, *args, **options):
        phone_number = options['phone_number']
        message = options['message']
        
        self.stdout.write(self.style.NOTICE('Testing Hubtel SMS integration...'))
        
        # Check if Hubtel is configured
        if not is_hubtel_available():
            self.stdout.write(self.style.ERROR(
                'Hubtel SMS is not configured. Please set the following environment variables:'
            ))
            self.stdout.write('- HUBTEL_CLIENT_ID')
            self.stdout.write('- HUBTEL_CLIENT_SECRET')
            self.stdout.write('- HUBTEL_FROM')
            self.stdout.write('- HUBTEL_SMS_ENABLED=True')
            return
        
        self.stdout.write(self.style.SUCCESS('✓ Hubtel SMS is configured'))
        
        # Validate phone number
        is_valid, validation_message = validate_phone_number(phone_number)
        if not is_valid:
            self.stdout.write(self.style.ERROR(f'✗ Invalid phone number: {validation_message}'))
            return
        
        self.stdout.write(self.style.SUCCESS(f'✓ Phone number is valid'))
        
        # Format phone number
        formatted_phone = format_phone_number(phone_number)
        self.stdout.write(f'Formatted phone number: {formatted_phone}')
        
        # Send SMS
        self.stdout.write(self.style.NOTICE(f'\nSending SMS...'))
        self.stdout.write(f'To: {formatted_phone}')
        self.stdout.write(f'Message: {message}')
        
        success, response = send_sms(phone_number, message)
        
        if success:
            self.stdout.write(self.style.SUCCESS('\n✓ SMS sent successfully!'))
            self.stdout.write(f'Response: {response}')
        else:
            self.stdout.write(self.style.ERROR(f'\n✗ SMS sending failed'))
            self.stdout.write(f'Error: {response}')
            return
        
        self.stdout.write(self.style.SUCCESS('\n✓ Hubtel SMS test completed successfully'))
