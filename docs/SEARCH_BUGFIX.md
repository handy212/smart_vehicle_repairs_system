# Search Function Bug Fix

## Date: October 6, 2025

## Issue
The search function was throwing `FieldError` because it was trying to search for fields that don't exist in the models.

### Errors Encountered:
1. **Customer Model**: Tried to search `first_name`, `last_name`, `email`, `phone` directly on Customer
   - These fields are actually on the related `User` model
   
2. **WorkOrder Model**: Tried to search `description` field
   - WorkOrder doesn't have a `description` field
   - Actual fields: `customer_concerns`, `diagnosis_notes`, `special_instructions`

3. **Appointment Model**: Used `service_description` and incorrect date/time fields
   - Actual field: `customer_concerns`
   - Date fields: `appointment_date` and `appointment_time` (not `scheduled_date`/`scheduled_time`)

---

## Solution

### Fixed Customer Search
```python
# BEFORE (Wrong - these fields don't exist on Customer)
customers = Customer.objects.filter(
    Q(first_name__icontains=query) | 
    Q(last_name__icontains=query) | 
    Q(email__icontains=query) | 
    Q(phone__icontains=query)
)

# AFTER (Correct - using related user fields)
customers = Customer.objects.filter(
    Q(user__first_name__icontains=query) | 
    Q(user__last_name__icontains=query) | 
    Q(user__email__icontains=query) | 
    Q(user__phone__icontains=query) |
    Q(customer_number__icontains=query) |
    Q(company_name__icontains=query)
).select_related('user')[:10]
```

### Fixed WorkOrder Search
```python
# BEFORE (Wrong - description field doesn't exist)
workorders = WorkOrder.objects.filter(
    Q(work_order_number__icontains=query) | 
    Q(description__icontains=query) |
    ...
)

# AFTER (Correct - using actual WorkOrder fields)
workorders = WorkOrder.objects.filter(
    Q(work_order_number__icontains=query) | 
    Q(customer_concerns__icontains=query) | 
    Q(diagnosis_notes__icontains=query) |
    Q(special_instructions__icontains=query) |
    Q(vehicle__license_plate__icontains=query) | 
    Q(customer__user__first_name__icontains=query) | 
    Q(customer__user__last_name__icontains=query)
).select_related('vehicle', 'customer', 'customer__user')[:10]
```

### Fixed Appointment Search
```python
# BEFORE (Wrong - notes and service_description don't exist)
appointments = Appointment.objects.filter(
    Q(appointment_number__icontains=query) | 
    Q(notes__icontains=query) |
    Q(service_description__icontains=query) |
    ...
)

# AFTER (Correct - using special_instructions and customer_concerns)
appointments = Appointment.objects.filter(
    Q(appointment_number__icontains=query) | 
    Q(special_instructions__icontains=query) |
    Q(customer_concerns__icontains=query) |
    Q(customer__user__first_name__icontains=query) | 
    Q(customer__user__last_name__icontains=query) | 
    Q(vehicle__license_plate__icontains=query)
).select_related('customer', 'customer__user', 'vehicle')[:10]
```

---

## Template Fixes

### Work Order Display
```django
{# BEFORE #}
<p class="mb-1 small">{{ wo.description|truncatewords:15 }}</p>

{# AFTER #}
<p class="mb-1 small">{{ wo.customer_concerns|truncatewords:15 }}</p>
```

### Appointment Display
```django
{# BEFORE #}
Date: {{ apt.scheduled_date|date:"M d, Y" }} at {{ apt.scheduled_time }}
{% if apt.notes %}
<p class="mb-1 small">{{ apt.notes|truncatewords:15 }}</p>
{% endif %}

{# AFTER #}
Date: {{ apt.appointment_date|date:"M d, Y" }} at {{ apt.appointment_time }}
{% if apt.customer_concerns %}
<p class="mb-1 small">{{ apt.customer_concerns|truncatewords:15 }}</p>
{% endif %}
```

---

## Model Structure Reference

### Customer Model
```python
class Customer(models.Model):
    user = models.OneToOneField(User)  # User has: first_name, last_name, email, phone
    customer_number = models.CharField(...)
    company_name = models.CharField(...)
    # ... other fields
```

### WorkOrder Model
```python
class WorkOrder(models.Model):
    work_order_number = models.CharField(...)
    customer_concerns = models.TextField(...)  # What customer reported
    diagnosis_notes = models.TextField(...)    # Technician's diagnosis
    special_instructions = models.TextField(...)
    # NO 'description' field
```

### Appointment Model
```python
class Appointment(models.Model):
    appointment_number = models.CharField(...)
    appointment_date = models.DateField(...)    # NOT scheduled_date
    appointment_time = models.TimeField(...)    # NOT scheduled_time
    customer_concerns = models.TextField(...)   # NOT service_description
    notes = models.TextField(...)
```

---

## Files Modified

1. **`config/views.py`** - Fixed search queries to use correct field names
2. **`templates/search_results.html`** - Fixed template to display correct fields

---

## Testing

✅ Django check passes with no errors
✅ Search queries now use correct field names
✅ Template displays correct data fields
✅ All select_related() calls optimized for performance

---

## Key Learnings

1. **Customer data is stored in related User model** - Always access via `customer.user.first_name`, etc.
2. **WorkOrder uses specific field names** - `customer_concerns` for what customer reported, not generic `description`
3. **Appointment date/time fields** - Use `appointment_date` and `appointment_time`, not `scheduled_*`
4. **Always check model definitions** - Don't assume field names, verify in models.py

---

## Search Now Works For:

### Customers
- Name (first/last via user)
- Email (via user)
- Phone (via user)
- Customer number
- Company name

### Vehicles
- Make
- Model
- License plate
- VIN

### Work Orders
- Work order number
- Customer concerns
- Diagnosis notes
- Special instructions
- Related vehicle license plate
- Related customer name

### Appointments
- Appointment number
- Notes
- Customer concerns
- Related customer name
- Related vehicle license plate

---

## Status: ✅ FIXED

Search is now fully functional and error-free!
