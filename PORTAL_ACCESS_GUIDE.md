# Customer Portal Access Guide

## How to Access the Customer Portal

### Option 1: Direct URL Access
Once you have a customer account, you can access the portal directly at:
```
http://localhost:3000/portal
```

### Option 2: Through Login Page
1. Go to: `http://localhost:3000/login`
2. Login with a customer account
3. You'll be automatically redirected to `/portal` if you have the `customer` role

## Creating a Customer Account

### Method 1: Through Django Admin (Recommended for Testing)
1. Access Django admin: `http://localhost:8080/admin/`
2. Go to **Users** → **Add User**
3. Create a user with:
   - **Role**: `customer`
   - **Is Active**: ✅ (checked)
   - **Is Staff**: ❌ (unchecked)
4. Go to **Customers** → **Add Customer**
5. Link the customer profile to the user you just created

### Method 2: Through API (Programmatic)
You can create a customer via the API:
```bash
# First, create a user account
curl -X POST http://localhost:8080/api/auth/users/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "password": "testpass123",
    "first_name": "John",
    "last_name": "Doe",
    "role": "customer"
  }'

# Then create customer profile (requires authentication)
curl -X POST http://localhost:8080/api/customers/customers/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_type": "individual"
  }'
```

### Method 3: Using Django Shell
```python
python manage.py shell

from apps.accounts.models import User
from apps.customers.models import Customer

# Create customer user
user = User.objects.create_user(
    username='customer@example.com',
    email='customer@example.com',
    password='testpass123',
    first_name='John',
    last_name='Doe',
    role='customer',
    is_active=True,
    is_staff=False
)

# Create customer profile
customer = Customer.objects.create(
    user=user,
    customer_type='individual'
)

print(f"Customer created: {user.email}")
```

## Portal Features

Once logged in, customers can access:

1. **Dashboard** (`/portal`)
   - Overview of vehicles, appointments, invoices
   - Quick stats and recent activity

2. **My Vehicles** (`/portal/vehicles`)
   - View all registered vehicles
   - Vehicle details and service history

3. **My Appointments** (`/portal/appointments`)
   - View upcoming and past appointments
   - Filter by status

4. **My Invoices** (`/portal/invoices`)
   - View all invoices
   - Make payments via Paystack

5. **My Estimates** (`/portal/estimates`)
   - View service estimates
   - Approve or decline estimates

6. **Service History** (`/portal/history`)
   - View work orders and inspections
   - Filter by vehicle

7. **Book Appointment** (`/portal/book`)
   - Schedule new service appointments

8. **Settings** (`/portal/settings`)
   - Update profile information
   - Change password

## Testing Checklist

- [ ] Create a customer account
- [ ] Login and verify redirect to `/portal`
- [ ] Test dashboard page loads
- [ ] Test vehicle listing (if vehicles exist)
- [ ] Test appointment booking
- [ ] Test invoice viewing
- [ ] Test payment flow (Paystack integration)
- [ ] Test profile settings
- [ ] Test password change
- [ ] Verify non-customer users are redirected to `/dashboard`

## Troubleshooting

### Issue: Redirected to `/dashboard` instead of `/portal`
**Solution**: Check that the user's `role` field is set to `"customer"` in the database.

### Issue: "Access denied" or "Customer profile not found"
**Solution**: Ensure the user has a linked `Customer` profile in the database.

### Issue: Portal pages show "No data"
**Solution**: 
- Create test data (vehicles, appointments, invoices) linked to the customer
- Or use the admin panel to create sample data

### Issue: Payment page doesn't work
**Solution**: 
- Ensure Paystack credentials are configured in backend settings
- Check browser console for API errors

## Quick Test Script

Run this in Django shell to create a complete test customer with sample data:

```python
from apps.accounts.models import User
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle

# Create customer
user = User.objects.create_user(
    username='testcustomer@example.com',
    email='testcustomer@example.com',
    password='test123',
    first_name='Test',
    last_name='Customer',
    role='customer',
    is_active=True
)

customer = Customer.objects.create(user=user, customer_type='individual')

# Create a test vehicle
vehicle = Vehicle.objects.create(
    vin='1HGBH41JXMN109186',
    make='Honda',
    model='Civic',
    year=2020,
    license_plate='ABC123',
    owner=customer,
    status='active'
)

print(f"✅ Test customer created!")
print(f"   Email: {user.email}")
print(f"   Password: test123")
print(f"   Portal URL: http://localhost:3000/portal")
```

