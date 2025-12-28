import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.billing.models import Payment
from apps.core.services.print_service import generate_receipt_pdf

def verify():
    try:
        # Get a payment
        payment = Payment.objects.first()
        
        if not payment:
            print("No payments found. Cannot verify.")
            return

        print(f"Generating PDF for Payment #{payment.payment_number}...")
        response = generate_receipt_pdf(payment)
        
        output_filename = f"receipt_{payment.payment_number}_test.pdf"
        with open(output_filename, 'wb') as f:
            f.write(response.content)
            
        print(f"Success! PDF generated: {output_filename}")
        print(f"Size: {os.path.getsize(output_filename)} bytes")
        
    except Exception as e:
        print(f"FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    verify()
