# Customer Portal Access Guide

**Date:** October 4, 2025  
**Status:** Active  
**Portal URL:** http://127.0.0.1:8000/portal/

---

## 📋 Overview

This guide explains how to grant customers access to the Customer Portal. The portal requires:
1. A User account with `role='customer'`
2. A Customer profile linked to that User account

---

## 🔐 Access Requirements

### What Customers Need
1. **User Account** - A Django user with role set to 'customer'
2. **Customer Profile** - A Customer model instance linked to the user
3. **Active Status** - Both user account and customer profile must be active

### Portal URL Structure
- **Portal Home:** `/portal/`
- **All Portal Pages:** `/portal/*`

---

## 🚀 Method 1: Create Customer via Django Admin (Recommended)

### Step 1: Create User Account
1. Go to Django Admin: http://127.0.0.1:8000/admin/
2. Navigate to **Accounts → Users**
3. Click **"Add User"**
4. Fill in required fields:
   ```
   Username: john_doe
   Password: [secure password]
   Password confirmation: [same password]
   ```
5. Click **"Save and continue editing"**

### Step 2: Set User Role to Customer
On the user detail page:
1. Set **Role:** to `Customer`
2. Set **Email:** (required for customer)
3. Fill in other details (optional):
   - First name
   - Last name
   - Phone number
   - Address
4. Check **Active** checkbox
5. Click **"Save"**

### Step 3: Create Customer Profile
1. Navigate to **Customers → Customers**
2. Click **"Add Customer"**
3. Fill in required fields:
   ```
   User: [Select the user you just created]
   Customer type: Individual / Business / Fleet
   Status: Active
   ```
4. Fill in optional contact details:
   - Company name (for business customers)
   - Preferred contact method
   - Service address
   - Billing address
5. Click **"Save"**

### Step 4: Test Access
1. Logout from admin
2. Login with the customer credentials
3. Navigate to: http://127.0.0.1:8000/portal/
4. You should see the customer dashboard! 🎉

---

## 🔧 Method 2: Create Customer via Django Shell

### Quick Command
```bash
cd /home/handy/smart_vehicle_repairs_system
source venv/bin/activate
python manage.py shell
```

### Complete Script
```python
from apps.accounts.models import User
from apps.customers.models import Customer

# Step 1: Create User with customer role
user = User.objects.create_user(
    username='john_doe',
    email='john@example.com',
    password='SecurePassword123!',
    role='customer',  # Important: Set role to 'customer'
    first_name='John',
    last_name='Doe',
    phone='+233244123456',
    is_active=True
)

print(f"✅ User created: {user.username} (ID: {user.id})")

# Step 2: Create Customer profile
customer = Customer.objects.create(
    user=user,
    customer_type='individual',
    status='active',
    service_address='123 Main Street, Accra',
    billing_address='123 Main Street, Accra',
    preferred_contact_method='email'
)

print(f"✅ Customer profile created: {customer.customer_number}")
print(f"✅ Portal access granted! Login at: http://127.0.0.1:8000/portal/")
print(f"   Username: {user.username}")
print(f"   Email: {user.email}")
```

### Verify Creation
```python
# Check if customer can access portal
if hasattr(user, 'customer_profile'):
    print("✅ Customer profile exists - Portal access: GRANTED")
    print(f"   Customer Number: {user.customer_profile.customer_number}")
    print(f"   Customer Type: {user.customer_profile.customer_type}")
else:
    print("❌ No customer profile - Portal access: DENIED")
```

---

## 🔄 Method 3: Upgrade Existing User to Customer

If you already have a user but they can't access the portal:

### Option A: Via Django Shell
```python
from apps.accounts.models import User
from apps.customers.models import Customer

# Get the existing user
user = User.objects.get(username='existing_username')

# Update role to customer
user.role = 'customer'
user.save()
print(f"✅ User role updated to: {user.role}")

# Create customer profile
customer = Customer.objects.create(
    user=user,
    customer_type='individual',
    status='active',
    service_address='Customer address',
    billing_address='Billing address'
)
print(f"✅ Customer profile created: {customer.customer_number}")
```

### Option B: Via Django Admin
1. Go to **Accounts → Users**
2. Find and click the user
3. Change **Role** to `Customer`
4. Save
5. Go to **Customers → Customers**
6. Click **"Add Customer"**
7. Select the user from dropdown
8. Fill in customer details
9. Save

---

## 📊 Method 4: Bulk Customer Creation

For creating multiple customers at once:

### Create Python Script
Save as `create_bulk_customers.py`:

```python
from django.core.management.base import BaseCommand
from apps.accounts.models import User
from apps.customers.models import Customer

customers_data = [
    {
        'username': 'jane_smith',
        'email': 'jane@example.com',
        'password': 'Password123!',
        'first_name': 'Jane',
        'last_name': 'Smith',
        'phone': '+233244111111',
        'customer_type': 'individual'
    },
    {
        'username': 'acme_corp',
        'email': 'info@acmecorp.com',
        'password': 'Password123!',
        'first_name': 'ACME',
        'last_name': 'Corporation',
        'phone': '+233244222222',
        'customer_type': 'business',
        'company_name': 'ACME Corporation'
    },
]

for data in customers_data:
    # Create user
    user = User.objects.create_user(
        username=data['username'],
        email=data['email'],
        password=data['password'],
        role='customer',
        first_name=data['first_name'],
        last_name=data['last_name'],
        phone=data.get('phone', ''),
        is_active=True
    )
    
    # Create customer profile
    customer = Customer.objects.create(
        user=user,
        customer_type=data.get('customer_type', 'individual'),
        company_name=data.get('company_name', ''),
        status='active',
        preferred_contact_method='email'
    )
    
    print(f"✅ Created: {customer.customer_number} - {user.username}")
```

### Run Script
```bash
cd /home/handy/smart_vehicle_repairs_system
source venv/bin/activate
python manage.py shell < create_bulk_customers.py
```

---

## ✅ Verification Checklist

After granting portal access, verify the following:

### 1. User Account Check
```python
from apps.accounts.models import User

user = User.objects.get(username='john_doe')
print(f"✅ Username: {user.username}")
print(f"✅ Role: {user.role}")  # Should be 'customer'
print(f"✅ Email: {user.email}")
print(f"✅ Active: {user.is_active}")  # Should be True
```

### 2. Customer Profile Check
```python
from apps.customers.models import Customer

customer = Customer.objects.get(user__username='john_doe')
print(f"✅ Customer Number: {customer.customer_number}")
print(f"✅ Status: {customer.status}")  # Should be 'active'
print(f"✅ Type: {customer.customer_type}")
```

### 3. Portal Access Check
```python
# Check if user can access portal
user = User.objects.get(username='john_doe')

if user.role == 'customer' and hasattr(user, 'customer_profile'):
    print("✅ PORTAL ACCESS: GRANTED")
    print(f"   Portal URL: http://127.0.0.1:8000/portal/")
    print(f"   Customer: {user.customer_profile.customer_number}")
else:
    print("❌ PORTAL ACCESS: DENIED")
    if user.role != 'customer':
        print(f"   Issue: User role is '{user.role}', not 'customer'")
    if not hasattr(user, 'customer_profile'):
        print(f"   Issue: No customer profile linked to user")
```

### 4. Login Test
1. Open browser
2. Go to: http://127.0.0.1:8000/accounts/login/
3. Login with customer credentials
4. Navigate to: http://127.0.0.1:8000/portal/
5. You should see the dashboard with:
   - Welcome message
   - Statistics cards
   - Quick action buttons
   - Recent appointments
   - Recent invoices
   - Vehicle list

---

## 🔍 Troubleshooting

### Issue 1: "Access denied. This portal is for customers only."

**Cause:** User doesn't have customer profile

**Solution:**
```python
from apps.accounts.models import User
from apps.customers.models import Customer

user = User.objects.get(username='your_username')

# Check if profile exists
if not hasattr(user, 'customer_profile'):
    # Create customer profile
    customer = Customer.objects.create(
        user=user,
        customer_type='individual',
        status='active'
    )
    print(f"✅ Customer profile created: {customer.customer_number}")
```

### Issue 2: User role is not 'customer'

**Cause:** User has different role (admin, technician, etc.)

**Solution:**
```python
from apps.accounts.models import User

user = User.objects.get(username='your_username')
user.role = 'customer'
user.save()
print(f"✅ User role updated to: {user.role}")
```

### Issue 3: Customer profile status is 'inactive'

**Cause:** Customer status set to inactive or suspended

**Solution:**
```python
from apps.customers.models import Customer

customer = Customer.objects.get(user__username='your_username')
customer.status = 'active'
customer.save()
print(f"✅ Customer status updated to: {customer.status}")
```

### Issue 4: User account is not active

**Cause:** User's `is_active` flag is False

**Solution:**
```python
from apps.accounts.models import User

user = User.objects.get(username='your_username')
user.is_active = True
user.save()
print(f"✅ User account activated")
```

---

## 📝 Management Commands (Optional)

You can create a custom management command for easier customer creation:

### Create Command File
`apps/customers/management/commands/create_customer.py`:

```python
from django.core.management.base import BaseCommand
from apps.accounts.models import User
from apps.customers.models import Customer

class Command(BaseCommand):
    help = 'Create a new customer with portal access'

    def add_arguments(self, parser):
        parser.add_argument('username', type=str, help='Username for the customer')
        parser.add_argument('email', type=str, help='Email address')
        parser.add_argument('--password', type=str, default='Password123!', help='Password (default: Password123!)')
        parser.add_argument('--first-name', type=str, default='', help='First name')
        parser.add_argument('--last-name', type=str, default='', help='Last name')
        parser.add_argument('--phone', type=str, default='', help='Phone number')
        parser.add_argument('--type', type=str, default='individual', choices=['individual', 'business', 'fleet'])

    def handle(self, *args, **options):
        username = options['username']
        email = options['email']
        
        # Check if user exists
        if User.objects.filter(username=username).exists():
            self.stdout.write(self.style.ERROR(f'❌ User "{username}" already exists'))
            return
        
        # Create user
        user = User.objects.create_user(
            username=username,
            email=email,
            password=options['password'],
            role='customer',
            first_name=options['first_name'],
            last_name=options['last_name'],
            phone=options['phone'],
            is_active=True
        )
        
        # Create customer profile
        customer = Customer.objects.create(
            user=user,
            customer_type=options['type'],
            status='active',
            preferred_contact_method='email'
        )
        
        self.stdout.write(self.style.SUCCESS(f'✅ Customer created successfully!'))
        self.stdout.write(f'   Customer Number: {customer.customer_number}')
        self.stdout.write(f'   Username: {username}')
        self.stdout.write(f'   Email: {email}')
        self.stdout.write(f'   Portal URL: http://127.0.0.1:8000/portal/')
```

### Usage
```bash
# Create individual customer
python manage.py create_customer john_doe john@example.com --first-name John --last-name Doe --phone "+233244123456"

# Create business customer
python manage.py create_customer acme_corp info@acme.com --type business --first-name ACME --last-name Corp
```

---

## 🎯 Quick Reference

### Minimum Requirements for Portal Access
```python
# 1. User with customer role
user.role = 'customer'
user.is_active = True

# 2. Customer profile linked to user
customer = Customer(user=user, status='active')
```

### Quick Access Test
```bash
# Test if specific user can access portal
python manage.py shell -c "
from apps.accounts.models import User
user = User.objects.get(username='USERNAME_HERE')
can_access = user.role == 'customer' and hasattr(user, 'customer_profile') and user.is_active
print(f'Portal Access: {\"✅ GRANTED\" if can_access else \"❌ DENIED\"}')
"
```

### List All Portal Users
```bash
python manage.py shell -c "
from apps.accounts.models import User
from apps.customers.models import Customer

portal_users = User.objects.filter(role='customer', is_active=True)
print(f'Total Portal Users: {portal_users.count()}')
print('\nPortal Users:')
for user in portal_users:
    has_profile = hasattr(user, 'customer_profile')
    status = '✅ ACTIVE' if has_profile else '❌ NO PROFILE'
    customer_num = user.customer_profile.customer_number if has_profile else 'N/A'
    print(f'  {status} | {user.username:20s} | {customer_num}')
"
```

---

## 🔗 Related Documentation

- [PHASE12_CUSTOMER_PORTAL_COMPLETE.md](./PHASE12_CUSTOMER_PORTAL_COMPLETE.md) - Portal features
- [PHASE12_PORTAL_BUGFIX.md](./PHASE12_PORTAL_BUGFIX.md) - Recent bug fixes
- [User Model](../apps/accounts/models.py) - User model definition
- [Customer Model](../apps/customers/models.py) - Customer model definition

---

## 📞 Support

If you encounter any issues granting portal access:

1. Check Django logs: `logs/django.log`
2. Verify user role: Should be 'customer'
3. Verify customer profile exists
4. Check user is active
5. Run verification checklist above

---

**Last Updated:** October 4, 2025  
**Portal Version:** Phase 12  
**Status:** ✅ Active and Ready
