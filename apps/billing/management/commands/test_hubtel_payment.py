"""
Management command to test Hubtel Payment Gateway integration
Usage: python manage.py test_hubtel_payment <phone_number> <amount> [--network mtn]
"""
from django.core.management.base import BaseCommand
from decimal import Decimal
from apps.billing.hubtel_payment import (
    initiate_mobile_money_payment,
    check_payment_status,
    is_hubtel_payment_available,
    get_supported_networks
)


class Command(BaseCommand):
    help = 'Test Hubtel payment gateway integration'

    def add_arguments(self, parser):
        parser.add_argument('phone_number', type=str, help='Phone number for mobile money payment')
        parser.add_argument('amount', type=float, help='Amount to charge (GHS)')
        parser.add_argument('--network', type=str, default='mtn', 
                            choices=['mtn', 'vodafone', 'airtel-tigo'],
                            help='Mobile money network')
        parser.add_argument('--description', type=str, default='Test payment',
                            help='Payment description')

    def handle(self, *args, **options):
        phone_number = options['phone_number']
        amount = options['amount']
        network = options['network']
        description = options['description']

        self.stdout.write("\n" + "=" * 70)
        self.stdout.write(self.style.SUCCESS("HUBTEL PAYMENT GATEWAY TEST"))
        self.stdout.write("=" * 70 + "\n")

        # Check if Hubtel payment is available
        if not is_hubtel_payment_available():
            self.stdout.write(self.style.ERROR("❌ Hubtel Payment Gateway is not configured"))
            self.stdout.write("\nPlease set the following environment variables:")
            self.stdout.write("  HUBTEL_MERCHANT_ID=your_merchant_id")
            self.stdout.write("  HUBTEL_API_KEY=your_api_key")
            self.stdout.write("  HUBTEL_API_SECRET=your_api_secret")
            self.stdout.write("  HUBTEL_PAYMENT_ENABLED=True")
            self.stdout.write("  HUBTEL_SANDBOX=True  # For testing")
            return

        self.stdout.write(self.style.SUCCESS("✅ Hubtel Payment Gateway is configured\n"))

        # Display supported networks
        networks = get_supported_networks()
        self.stdout.write("Supported Networks:")
        for code, name in networks.items():
            marker = "→" if code == network else " "
            self.stdout.write(f"  {marker} {code}: {name}")

        self.stdout.write(f"\nPayment Details:")
        self.stdout.write(f"  Phone: {phone_number}")
        self.stdout.write(f"  Amount: GHS {amount}")
        self.stdout.write(f"  Network: {network}")
        self.stdout.write(f"  Description: {description}\n")

        # Initiate payment
        self.stdout.write("Initiating payment...")
        success, response = initiate_mobile_money_payment(
            phone_number=phone_number,
            amount=amount,
            description=description,
            network=network
        )

        if success:
            self.stdout.write(self.style.SUCCESS("\n✅ PAYMENT INITIATED SUCCESSFULLY!"))
            self.stdout.write(f"\nDetails:")
            self.stdout.write(f"  Transaction ID: {response.get('transaction_id')}")
            self.stdout.write(f"  Status: {response.get('status')}")
            self.stdout.write(f"  Amount: GHS {response.get('amount')}")
            self.stdout.write(f"  Phone: {response.get('phone')}")
            self.stdout.write(f"  Reference: {response.get('reference')}")
            
            if response.get('checkout_url'):
                self.stdout.write(f"  Checkout URL: {response.get('checkout_url')}")

            self.stdout.write(self.style.WARNING("\n⚠️ Customer will receive a USSD prompt on their phone."))
            self.stdout.write("They need to enter their mobile money PIN to complete the payment.")

            # Offer to check status
            transaction_id = response.get('transaction_id')
            if transaction_id:
                self.stdout.write(f"\nTo check payment status, run:")
                self.stdout.write(f"  python manage.py check_hubtel_payment {transaction_id}")

        else:
            self.stdout.write(self.style.ERROR(f"\n❌ FAILED TO INITIATE PAYMENT"))
            self.stdout.write(f"Error: {response}")

        self.stdout.write("\n" + "=" * 70 + "\n")
