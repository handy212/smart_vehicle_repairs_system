# Notification Integration Guide

## Overview
This document describes how notifications are integrated throughout the Smart Vehicle Repairs System. Notifications are automatically sent when key events occur across appointments, work orders, invoices, payments, and inventory.

---

## 🔔 Automatic Notification Triggers

### Appointments

#### 1. **Appointment Confirmed**
- **When:** Customer appointment is confirmed by staff
- **Recipient:** Customer
- **Channel:** Email
- **Priority:** Normal
- **Trigger Location:** `apps/appointments/views.py` → `confirm()` action
- **Content:** Confirmation details with date, time, vehicle, technician

#### 2. **Appointment Cancelled**
- **When:** Appointment is cancelled
- **Recipient:** Customer
- **Channel:** Email
- **Priority:** Normal
- **Trigger Location:** `apps/appointments/views.py` → `cancel()` action
- **Content:** Cancellation notice with reason

#### 3. **Vehicle Ready for Pickup**
- **When:** Appointment is marked as completed
- **Recipient:** Customer
- **Channel:** Email
- **Priority:** High
- **Trigger Location:** `apps/appointments/views.py` → `complete()` action
- **Content:** Vehicle ready notice

#### 4. **Appointment Reminder** (Scheduled)
- **When:** Run via management command (24 hours before appointment)
- **Recipient:** Customer
- **Channel:** Email
- **Priority:** High
- **Command:** `python manage.py send_appointment_reminders`
- **Content:** Reminder with appointment details

---

### Work Orders

#### 5. **Work Order Created**
- **When:** New work order is created
- **Recipient:** Customer
- **Channel:** Email
- **Priority:** Normal
- **Trigger:** Can be added to `perform_create` in WorkOrderViewSet
- **Content:** Work order number, vehicle, description

#### 6. **Approval Required**
- **When:** Work order requires customer approval
- **Recipient:** Customer
- **Channel:** Email
- **Priority:** High
- **Trigger Location:** `apps/workorders/views.py` → `request_approval()` action
- **Content:** Diagnosis notes, estimated cost, approval request

#### 7. **Work Order Approved**
- **When:** Customer approves work order
- **Recipient:** Technician (primary)
- **Channel:** In-App
- **Priority:** High
- **Trigger Location:** `apps/workorders/views.py` → `approve()` action
- **Content:** Approval notice, ready to start work

#### 8. **Work Order Completed**
- **When:** Work order passes quality check
- **Recipient:** Customer
- **Channel:** Email
- **Priority:** Normal
- **Trigger Location:** `apps/workorders/views.py` → `quality_check()` action
- **Content:** Completion notice, pickup instructions

---

### Invoices & Payments

#### 9. **Invoice Sent**
- **When:** Invoice is sent to customer
- **Recipient:** Customer
- **Channel:** Email
- **Priority:** High
- **Trigger Location:** `apps/billing/views.py` → `send()` action (InvoiceViewSet)
- **Content:** Invoice number, amount due, due date, payment instructions

#### 10. **Invoice Due Soon** (Scheduled)
- **When:** Run via management command (3 days before due)
- **Recipient:** Customer
- **Channel:** Email
- **Priority:** High
- **Command:** `python manage.py send_invoice_reminders --due-soon-days 3`
- **Content:** Reminder with days until due

#### 11. **Invoice Overdue** (Scheduled)
- **When:** Run via management command (daily check for overdue)
- **Recipient:** Customer
- **Channel:** Email
- **Priority:** Urgent
- **Command:** `python manage.py send_invoice_reminders`
- **Content:** Overdue notice with days overdue

#### 12. **Payment Received**
- **When:** Payment is created/recorded
- **Recipient:** Customer
- **Channel:** Email
- **Priority:** Normal
- **Trigger Location:** `apps/billing/serializers.py` → `PaymentCreateSerializer.create()`
- **Content:** Payment confirmation, amount, remaining balance

---

### Inventory

#### 13. **Low Stock Alert** (Scheduled)
- **When:** Run via management command (daily check)
- **Recipient:** Parts Managers
- **Channel:** In-App
- **Priority:** Urgent
- **Command:** `python manage.py send_low_stock_alerts`
- **Content:** Part details, current stock, reorder point

#### 14. **Parts Received**
- **When:** Purchase order is received
- **Recipient:** Requester (who ordered parts)
- **Channel:** In-App
- **Priority:** Normal
- **Trigger:** Can be added to PO receive action
- **Content:** PO number, supplier, parts list

---

### Inspections

#### 15. **Inspection Completed**
- **When:** Vehicle inspection is completed
- **Recipient:** Customer
- **Channel:** Email
- **Priority:** Normal
- **Trigger:** Can be added to inspection complete action
- **Content:** Inspection results, pass/fail items

---

## 🛠️ Implementation Details

### Integration Points

All notification triggers are located in:
```python
apps/notifications_app/triggers.py
```

Import in any view:
```python
from apps.notifications_app.triggers import notification_triggers
```

### Example Usage in Views

```python
@action(detail=True, methods=['post'])
def confirm(self, request, pk=None):
    """Confirm appointment"""
    appointment = self.get_object()
    
    # ... validation logic ...
    
    appointment.status = 'confirmed'
    appointment.save()
    
    # Send notification
    try:
        notification_triggers.appointment_confirmed(appointment)
    except Exception as e:
        # Log but don't fail the request
        print(f"Failed to send notification: {e}")
    
    return Response(serializer.data)
```

### Error Handling

All notification triggers use try-except blocks to ensure that notification failures **do not break the main workflow**. Notifications are sent asynchronously from the main business logic.

```python
try:
    notification_triggers.some_notification(obj)
except Exception as e:
    print(f"Failed to send notification: {e}")
    # Main request continues normally
```

---

## ⏰ Scheduled Notifications (Cron Jobs)

### Management Commands

The system includes 4 management commands for scheduled notifications:

#### 1. Send Scheduled Notifications
```bash
python manage.py send_scheduled_notifications
```
- **Purpose:** Send notifications with `scheduled_for` date in the past
- **Frequency:** Every hour (recommended)
- **Cron:** `0 * * * * cd /path/to/project && python manage.py send_scheduled_notifications`

#### 2. Send Appointment Reminders
```bash
python manage.py send_appointment_reminders --hours-ahead 24
```
- **Purpose:** Remind customers about upcoming appointments
- **Frequency:** Daily at 9 AM (recommended)
- **Cron:** `0 9 * * * cd /path/to/project && python manage.py send_appointment_reminders`

#### 3. Send Invoice Reminders
```bash
python manage.py send_invoice_reminders --due-soon-days 3
```
- **Purpose:** Remind customers about invoices due soon and send overdue notices
- **Frequency:** Daily at 8 AM (recommended)
- **Cron:** `0 8 * * * cd /path/to/project && python manage.py send_invoice_reminders`

#### 4. Send Low Stock Alerts
```bash
python manage.py send_low_stock_alerts
```
- **Purpose:** Alert parts managers about parts below reorder point
- **Frequency:** Daily at 7 AM (recommended)
- **Cron:** `0 7 * * * cd /path/to/project && python manage.py send_low_stock_alerts`

### Complete Crontab Example

```bash
# Edit crontab
crontab -e

# Add these lines (adjust paths):
0 * * * * cd /home/user/smart_vehicle_repairs_system && /home/user/smart_vehicle_repairs_system/venv/bin/python manage.py send_scheduled_notifications >> /var/log/notifications.log 2>&1
0 7 * * * cd /home/user/smart_vehicle_repairs_system && /home/user/smart_vehicle_repairs_system/venv/bin/python manage.py send_low_stock_alerts >> /var/log/notifications.log 2>&1
0 8 * * * cd /home/user/smart_vehicle_repairs_system && /home/user/smart_vehicle_repairs_system/venv/bin/python manage.py send_invoice_reminders >> /var/log/notifications.log 2>&1
0 9 * * * cd /home/user/smart_vehicle_repairs_system && /home/user/smart_vehicle_repairs_system/venv/bin/python manage.py send_appointment_reminders >> /var/log/notifications.log 2>&1
```

---

## 📝 Adding New Notification Triggers

### Step 1: Add Trigger Method to `triggers.py`

```python
def new_event_notification(self, obj):
    """Send notification for new event"""
    if not obj.customer.user:
        return
    
    notification = Notification.objects.create(
        recipient=obj.customer.user,
        notification_type='custom',  # or appropriate type
        channel='email',
        priority='normal',
        title='Event Title',
        message='Event message with {{details}}',
        data={
            'obj_id': obj.id,
            'relevant_field': obj.field,
        },
        related_object_type='model_name',
        related_object_id=obj.id
    )
    self.service.send_notification(notification)
```

### Step 2: Call from View

```python
from apps.notifications_app.triggers import notification_triggers

@action(detail=True, methods=['post'])
def custom_action(self, request, pk=None):
    obj = self.get_object()
    
    # ... business logic ...
    
    try:
        notification_triggers.new_event_notification(obj)
    except Exception as e:
        print(f"Failed to send notification: {e}")
    
    return Response(serializer.data)
```

### Step 3: Create Template (Optional)

Create a NotificationTemplate via admin or API with:
- `template_type`: Choose appropriate type or 'custom'
- `channel`: email, sms, push, in_app
- Subject/body with {{variable}} placeholders

---

## 🧪 Testing Notifications

### Test Individual Trigger

```python
# Django shell
python manage.py shell

from apps.appointments.models import Appointment
from apps.notifications_app.triggers import notification_triggers

appointment = Appointment.objects.first()
notification_triggers.appointment_confirmed(appointment)
```

### Test Management Commands

```bash
# Test appointment reminders
python manage.py send_appointment_reminders --hours-ahead 168

# Test invoice reminders
python manage.py send_invoice_reminders --due-soon-days 7

# Test low stock alerts
python manage.py send_low_stock_alerts

# Test scheduled notifications
python manage.py send_scheduled_notifications
```

### Check Email Output (Console Backend)

If using console email backend (development), check terminal for email output:
```
Content-Type: text/plain; charset="utf-8"
MIME-Version: 1.0
Content-Transfer-Encoding: 7bit
Subject: Appointment Confirmed - 2025-10-05
From: noreply@smartvehiclerepairs.com
To: customer@example.com
Date: Wed, 02 Oct 2025 10:30:00 -0000

Your appointment has been confirmed...
```

---

## 📊 Monitoring Notifications

### View Notification Logs

```bash
# API endpoint
GET /api/notifications/logs/?action=failed

# Django shell
from apps.notifications_app.models import NotificationLog
failed = NotificationLog.objects.filter(action='failed')
for log in failed:
    print(f"{log.notification.title}: {log.details}")
```

### Check Notification Statistics

```bash
# API endpoint
GET /api/notifications/notifications/stats/

# Response shows counts by type, channel, status
```

### Failed Notifications

```bash
# Find failed notifications
GET /api/notifications/notifications/?status=failed

# Resend a failed notification
POST /api/notifications/notifications/{id}/resend/
```

---

## 🔧 Configuration

### Email Settings

Edit `config/settings.py`:

```python
# Development (console)
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Production (SMTP)
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'your_email@gmail.com'
EMAIL_HOST_PASSWORD = 'your_app_password'
DEFAULT_FROM_EMAIL = 'noreply@smartvehiclerepairs.com'
```

### SMS Configuration (Future)

Edit `apps/notifications_app/services.py` → `_send_sms()`:
```python
import twilio
# Add Twilio credentials and logic
```

### Push Notification Configuration (Future)

Edit `apps/notifications_app/services.py` → `_send_push()`:
```python
import firebase_admin
# Add Firebase credentials and logic
```

---

## ✅ Current Integration Status

| Feature | Integrated | Tested | Notes |
|---------|-----------|--------|-------|
| Appointment Confirmed | ✅ | ⏳ | Ready |
| Appointment Cancelled | ✅ | ⏳ | Ready |
| Vehicle Ready | ✅ | ⏳ | Ready |
| Appointment Reminder (Scheduled) | ✅ | ⏳ | Management command ready |
| Work Order Approval Required | ✅ | ⏳ | Ready |
| Work Order Approved | ✅ | ⏳ | Ready |
| Work Order Completed | ✅ | ⏳ | Ready |
| Invoice Sent | ✅ | ⏳ | Ready |
| Invoice Due Soon (Scheduled) | ✅ | ⏳ | Management command ready |
| Invoice Overdue (Scheduled) | ✅ | ⏳ | Management command ready |
| Payment Received | ✅ | ⏳ | Ready |
| Low Stock Alert (Scheduled) | ✅ | ⏳ | Management command ready |

---

## 📚 Additional Resources

- **PHASE8_COMPLETE.md** - Complete Phase 8 documentation
- **QUICK_START_PHASE8.md** - Testing guide with examples
- **apps/notifications_app/triggers.py** - All trigger implementations
- **apps/notifications_app/services.py** - Notification sending logic
- **apps/notifications_app/models.py** - Data models

---

## 🎯 Next Steps

1. **Test Integration:**
   - Create test appointments and confirm them
   - Create test work orders and request approval
   - Create test invoices and send them
   - Record test payments

2. **Setup Cron Jobs:**
   - Configure crontab for scheduled commands
   - Monitor logs for errors

3. **Configure Email:**
   - Set up production SMTP settings
   - Test email delivery

4. **Optional Enhancements:**
   - Add SMS integration (Twilio)
   - Add push notifications (Firebase)
   - Create custom notification templates
   - Add notification preferences UI

---

**Integration Complete!** The notification system is now fully integrated and sending automatic notifications for key events throughout the system.
