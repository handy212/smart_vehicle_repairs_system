import os
import django
from decimal import Decimal
from datetime import date
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.billing.models import Invoice, Payment
from apps.customers.models import Customer
from apps.branches.models import Branch
from apps.accounts.models import User

def create_test_data():
    try:
        # Get or create user
        user = User.objects.first()
        if not user:
            user = User.objects.create(username='admin', email='admin@example.com')
            
        # Get or create branch
        branch = Branch.objects.first()
        if not branch:
            branch = Branch.objects.create(
                name="Headquarters",
                code="HQ",
                phone="555-0100"
            )
            
        # Get or create customer
        customer, _ = Customer.objects.get_or_create(
            first_name="Jane",
            last_name="Doe",
            defaults={
                'email': 'jane@example.com',
                'phone': '555-0200',
                'address_line1': '789 Oak St',
                'city': 'Metropolis',
                'state': 'NY',
                'zip_code': '10001',
                'branch': branch
            }
        )
        
        # Create Invoice
        invoice = Invoice.objects.create(
            customer=customer,
            branch=branch,
            status='partial',
            invoice_date=date.today(),
            subtotal=Decimal('100.00'),
            total=Decimal('100.00'),
            amount_due=Decimal('50.00'),
            amount_paid=Decimal('50.00'),
            created_by=user
        )
        
        # Create Payment
        payment = Payment.objects.create(
            invoice=invoice,
            customer=customer,
            amount=Decimal('50.00'),
            payment_method='credit_card',
            status='completed',
            payment_date=django.utils.timezone.now(),
            reference_number='TXN123456789',
            processed_by=user,
            card_last_four='4242',
            card_type='Visa'
        )
        
        print(f"Created Test Payment: {payment.payment_number} for Invoice: {invoice.invoice_number}")
        
    except Exception as e:
        print(f"FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    create_test_data()
