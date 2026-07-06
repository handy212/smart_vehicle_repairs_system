"""
Management command to test Hubtel SMS integration
Usage: python manage.py test_hubtel_sms <phone_number> [--message "Your message"]
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.notifications_app.hubtel_sms import (
    send_sms, is_hubtel_available, validate_phone_number,
    check_sms_balance
)

User = get_user_model()


class Command(BaseCommand):
    help = 'Test Hubtel SMS integration by sending a test message'

    def add_arguments(self, parser):
        parser.add_argument('phone_number', type=str, help='Phone number to send SMS to')
        parser.add_argument('--message', type=str, default='Test SMS from Smart Vehicle Repairs System',
                            help='Message to send')

    def handle(self, *args, **options):
        phone_number = options['phone_number']
        message = options['message']

        self.stdout.write("\n" + "=" * 70)
        self.stdout.write(self.style.SUCCESS("HUBTEL SMS TEST"))
        self.stdout.write("=" * 70 + "\n")

        # Check if Hubtel is available
        if not is_hubtel_available():
            self.stdout.write(self.style.ERROR("❌ Hubtel SMS is not configured"))
            self.stdout.write("\nPlease set the following environment variables:")
            self.stdout.write("  HUBTEL_CLIENT_ID=your_client_id")
            self.stdout.write("  HUBTEL_CLIENT_SECRET=your_client_secret")
            self.stdout.write("  HUBTEL_SMS_ENABLED=True")
            self.stdout.write("  HUBTEL_FROM=YourSenderName")
            return

        self.stdout.write(self.style.SUCCESS("✅ Hubtel SMS is configured\n"))

        # Validate phone number
        is_valid, formatted_phone, error = validate_phone_number(phone_number)
        
        if not is_valid:
            self.stdout.write(self.style.ERROR(f"❌ Invalid phone number: {error}"))
            self.stdout.write("\nExpected format examples:")
            self.stdout.write("  +233244123456")
            self.stdout.write("  0244123456")
            self.stdout.write("  233244123456")
            return

        self.stdout.write(f"Phone number: {phone_number}")
        self.stdout.write(f"Formatted: {formatted_phone}")
        self.stdout.write(f"Message: {message}")
        self.stdout.write(f"Length: {len(message)} characters\n")

        # Check balance
        self.stdout.write("Checking account balance...")
        success, balance = check_sms_balance()
        if success:
            self.stdout.write(self.style.SUCCESS(f"✅ Balance: {balance}"))
        else:
            self.stdout.write(self.style.WARNING(f"⚠️ Could not check balance: {balance}"))

        # Send SMS
        self.stdout.write("\nSending SMS...")
        success, response = send_sms(formatted_phone, message)

        if success:
            self.stdout.write(self.style.SUCCESS("\n✅ SMS SENT SUCCESSFULLY!"))
            self.stdout.write(f"\nDetails:")
            self.stdout.write(f"  Message ID: {response.get('message_id')}")
            self.stdout.write(f"  Status: {response.get('status')}")
            self.stdout.write(f"  Network: {response.get('network')}")
            self.stdout.write(f"  Phone: {response.get('phone')}")
            if response.get('rate'):
                self.stdout.write(f"  Cost: GHS {response.get('rate')}")
        else:
            self.stdout.write(self.style.ERROR(f"\n❌ FAILED TO SEND SMS"))
            self.stdout.write(f"Error: {response}")

        self.stdout.write("\n" + "=" * 70 + "\n")
