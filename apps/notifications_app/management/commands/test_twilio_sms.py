"""
Management command to test Twilio SMS integration.
Usage: python manage.py test_twilio_sms <phone_number> [--message "Your message"]
"""
from django.core.management.base import BaseCommand

from apps.notifications_app.sms_service import (
    TwilioSMSService,
    format_twilio_e164,
    get_twilio_config,
    is_twilio_available,
)


class Command(BaseCommand):
    help = 'Test Twilio SMS integration by sending a test message'

    def add_arguments(self, parser):
        parser.add_argument('phone_number', type=str, help='Phone number to send SMS to')
        parser.add_argument(
            '--message',
            type=str,
            default='Test SMS from Smart Vehicle Repairs System (Twilio)',
            help='Message to send',
        )

    def handle(self, *args, **options):
        phone_number = options['phone_number']
        message = options['message']

        self.stdout.write("\n" + "=" * 70)
        self.stdout.write(self.style.SUCCESS("TWILIO SMS TEST"))
        self.stdout.write("=" * 70 + "\n")

        if not is_twilio_available():
            self.stdout.write(self.style.ERROR("Twilio SMS is not configured"))
            self.stdout.write("\nSet real values (not your-twilio-* placeholders) for:")
            self.stdout.write("  TWILIO_ACCOUNT_SID")
            self.stdout.write("  TWILIO_AUTH_TOKEN")
            self.stdout.write("  TWILIO_PHONE_NUMBER  (or TWILIO_MESSAGING_SERVICE_SID)")
            self.stdout.write("\nOr configure the same keys under Admin → Integrations → SMS.")
            return

        config = get_twilio_config()
        formatted = format_twilio_e164(phone_number)
        if not formatted:
            self.stdout.write(self.style.ERROR(f"Invalid phone number: {phone_number}"))
            self.stdout.write("\nExpected formats: +233244123456, 0244123456, 233244123456")
            return

        self.stdout.write(self.style.SUCCESS("Twilio SMS is configured\n"))
        self.stdout.write(f"From: {config['phone_number'] or config['messaging_service_sid']}")
        self.stdout.write(f"To (raw): {phone_number}")
        self.stdout.write(f"To (E.164): {formatted}")
        self.stdout.write(f"Message: {message}")
        self.stdout.write(f"Length: {len(message)} characters\n")

        self.stdout.write("Sending SMS...")
        service = TwilioSMSService()
        success, result = service.send_sms(phone_number, message)

        if success:
            self.stdout.write(self.style.SUCCESS("\nSMS SENT SUCCESSFULLY!"))
            self.stdout.write(f"  Message SID: {result}")
        else:
            self.stdout.write(self.style.ERROR("\nFAILED TO SEND SMS"))
            self.stdout.write(f"Error: {result}")

        self.stdout.write("\n" + "=" * 70 + "\n")
