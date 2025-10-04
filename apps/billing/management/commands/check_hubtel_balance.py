"""
Check Hubtel SMS balance
Displays available SMS credits
"""
from django.core.management.base import BaseCommand
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))

from apps.notifications_app.hubtel_sms import (
    get_sms_balance,
    is_hubtel_available
)


class Command(BaseCommand):
    help = 'Check Hubtel SMS credit balance'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('Checking Hubtel SMS balance...'))
        
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
        
        # Get balance
        success, response = get_sms_balance()
        
        if success:
            self.stdout.write(self.style.SUCCESS('\n✓ SMS balance retrieved successfully!'))
            
            # Display balance information
            if isinstance(response, dict):
                balance = response.get('balance', 'Unknown')
                currency = response.get('currency', 'GHS')
                self.stdout.write(f'\nCurrent Balance: {balance} {currency}')
                
                if 'credits' in response:
                    self.stdout.write(f'Available Credits: {response["credits"]}')
            else:
                self.stdout.write(f'Balance: {response}')
        else:
            self.stdout.write(self.style.ERROR(f'\n✗ Failed to retrieve balance'))
            self.stdout.write(f'Error: {response}')
