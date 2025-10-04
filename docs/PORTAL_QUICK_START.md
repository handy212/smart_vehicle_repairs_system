# Customer Portal - Quick Start Guide

**Created:** October 4, 2025  
**Status:** ✅ Ready to Use

---

## 🎯 Test Customer Created!

I've created a test customer account that you can use immediately to access the portal.

### 🔐 Login Credentials

```
Portal URL:  http://127.0.0.1:8000/portal/
Login URL:   http://127.0.0.1:8000/accounts/login/

Username:    test_customer
Password:    TestPass123!
Email:       customer@test.com
```

### 👤 Customer Details

```
Customer Number:  CUST-00006
Name:            Test Customer
Phone:           +233244123456
Type:            Individual
Status:          Active
```

---

## 🚀 How to Access the Portal

### Step 1: Start the Development Server
```bash
cd /home/handy/smart_vehicle_repairs_system
source venv/bin/activate
python manage.py runserver
```

### Step 2: Login
1. Open your browser
2. Go to: http://127.0.0.1:8000/accounts/login/
3. Enter credentials:
   - Username: `test_customer`
   - Password: `TestPass123!`
4. Click "Login"

### Step 3: Access Portal
1. After login, go to: http://127.0.0.1:8000/portal/
2. Or click "Portal Home" in the sidebar
3. You should see the customer dashboard! 🎉

---

## 📱 Portal Features Available

### 1. **Portal Home** (`/portal/`)
- Dashboard with statistics
- Quick action buttons
- Recent appointments
- Recent invoices
- Vehicle list

### 2. **My Vehicles** (`/portal/my-vehicles/`)
- View all your vehicles
- Service history per vehicle
- Book service appointments

### 3. **My Appointments** (`/portal/my-appointments/`)
- View upcoming appointments
- View past appointments
- Filter by status
- Cancel appointments
- Book new appointments

### 4. **My Invoices** (`/portal/my-invoices/`)
- View all invoices
- See payment status
- Total pending/paid amounts
- Pay invoices online

### 5. **Service History** (`/portal/my-history/`)
- Complete service timeline
- All work orders
- Vehicle inspections
- Filter by vehicle

### 6. **Book Appointment** (`/portal/book-appointment/`)
- 4-step booking wizard
- Select vehicle
- Choose service type
- Pick date and time
- Add notes

### 7. **Make Payment** (`/portal/payment/<invoice_id>/`)
- Pay invoices online
- Multiple payment methods:
  - Mobile Money (MTN, Vodafone, AirtelTigo)
  - Credit/Debit Card
  - Bank Transfer
  - Cash Payment

---

## 🔧 Creating More Customers

### Method 1: Use the Script (Easiest)
```bash
cd /home/handy/smart_vehicle_repairs_system
source venv/bin/activate
python create_test_customer.py
```

### Method 2: Django Admin
1. Go to: http://127.0.0.1:8000/admin/
2. Create User:
   - Accounts → Users → Add User
   - Set username, password
   - Set Role to "Customer"
   - Set email address
   - Mark as Active
3. Create Customer Profile:
   - Customers → Customers → Add Customer
   - Select the user you created
   - Fill in customer details
   - Set Status to "Active"
   - Save

### Method 3: Django Shell
```bash
python manage.py shell
```

```python
from apps.accounts.models import User
from apps.customers.models import Customer

# Create user
user = User.objects.create_user(
    username='new_customer',
    email='new@example.com',
    password='Password123!',
    role='customer',
    first_name='New',
    last_name='Customer',
    is_active=True
)

# Get next customer number
last_customer = Customer.objects.order_by('-id').first()
if last_customer:
    last_num = int(last_customer.customer_number.split('-')[-1])
    next_num = last_num + 1
else:
    next_num = 1

customer_number = f"CUST-{next_num:05d}"

# Create customer profile
customer = Customer.objects.create(
    user=user,
    customer_number=customer_number,
    customer_type='individual',
    status='active'
)

print(f"✅ Customer created: {customer.customer_number}")
```

---

## ✅ Access Requirements

For a user to access the portal, they need:

1. ✅ **User Account**
   - Role = 'customer'
   - is_active = True
   - Email address

2. ✅ **Customer Profile**
   - Linked to user account
   - Status = 'active'
   - Unique customer number

3. ✅ **Relationship**
   - User → Customer via `user.customer_profile`
   - Customer → User via `customer.user`

---

## 🔍 Verify Portal Access

### Quick Check
```bash
python manage.py shell -c "
from apps.accounts.models import User

user = User.objects.get(username='test_customer')
can_access = user.role == 'customer' and hasattr(user, 'customer_profile')
print(f'Portal Access: {\"✅ GRANTED\" if can_access else \"❌ DENIED\"}')
print(f'Role: {user.role}')
print(f'Has Profile: {hasattr(user, \"customer_profile\")}')
if hasattr(user, 'customer_profile'):
    print(f'Customer #: {user.customer_profile.customer_number}')
"
```

### Expected Output
```
Portal Access: ✅ GRANTED
Role: customer
Has Profile: True
Customer #: CUST-00006
```

---

## 🐛 Troubleshooting

### Issue: "Access denied. This portal is for customers only."

**Solutions:**
1. Check user role is 'customer'
2. Verify customer profile exists
3. Ensure user is active

```python
from apps.accounts.models import User

user = User.objects.get(username='your_username')
print(f"Role: {user.role}")  # Should be 'customer'
print(f"Active: {user.is_active}")  # Should be True
print(f"Has Profile: {hasattr(user, 'customer_profile')}")  # Should be True
```

### Issue: Can't login with test credentials

**Solutions:**
1. Ensure development server is running
2. Try resetting password:
```python
from apps.accounts.models import User
user = User.objects.get(username='test_customer')
user.set_password('TestPass123!')
user.save()
```

### Issue: Portal pages show no data

**Reason:** Test customer has no vehicles, appointments, or invoices yet.

**Normal behavior** - The portal will show empty states with call-to-action buttons.

---

## 📚 Documentation

For complete documentation, see:
- **[CUSTOMER_PORTAL_ACCESS_GUIDE.md](./CUSTOMER_PORTAL_ACCESS_GUIDE.md)** - Detailed access guide
- **[PHASE12_CUSTOMER_PORTAL_COMPLETE.md](./PHASE12_CUSTOMER_PORTAL_COMPLETE.md)** - Portal features
- **[PHASE12_PORTAL_BUGFIX.md](./PHASE12_PORTAL_BUGFIX.md)** - Recent fixes

---

## 📞 Need Help?

If you encounter any issues:
1. Check Django logs: `logs/django.log`
2. Run: `python manage.py check`
3. Verify user and customer exist in admin panel
4. Use the verification script above

---

**Quick Start Created:** October 4, 2025  
**Test Customer:** CUST-00006  
**Status:** ✅ Ready to Use

🎉 **You're all set! Start exploring the customer portal!**
