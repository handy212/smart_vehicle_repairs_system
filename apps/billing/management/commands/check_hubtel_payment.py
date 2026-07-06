"""
Management command to check Hubtel payment status
Usage: python manage.py check_hubtel_payment <transaction_id>
"""
from django.core.management.base import BaseCommand
from apps.billing.hubtel_payment import check_payment_status, is_hubtel_payment_available


class Command(BaseCommand):
    help = 'Check status of a Hubtel payment transaction'

    def add_arguments(self, parser):
        parser.add_argument('transaction_id', type=str, help='Hubtel transaction ID')

    def handle(self, *args, **options):
        transaction_id = options['transaction_id']

        self.stdout.write("\n" + "=" * 70)
        self.stdout.write(self.style.SUCCESS("HUBTEL PAYMENT STATUS CHECK"))
        self.stdout.write("=" * 70 + "\n")

        # Check if Hubtel payment is available
        if not is_hubtel_payment_available():
            self.stdout.write(self.style.ERROR("❌ Hubtel Payment Gateway is not configured"))
            return

        self.stdout.write(f"Checking transaction: {transaction_id}\n")

        # Check status
        success, status_data = check_payment_status(transaction_id)

        if success:
            status = status_data.get('status')
            
            if status == 'success':
                self.stdout.write(self.style.SUCCESS("\n✅ PAYMENT SUCCESSFUL!"))
            elif status == 'pending':
                self.stdout.write(self.style.WARNING("\n⏳ PAYMENT PENDING"))
            elif status == 'failed':
                self.stdout.write(self.style.ERROR("\n❌ PAYMENT FAILED"))
            
            self.stdout.write(f"\nDetails:")
            self.stdout.write(f"  Transaction ID: {status_data.get('transaction_id')}")
            self.stdout.write(f"  Status: {status_data.get('status')}")
            self.stdout.write(f"  Amount: GHS {status_data.get('amount')}")
            self.stdout.write(f"  Phone: {status_data.get('phone')}")
            self.stdout.write(f"  Reference: {status_data.get('reference')}")
            self.stdout.write(f"  Timestamp: {status_data.get('timestamp')}")

        else:
            self.stdout.write(self.style.ERROR(f"\n❌ FAILED TO CHECK STATUS"))
            self.stdout.write(f"Error: {status_data}")

        self.stdout.write("\n" + "=" * 70 + "\n")
