# Customer Portal - Fixes Needed After Auth Separation

**Date:** October 5, 2025  
**Status:** Review Complete  
**Priority:** High

---

## 📋 Executive Summary

After separating the customer authentication from the main staff authentication system, the following issues need to be addressed to ensure the customer portal functions correctly:

---

## 🔴 Critical Issues

### 1. **Inconsistent Decorator Usage in Portal Views**

**Location:** `apps/customers/portal_views.py`

**Problem:** 
- Only `portal_home()` uses the custom `@customer_login_required` decorator
- All other portal views (`my_vehicles`, `my_appointments`, `my_invoices`, `my_history`, `book_appointment`, `make_payment`) use the generic `@login_required` decorator
- This means staff users could potentially access customer portal pages

**Current Code:**
```python
@customer_login_required  # ✅ Correct - only on portal_home
def portal_home(request):
    ...

@login_required  # ❌ Wrong - redirects to staff login page
def my_vehicles(request):
    if not hasattr(request.user, 'customer_profile'):
        messages.error(request, 'Access denied. This portal is for customers only.')
        return redirect('home')
    ...
```

**Impact:**
- Customers trying to access these pages get redirected to staff login (`/accounts/login/`) instead of customer login (`/customer/login/`)
- Manual checks inside each view are redundant if decorator is fixed
- Inconsistent user experience

**Fix Required:**
Replace all `@login_required` with `@customer_login_required` for these views:
- `my_vehicles()`
- `my_appointments()`
- `my_invoices()`
- `my_history()`
- `book_appointment()`
- `make_payment()`

---

### 2. **Customer Logout Decorator Issue**

**Location:** `apps/customers/auth_views.py`, line 152

**Problem:**
```python
@login_required  # ❌ This breaks logout flow
def customer_logout(request):
    logout(request)
    messages.success(request, 'You have been logged out successfully.')
    return redirect('customer_login')
```

**Impact:**
- If a customer is not logged in and tries to access `/customer/logout/`, they get redirected to staff login first
- This creates a circular redirect problem
- Customers cannot logout properly if their session expires

**Fix Required:**
Remove the `@login_required` decorator from `customer_logout()` view

---

### 3. **Password Reset Not Implemented**

**Location:** `apps/customers/auth_views.py`, line 161-164

**Problem:**
```python
def customer_forgot_password(request):
    """Customer password reset request"""
    # TODO: Implement password reset with email
    return render(request, 'customers/customer_forgot_password.html')
```

**Impact:**
- Customers cannot reset their passwords if forgotten
- The link exists in login page but doesn't work
- Poor user experience, forces manual admin intervention

**Fix Required:**
Implement proper password reset functionality:
1. Create password reset form
2. Generate password reset tokens
3. Send password reset emails
4. Create password reset confirmation view
5. Update password in database

---

## 🟡 Medium Priority Issues

### 4. **Login Redirect URL Mismatch**

**Location:** `config/settings.py`, lines 222-223

**Problem:**
```python
LOGIN_URL = '/accounts/login/'  # Staff login
LOGIN_REDIRECT_URL = '/dashboard/'  # Staff dashboard
```

**Impact:**
- When Django's generic `@login_required` is used, it redirects to staff login
- After customer login, the default redirect might be wrong
- The `customer_login_required` decorator handles this, but inconsistency exists

**Fix Required:**
Either:
- Ensure all customer portal views use `@customer_login_required`
- OR create separate settings for customer portal
- Document this distinction clearly

---

### 5. **Customer Model Property Access Issues**

**Location:** `templates/portal/home.html`, `templates/portal/partials/customer_sidebar.html`

**Problem:**
Templates try to access `customer.email` and `customer.phone` but these are properties that proxy to `user.email` and `user.phone`.

**Current Template Code:**
```django
{{ customer.email }}  # Works via @property
{{ customer.phone }}  # Works via @property
{{ customer.full_name }}  # Works via @property
```

**Impact:**
- Currently works because model has `@property` decorators
- However, if direct field access is attempted elsewhere, it will fail
- Not immediately clear to developers that these are proxied fields

**Fix Required:**
Consider either:
- Document this clearly in code comments
- OR change templates to use `customer.user.email` explicitly
- Ensure consistency across all templates

---

### 6. **Profile Settings Link Points to Staff Profile**

**Location:** `templates/portal/partials/customer_sidebar.html`, line 67

**Problem:**
```django
<a class="nav-link" href="{% url 'profile' %}">
    <i class="fas fa-user-cog"></i>
    Account Settings
</a>
```

**Impact:**
- Clicking "Account Settings" in customer portal takes customer to staff profile page
- Should have separate customer profile management page
- Confusing UI/UX

**Fix Required:**
Create dedicated customer profile editing view and update the link

---

## 🟢 Low Priority Issues

### 7. **Missing Customer Portal Templates Validation**

**Location:** Various portal templates

**Problem:**
- No error handling for missing customer profile
- Assumes `customer_profile` always exists
- Could cause template errors in edge cases

**Fix Required:**
Add template checks:
```django
{% if user.customer_profile %}
    {{ user.customer_profile.customer_number }}
{% else %}
    <p>Profile not found</p>
{% endif %}
```

---

### 8. **No Rate Limiting on Customer Login/Registration**

**Location:** `apps/customers/auth_views.py`

**Problem:**
- No rate limiting or brute force protection
- Customers can attempt unlimited login/registration attempts
- Security vulnerability

**Fix Required:**
- Add Django rate limiting middleware (e.g., `django-ratelimit`)
- Limit login attempts per IP
- Add CAPTCHA for repeated failures

---

### 9. **Session Expiry Configuration**

**Location:** `apps/customers/auth_views.py`, line 138

**Problem:**
```python
if not remember_me:
    request.session.set_expiry(0)  # Expires when browser closes
```

**Impact:**
- "Remember me" only affects session expiry
- No persistent token/cookie for true "remember me" functionality
- Users must login again even if they checked "remember me" after browser restart

**Fix Required:**
Consider implementing persistent authentication using:
- Extended session expiry (e.g., 30 days)
- Secure remember-me tokens
- Proper cookie configuration

---

### 10. **Missing CSRF Exemption for API Views**

**Location:** Not implemented

**Problem:**
- If customer portal needs API endpoints for AJAX calls
- May need CSRF exemption or token handling for API requests

**Fix Required:**
- Review if customer portal uses AJAX
- Add proper CSRF handling if needed

---

## 📝 Recommended Implementation Order

### Phase 1: Critical Fixes (Immediate)
1. ✅ Fix decorator inconsistency in portal views
2. ✅ Remove `@login_required` from `customer_logout()`
3. ✅ Implement password reset functionality

### Phase 2: Medium Priority (This Week)
4. ✅ Create separate customer profile settings page
5. ✅ Add proper error handling in templates
6. ✅ Document customer model property usage

### Phase 3: Low Priority (Next Sprint)
7. ✅ Add rate limiting
8. ✅ Improve "remember me" functionality
9. ✅ Review and test all customer portal flows

---

## 🔧 Code Changes Required

### File: `apps/customers/portal_views.py`

Replace all occurrences of `@login_required` with `@customer_login_required`:

```python
# Change from:
@login_required
def my_vehicles(request):
    if not hasattr(request.user, 'customer_profile'):
        messages.error(request, 'Access denied. This portal is for customers only.')
        return redirect('home')
    ...

# Change to:
@customer_login_required
def my_vehicles(request):
    # No need for manual check anymore
    ...
```

Apply to:
- `my_vehicles()`
- `my_appointments()`
- `my_invoices()`
- `my_history()`
- `book_appointment()`
- `make_payment()`

### File: `apps/customers/auth_views.py`

Remove decorator from logout:
```python
# Change from:
@login_required
def customer_logout(request):

# Change to:
def customer_logout(request):
```

Implement password reset:
```python
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.template.loader import render_to_string
from django.core.mail import send_mail

def customer_forgot_password(request):
    """Customer password reset request"""
    if request.method == 'POST':
        email = request.POST.get('email')
        try:
            user = User.objects.get(email=email, role='customer')
            
            # Generate token
            token = default_token_generator.make_token(user)
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            
            # Send email with reset link
            reset_link = request.build_absolute_uri(
                f'/customer/reset-password/{uid}/{token}/'
            )
            
            # TODO: Send email
            messages.success(request, 'Password reset link has been sent to your email.')
            return redirect('customer_login')
        except User.DoesNotExist:
            messages.error(request, 'No account found with that email address.')
    
    return render(request, 'customers/customer_forgot_password.html')
```

---

## ✅ Testing Checklist

After implementing fixes, test the following:

### Customer Authentication Flow
- [ ] Customer can register successfully
- [ ] Customer can login successfully
- [ ] Customer cannot access staff portal
- [ ] Staff cannot access customer portal
- [ ] Customer logout works correctly
- [ ] Password reset flow works end-to-end

### Customer Portal Access
- [ ] All portal pages require customer authentication
- [ ] Unauthenticated access redirects to customer login (not staff login)
- [ ] Customer can access all portal sections:
  - [ ] Dashboard/Home
  - [ ] My Vehicles
  - [ ] My Appointments
  - [ ] My Invoices
  - [ ] Service History
  - [ ] Book Appointment
  - [ ] Make Payment

### Edge Cases
- [ ] Expired session redirects to customer login
- [ ] Invalid customer profile shows appropriate error
- [ ] Customer with no vehicles shows empty state
- [ ] Customer with no appointments shows empty state
- [ ] Database queries are optimized (no N+1 queries)

---

## 📚 Documentation Updates Needed

1. **Update CUSTOMER_PORTAL_ACCESS_GUIDE.md**
   - Add password reset instructions
   - Document customer profile editing
   - Add troubleshooting section

2. **Create CUSTOMER_PORTAL_SECURITY.md**
   - Document authentication flow
   - Explain rate limiting
   - Security best practices

3. **Update README.md**
   - Add customer portal section
   - Link to customer portal guide

---

## 🎯 Success Criteria

Customer portal auth separation is complete when:

1. ✅ All portal views use `@customer_login_required` decorator
2. ✅ Password reset functionality works
3. ✅ No staff users can access customer portal
4. ✅ No customers can access staff portal
5. ✅ All authentication redirects point to correct login pages
6. ✅ Customer profile editing works
7. ✅ All tests pass
8. ✅ Documentation is updated

---

## 📞 Support

For questions or issues:
- Review code in `apps/customers/auth_views.py`
- Review decorator in `apps/customers/portal_views.py`
- Check templates in `templates/portal/`
- Reference Django authentication docs

---

**Last Updated:** October 5, 2025  
**Reviewed By:** AI Assistant  
**Status:** Awaiting Implementation
