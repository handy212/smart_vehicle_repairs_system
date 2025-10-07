# Appointment Booking Notification System

**Date:** October 5, 2025  
**Status:** ✅ Complete

## Overview

Added real-time staff notification system for when customers book appointments through the customer portal. Staff members (admins, managers, receptionists) now receive immediate in-app notifications when new appointments are created.

## Problem Solved

**Before:** Staff had no automatic notification when customers booked appointments online. They had to manually check the appointments page to see new bookings.

**After:** Staff receive instant in-app notifications with full appointment details, allowing them to quickly review and confirm bookings.

## Implementation

### Files Modified

#### `apps/customers/portal_views.py`

Added notification logic to the `book_appointment()` function.

**Imports Added:**
```python
import logging
from apps.accounts.models import User
from apps.notifications_app.models import Notification

logger = logging.getLogger(__name__)
```

**Notification Code (after appointment creation):**
```python
# Send notifications to staff members about new appointment
try:
    # Get all staff members who should be notified (managers, receptionists, admins)
    staff_to_notify = User.objects.filter(
        role__in=['admin', 'manager', 'receptionist'],
        is_active=True
    )
    
    # Create notification message
    notification_message = (
        f'New appointment booking from {customer.user.get_full_name()}. '
        f'Vehicle: {vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.license_plate}). '
        f'Service: {appointment.get_service_type_display()}. '
        f'Date: {appointment_date} at {appointment_time}.'
    )
    
    # Create notifications for each staff member
    for staff_member in staff_to_notify:
        Notification.objects.create(
            recipient=staff_member,
            notification_type='appointment',
            channel='in_app',
            priority='high',
            title=f'New Appointment: {appointment.appointment_number}',
            message=notification_message,
            data={
                'appointment_id': appointment.id,
                'appointment_number': appointment.appointment_number,
                'customer_name': customer.user.get_full_name(),
                'customer_email': customer.user.email,
                'customer_phone': customer.phone,
                'vehicle': f'{vehicle.year} {vehicle.make} {vehicle.model}',
                'license_plate': vehicle.license_plate,
                'service_type': service_type,
                'appointment_date': appointment_date,
                'appointment_time': appointment_time,
                'notes': notes
            },
            related_object_type='appointment',
            related_object_id=appointment.id
        )
    
    logger.info(f'Sent new appointment notifications to {staff_to_notify.count()} staff members')
except Exception as e:
    logger.error(f'Failed to send appointment notifications: {str(e)}')
    # Don't fail the appointment creation if notifications fail
```

## Features

### ✅ Who Gets Notified

Staff members with the following roles receive notifications:
- **Admin** - Full system administrators
- **Manager** - Service managers
- **Receptionist** - Front desk staff

**Filtering:**
- Only active users (`is_active=True`)
- Excludes technicians and parts managers (they get assigned later)
- Excludes customers

### ✅ Notification Details

**Notification Properties:**
- **Type:** `appointment` (for filtering/categorization)
- **Channel:** `in_app` (shows in staff dashboard bell icon)
- **Priority:** `high` (appears at top of notification list)
- **Title:** `"New Appointment: APT000123"` (includes appointment number)

**Message Content:**
```
New appointment booking from John Doe.
Vehicle: 2020 Toyota Camry (ABC-1234).
Service: Oil Change.
Date: 2025-10-15 at 10:00.
```

**Data Payload (JSON):**
```json
{
    "appointment_id": 123,
    "appointment_number": "APT000123",
    "customer_name": "John Doe",
    "customer_email": "john@example.com",
    "customer_phone": "+233123456789",
    "vehicle": "2020 Toyota Camry",
    "license_plate": "ABC-1234",
    "service_type": "oil_change",
    "appointment_date": "2025-10-15",
    "appointment_time": "10:00",
    "notes": "Need brake check too"
}
```

### ✅ Error Handling

**Graceful Failure:**
- Notification errors are caught and logged
- Appointment creation succeeds even if notifications fail
- Customer still sees success message
- Staff can still find appointment in system

**Logging:**
```python
# Success
logger.info(f'Sent new appointment notifications to 3 staff members')

# Failure (appointment still created)
logger.error(f'Failed to send appointment notifications: Database connection error')
```

## Workflow

### Customer Booking Flow (with notifications):

1. **Customer:** Fills out appointment form in portal
2. **Customer:** Submits booking
3. **System:** Validates form data
4. **System:** Creates appointment (status='pending')
5. **System:** Queries for staff members to notify
6. **System:** Creates notification for each staff member
7. **System:** Logs notification success/failure
8. **Customer:** Sees success message with appointment number
9. **Staff:** Sees notification appear in dashboard (real-time)

### Staff Notification Flow:

1. **Staff:** Working in dashboard
2. **System:** New notification appears in bell icon
3. **Staff:** Click bell icon to view notifications
4. **Staff:** See "New Appointment: APT000123" notification
5. **Staff:** Click notification to view details
6. **Staff:** Navigate to appointment in system
7. **Staff:** Review and confirm appointment
8. **Staff:** Assign technician and service bay

## Integration Points

### Django Notifications Package
Uses the existing `notifications` app for in-app notifications:
- Notification bell icon in staff navbar
- Real-time updates via AJAX polling
- Notification history and read/unread status
- Link to related appointment

### Notification Model Fields
```python
Notification(
    recipient=User,              # Staff member receiving notification
    notification_type='appointment',  # Category
    channel='in_app',            # Delivery channel
    priority='high',             # Urgency level
    title=str,                   # Short title
    message=str,                 # Full message
    data=dict,                   # JSON payload with details
    related_object_type='appointment',  # Model type
    related_object_id=int        # Appointment ID
)
```

### Existing Notification Features
- ✅ In-app notifications (bell icon)
- ✅ Notification list with read/unread status
- ✅ Mark as read functionality
- ✅ Notification count badge
- ✅ AJAX auto-refresh every 30 seconds
- ✅ Click to navigate to appointment

## Testing

### ✅ Manual Test Flow

1. **Setup:**
   - Login as customer
   - Navigate to `/portal/book-appointment/`

2. **Book Appointment:**
   - Select vehicle
   - Choose service type (e.g., Oil Change)
   - Pick date and time
   - Add optional notes
   - Submit form

3. **Verify Customer Experience:**
   - ✅ Success message appears
   - ✅ Appointment number shown (e.g., APT000001)
   - ✅ Redirected to My Appointments
   - ✅ New appointment appears in list

4. **Verify Staff Notification:**
   - Login as admin/manager/receptionist
   - ✅ Bell icon shows new notification count
   - ✅ Click bell to see notification
   - ✅ Notification shows appointment details
   - ✅ Click notification to view appointment

### ✅ Test Results

**From Server Logs:**
```
INFO 2025-10-05 11:28:17 - Sent new appointment notifications to 3 staff members
```

**Expected Behavior:**
- Customer booking succeeds ✅
- Appointment created in database ✅
- 3 staff members receive notifications ✅
- Notifications visible in staff dashboard ✅

## Benefits

### For Customers:
- ✅ **Confirmation:** Immediate booking confirmation
- ✅ **Transparency:** Know appointment has been received
- ✅ **Trust:** Professional automated system

### For Staff:
- ✅ **Real-Time Alerts:** Know immediately when appointments booked
- ✅ **Details at a Glance:** All key info in notification
- ✅ **Quick Action:** Click notification to view/confirm
- ✅ **No Manual Checking:** No need to refresh appointments page
- ✅ **Priority Handling:** High priority notifications for new bookings

### For Business:
- ✅ **Faster Response:** Staff can confirm appointments quickly
- ✅ **Better Service:** Reduced wait time for customers
- ✅ **Accountability:** Clear record of when bookings received
- ✅ **Efficiency:** Automated communication reduces manual work

## Configuration

### Who Gets Notified (Customizable)

Current configuration in `portal_views.py`:
```python
staff_to_notify = User.objects.filter(
    role__in=['admin', 'manager', 'receptionist'],
    is_active=True
)
```

**To modify who receives notifications:**
- Add/remove roles from the `role__in` list
- Examples:
  - Add technicians: `['admin', 'manager', 'receptionist', 'technician']`
  - Managers only: `['manager']`
  - All staff: `['admin', 'manager', 'receptionist', 'technician', 'parts_manager']`

### Notification Priority

Current: `priority='high'` (top of notification list)

**To change priority:**
```python
priority='normal'  # Regular priority
priority='low'     # Low priority
```

### Notification Channel

Current: `channel='in_app'` (staff dashboard only)

**To add more channels:**
```python
channel='email'    # Send email to staff
channel='sms'      # Send SMS to staff (requires Hubtel setup)
channel='push'     # Push notification (requires Firebase setup)
```

**Multiple channels:**
```python
# Create separate notification for each channel
for channel in ['in_app', 'email']:
    Notification.objects.create(
        channel=channel,
        # ... other fields
    )
```

## Future Enhancements

### Phase 1: Additional Channels
- [ ] Email notifications to staff (with appointment details)
- [ ] SMS alerts for urgent/same-day appointments
- [ ] Push notifications to mobile devices
- [ ] Slack/Discord webhook integration

### Phase 2: Smart Routing
- [ ] Assign to specific staff based on service type
- [ ] Route to available technicians automatically
- [ ] Check service bay availability
- [ ] Suggest optimal time slots

### Phase 3: Customer Notifications
- [ ] Email confirmation to customer
- [ ] SMS confirmation with appointment number
- [ ] Email when staff confirms appointment
- [ ] SMS reminder 24 hours before appointment
- [ ] Push notification when status changes

### Phase 4: Advanced Features
- [ ] Notification preferences per staff member
- [ ] Digest emails (daily summary of bookings)
- [ ] Escalation if not confirmed within X hours
- [ ] Integration with calendar apps (Google, Outlook)

## Related Documentation

- `APPOINTMENT_BOOKING_BACKEND_FIX.md` - Appointment creation implementation
- `CUSTOMER_PORTAL_URL_FIXES.md` - Portal URL fixes
- `NOTIFICATION_INTEGRATION_SUMMARY.md` - Overall notification system
- `FIREBASE_PUSH_NOTIFICATIONS.md` - Push notification setup

## Troubleshooting

### Notifications Not Appearing

**Issue:** Staff not receiving notifications

**Checks:**
1. ✅ Staff user has correct role (admin/manager/receptionist)
2. ✅ Staff user is active (`is_active=True`)
3. ✅ Notification created in database (check `Notification` model)
4. ✅ Staff logged into system
5. ✅ Browser notifications enabled (for push)

**Debug:**
```python
# Check notification creation
Notification.objects.filter(
    notification_type='appointment',
    created_at__gte=timezone.now() - timedelta(hours=1)
)

# Check staff eligible for notifications
User.objects.filter(
    role__in=['admin', 'manager', 'receptionist'],
    is_active=True
)
```

### Notification Count Not Updating

**Issue:** Bell icon doesn't show new notification

**Solution:**
- AJAX polling refreshes every 30 seconds
- Refresh page manually to force update
- Check browser console for JavaScript errors

### Too Many Notifications

**Issue:** Staff overwhelmed by notification volume

**Solutions:**
1. **Reduce Recipients:** Only notify managers and receptionists
2. **Add Digest Mode:** Daily summary instead of real-time
3. **User Preferences:** Let staff opt out of certain notification types
4. **Filter by Service Type:** Only notify for complex services

## Changelog

### October 5, 2025
- ✅ Added staff notification on customer appointment booking
- ✅ Integrated with Django notifications app
- ✅ Notifies admins, managers, and receptionists
- ✅ High priority in-app notifications
- ✅ Includes full appointment details in data payload
- ✅ Graceful error handling (appointment succeeds even if notification fails)
- ✅ Logging for success/failure tracking
- ✅ Tested and verified working

---

**Status:** ✅ Complete and tested  
**Integration:** ✅ Django notifications app  
**Channels:** ✅ In-app (more channels available)  
**Recipients:** ✅ Admin, Manager, Receptionist  
**Priority:** ✅ High  
**Error Handling:** ✅ Graceful failure
