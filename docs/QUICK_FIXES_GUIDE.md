# Quick Fixes Guide - Critical Issues

**Purpose:** Step-by-step guide to fix critical issues identified in code review  
**Estimated Time:** 1-2 days  
**Priority:** Complete these ASAP before production

---

## Fix #1: Replace Print Statements (2-3 hours)

### Issue
20+ print statements found in production code. These should use proper logging.

### Files to Fix
```bash
# Find all print statements
grep -rn "^\s*print(" --include="*.py" apps/ | grep -v "__main__"
```

### Example Fix

**BEFORE:**
```python
# apps/billing/frontend_views.py:260
print(f"DEBUG - Form data: customer_id={customer_id}, vehicle_id={vehicle_id}")
```

**AFTER:**
```python
import logging
logger = logging.getLogger(__name__)

logger.debug(f"Form data: customer_id={customer_id}, vehicle_id={vehicle_id}")
```

### Step-by-Step

1. **Add logging import at top of file:**
   ```python
   import logging
   logger = logging.getLogger(__name__)
   ```

2. **Replace each print() with logger call:**
   ```python
   # Debug information
   print("Value:", value)  →  logger.debug(f"Value: {value}")
   
   # General information
   print("Processing...")  →  logger.info("Processing...")
   
   # Warnings
   print("Warning!")  →  logger.warning("Warning!")
   
   # Errors
   print("Error!")  →  logger.error("Error!")
   ```

3. **Special cases - Test/diagnostic code:**
   ```python
   # Keep print() in __main__ blocks for CLI testing
   if __name__ == '__main__':
       print("Test results...")  # OK - CLI only
   ```

4. **Verify fix:**
   ```bash
   # Should return 0 (or only __main__ blocks)
   grep -rn "^\s*print(" --include="*.py" apps/ | grep -v "__main__" | wc -l
   ```

### Files List
- `apps/billing/frontend_views.py` (line 260)
- `apps/notifications_app/hubtel_sms.py` (lines 241-252)
- `apps/billing/paystack_integration.py` (lines 191-207)
- `apps/billing/hubtel_payment.py` (lines 343-350)

---

## Fix #2: Fix Bare Exception Handlers (4-6 hours)

### Issue
15 instances of bare `except:` or `except Exception:` that silently swallow errors.

### Files to Fix
```bash
# Find all bare exception handlers
grep -rn "except:\|except Exception:" --include="*.py" apps/ | grep -v migrations
```

### Example Fix

**BEFORE:**
```python
# apps/vehicles/vin_decoder.py:143
try:
    data = parse_vin(vin)
    return data
except:
    return None
```

**AFTER:**
```python
import logging
logger = logging.getLogger(__name__)

try:
    data = parse_vin(vin)
    return data
except ValueError as e:
    logger.warning(f"Invalid VIN format: {vin}, error: {e}")
    return None
except requests.RequestException as e:
    logger.error(f"VIN API request failed: {e}", exc_info=True)
    return None
except Exception as e:
    logger.error(f"Unexpected error parsing VIN: {e}", exc_info=True)
    return None
```

### Pattern to Follow

```python
# 1. Import logging
import logging
logger = logging.getLogger(__name__)

# 2. Catch specific exceptions first
try:
    risky_operation()
except SpecificException as e:
    logger.error(f"Specific error: {e}")
    # Handle specific case
except AnotherException as e:
    logger.warning(f"Another error: {e}")
    # Handle another case
except Exception as e:
    # Only use as last resort
    logger.error(f"Unexpected error: {e}", exc_info=True)
    # Generic handling
```

### Files List
1. `apps/inspections/frontend_views.py:194`
2. `apps/accounts/settings_utils.py:31`
3. `apps/accounts/settings_utils.py:68`
4. `apps/customers/auth_views.py:96`
5. `apps/vehicles/templatetags/vehicle_filters.py:20`
6. `apps/vehicles/templatetags/vehicle_filters.py:37`
7. `apps/vehicles/forms.py:291`
8. `apps/vehicles/vin_decoder.py:143`
9. `apps/vehicles/vin_decoder.py:153`
10. `apps/vehicles/vin_decoder.py:173`

### Verification
```bash
# Should return 0
grep -rn "^\s*except:\s*$" --include="*.py" apps/ | grep -v migrations | wc -l
```

---

## Fix #3: Complete Critical TODOs (1-2 days)

### Issue
15 TODO comments indicating incomplete features.

### Find TODOs
```bash
grep -rn "TODO\|FIXME" --include="*.py" apps/
```

### Critical TODOs to Implement

#### 1. Customer Notifications
**File:** `apps/workorders/frontend_views.py:1106`

**BEFORE:**
```python
# TODO: Send notification to customer
```

**AFTER:**
```python
from apps.notifications_app.services import NotificationService

# Send notification to customer
NotificationService.send_notification(
    recipient=work_order.customer.user,
    notification_type='workorder_completed',
    context={
        'work_order': work_order,
        'vehicle': work_order.vehicle,
    }
)
```

#### 2. Email Sending in Documents
**File:** `apps/documents/views.py:336, 363`

**BEFORE:**
```python
# TODO: Send email if send_email is True and email provided
```

**AFTER:**
```python
from django.core.mail import send_mail
from django.template.loader import render_to_string

if send_email and email:
    subject = f"Document Shared: {document.name}"
    message = render_to_string('documents/email/share_notification.html', {
        'document': document,
        'share_link': share.get_absolute_url(),
    })
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        html_message=message,
    )
```

#### 3. Report Email Delivery
**File:** `apps/reporting/frontend_views.py:308`

**BEFORE:**
```python
# TODO: Implement email sending
```

**AFTER:**
```python
from django.core.mail import EmailMessage

if send_email:
    email = EmailMessage(
        subject=f"Report: {report_type}",
        body=f"Attached is your {report_type} report.",
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[request.user.email],
    )
    # Attach report file
    email.attach(f'report_{report_type}.pdf', report_data, 'application/pdf')
    email.send()
```

### Non-Critical TODOs
Create GitHub issues for these:
- `apps/reporting/frontend_views.py:25-26` - Scheduled reports model
- `apps/reporting/frontend_views.py:327` - Save report configuration
- `apps/reporting/frontend_views.py:338` - Schedule editing
- `apps/reporting/frontend_views.py:346` - Schedule deletion

---

## Fix #4: Add Basic API Documentation (1 day)

### Issue
No API documentation despite drf-spectacular being installed.

### Quick Setup

#### Step 1: Configure Settings
```python
# config/settings/base.py

# Add to REST_FRAMEWORK
REST_FRAMEWORK = {
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    # ... other settings
}

# Add spectacular settings
SPECTACULAR_SETTINGS = {
    'TITLE': 'Smart Vehicle Repairs API',
    'DESCRIPTION': 'Complete vehicle repair management system API',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}
```

#### Step 2: Add URLs
```python
# config/urls.py
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView
)

urlpatterns = [
    # ... existing patterns
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]
```

#### Step 3: Add Basic Docstrings (Example)
```python
# apps/workorders/views.py
from drf_spectacular.utils import extend_schema, OpenApiParameter

class WorkOrderViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing work orders.
    
    Work orders track vehicle service and repair jobs.
    """
    
    @extend_schema(
        summary="List work orders",
        description="Get a list of all work orders with filtering and pagination.",
        parameters=[
            OpenApiParameter(
                name='status',
                description='Filter by status',
                required=False,
                type=str
            ),
        ]
    )
    def list(self, request):
        """List all work orders"""
        return super().list(request)
    
    @extend_schema(
        summary="Create work order",
        description="Create a new work order for a vehicle."
    )
    def create(self, request):
        """Create a new work order"""
        return super().create(request)
```

#### Step 4: Test
```bash
python manage.py spectacular --file schema.yml
python manage.py runserver

# Visit:
# http://localhost:8000/api/docs/      (Swagger UI)
# http://localhost:8000/api/redoc/     (ReDoc)
# http://localhost:8000/api/schema/    (Raw schema)
```

---

## Fix #5: Add Security Headers (2-3 hours)

### Issue
Missing security headers in production settings.

### Quick Fix

**File:** `config/settings/production.py`

```python
# Add these settings

# SSL/HTTPS
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Secure Cookies
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True

# Security Headers
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

# HSTS
SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# CORS - Fix development setting
# In config/settings/development.py, change:
CORS_ALLOW_ALL_ORIGINS = False  # Was True
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
```

### Test Security
```bash
python manage.py check --deploy
```

---

## Fix #6: Add Rate Limiting (3-4 hours)

### Issue
No rate limiting on API endpoints.

### Quick Fix

#### Step 1: Configure in Settings
```python
# config/settings/base.py

REST_FRAMEWORK = {
    # ... existing settings
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
        'user': '1000/hour',
    }
}
```

#### Step 2: Add Custom Throttles for Sensitive Endpoints
```python
# apps/accounts/throttles.py (new file)
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

class LoginThrottle(AnonRateThrottle):
    rate = '10/hour'

class PaymentThrottle(UserRateThrottle):
    rate = '50/hour'
```

#### Step 3: Apply to Views
```python
# apps/accounts/views.py
from .throttles import LoginThrottle

class LoginView(APIView):
    throttle_classes = [LoginThrottle]
    # ... rest of view

# apps/billing/views.py
from apps.accounts.throttles import PaymentThrottle

class PaymentViewSet(viewsets.ModelViewSet):
    throttle_classes = [PaymentThrottle]
    # ... rest of view
```

#### Step 4: Test
```bash
# Test with curl (should get 429 after limit)
for i in {1..15}; do
    curl -X POST http://localhost:8000/api/accounts/login/
done
```

---

## Verification Checklist

After completing all fixes:

### Code Quality
- [ ] No print() statements in production code
  ```bash
  grep -rn "^\s*print(" --include="*.py" apps/ | grep -v "__main__" | wc -l
  # Should be 0
  ```

- [ ] No bare exception handlers
  ```bash
  grep -rn "^\s*except:\s*$" --include="*.py" apps/ | grep -v migrations | wc -l
  # Should be 0
  ```

- [ ] All critical TODOs completed
  ```bash
  grep -rn "TODO" --include="*.py" apps/ | wc -l
  # Should be 0 or only non-critical items
  ```

### Security
- [ ] Security headers configured
  ```bash
  python manage.py check --deploy
  # Should pass all checks
  ```

- [ ] Rate limiting configured
  ```bash
  # Test authentication endpoint
  curl -I http://localhost:8000/api/accounts/login/
  # Should see X-RateLimit headers
  ```

### Documentation
- [ ] API docs accessible
  ```bash
  curl http://localhost:8000/api/schema/
  # Should return OpenAPI schema
  ```

- [ ] Swagger UI works
  ```
  Visit: http://localhost:8000/api/docs/
  # Should see interactive API documentation
  ```

---

## Quick Test Commands

```bash
# 1. Check code quality
python manage.py check
python manage.py check --deploy

# 2. Run existing tests
python manage.py test

# 3. Check for security issues
python manage.py check --deploy

# 4. Verify migrations
python manage.py makemigrations --dry-run
python manage.py showmigrations

# 5. Test API documentation
python manage.py spectacular --file schema.yml

# 6. Start development server
python manage.py runserver

# 7. Visit API docs
# http://localhost:8000/api/docs/
```

---

## Need Help?

### Common Issues

**Issue:** Import errors after changes  
**Solution:** Restart Django development server

**Issue:** Logging not showing  
**Solution:** Check LOGGING configuration in settings

**Issue:** API docs not showing all endpoints  
**Solution:** Add @extend_schema decorators to custom actions

**Issue:** Rate limiting not working  
**Solution:** Verify REST_FRAMEWORK settings include throttle classes

---

## Summary

These quick fixes address the most critical issues:
1. ✅ Replace 20+ print statements with logging (2-3 hours)
2. ✅ Fix 15 bare exception handlers (4-6 hours)
3. ✅ Complete critical TODOs (1-2 days)
4. ✅ Add API documentation (1 day)
5. ✅ Add security headers (2-3 hours)
6. ✅ Add rate limiting (3-4 hours)

**Total Time:** 2-3 days  
**Impact:** HIGH - Significantly improves production readiness

After completing these fixes, the system will be much closer to production-ready status.
