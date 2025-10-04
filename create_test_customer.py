#!/usr/bin/env python
"""
Quick script to create a test customer with portal access
Usage: python create_test_customer.py
"""

import os
import sys
import django

# Setup Django environment
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.accounts.models import User
from apps.customers.models import Customer

def create_test_customer():
    """Create a test customer with portal access"""
    
    print("=" * 60)
    print("Creating Test Customer for Portal Access")
    print("=" * 60)
    
    # Test customer data
    username = 'test_customer'
    email = 'customer@test.com'
    password = 'TestPass123!'
    
    # Check if user already exists
    if User.objects.filter(username=username).exists():
        print(f"\n⚠️  User '{username}' already exists!")
        response = input("Do you want to recreate it? (yes/no): ").lower()
        if response != 'yes':
            print("❌ Operation cancelled.")
            return
        
        # Delete existing user (will cascade delete customer profile)
        User.objects.filter(username=username).delete()
        print(f"✅ Deleted existing user '{username}'")
    
    print(f"\n📝 Creating new customer account...")
    
    # Step 1: Create User with customer role
    try:
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            role='customer',  # Important: Set role to 'customer'
            first_name='Test',
            last_name='Customer',
            phone='+233244123456',
            is_active=True
        )
        print(f"✅ User created: {user.username} (ID: {user.id})")
    except Exception as e:
        print(f"❌ Error creating user: {e}")
        return
    
    # Step 2: Create Customer profile
    try:
        # Generate next customer number
        last_customer = Customer.objects.order_by('-id').first()
        if last_customer and last_customer.customer_number:
            # Extract number from format like CUST-00005
            try:
                last_num = int(last_customer.customer_number.split('-')[-1])
                next_num = last_num + 1
            except (ValueError, IndexError):
                next_num = 1
        else:
            next_num = 1
        
        customer_number = f"CUST-{next_num:05d}"
        
        customer = Customer.objects.create(
            user=user,
            customer_number=customer_number,
            customer_type='individual',
            status='active',
            service_address='123 Test Street, Accra, Ghana',
            billing_address='123 Test Street, Accra, Ghana',
            preferred_contact_method='email'
        )
        print(f"✅ Customer profile created: {customer.customer_number}")
    except Exception as e:
        print(f"❌ Error creating customer profile: {e}")
        user.delete()  # Cleanup
        return
    
    # Step 3: Verify portal access
    print(f"\n🔍 Verifying portal access...")
    
    if hasattr(user, 'customer_profile'):
        print("✅ Customer profile linked successfully")
        print(f"   Customer Number: {user.customer_profile.customer_number}")
        print(f"   Customer Type: {user.customer_profile.customer_type}")
        print(f"   Status: {user.customer_profile.status}")
    else:
        print("❌ Customer profile not linked - Portal access will be denied")
        return
    
    # Success!
    print("\n" + "=" * 60)
    print("🎉 SUCCESS! Test customer created with portal access!")
    print("=" * 60)
    print(f"\n📋 Login Credentials:")
    print(f"   Portal URL: http://127.0.0.1:8000/portal/")
    print(f"   Username:   {username}")
    print(f"   Password:   {password}")
    print(f"   Email:      {email}")
    print(f"\n👤 Customer Details:")
    print(f"   Customer Number: {customer.customer_number}")
    print(f"   Name: {user.get_full_name()}")
    print(f"   Phone: {user.phone}")
    print(f"   Type: {customer.customer_type.capitalize()}")
    print(f"\n🚀 Next Steps:")
    print(f"   1. Make sure the development server is running:")
    print(f"      python manage.py runserver")
    print(f"   2. Open your browser and go to:")
    print(f"      http://127.0.0.1:8000/accounts/login/")
    print(f"   3. Login with the credentials above")
    print(f"   4. Navigate to the portal:")
    print(f"      http://127.0.0.1:8000/portal/")
    print("=" * 60)

if __name__ == '__main__':
    try:
        create_test_customer()
    except KeyboardInterrupt:
        print("\n\n❌ Operation cancelled by user.")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
