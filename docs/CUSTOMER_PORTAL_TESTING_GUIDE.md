# Customer Portal Testing Quick Start

**Date:** October 5, 2025  
**Status:** Ready for Testing  

---

## 🚀 Quick Start Guide

### 1. Start the Development Server

```bash
cd /home/handy/smart_vehicle_repairs_system
source venv/bin/activate
python manage.py runserver 8000
```

---

## 🧪 Test Scenarios

### Scenario 1: New Customer Registration

1. **Visit Registration Page**
   ```
   http://127.0.0.1:8000/customer/register/
   ```

2. **Fill in the form:**
   - First Name: John
   - Last Name: Doe
   - Email: john.doe@example.com
   - Phone: 555-1234
   - Password: TestPass123!
   - Confirm Password: TestPass123!

3. **Expected Result:**
   - ✅ Registration successful
   - ✅ Automatically logged in
   - ✅ Redirected to portal home
   - ✅ Welcome message displayed

---

### Scenario 2: Customer Login

1. **Visit Login Page**
   ```
   http://127.0.0.1:8000/customer/login/
   ```

2. **Login with:**
   - Email: john.doe@example.com
   - Password: TestPass123!
   - Check "Remember Me" (optional)

3. **Expected Result:**
   - ✅ Login successful
   - ✅ Redirected to portal dashboard
   - ✅ Welcome message displayed
   - ✅ Sidebar shows customer menu

---

### Scenario 3: Access Portal Pages (Authenticated)

After logging in, visit these URLs:

```
✅ Dashboard: http://127.0.0.1:8000/portal/
✅ My Vehicles: http://127.0.0.1:8000/portal/my-vehicles/
✅ My Appointments: http://127.0.0.1:8000/portal/my-appointments/
✅ My Invoices: http://127.0.0.1:8000/portal/my-invoices/
✅ Service History: http://127.0.0.1:8000/portal/my-history/
✅ Book Appointment: http://127.0.0.1:8000/portal/book-appointment/
✅ Profile Settings: http://127.0.0.1:8000/portal/settings/
✅ Change Password: http://127.0.0.1:8000/portal/change-password/
```

**Expected Result:**
- ✅ All pages load successfully
- ✅ Customer data displays correctly
- ✅ No errors in console
- ✅ Active menu item highlighted

---

### Scenario 4: Access Portal Pages (Unauthenticated)

1. **Logout first** (click Logout in sidebar)

2. **Try to access portal URLs directly:**
   ```
   http://127.0.0.1:8000/portal/
   http://127.0.0.1:8000/portal/my-vehicles/
   ```

3. **Expected Result:**
   - ✅ Redirected to: `http://127.0.0.1:8000/customer/login/`
   - ✅ NOT redirected to: `/accounts/login/` (staff login)
   - ✅ After login, redirected back to requested page

---

### Scenario 5: Update Profile

1. **Navigate to Profile Settings**
   ```
   http://127.0.0.1:8000/portal/settings/
   ```

2. **Update information:**
   - Change phone number
   - Update address
   - Toggle marketing preferences
   - Click "Save Changes"

3. **Expected Result:**
   - ✅ Changes saved successfully
   - ✅ Success message displayed
   - ✅ Form shows updated values
   - ✅ Data persisted in database

---

### Scenario 6: Change Password

1. **Navigate to Change Password**
   ```
   http://127.0.0.1:8000/portal/change-password/
   ```

2. **Fill in the form:**
   - Current Password: TestPass123!
   - New Password: NewPass456!
   - Confirm Password: NewPass456!
   - Click "Change Password"

3. **Expected Result:**
   - ✅ Password changed successfully
   - ✅ Success message displayed
   - ✅ Still logged in (session preserved)
   - ✅ Can logout and login with new password

---

### Scenario 7: Forgot Password Flow

1. **Logout from customer portal**

2. **Visit Login Page**
   ```
   http://127.0.0.1:8000/customer/login/
   ```

3. **Click "Forgot Password?" link**

4. **Enter email address:**
   - Email: john.doe@example.com
   - Click "Send Reset Link"

5. **Check console for email** (if using console backend):
   - Copy the reset link from console output
   - Link format: `/customer/reset-password/<uid>/<token>/`

6. **Visit the reset link** and set new password

7. **Expected Result:**
   - ✅ Reset email sent (or displayed in console)
   - ✅ Reset link works
   - ✅ Can set new password
   - ✅ Can login with new password

---

### Scenario 8: Customer Cannot Access Staff Portal

1. **Login as customer** (john.doe@example.com)

2. **Try to access staff URLs:**
   ```
   http://127.0.0.1:8000/dashboard/
   http://127.0.0.1:8000/customers/
   http://127.0.0.1:8000/workorders/
   ```

3. **Expected Result:**
   - ✅ Access denied or redirected
   - ✅ Error message displayed
   - ✅ Cannot view staff content

---

### Scenario 9: Staff Cannot Access Customer Portal

1. **Create a staff user** (if not exists):
   ```bash
   python manage.py shell
   ```
   ```python
   from apps.accounts.models import User
   
   staff = User.objects.create_user(
       username='staffuser',
       email='staff@example.com',
       password='StaffPass123!',
       role='manager',
       first_name='Staff',
       last_name='User',
   )
   ```

2. **Try to login via customer portal:**
   ```
   http://127.0.0.1:8000/customer/login/
   ```
   - Email: staff@example.com
   - Password: StaffPass123!

3. **Expected Result:**
   - ✅ Login denied
   - ✅ Error: "Staff members should use the Staff Portal"
   - ✅ Cannot access customer portal

---

### Scenario 10: Customer Logout

1. **While logged in as customer**

2. **Click "Logout" button in sidebar**

3. **Expected Result:**
   - ✅ Logged out successfully
   - ✅ Redirected to customer login page
   - ✅ Success message displayed
   - ✅ Cannot access portal pages anymore

---

## 🔍 Verification Checklist

After testing, verify:

### Authentication ✅
- [ ] Customer registration works
- [ ] Customer login works
- [ ] Customer logout works
- [ ] Password reset works
- [ ] Staff cannot login via customer portal
- [ ] Customer cannot login via staff portal

### Portal Access ✅
- [ ] Authenticated customers can access all portal pages
- [ ] Unauthenticated users redirected to customer login
- [ ] All portal pages display correctly
- [ ] Navigation works properly
- [ ] Active menu items highlighted

### Profile Management ✅
- [ ] Can view profile information
- [ ] Can edit profile successfully
- [ ] Can change password
- [ ] Can update preferences
- [ ] Changes persist in database

### Security ✅
- [ ] CSRF tokens present on forms
- [ ] Password strength validation works
- [ ] Email format validation works
- [ ] Role-based access control works
- [ ] Session management works

---

## 🐛 Common Issues & Solutions

### Issue: Email not sending for password reset
**Solution:** 
```python
# Check settings.py
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'  # For dev
# Check console output for email content
```

### Issue: 404 Not Found errors
**Solution:**
```bash
# Restart the development server
python manage.py runserver 8000
```

### Issue: Template not found
**Solution:**
```bash
# Verify template paths
ls -la templates/portal/
ls -la templates/customers/
```

### Issue: Customer profile not created
**Solution:**
```python
# Verify in shell
python manage.py shell

from apps.accounts.models import User
user = User.objects.get(email='john.doe@example.com')
print(hasattr(user, 'customer_profile'))  # Should be True
print(user.customer_profile)  # Should show customer
```

---

## 📊 Database Verification

```bash
python manage.py shell
```

```python
from apps.accounts.models import User
from apps.customers.models import Customer

# Check customer users
customers = User.objects.filter(role='customer')
print(f"Total customers: {customers.count()}")

# Check customer profiles
profiles = Customer.objects.all()
print(f"Total customer profiles: {profiles.count()}")

# Verify link
for user in customers:
    has_profile = hasattr(user, 'customer_profile')
    print(f"{user.email}: Profile exists = {has_profile}")
```

---

## 🎯 Success Metrics

Your implementation is successful if:

1. ✅ Customer can register and login
2. ✅ All portal pages redirect to customer login (not staff login)
3. ✅ Password reset flow works end-to-end
4. ✅ Profile editing works
5. ✅ Customer/staff portals are completely separated
6. ✅ No Python errors in console
7. ✅ No JavaScript errors in browser console
8. ✅ All forms have CSRF protection

---

## 📝 Test Report Template

After testing, document your results:

```
# Customer Portal Testing Report

Date: October 5, 2025
Tester: [Your Name]

## Test Results

### Scenario 1: Registration
- Status: ✅ PASS / ❌ FAIL
- Notes: 

### Scenario 2: Login
- Status: ✅ PASS / ❌ FAIL
- Notes: 

### Scenario 3: Portal Access
- Status: ✅ PASS / ❌ FAIL
- Notes: 

### Scenario 4: Unauthenticated Access
- Status: ✅ PASS / ❌ FAIL
- Notes: 

### Scenario 5: Profile Update
- Status: ✅ PASS / ❌ FAIL
- Notes: 

### Scenario 6: Password Change
- Status: ✅ PASS / ❌ FAIL
- Notes: 

### Scenario 7: Password Reset
- Status: ✅ PASS / ❌ FAIL
- Notes: 

### Scenario 8: Staff Portal Prevention
- Status: ✅ PASS / ❌ FAIL
- Notes: 

### Scenario 9: Customer Portal Prevention
- Status: ✅ PASS / ❌ FAIL
- Notes: 

### Scenario 10: Logout
- Status: ✅ PASS / ❌ FAIL
- Notes: 

## Issues Found
1. 
2. 
3. 

## Overall Status
✅ Ready for Production / ⚠️ Needs Minor Fixes / ❌ Major Issues Found
```

---

**Ready to test?** Start with Scenario 1 and work through each one systematically!

**Need help?** Check the error messages, console output, and refer to CUSTOMER_PORTAL_FIXES_COMPLETE.md for detailed information.
