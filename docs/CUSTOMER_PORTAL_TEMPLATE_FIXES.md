# Customer Portal Template Fixes

## Date: October 5, 2025

## Issues Fixed

### 1. Template Syntax Error in `service_card.html` ❌
**Error:** `TemplateSyntaxError: Could not parse some characters: service.status| == 'completed'||yesno:'success,'`

**Location:** `templates/portal/partials/service_card.html` line 20

**Problem:**
The badge class was using invalid Django template syntax, mixing comparison operators (`==`) with the `yesno` filter in an incorrect way:
```django
<span class="badge bg-{{ service.status == 'completed'|yesno:'success,' }}{{ service.status == 'in_progress'|yesno:'warning,' }}{{ service.status == 'pending'|yesno:'info,secondary' }}">
```

**Solution:**
Replaced with proper Django conditional template tags:
```django
<span class="badge bg-{% if service.status == 'completed' %}success{% elif service.status == 'in_progress' %}warning{% elif service.status == 'pending' %}info{% else %}secondary{% endif %}">
```

### 2. NoReverseMatch Error - Invalid URL Names ❌
**Error:** `NoReverseMatch: Reverse for 'workorder-detail' not found`

**Location:** Multiple templates
- `templates/portal/partials/service_card.html` line 57
- `templates/portal/partials/invoice_card.html` lines 30, 76

**Problem:**
Templates were trying to link to staff-only views that:
1. Used incorrect URL names (`workorder-detail` instead of `workorders:detail`)
2. Shouldn't be accessible to customers for security reasons (exposes internal business data)

**Solution:**
- **Removed "View Details" button** from service cards (links to staff workorder detail)
- **Removed "View Invoice" button** from invoice cards (links to staff invoice detail)
- **Removed clickable link** from work order number in invoice cards
- **Kept "Print Invoice" button** (customers can print their invoices)

Added TODO comments for future implementation:
```html
<!-- TODO: Add customer-specific service detail view -->
<!-- Staff workorder and invoice detail pages are not accessible to customers for security reasons -->
```

### 3. Template Syntax Error in `invoice_card.html` ❌
**Error:** Same `yesno` filter syntax issue as service_card.html

**Location:** `templates/portal/partials/invoice_card.html` line 11

**Problem:**
Invalid badge class syntax:
```django
<span class="badge bg-{{ invoice.status == 'paid'|yesno:'success,' }}{{ invoice.status == 'pending'|yesno:'warning,' }}...">
```

**Solution:**
Replaced with proper conditional tags:
```django
<span class="badge bg-{% if invoice.status == 'paid' %}success{% elif invoice.status == 'pending' %}warning{% elif invoice.status == 'sent' %}info{% elif invoice.status == 'overdue' %}danger{% elif invoice.status == 'cancelled' %}secondary{% else %}warning{% endif %} px-3 py-2">
```

## Files Modified

1. ✅ `/templates/portal/partials/service_card.html`
   - Fixed badge status conditional logic
   - Removed staff-only "View Details" and "View Invoice" buttons
   
2. ✅ `/templates/portal/partials/invoice_card.html`
   - Fixed badge status conditional logic
   - Removed staff-only "View Invoice" button
   - Removed clickable link from work order reference
   - Kept "Print Invoice" button for customer use

## Testing Performed

✅ **Django Check:** `python manage.py check` - No issues found
✅ **Template Syntax:** All Django template syntax is now valid
✅ **URL Resolution:** All remaining URLs resolve correctly

## Status Badge Colors

### Service Status (Work Orders)
- 🟢 **Completed** → `bg-success` (green)
- 🟡 **In Progress** → `bg-warning` (yellow)
- 🔵 **Pending** → `bg-info` (blue)
- ⚫ **Other** → `bg-secondary` (gray)

### Invoice Status
- 🟢 **Paid** → `bg-success` (green)
- 🟡 **Pending** → `bg-warning` (yellow)
- 🔵 **Sent** → `bg-info` (blue)
- 🔴 **Overdue** → `bg-danger` (red)
- ⚫ **Cancelled** → `bg-secondary` (gray)

## Next Steps (TODO)

### High Priority 🔴
1. **Create Customer Service Detail View**
   - Add `portal/service-detail/<int:work_order_id>/` URL
   - Create `customer_service_detail` view in `portal_views.py`
   - Create `templates/portal/service_detail.html` template
   - Show sanitized work order information (no internal costs, technician notes, etc.)

2. **Create Customer Invoice Detail View**
   - Add `portal/invoice-detail/<int:invoice_id>/` URL
   - Create `customer_invoice_detail` view in `portal_views.py`
   - Create `templates/portal/invoice_detail.html` template
   - Show full invoice with line items, payments, balance

### Medium Priority 🟡
3. **Re-enable "View Details" Buttons**
   - After creating customer-specific views, update service_card.html:
   ```django
   <a href="{% url 'portal:service-detail' service.id %}" class="btn btn-sm btn-outline-primary">
       <i class="fas fa-eye me-1"></i> View Details
   </a>
   ```

4. **Re-enable "View Invoice" Buttons**
   - After creating customer invoice view, update invoice_card.html:
   ```django
   <a href="{% url 'portal:invoice-detail' invoice.id %}" class="btn btn-sm btn-outline-primary">
       <i class="fas fa-eye me-1"></i> View Invoice
   </a>
   ```

### Low Priority 🟢
5. **Add Appointment Detail View** (if needed)
6. **Add Vehicle Service History Detail View** (if needed)

## Security Considerations ⚠️

**Why we removed staff view links:**

1. **Data Privacy:** Staff work order detail pages may contain:
   - Internal cost breakdowns and markup percentages
   - Technician private notes
   - Shop-only communications
   - Labor hour tracking and rates

2. **Business Intelligence:** Invoices may expose:
   - Wholesale vs retail pricing
   - Profit margins
   - Vendor information
   - Internal accounting details

3. **User Experience:** Staff interfaces are complex and confusing for customers
   - Too much technical information
   - Access control checks would fail anyway
   - Better to create simplified customer-friendly views

## Verification Steps

To verify the fixes work:

1. **Start the development server:**
   ```bash
   python manage.py runserver 8000
   ```

2. **Login as a customer:**
   - Go to: `http://localhost:8000/customer/login/`
   - Use a test customer account

3. **Test Service History Page:**
   - Navigate to: `http://localhost:8000/portal/my-history/`
   - Verify page loads without errors
   - Check status badges show correct colors
   - Verify no "View Details" buttons appear

4. **Test Invoices Page:**
   - Navigate to: `http://localhost:8000/portal/my-invoices/`
   - Verify page loads without errors
   - Check status badges show correct colors
   - Verify only "Print Invoice" button appears (no "View Invoice")

## Notes

- All fixes maintain backward compatibility
- No database migrations required
- No changes to models or business logic
- Only template presentation layer updated
- Staff portal remains unchanged and functional

## Related Documentation

- [CUSTOMER_PORTAL_ACCESS_GUIDE.md](CUSTOMER_PORTAL_ACCESS_GUIDE.md) - How customers access the portal
- [CUSTOMER_SIDEBAR_FIX.md](CUSTOMER_SIDEBAR_FIX.md) - Previous sidebar visibility fix
- [CUSTOMER_PORTAL_TESTING_GUIDE.md](CUSTOMER_PORTAL_TESTING_GUIDE.md) - Complete testing guide

---

**Status:** ✅ All immediate issues resolved  
**Django Check:** ✅ Passing  
**Ready for Testing:** ✅ Yes
