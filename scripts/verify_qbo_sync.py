import os
import django
import sys

sys.path.append('/home/dev/smart_vehicle_repairs_system')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from apps.customers.models import Customer
from apps.quickbooks_online.services import QuickBooksService
from apps.quickbooks_online.models import QBOMapping
from django.contrib.contenttypes.models import ContentType
import random

def verify_sync():
    print("--- QBO Sync Verification ---")
    
    # 1. Create a Test Customer
    # customer_number = f"TEST-{random.randint(1000, 9999)}"
    customer_number = "TEST-3834"
    print(f"Using test customer: {customer_number}")
    
    from django.contrib.auth import get_user_model
    User = get_user_model()
    
    username = f"test_user_{customer_number}"
    email = f"test.{customer_number}@example.com"
    
    user, created = User.objects.get_or_create(
        username=username,
        defaults={
            'email': email,
            'first_name': 'Test',
            'last_name': 'QBO-Sync',
            'role': 'customer',
            'is_active': True
        }
    )
    
    if created:
        user.set_password('testpass123')
        user.save()
        
    customer, created = Customer.objects.get_or_create(
        customer_number=customer_number,
        defaults={
            'user': user,
            'customer_type': 'individual',
            'status': 'active'
        }
    )
    
    if not created:
        print("Using existing test customer.")
    
    # 2. Trigger Sync manually
    print("Intializing QuickBooksService...")
    service = QuickBooksService()
    
    print(f"Calling sync_customer for {customer.customer_number}...")
    try:
        qb_customer = service.sync_customer(customer)
        if qb_customer:
            print(f"✅ SUCCESS! Synced Customer to QBO ID: {qb_customer.Id}")
        else:
            print("❌ FAILED: sync_customer returned None.")
            return

        # 3. Create Test Invoice
        from apps.billing.models import Invoice
        from django.utils import timezone
        from decimal import Decimal
        
        print("\n--- Testing Invoice Sync ---")
        invoice_number = f"INV-{customer_number}"
        print(f"Creating test invoice: {invoice_number}")
        
        from apps.branches.models import Branch
        branch = Branch.objects.first()
        if not branch:
            # Create dummy branch if none exists
            branch = Branch.objects.create(name="Head Office", code="HO", is_active=True)
            
        invoice, created = Invoice.objects.get_or_create(
            invoice_number=invoice_number,
            defaults={
                'customer': customer,
                'branch': branch,
                'status': 'draft',
                'invoice_date': timezone.now().date(),
                'due_date': timezone.now().date(),
                'labor_subtotal': Decimal('100.00'),
                'parts_subtotal': Decimal('50.00'),
                'total': Decimal('150.00'),
                'subtotal': Decimal('150.00'), # Explicitly set subtotal
                'amount_due': Decimal('150.00'), # Explicitly set amount due
                'notes': 'Test Invoice for QBO Sync',
                'created_by': customer.user
            }
        )
        
        # Force update fields in case invoice already existed with 0/wrong values
        invoice.branch = branch
        invoice.subtotal = Decimal('150.00')
        invoice.total = Decimal('150.00')
        invoice.tax_amount = Decimal('0.00')
        invoice.amount_due = Decimal('150.00')
        invoice.clean() # Optional but good
        invoice.save()
        
        # Create Line Items to satisfy Accounting Service balance check
        from apps.billing.models import InvoiceLineItem
        
        # Labor Line
        InvoiceLineItem.objects.get_or_create(
            invoice=invoice,
            description="Test Labor",
            defaults={
                'item_type': 'labor',
                'labor_hours': Decimal('1.0'),
                'labor_rate': Decimal('100.00'),
                'total': Decimal('100.00'),
                'is_taxable': False 
            }
        )
        
        # Parts Line
        InvoiceLineItem.objects.get_or_create(
            invoice=invoice,
            description="Test Part",
            defaults={
                'item_type': 'part',
                'quantity': Decimal('1.0'),
                'unit_price': Decimal('50.00'),
                'total': Decimal('50.00'),
                'is_taxable': False
            }
        )
        
        # Trigger Invoice Sync
        print(f"Calling sync_invoice for {invoice.invoice_number}...")
        qb_invoice = service.sync_invoice(invoice)
        if qb_invoice:
            print(f"✅ SUCCESS! Synced Invoice to QBO ID: {qb_invoice.Id}")
            if qb_invoice.DepartmentRef:
                print(f"   - Branch synced as Department ID: {qb_invoice.DepartmentRef.value}")
            else:
                print("   ⚠️ WARNING: DepartmentRef not set on Invoice.")
        else:
            print("❌ FAILED: sync_invoice returned None.")
            return

        # 4. Create Test Payment
        from apps.billing.models import Payment
        print("\n--- Testing Payment Sync ---")
        payment_number = f"PAY-{customer_number}"
        print(f"Creating test payment: {payment_number}")
        
        payment, created = Payment.objects.get_or_create(
            payment_number=payment_number,
            defaults={
                'invoice': invoice,
                'customer': customer,
                'amount': Decimal('150.00'),
                'payment_method': 'cash',
                'status': 'completed',
                'payment_date': timezone.now(),
                'notes': 'Full payment for test invoice',
                'processed_by': customer.user
            }
        )
        
        # Trigger Payment Sync
        print(f"Calling sync_payment for {payment.payment_number}...")
        qb_payment = service.sync_payment(payment)
        if qb_payment:
            print(f"✅ SUCCESS! Synced Payment to QBO ID: {qb_payment.Id}")
        else:
            print("❌ FAILED: sync_payment returned None.")

    except Exception as e:
        print(f"❌ EXCEPTION during sync: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    verify_sync()
