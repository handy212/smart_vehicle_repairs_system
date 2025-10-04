# ✅ Phase 1 Testing & Verification Guide

**Date:** October 2, 2025  
**Purpose:** Verify Phase 1 implementation is working correctly

---

## 🧪 MANUAL TESTING CHECKLIST

### Pre-Testing Setup

1. **Start Development Server**
```bash
cd /home/handy/smart_vehicle_repairs_system
source venv/bin/activate
python manage.py runserver 8000
```

2. **Open Browser**
```
http://localhost:8000
```

---

## 1️⃣ BASE TEMPLATES TESTING

### Test 1.1: Master Template (base.html)
- [ ] Navigate to homepage: `http://localhost:8000/`
- [ ] Verify header loads with logo
- [ ] Verify footer displays (scroll to bottom)
- [ ] Check navigation menu appears
- [ ] Test mobile menu (resize browser to mobile size)

**Expected Result:** ✅ Clean homepage with header, content, footer

---

### Test 1.2: Admin Dashboard Template (base_admin.html)
- [ ] Login as admin: `http://localhost:8000/login/`
  - Email: `admin@admin.com`
  - Password: `danewcash54899`
- [ ] Navigate to dashboard: `http://localhost:8000/dashboard/`
- [ ] Verify dark sidebar appears on left
- [ ] Check role-based menu items visible
- [ ] Test sidebar toggle on mobile
- [ ] Verify top navigation with search bar
- [ ] Check user dropdown menu works

**Expected Result:** ✅ Professional admin interface with sidebar navigation

---

### Test 1.3: Customer Portal Template (base_customer.html)
**Note:** This template will be used in Phase 12 for customer portal

- [ ] Verify template file exists: `templates/base_customer.html`
- [ ] Check gradient navigation bar styling
- [ ] Verify customer-focused menu structure

**Expected Result:** ✅ Template ready for future customer portal pages

---

### Test 1.4: Header Partial
- [ ] Verify header appears on all authenticated pages
- [ ] Test search functionality (search bar visible)
- [ ] Click notifications icon (dropdown should open)
- [ ] Click user avatar/name (dropdown should show profile options)
- [ ] Verify role display in user dropdown

**Expected Result:** ✅ Consistent header across all pages

---

### Test 1.5: Footer Partial
- [ ] Scroll to bottom of any page
- [ ] Verify 4 columns: About, Quick Links, Customer Portal, Contact
- [ ] Click social media icons (should have # links)
- [ ] Verify contact information displays
- [ ] Check copyright year (2025)
- [ ] Test footer on mobile (should stack vertically)

**Expected Result:** ✅ Comprehensive footer with all links

---

### Test 1.6: Sidebar Partial
- [ ] Login and go to dashboard
- [ ] Verify sidebar shows role-appropriate menu items
- [ ] Check section headers (Main, Operations, Service, etc.)
- [ ] Verify active page highlighting
- [ ] Hover over menu items (should highlight)
- [ ] Test mobile sidebar toggle

**Expected Result:** ✅ Role-based sidebar with proper permissions

---

### Test 1.7: Messages Partial
- [ ] Perform an action that generates a message (e.g., logout)
- [ ] Verify message appears in top-right corner
- [ ] Check message has correct icon (✓ for success)
- [ ] Verify auto-dismiss after 5 seconds
- [ ] Test manual close button

**Expected Result:** ✅ Messages display properly and auto-dismiss

---

## 2️⃣ AUTHENTICATION TEMPLATES TESTING

### Test 2.1: Login Page
- [ ] Navigate to: `http://localhost:8000/login/`
- [ ] Verify form displays with email and password fields
- [ ] Check "Remember me" checkbox present
- [ ] Verify "Forgot password?" link works
- [ ] Test password visibility toggle (eye icon)
- [ ] Try invalid login (should show error)
- [ ] Try valid login (should redirect to dashboard)

**Test Credentials:**
```
Email: admin@admin.com
Password: danewcash54899
```

**Expected Result:** ✅ Login works, redirects to dashboard

---

### Test 2.2: Customer Registration
- [ ] Navigate to: `http://localhost:8000/register/`
- [ ] Verify all required fields present:
  - First Name
  - Last Name
  - Email
  - Username
  - Phone
  - Password
  - Confirm Password
- [ ] Test form validation (leave fields empty)
- [ ] Test password mismatch error
- [ ] Test email format validation
- [ ] Register a test customer account

**Expected Result:** ✅ Registration form validates properly

---

### Test 2.3: Staff Registration (Admin Only)
- [ ] Login as admin
- [ ] Navigate to: `http://localhost:8000/accounts/staff-register/`
- [ ] Verify form displays with all fields
- [ ] Check role dropdown has 4 options:
  - Manager
  - Receptionist
  - Technician
  - Parts Manager
- [ ] Verify role descriptions displayed
- [ ] Test auto-username generation (type first/last name)
- [ ] Create a test staff member

**Expected Result:** ✅ Staff registration works, user created

**Test Non-Admin Access:**
- [ ] Logout admin
- [ ] Login as different role
- [ ] Try to access `/accounts/staff-register/`
- [ ] Verify access denied message

**Expected Result:** ✅ Only admin can access

---

### Test 2.4: Password Reset Flow
- [ ] Navigate to: `http://localhost:8000/accounts/password-reset/`
- [ ] Enter email address
- [ ] Verify confirmation page displays
- [ ] Check email sent (check console logs for email)
- [ ] Click reset link in email
- [ ] Enter new password
- [ ] Verify password changed successfully

**Note:** In development, emails are printed to console

**Expected Result:** ✅ Full password reset flow works

---

### Test 2.5: Password Change (Authenticated)
- [ ] Login to system
- [ ] Navigate to profile or change password page
- [ ] Verify form requires:
  - Old password
  - New password
  - Confirm new password
- [ ] Test validation (wrong old password)
- [ ] Successfully change password
- [ ] Logout and login with new password

**Expected Result:** ✅ Password change works correctly

---

### Test 2.6: Profile View/Edit
- [ ] Login to system
- [ ] Access user profile via API: `http://localhost:8000/api/auth/users/me/`
- [ ] Verify user data returned (JSON)
- [ ] Check profile includes:
  - Username
  - Email
  - First/Last name
  - Role
  - Phone

**Expected Result:** ✅ Profile data accessible via API

---

### Test 2.7: Logout
- [ ] Login to system
- [ ] Click user dropdown
- [ ] Click "Logout"
- [ ] Verify success message displayed
- [ ] Verify redirected to homepage
- [ ] Try accessing `/dashboard/` (should redirect to login)

**Expected Result:** ✅ Logout works, session cleared

---

## 3️⃣ ERROR PAGES TESTING

### Test 3.1: 404 - Page Not Found
- [ ] Navigate to non-existent page: `http://localhost:8000/nonexistent/`
- [ ] Verify custom 404 page displays
- [ ] Check "404" large text
- [ ] Verify "Go Home" button works
- [ ] Verify "Go Back" button works

**Expected Result:** ✅ Custom 404 page displays

---

### Test 3.2: 403 - Permission Denied
- [ ] Login as non-admin user
- [ ] Try accessing admin-only page
- [ ] Verify 403 error or redirect with error message

**Expected Result:** ✅ Permission denied properly handled

---

### Test 3.3: 500 - Server Error
**Note:** Difficult to test in development without breaking something

- [ ] Verify template exists: `templates/errors/500.html`
- [ ] Check styling consistent with other error pages

**Expected Result:** ✅ Template ready for production errors

---

### Test 3.4: 400 - Bad Request
- [ ] Verify template exists: `templates/errors/400.html`
- [ ] Check animated warning icon
- [ ] Verify styling (orange/red gradient)

**Expected Result:** ✅ 400 error page ready

---

## 4️⃣ RESPONSIVE DESIGN TESTING

### Test 4.1: Desktop (1920x1080)
- [ ] Login and navigate to dashboard
- [ ] Verify sidebar visible on left
- [ ] Check top navigation displays properly
- [ ] Verify content area uses full width
- [ ] Test all dropdowns and menus

**Expected Result:** ✅ Full desktop layout works

---

### Test 4.2: Laptop (1366x768)
- [ ] Resize browser to 1366px width
- [ ] Verify layout still looks good
- [ ] Check sidebar doesn't overlap content
- [ ] Test all interactive elements

**Expected Result:** ✅ Laptop view works properly

---

### Test 4.3: Tablet (768px)
- [ ] Resize browser to 768px width
- [ ] Verify sidebar auto-hides
- [ ] Check hamburger menu appears
- [ ] Test sidebar toggle button
- [ ] Verify content is readable

**Expected Result:** ✅ Tablet view responsive

---

### Test 4.4: Mobile (375px)
- [ ] Resize browser to 375px width (or use DevTools device mode)
- [ ] Verify mobile menu works
- [ ] Check sidebar becomes overlay
- [ ] Test navigation hamburger icon
- [ ] Verify forms are usable
- [ ] Check footer stacks vertically

**Expected Result:** ✅ Mobile experience optimized

---

## 5️⃣ ROLE-BASED ACCESS TESTING

### Test 5.1: Admin Role
- [ ] Login as admin
- [ ] Verify sidebar shows ALL sections:
  - Main (Dashboard)
  - Operations (Customers, Vehicles, Appointments)
  - Service (Work Orders, Inspections)
  - Inventory (Parts, Suppliers, Purchase Orders)
  - Financial (Billing, Invoices, Payments)
  - Analytics (Reports, Analytics)
  - System (Users, Settings, Django Admin)

**Expected Result:** ✅ Admin sees all menu items

---

### Test 5.2: Manager Role
- [ ] Login as manager
- [ ] Verify sidebar shows:
  - Main (Dashboard)
  - Operations (Customers, Vehicles, Appointments)
  - Service (Work Orders, Inspections)
  - Inventory (Parts, Suppliers, Purchase Orders)
  - Financial (Billing, Invoices, Payments)
  - Analytics (Reports, Analytics)
- [ ] Verify NO System section

**Expected Result:** ✅ Manager sees appropriate items

---

### Test 5.3: Receptionist Role
- [ ] Login as receptionist
- [ ] Verify sidebar shows:
  - Main (Dashboard)
  - Operations (Customers, Vehicles, Appointments)
  - Service (Work Orders)
  - Financial (Billing, Invoices, Payments)

**Expected Result:** ✅ Receptionist sees limited items

---

### Test 5.4: Technician Role
- [ ] Login as technician
- [ ] Verify sidebar shows:
  - Main (Dashboard)
  - Service (Work Orders, Inspections)

**Expected Result:** ✅ Technician sees only work-related items

---

### Test 5.5: Parts Manager Role
- [ ] Login as parts manager
- [ ] Verify sidebar shows:
  - Main (Dashboard)
  - Inventory (Parts, Suppliers, Purchase Orders)
  - Service (Work Orders - for parts usage)

**Expected Result:** ✅ Parts manager sees inventory items

---

### Test 5.6: Customer Role
- [ ] Login as customer
- [ ] Verify different navigation (customer portal style)
- [ ] Check sidebar shows customer-specific items:
  - My Vehicles
  - My Appointments
  - My Invoices
  - Service History

**Expected Result:** ✅ Customer sees portal navigation

---

## 6️⃣ FORM VALIDATION TESTING

### Test 6.1: Required Fields
- [ ] Try submitting login form empty
- [ ] Verify browser shows "Please fill out this field"
- [ ] Try submitting registration with missing fields

**Expected Result:** ✅ Required field validation works

---

### Test 6.2: Email Validation
- [ ] Enter invalid email (e.g., "notanemail")
- [ ] Try to submit
- [ ] Verify error: "Please include '@' in the email"

**Expected Result:** ✅ Email format validated

---

### Test 6.3: Password Confirmation
- [ ] Enter different passwords in password/confirm fields
- [ ] Try to submit
- [ ] Verify error: "Passwords don't match"

**Expected Result:** ✅ Password match validation works

---

### Test 6.4: Username Format
- [ ] Try username with spaces or special characters
- [ ] Verify validation error
- [ ] Test allowed characters: letters, digits, @/./+/-/_

**Expected Result:** ✅ Username validation works

---

## 7️⃣ JAVASCRIPT FUNCTIONALITY TESTING

### Test 7.1: Auto-Dismiss Alerts
- [ ] Perform action that creates success message
- [ ] Watch message for 5 seconds
- [ ] Verify message auto-closes

**Expected Result:** ✅ Messages auto-dismiss after 5 seconds

---

### Test 7.2: Password Visibility Toggle
- [ ] Go to login page
- [ ] Click eye icon next to password field
- [ ] Verify password becomes visible (text)
- [ ] Click again
- [ ] Verify password becomes hidden (dots)

**Expected Result:** ✅ Password toggle works

---

### Test 7.3: Sidebar Toggle (Mobile)
- [ ] Resize browser to mobile size
- [ ] Click hamburger menu icon
- [ ] Verify sidebar slides in
- [ ] Click outside or close button
- [ ] Verify sidebar closes

**Expected Result:** ✅ Mobile sidebar toggle works

---

### Test 7.4: Dropdown Menus
- [ ] Click user dropdown in header
- [ ] Verify dropdown opens
- [ ] Click outside dropdown
- [ ] Verify dropdown closes
- [ ] Test notifications dropdown

**Expected Result:** ✅ All dropdowns work properly

---

## 8️⃣ CROSS-BROWSER TESTING

### Test 8.1: Chrome/Chromium
- [ ] Test all features in Chrome
- [ ] Verify CSS renders correctly
- [ ] Check JavaScript works

**Expected Result:** ✅ Works in Chrome

---

### Test 8.2: Firefox
- [ ] Test all features in Firefox
- [ ] Verify layout consistent with Chrome
- [ ] Check no console errors

**Expected Result:** ✅ Works in Firefox

---

### Test 8.3: Safari (if available)
- [ ] Test on Safari
- [ ] Verify compatibility

**Expected Result:** ✅ Works in Safari

---

### Test 8.4: Edge
- [ ] Test on Microsoft Edge
- [ ] Verify no issues

**Expected Result:** ✅ Works in Edge

---

## 9️⃣ ACCESSIBILITY TESTING

### Test 9.1: Keyboard Navigation
- [ ] Use TAB key to navigate forms
- [ ] Verify focus indicators visible
- [ ] Press ENTER to submit forms
- [ ] Use ESC to close modals/dropdowns

**Expected Result:** ✅ Keyboard navigation works

---

### Test 9.2: Screen Reader Compatibility
- [ ] Check form labels properly associated
- [ ] Verify alt text on images
- [ ] Check ARIA labels present

**Expected Result:** ✅ Accessible to screen readers

---

### Test 9.3: Color Contrast
- [ ] Verify text readable on backgrounds
- [ ] Check link colors have sufficient contrast
- [ ] Test button colors

**Expected Result:** ✅ Good color contrast throughout

---

## 🐛 COMMON ISSUES & SOLUTIONS

### Issue: Templates not found
**Solution:**
```python
# Check config/settings.py
TEMPLATES = [
    {
        'DIRS': [BASE_DIR / 'templates'],
        # ...
    }
]
```

### Issue: Static files not loading
**Solution:**
```bash
python manage.py collectstatic --noinput
```

### Issue: Login redirects to wrong page
**Solution:**
```python
# Add to config/settings.py
LOGIN_REDIRECT_URL = 'dashboard'
LOGIN_URL = 'login'
```

### Issue: Messages not displaying
**Solution:**
```python
# Ensure in INSTALLED_APPS:
'django.contrib.messages',

# Ensure in MIDDLEWARE:
'django.contrib.messages.middleware.MessageMiddleware',
```

### Issue: Staff registration not accessible
**Solution:**
```python
# In view, check:
if request.user.role != 'admin':
    # Deny access
```

---

## ✅ FINAL VERIFICATION

After completing all tests, verify:

- [ ] All authentication flows work
- [ ] All templates render without errors
- [ ] Role-based access control works
- [ ] Forms validate properly
- [ ] Responsive design works on all screen sizes
- [ ] JavaScript functionality works
- [ ] Messages display and auto-dismiss
- [ ] No console errors
- [ ] All links work (no 404s)
- [ ] Error pages display correctly

---

## 📊 TEST RESULTS SUMMARY

| Category | Tests | Passed | Failed | Notes |
|----------|-------|--------|--------|-------|
| Base Templates | 7 | | | |
| Authentication | 7 | | | |
| Error Pages | 4 | | | |
| Responsive Design | 4 | | | |
| Role-Based Access | 6 | | | |
| Form Validation | 4 | | | |
| JavaScript | 4 | | | |
| Cross-Browser | 4 | | | |
| Accessibility | 3 | | | |
| **TOTAL** | **43** | | | |

---

## 🎉 COMPLETION

Once all tests pass:

✅ **Phase 1 is verified and production-ready**  
✅ **Ready to proceed to Phase 2: Dashboard & Analytics**

---

*Testing Date: __________*  
*Tester Name: __________*  
*Status: __________*
