
import os
import sys
import django
from decimal import Decimal
from datetime import date, timedelta

# Setup Django environment
sys.path.append('/home/dev/smart_vehicle_repairs_system')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from django.conf import settings
settings.ALLOWED_HOSTS += ['testserver']

from apps.billing.models import Invoice, InvoiceLineItem
from apps.customers.models import Customer
from rest_framework.test import APIRequestFactory, force_authenticate
from apps.billing.views import InvoiceViewSet
from apps.vehicles.models import Vehicle
from apps.inventory.models import Part, PartCategory

from django.contrib.auth import get_user_model
User = get_user_model()

def run_verification():
    print("Verifying Phase 5: Proforma Invoices...")
    
    # Create test user
    user, _ = User.objects.get_or_create(
        username='test_admin', 
        defaults={'email': 'test@example.com', 'role': 'admin'}
    )
    
    # Create test customer user
    customer_user, _ = User.objects.get_or_create(
        username='proforma_customer',
        defaults={
            'email': 'proforma@test.com',
            'first_name': 'Proforma',
            'last_name': 'Tester',
            'role': 'customer'
        }
    )

    customer, _ = Customer.objects.get_or_create(
        user=customer_user,
        defaults={'customer_type': 'individual'}
    )
    
    # Use instance for owner
    vehicle, _ = Vehicle.objects.get_or_create(
        owner=customer, 
        make='Test', 
        model='Car', 
        year=2022, 
        defaults={
            'vin': 'VIN123456789',
            'current_mileage': 10000
        }
    )
    if not vehicle.vin:
        vehicle.vin = 'VIN123456789'
        vehicle.save()

    # Create category
    category, _ = PartCategory.objects.get_or_create(name='Test Category')

    part, _ = Part.objects.get_or_create(
        part_number='PRO-001', 
        defaults={
            'name': 'Proforma Part', 
            'cost_price': 100, 
            'selling_price': 150, 
            'quantity_in_stock': 10,
            'category': category
        }
    )
    
    # 1. Test Creating Proforma Invoice directly
    print("\n1. Testing Create Proforma Invoice via ViewSet...")
    factory = APIRequestFactory()
    view = InvoiceViewSet.as_view({'post': 'create'})
    
    payload = {
        'customer': customer.id,
        'vehicle': vehicle.id,
        'invoice_date': str(date.today()),
        'due_date': str(date.today() + timedelta(days=30)),
        'status': 'proforma',
        'line_items': [
            {
                'item_type': 'part',
                'description': 'Test Part',
                'quantity': 1,
                'unit_price': 150,
                'part': part.id,
                'is_taxable': False 
            }
        ]
    }
    
    request = factory.post('/api/billing/invoices/', payload, format='json')
    force_authenticate(request, user=user)
    response = view(request)
    
    if response.status_code != 201:
        print(f"FAILED to create invoice: {response.data}")
        return
        
    print(f"Response data: {response.data}")
    invoice_id = response.data['id']
    invoice = Invoice.objects.get(id=invoice_id)
    print(f"Created Invoice #{invoice.invoice_number} with status: {invoice.status}")
    
    if invoice.status != 'proforma':
        print(f"ERROR: Expected status 'proforma', got '{invoice.status}'")
    else:
        print("SUCCESS: Status is 'proforma'")

    # 2. Verify visibility in 'unpaid' list
    print("\n2. Verifying visibility in 'unpaid' list...")
    view_unpaid = InvoiceViewSet.as_view({'get': 'unpaid'})
    request_unpaid = factory.get('/api/billing/invoices/unpaid/')
    force_authenticate(request_unpaid, user=user)
    response_unpaid = view_unpaid(request_unpaid)
    
    # Check format of response. It might be paginated.
    if 'results' in response_unpaid.data:
        unpaid_ids = [inv['id'] for inv in response_unpaid.data['results']]
    else:
        unpaid_ids = [inv['id'] for inv in response_unpaid.data]
    
    if invoice_id in unpaid_ids:
        print("SUCCESS: Proforma invoice found in unpaid list")
    else:
        print("ERROR: Proforma invoice NOT found in unpaid list")
        
    # 3. Test Sending Proforma Invoice
    print("\n3. Testing Send Proforma Invoice...")
    view_send = InvoiceViewSet.as_view({'post': 'send'})
    request_send = factory.post(f'/api/billing/invoices/{invoice_id}/send/')
    force_authenticate(request_send, user=user)
    
    # Mock notification triggers to avoid errors
    from unittest.mock import patch
    with patch('apps.billing.views.notification_triggers') as mock_notify:
        response_send = view_send(request_send, pk=invoice_id)
        
    invoice.refresh_from_db()
    print(f"After send, status is: {invoice.status}")
    print(f"Sent at: {invoice.sent_at}")
    
    if invoice.status == 'proforma' and invoice.sent_at is not None:
        print("SUCCESS: Status remained 'proforma' and sent_at was set")
    else:
        print(f"ERROR: Status or sent_at incorrect. Status: {invoice.status}, Sent at: {invoice.sent_at}")

if __name__ == '__main__':
    run_verification()
