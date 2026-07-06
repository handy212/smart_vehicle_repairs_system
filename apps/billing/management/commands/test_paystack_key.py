"""
Management command to test Paystack API key
"""
from django.core.management.base import BaseCommand
from django.conf import settings
import requests


class Command(BaseCommand):
    help = 'Test Paystack API key by making a simple API call'

    def handle(self, *args, **options):
        secret_key = getattr(settings, 'PAYSTACK_SECRET_KEY', None)
        
        if not secret_key:
            self.stdout.write(self.style.ERROR('PAYSTACK_SECRET_KEY not found in settings'))
            return
        
        secret_key = secret_key.strip()
        
        self.stdout.write(f'Testing Paystack key: {secret_key[:15]}...')
        self.stdout.write(f'Key length: {len(secret_key)}')
        self.stdout.write(f'Key format: {"✓ Valid" if (secret_key.startswith("sk_live_") or secret_key.startswith("sk_test_")) else "✗ Invalid"}')
        
        # Test by calling Paystack's balance endpoint (requires valid key)
        headers = {
            'Authorization': f'Bearer {secret_key}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.get(
                'https://api.paystack.co/balance',
                headers=headers,
                timeout=10
            )
            
            self.stdout.write(f'\nHTTP Status: {response.status_code}')
            
            if response.status_code == 200:
                data = response.json()
                if data.get('status'):
                    balance_data = data.get('data', [])
                    self.stdout.write(self.style.SUCCESS('✓ Paystack key is VALID'))
                    if balance_data:
                        self.stdout.write(f'Account balances: {balance_data}')
                else:
                    self.stdout.write(self.style.ERROR(f'✗ Paystack returned error: {data.get("message")}'))
            else:
                error_data = response.json() if response.content else {}
                error_msg = error_data.get('message', f'HTTP {response.status_code}')
                self.stdout.write(self.style.ERROR(f'✗ Paystack API error: {error_msg}'))
                self.stdout.write(f'Full response: {error_data}')
                
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error testing Paystack key: {e}'))

