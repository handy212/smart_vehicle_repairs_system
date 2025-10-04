# Separate Authentication Systems Implementation

## 📋 Overview

The Smart Vehicle Repairs System now implements **two separate authentication systems** for enhanced security and better user experience:

1. **Staff Portal** (`/accounts/login/`) - For internal employees (admin, managers, technicians, receptionists)
2. **Customer Portal** (`/customer/login/`) - For public customers (vehicle owners)

## 🔐 Why Separate Authentication?

### Security Benefits
- **Isolated Access** - Customers cannot accidentally access staff areas
- **Different Security Requirements** - Staff can have stricter policies (2FA, IP restrictions)
- **Role Separation** - Clear distinction between internal and external users
- **Data Protection** - Separate authentication reduces risk of data exposure
- **Audit Trail** - Clear separation of staff vs customer actions

### User Experience Benefits
- **Simplified Interface** - Each portal shows only relevant features
- **Branded Experience** - Customer portal can be more customer-facing
- **Clearer Navigation** - Users know which portal to use
- **Better Onboarding** - New customers register separately from staff

## 🏗️ Architecture

### Staff Authentication System
**URL Prefix:** `/accounts/`

**Features:**
- Admin-created accounts only (staff cannot self-register without approval)
- Role-based access control (admin, manager, technician, receptionist)
- Access to full system (work orders, inventory, billing, inspections, etc.)
- Requires `is_staff=True` flag
- Login at: `/accounts/login/`

**User Model:**
```python
{
    'username': 'staff.user@company.com',
    'email': 'staff.user@company.com',
    'role': 'technician',  # or 'admin', 'manager', 'receptionist'
    'is_staff': True,
    'is_active': True,
    'has_customer_profile': False
}
```

### Customer Authentication System
**URL Prefix:** `/customer/`

**Features:**
- Self-registration enabled (customers create own accounts)
- Limited access to customer portal only
- Cannot access staff areas
- Requires `role='customer'` and customer_profile exists
- Login at: `/customer/login/`

**User Model:**
```python
{
    'username': 'customer@email.com',  # Email used as username
    'email': 'customer@email.com',
    'role': 'customer',
    'is_staff': False,  # Important: customers are NOT staff
    'is_active': True,
    'customer_profile': Customer object  # Must exist
}
```

## 📁 Files Created/Modified

### New Files

1. **`apps/customers/auth_views.py`** - Customer authentication views
   - `customer_register()` - Account creation with customer profile
   - `customer_login()` - Login with role verification
   - `customer_logout()` - Logout and redirect
   - `customer_forgot_password()` - Password reset (placeholder)

2. **`templates/customers/customer_login.html`** - Customer login page
   - Clean, customer-friendly design
   - Email + password authentication
   - "Remember me" checkbox
   - Links to registration and staff portal

3. **`templates/customers/customer_register.html`** - Customer registration page
   - First name, last name, email, phone
   - Password strength indicator
   - Password confirmation validation
   - Creates both User and Customer objects

4. **`templates/customers/customer_forgot_password.html`** - Password reset page
   - Placeholder for future implementation
   - Contact information for manual reset

### Modified Files

1. **`config/urls.py`**
   ```python
   # Customer Authentication (Separate System)
   path('customer/login/', customer_auth_views.customer_login, name='customer_login'),
   path('customer/register/', customer_auth_views.customer_register, name='customer_register'),
   path('customer/logout/', customer_auth_views.customer_logout, name='customer_logout'),
   path('customer/forgot-password/', customer_auth_views.customer_forgot_password, name='customer_forgot_password'),
   ```

2. **`templates/home.html`**
   - Updated "Customer Portal" button to link to `/customer/login/`
   - Added "Create Account" link for new customers
   - Changed from `{% url 'portal:home' %}` to `{% url 'customer_login' %}`

## 🔄 Authentication Flow

### Staff Login Flow
```
1. User visits homepage (/)
2. Clicks "Staff Portal" button
3. Redirects to /accounts/login/
4. Enters credentials
5. System checks: is_staff=True and role in ['admin', 'manager', 'technician', 'receptionist']
6. Success → Redirect to /dashboard/
7. Failure → Show error message
```

### Customer Login Flow
```
1. User visits homepage (/)
2. Clicks "Customer Login" button
3. Redirects to /customer/login/
4. Enters email + password
5. System checks: role='customer' AND customer_profile exists AND is_staff=False
6. Success → Redirect to /portal/ (customer portal home)
7. Failure → Show error message
8. If staff user tries to login → Shows error "Use Staff Portal"
```

### Customer Registration Flow
```
1. New customer visits /customer/register/
2. Fills out form: first name, last name, email, phone, password
3. System validates:
   - Email not already registered
   - Passwords match
   - All required fields filled
4. Creates User object with:
   - username = email
   - role = 'customer'
   - is_staff = False
   - is_active = True
5. Creates Customer profile linked to user
6. Automatically logs user in
7. Redirects to /portal/ (customer portal)
```

## 🛡️ Security Features

### Role Verification
Both systems verify user roles during login:

**Staff Login:**
```python
if user.role not in ['admin', 'manager', 'technician', 'receptionist']:
    messages.error(request, 'Invalid credentials. Use Customer Portal.')
    return redirect('customer_login')
```

**Customer Login:**
```python
if user.role != 'customer' or not hasattr(user, 'customer_profile'):
    messages.error(request, 'Invalid credentials. Staff members use Staff Portal.')
    return redirect('login')
```

### Protection Against Cross-Portal Access

1. **Staff Portal Protected:**
   - Requires `is_staff=True` flag
   - Checked by `@login_required` and role middleware
   - Staff URLs return 403 if accessed by customers

2. **Customer Portal Protected:**
   - Requires `role='customer'` and `customer_profile` exists
   - Checked in `portal_views.py` with `@login_required`
   - Redirects to customer login if not authenticated

### Password Security
- Minimum 8 characters required
- Strength indicator shows weak/medium/strong
- Confirmation field prevents typos
- Django's built-in password hashing (PBKDF2)

## 🎨 User Interface Differences

### Staff Portal (`/accounts/login/`)
- **Theme:** Purple/violet gradient
- **Branding:** Company logo + "Staff Portal"
- **Fields:** Username, Password
- **Features:** Forgot password, staff registration (approval required)
- **Target:** Internal employees only

### Customer Portal (`/customer/login/`)
- **Theme:** Green gradient (success colors)
- **Branding:** Company logo + "Customer Portal"
- **Fields:** Email, Password, Remember Me
- **Features:** Create account, forgot password, link to staff portal
- **Target:** Public customers (vehicle owners)

## 🧪 Testing the System

### Test Staff Login
```bash
# Visit homepage
http://127.0.0.1:8000/

# Click "Staff Portal"
# Should redirect to http://127.0.0.1:8000/accounts/login/

# Try logging in as admin
Username: admin
Password: danewcash54899

# Should redirect to /dashboard/
```

### Test Customer Registration
```bash
# Visit homepage
http://127.0.0.1:8000/

# Click "Customer Login"
# Should redirect to http://127.0.0.1:8000/customer/login/

# Click "Create Account"
# Should redirect to http://127.0.0.1:8000/customer/register/

# Fill out form:
First Name: John
Last Name: Doe
Email: john.doe@example.com
Phone: +233 XX XXX XXXX
Password: SecurePass123!
Confirm Password: SecurePass123!

# Click "Create Account"
# Should create user and redirect to /portal/
```

### Test Customer Login
```bash
# Visit http://127.0.0.1:8000/customer/login/
Email: john.doe@example.com
Password: SecurePass123!

# Click "Login"
# Should redirect to /portal/
```

### Test Cross-Portal Prevention
```bash
# Try logging into Staff Portal as customer
http://127.0.0.1:8000/accounts/login/
Username: john.doe@example.com
Password: SecurePass123!

# Should fail with error: "Invalid credentials"

# Try logging into Customer Portal as staff
http://127.0.0.1:8000/customer/login/
Email: admin@admin.com
Password: danewcash54899

# Should fail with error: "Invalid credentials. Staff members should use the Staff Portal"
```

## 📊 Database Schema

### User Model (Extended)
```python
class User(AbstractUser):
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    role = models.CharField(max_length=20, choices=[
        ('admin', 'Administrator'),
        ('manager', 'Manager'),
        ('technician', 'Technician'),
        ('receptionist', 'Receptionist'),
        ('customer', 'Customer'),  # New role
    ])
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
```

### Customer Model
```python
class Customer(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='customer_profile')
    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)
    email = models.EmailField()
    phone = models.CharField(max_length=20)
    address = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

## 🔗 URL Mapping

### Staff Portal URLs
```
/                           → Homepage
/accounts/login/            → Staff login page
/accounts/logout/           → Staff logout
/accounts/staff-register/   → Staff registration (requires approval)
/dashboard/                 → Staff dashboard (after login)
/admin-panel/               → Admin panel
```

### Customer Portal URLs
```
/                           → Homepage
/customer/login/            → Customer login page
/customer/register/         → Customer registration (self-service)
/customer/logout/           → Customer logout
/customer/forgot-password/  → Password reset (placeholder)
/portal/                    → Customer portal home (after login)
/portal/my-vehicles/        → Customer's vehicles
/portal/my-appointments/    → Customer's appointments
/portal/my-invoices/        → Customer's invoices
```

## ⚙️ Configuration

### Settings Required
No additional settings needed. Uses existing Django authentication.

### Context Processor
The existing `settings_context` provides branding variables to both portals:
- SITE_NAME
- COMPANY_NAME
- LOGO_PATH
- FAVICON_PATH
- PRIMARY_COLOR (green for customers)
- SECONDARY_COLOR

## 🚀 Next Steps

### Recommended Enhancements

1. **Email Verification** - Verify customer email addresses
2. **Password Reset** - Implement full password reset flow with email
3. **Two-Factor Authentication** - Add 2FA for staff accounts
4. **Session Management** - Different session timeouts for staff vs customers
5. **IP Whitelisting** - Restrict staff portal to office IP addresses
6. **Account Lockout** - Lock accounts after failed login attempts
7. **Audit Logging** - Log all authentication events
8. **Social Login** - Add Google/Facebook login for customers

### Migration Strategy
If you have existing users who should be customers:

```python
# Run this Django management command
python manage.py shell

from django.contrib.auth import get_user_model
from apps.customers.models import Customer

User = get_user_model()

# Find users without customer profiles
users_without_profile = User.objects.filter(role='customer', customer_profile__isnull=True)

for user in users_without_profile:
    Customer.objects.create(
        user=user,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        phone=user.phone
    )
    print(f'Created customer profile for {user.email}')
```

## ✅ Best Practices Implemented

✅ **Separate Authentication** - Staff and customers use different login systems  
✅ **Role Verification** - Each login checks user role before allowing access  
✅ **Clear User Paths** - Obvious distinction between staff and customer portals  
✅ **Self-Service Registration** - Customers can create accounts without staff intervention  
✅ **Security Checks** - Prevents customers from accessing staff areas  
✅ **User-Friendly Design** - Different branding and UX for each portal  
✅ **Proper Redirects** - Users redirected to appropriate portal after login  
✅ **Error Messages** - Clear error messages when using wrong portal  

## 📝 Summary

The system now has two completely separate authentication flows:

**Staff Portal** → Internal employees only → Full system access → Admin-managed accounts  
**Customer Portal** → Public vehicle owners → Limited portal access → Self-registration

This separation provides better security, clearer user experience, and follows industry best practices for multi-tenant applications.

## 📞 Support

If customers need help:
- Password reset: Contact {{ COMPANY_EMAIL }} or {{ COMPANY_PHONE }}
- Account issues: Visit /customer/forgot-password/
- New customers: Visit /customer/register/

If staff need help:
- Contact system administrator
- Use /accounts/staff-register/ for new staff accounts

---

**Status:** ✅ Implementation Complete  
**Date:** Phase 14 - System Settings Enhancement  
**Version:** 1.0.0
