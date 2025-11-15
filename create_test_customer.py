#!/usr/bin/env python3
"""
Quick script to create a test customer account for portal testing
"""
import os
import sys
import django

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.accounts.models import User
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle

def create_test_customer():
    """Create a test customer with sample data"""
    
    email = 'customer@example.com'
    password = 'test123'
    
    # Check if user already exists
    if User.objects.filter(email=email).exists():
        user = User.objects.get(email=email)
        print(f"⚠️  User {email} already exists!")
        print(f"   Updating to ensure it's a customer...")
        user.role = 'customer'
        user.is_active = True
        user.is_staff = False
        user.save()
    else:
        # Create user
        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name='Test',
            last_name='Customer',
            role='customer',
            is_active=True,
            is_staff=False
        )
        print(f"✅ Created user: {email}")
    
    # Check if customer profile exists
    if hasattr(user, 'customer_profile'):
        customer = user.customer_profile
        print(f"✅ Customer profile already exists")
    else:
        customer = Customer.objects.create(
            user=user,
            customer_type='individual'
        )
        print(f"✅ Created customer profile")
    
    # Create a test vehicle if none exists
    if not Vehicle.objects.filter(owner=customer).exists():
        vehicle = Vehicle.objects.create(
            vin='1HGBH41JXMN109186',
            make='Honda',
            model='Civic',
            year=2020,
            license_plate='TEST123',
            owner=customer,
            status='active',
            current_mileage=25000
        )
        print(f"✅ Created test vehicle: {vehicle.year} {vehicle.make} {vehicle.model}")
    
    print("\n" + "="*60)
    print("🎉 Test Customer Account Ready!")
    print("="*60)
    print(f"Email:    {email}")
    print(f"Password: {password}")
    print(f"\nPortal URL: http://localhost:3000/portal")
    print(f"Login URL:  http://localhost:3000/login")
    print("="*60)

if __name__ == '__main__':
    create_test_customer()

