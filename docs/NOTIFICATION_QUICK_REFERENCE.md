# 📋 Notification Quick Reference

## Import Statement
```python
from apps.notifications_app.triggers import notification_triggers
```

---

## 🔔 Available Triggers

### Appointments
```python
notification_triggers.appointment_confirmed(appointment)
notification_triggers.appointment_cancelled(appointment, reason='')
notification_triggers.appointment_reminder(appointment)
notification_triggers.vehicle_ready(appointment)
```

### Work Orders
```python
notification_triggers.work_order_created(work_order)
notification_triggers.work_order_requires_approval(work_order)
notification_triggers.work_order_approved(work_order)
notification_triggers.work_order_completed(work_order)
```

### Invoices & Payments
```python
notification_triggers.invoice_generated(invoice)
notification_triggers.invoice_sent(invoice)
notification_triggers.invoice_due_soon(invoice, days_until_due=3)
notification_triggers.invoice_overdue(invoice)
notification_triggers.payment_received(payment)
```

### Inventory
```python
notification_triggers.low_stock_alert(part, recipient)
notification_triggers.parts_received(purchase_order)
```

### Inspections
```python
notification_triggers.inspection_completed(inspection)
```

### Vehicles
```python
notification_triggers.service_due_reminder(vehicle)
```

---

## 🛠️ Usage Pattern

```python
@action(detail=True, methods=['post'])
def my_action(self, request, pk=None):
    obj = self.get_object()
    
    # ... your business logic ...
    
    obj.save()
    
    # Send notification (always wrap in try-except)
    try:
        notification_triggers.some_notification(obj)
    except Exception as e:
        print(f"Failed to send notification: {e}")
    
    return Response(serializer.data)
```

---

## ⏰ Management Commands

```bash
# Scheduled notifications
python manage.py send_scheduled_notifications

# Appointment reminders (24h ahead)
python manage.py send_appointment_reminders --hours-ahead 24

# Invoice reminders (3d before due + overdue)
python manage.py send_invoice_reminders --due-soon-days 3

# Low stock alerts
python manage.py send_low_stock_alerts
```

---

## 📊 API Endpoints

```bash
# Get my notifications
GET /api/notifications/notifications/my_notifications/

# Mark as read
POST /api/notifications/notifications/{id}/mark_read/

# Get unread count
GET /api/notifications/notifications/unread_count/

# Get stats
GET /api/notifications/notifications/stats/

# My preferences
GET /api/notifications/preferences/my_preferences/

# Update preferences
PUT /api/notifications/preferences/update_preferences/
```

---

## 🎨 Cron Schedule

```bash
0 * * * * send_scheduled_notifications  # Every hour
0 7 * * * send_low_stock_alerts         # Daily 7 AM
0 8 * * * send_invoice_reminders        # Daily 8 AM
0 9 * * * send_appointment_reminders    # Daily 9 AM
```

---

## 🧪 Quick Test

```python
# Django shell
python manage.py shell

from apps.appointments.models import Appointment
from apps.notifications_app.triggers import notification_triggers

appt = Appointment.objects.first()
notification_triggers.appointment_confirmed(appt)
# Check terminal for email output
```

---

## 📝 Creating Custom Notifications

```python
from apps.notifications_app.models import Notification
from apps.notifications_app.services import NotificationService

notification = Notification.objects.create(
    recipient=user,
    notification_type='custom',
    channel='email',
    priority='normal',
    title='Custom Title',
    message='Custom message',
    data={'key': 'value'}
)

service = NotificationService()
service.send_notification(notification)
```

---

## ✅ Remember

1. **Always use try-except** - Don't break main flow
2. **Check user exists** - `if obj.customer.user:`
3. **Log errors** - Print or use proper logging
4. **Test manually first** - Before setting up cron
5. **Monitor logs** - Check `/api/notifications/logs/`

---

## 📚 Full Documentation

- **NOTIFICATION_INTEGRATION.md** - Complete integration guide
- **PHASE8_COMPLETE.md** - API reference
- **QUICK_START_PHASE8.md** - Testing examples
