# Phase 8: Notifications System - Quick Start Testing Guide

This guide provides step-by-step examples to test the notifications system functionality.

---

## 🔐 AUTHENTICATION SETUP

### 1. Login to Get Access Token
```bash
# Login as admin
curl -X POST http://localhost:8080/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }'

# Save the access token
export TOKEN="<access_token_from_response>"
```

---

## 📧 NOTIFICATION TEMPLATES

### 1. Create Appointment Reminder Email Template
```bash
curl -X POST http://localhost:8080/api/notifications/templates/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Appointment Reminder - Email",
    "template_type": "appointment_reminder",
    "channel": "email",
    "subject": "🔔 Appointment Reminder - {{ appointment_date }}",
    "body": "Hi {{ customer_name }},\n\nThis is a reminder about your upcoming appointment:\n\nDate: {{ appointment_date }}\nTime: {{ appointment_time }}\nVehicle: {{ vehicle }}\nService: {{ service_description }}\n\nPlease arrive 10 minutes early.\n\nThank you!",
    "html_body": "<h2>Appointment Reminder</h2><p>Hi {{ customer_name }},</p><p>This is a reminder about your upcoming appointment:</p><ul><li><strong>Date:</strong> {{ appointment_date }}</li><li><strong>Time:</strong> {{ appointment_time }}</li><li><strong>Vehicle:</strong> {{ vehicle }}</li><li><strong>Service:</strong> {{ service_description }}</li></ul><p>Please arrive 10 minutes early.</p><p>Thank you!</p>",
    "is_active": true,
    "variables": {
      "customer_name": "Customer name",
      "appointment_date": "Appointment date",
      "appointment_time": "Appointment time",
      "vehicle": "Vehicle info",
      "service_description": "Service description"
    }
  }'
```

**Expected Response:**
```json
{
  "id": 1,
  "name": "Appointment Reminder - Email",
  "template_type": "appointment_reminder",
  "channel": "email",
  "subject": "🔔 Appointment Reminder - {{ appointment_date }}",
  "is_active": true,
  "created_at": "2025-10-02T10:00:00Z",
  "created_by_name": "Admin User"
}
```

### 2. Create Invoice Due SMS Template
```bash
curl -X POST http://localhost:8080/api/notifications/templates/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Invoice Due - SMS",
    "template_type": "invoice_due",
    "channel": "sms",
    "sms_body": "Hi {{ customer_name }}, your invoice #{{ invoice_number }} for ${{ total }} is due on {{ due_date }}. Pay online at {{ payment_link }}",
    "is_active": true,
    "variables": {
      "customer_name": "Customer name",
      "invoice_number": "Invoice number",
      "total": "Total amount",
      "due_date": "Due date",
      "payment_link": "Payment URL"
    }
  }'
```

### 3. List All Templates
```bash
curl -X GET http://localhost:8080/api/notifications/templates/ \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Filter Templates by Type
```bash
# Get appointment templates only
curl -X GET "http://localhost:8080/api/notifications/templates/?template_type=appointment_reminder" \
  -H "Authorization: Bearer $TOKEN"

# Get email templates only
curl -X GET "http://localhost:8080/api/notifications/templates/?channel=email" \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Search Templates
```bash
curl -X GET "http://localhost:8080/api/notifications/templates/?search=invoice" \
  -H "Authorization: Bearer $TOKEN"
```

### 6. Test Send Template
```bash
# Get a user ID first (e.g., customer ID)
curl -X GET http://localhost:8080/api/customers/ \
  -H "Authorization: Bearer $TOKEN"

# Test send template to user
curl -X POST http://localhost:8080/api/notifications/templates/1/test_send/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_id": 2,
    "data": {
      "customer_name": "John Doe",
      "appointment_date": "October 5, 2025",
      "appointment_time": "10:00 AM",
      "vehicle": "2020 Toyota Camry",
      "service_description": "Oil Change & Inspection"
    }
  }'
```

---

## 🔔 NOTIFICATIONS

### 1. Create Simple Notification
```bash
curl -X POST http://localhost:8080/api/notifications/notifications/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": 2,
    "notification_type": "system",
    "channel": "in_app",
    "priority": "normal",
    "title": "Welcome to Smart Vehicle Repairs!",
    "message": "Thank you for creating your account. We look forward to serving you."
  }'
```

### 2. Create Scheduled Notification
```bash
# Schedule for 1 hour from now
curl -X POST http://localhost:8080/api/notifications/notifications/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": 2,
    "notification_type": "appointment",
    "channel": "email",
    "priority": "high",
    "title": "Appointment Tomorrow",
    "message": "This is a reminder that you have an appointment tomorrow at 10 AM.",
    "scheduled_for": "2025-10-02T18:00:00Z"
  }'
```

### 3. Create Notification with Template
```bash
curl -X POST http://localhost:8080/api/notifications/notifications/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": 2,
    "notification_type": "appointment",
    "channel": "email",
    "priority": "high",
    "template": 1,
    "data": {
      "customer_name": "John Doe",
      "appointment_date": "October 5, 2025",
      "appointment_time": "10:00 AM",
      "vehicle": "2020 Toyota Camry",
      "service_description": "Oil Change & Inspection"
    }
  }'
```

### 4. View My Notifications
```bash
# All notifications
curl -X GET http://localhost:8080/api/notifications/notifications/my_notifications/ \
  -H "Authorization: Bearer $TOKEN"

# Unread only
curl -X GET "http://localhost:8080/api/notifications/notifications/my_notifications/?unread_only=true" \
  -H "Authorization: Bearer $TOKEN"

# By type
curl -X GET "http://localhost:8080/api/notifications/notifications/my_notifications/?type=appointment" \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Get Unread Count
```bash
curl -X GET http://localhost:8080/api/notifications/notifications/unread_count/ \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "unread_count": 5
}
```

### 6. Mark Notification as Read
```bash
# Mark single notification as read (use notification ID)
curl -X POST http://localhost:8080/api/notifications/notifications/1/mark_read/ \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Notification marked as read"
}
```

### 7. Mark All as Read
```bash
curl -X POST http://localhost:8080/api/notifications/notifications/mark_all_read/ \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "5 notifications marked as read",
  "count": 5
}
```

### 8. Clear Read Notifications
```bash
curl -X DELETE http://localhost:8080/api/notifications/notifications/clear_read/ \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "3 notifications deleted",
  "count": 3
}
```

### 9. Get Notification Statistics
```bash
curl -X GET http://localhost:8080/api/notifications/notifications/stats/ \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "total_notifications": 50,
  "unread_count": 12,
  "by_type": {
    "appointment": 20,
    "work_order": 15,
    "invoice": 10,
    "payment": 3,
    "system": 2
  },
  "by_channel": {
    "email": 30,
    "in_app": 20
  },
  "by_status": {
    "delivered": 45,
    "failed": 2,
    "read": 30,
    "pending": 3
  },
  "recent_notifications": [...]
}
```

### 10. Send Bulk Notifications
```bash
curl -X POST http://localhost:8080/api/notifications/notifications/bulk_send/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_ids": [2, 3, 4, 5],
    "notification_type": "system",
    "channel": "in_app",
    "priority": "normal",
    "title": "System Maintenance Notice",
    "message": "Our system will be down for maintenance this Sunday from 2 AM to 6 AM. We apologize for any inconvenience."
  }'
```

**Expected Response:**
```json
{
  "message": "Sent 4 notifications",
  "results": [
    {
      "notification_id": 101,
      "recipient_id": 2,
      "status": "pending",
      "success": true
    },
    {
      "notification_id": 102,
      "recipient_id": 3,
      "status": "pending",
      "success": true
    },
    {
      "notification_id": 103,
      "recipient_id": 4,
      "status": "pending",
      "success": true
    },
    {
      "notification_id": 104,
      "recipient_id": 5,
      "status": "pending",
      "success": true
    }
  ]
}
```

### 11. Resend Failed Notification
```bash
# First, create a notification that might fail (e.g., invalid email)
# Then resend it with correct details

curl -X POST http://localhost:8080/api/notifications/notifications/1/resend/ \
  -H "Authorization: Bearer $TOKEN"
```

### 12. Filter Notifications
```bash
# By type
curl -X GET "http://localhost:8080/api/notifications/notifications/?notification_type=invoice" \
  -H "Authorization: Bearer $TOKEN"

# By channel
curl -X GET "http://localhost:8080/api/notifications/notifications/?channel=email" \
  -H "Authorization: Bearer $TOKEN"

# By status
curl -X GET "http://localhost:8080/api/notifications/notifications/?status=delivered" \
  -H "Authorization: Bearer $TOKEN"

# By priority
curl -X GET "http://localhost:8080/api/notifications/notifications/?priority=high" \
  -H "Authorization: Bearer $TOKEN"

# Unread only
curl -X GET "http://localhost:8080/api/notifications/notifications/?is_read=false" \
  -H "Authorization: Bearer $TOKEN"

# Multiple filters
curl -X GET "http://localhost:8080/api/notifications/notifications/?notification_type=appointment&status=delivered&priority=high" \
  -H "Authorization: Bearer $TOKEN"
```

---

## ⚙️ NOTIFICATION PREFERENCES

### 1. Get My Preferences
```bash
curl -X GET http://localhost:8080/api/notifications/preferences/my_preferences/ \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "id": 1,
  "user": 2,
  "user_email": "john@example.com",
  "user_name": "John Doe",
  "email_enabled": true,
  "sms_enabled": false,
  "push_enabled": true,
  "in_app_enabled": true,
  "appointment_notifications": true,
  "work_order_notifications": true,
  "invoice_notifications": true,
  "payment_notifications": true,
  "inspection_notifications": true,
  "inventory_notifications": false,
  "vehicle_notifications": true,
  "system_notifications": true,
  "quiet_hours_enabled": false,
  "quiet_hours_start": null,
  "quiet_hours_end": null,
  "digest_enabled": false,
  "digest_frequency": "daily",
  "phone_number": "",
  "push_token": "",
  "created_at": "2025-10-02T10:00:00Z",
  "updated_at": "2025-10-02T10:00:00Z"
}
```

### 2. Enable SMS Notifications
```bash
curl -X PUT http://localhost:8080/api/notifications/preferences/update_preferences/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sms_enabled": true,
    "phone_number": "+1234567890"
  }'
```

### 3. Set Quiet Hours
```bash
curl -X PATCH http://localhost:8080/api/notifications/preferences/update_preferences/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quiet_hours_enabled": true,
    "quiet_hours_start": "22:00:00",
    "quiet_hours_end": "08:00:00"
  }'
```

### 4. Disable Invoice Notifications
```bash
curl -X PATCH http://localhost:8080/api/notifications/preferences/update_preferences/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invoice_notifications": false
  }'
```

### 5. Enable Daily Digest
```bash
curl -X PATCH http://localhost:8080/api/notifications/preferences/update_preferences/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "digest_enabled": true,
    "digest_frequency": "daily"
  }'
```

### 6. Update Push Token (for Mobile Apps)
```bash
curl -X POST http://localhost:8080/api/notifications/preferences/update_push_token/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "push_token": "fcm_token_xxxxxxxxxxxxxxxxxxxxxxxxxx"
  }'
```

### 7. Opt Out of All Email Notifications
```bash
curl -X PATCH http://localhost:8080/api/notifications/preferences/update_preferences/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email_enabled": false
  }'
```

---

## 📊 NOTIFICATION LOGS

### 1. View All Logs (Admin Only)
```bash
curl -X GET http://localhost:8080/api/notifications/logs/ \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
[
  {
    "id": 1,
    "notification": 1,
    "notification_title": "Appointment Reminder",
    "action": "created",
    "details": "Notification created",
    "metadata": {},
    "timestamp": "2025-10-02T09:00:00Z"
  },
  {
    "id": 2,
    "notification": 1,
    "notification_title": "Appointment Reminder",
    "action": "sent",
    "details": "Email sent to john@example.com",
    "metadata": {
      "email": "john@example.com",
      "subject": "Appointment Reminder - October 5, 2025"
    },
    "timestamp": "2025-10-02T09:00:10Z"
  },
  {
    "id": 3,
    "notification": 1,
    "notification_title": "Appointment Reminder",
    "action": "delivered",
    "details": "Email delivered successfully",
    "metadata": {},
    "timestamp": "2025-10-02T09:00:15Z"
  }
]
```

### 2. Filter Logs by Notification
```bash
curl -X GET "http://localhost:8080/api/notifications/logs/?notification=1" \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Filter Logs by Action
```bash
# View all failed attempts
curl -X GET "http://localhost:8080/api/notifications/logs/?action=failed" \
  -H "Authorization: Bearer $TOKEN"

# View all sent notifications
curl -X GET "http://localhost:8080/api/notifications/logs/?action=sent" \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Get Logs for Specific Notification
```bash
curl -X GET "http://localhost:8080/api/notifications/logs/by_notification/?notification_id=1" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🎯 REAL-WORLD TESTING SCENARIOS

### Scenario 1: Appointment Reminder Flow

**Step 1:** Create appointment reminder template (see above)

**Step 2:** Get customer ID
```bash
curl -X GET http://localhost:8080/api/customers/ \
  -H "Authorization: Bearer $TOKEN"
# Note customer ID (e.g., 2) and user ID (e.g., 5)
```

**Step 3:** Send appointment reminder
```bash
curl -X POST http://localhost:8080/api/notifications/notifications/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": 5,
    "notification_type": "appointment",
    "channel": "email",
    "priority": "high",
    "template": 1,
    "data": {
      "customer_name": "John Doe",
      "appointment_date": "October 5, 2025",
      "appointment_time": "10:00 AM",
      "vehicle": "2020 Toyota Camry",
      "service_description": "Oil Change & Inspection"
    },
    "related_object_type": "appointment",
    "related_object_id": 123,
    "scheduled_for": "2025-10-04T18:00:00Z"
  }'
```

**Step 4:** Customer views notification
```bash
# Login as customer
export CUSTOMER_TOKEN="<customer_access_token>"

curl -X GET http://localhost:8080/api/notifications/notifications/my_notifications/ \
  -H "Authorization: Bearer $CUSTOMER_TOKEN"
```

**Step 5:** Customer marks as read
```bash
curl -X POST http://localhost:8080/api/notifications/notifications/1/mark_read/ \
  -H "Authorization: Bearer $CUSTOMER_TOKEN"
```

---

### Scenario 2: Invoice Due Reminder

**Step 1:** Create invoice
```bash
# Assuming invoice already exists with ID 456
```

**Step 2:** Send invoice due notification
```bash
curl -X POST http://localhost:8080/api/notifications/notifications/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": 5,
    "notification_type": "invoice",
    "channel": "email",
    "priority": "normal",
    "title": "Invoice Due",
    "message": "Your invoice #INV000456 for $1,250.00 is due on October 15, 2025.",
    "data": {
      "invoice_id": 456,
      "invoice_number": "INV000456",
      "total": "1250.00",
      "due_date": "2025-10-15"
    },
    "related_object_type": "invoice",
    "related_object_id": 456
  }'
```

---

### Scenario 3: Low Stock Alert to Parts Manager

**Step 1:** Get parts manager user ID
```bash
curl -X GET "http://localhost:8080/api/auth/users/?role=parts_manager" \
  -H "Authorization: Bearer $TOKEN"
# Note user ID (e.g., 10)
```

**Step 2:** Send low stock alert
```bash
curl -X POST http://localhost:8080/api/notifications/notifications/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": 10,
    "notification_type": "inventory",
    "channel": "in_app",
    "priority": "urgent",
    "title": "Low Stock Alert: Oil Filter",
    "message": "Oil Filter (PN: OF12345) is below reorder point. Current stock: 3, Reorder point: 10.",
    "data": {
      "part_id": 789,
      "part_name": "Oil Filter",
      "part_number": "OF12345",
      "current_stock": 3,
      "reorder_point": 10
    },
    "related_object_type": "part",
    "related_object_id": 789
  }'
```

**Step 3:** Parts manager views alert
```bash
# Login as parts manager
export MANAGER_TOKEN="<manager_access_token>"

curl -X GET "http://localhost:8080/api/notifications/notifications/my_notifications/?type=inventory&priority=urgent" \
  -H "Authorization: Bearer $MANAGER_TOKEN"
```

---

### Scenario 4: System Maintenance Announcement

**Step 1:** Get all active user IDs
```bash
curl -X GET http://localhost:8080/api/auth/users/ \
  -H "Authorization: Bearer $TOKEN"
# Note all user IDs (e.g., [2, 3, 4, 5, 6, 7, 8])
```

**Step 2:** Send bulk announcement
```bash
curl -X POST http://localhost:8080/api/notifications/notifications/bulk_send/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_ids": [2, 3, 4, 5, 6, 7, 8],
    "notification_type": "system",
    "channel": "in_app",
    "priority": "normal",
    "title": "System Maintenance - Sunday, October 8",
    "message": "Our system will be down for maintenance this Sunday from 2:00 AM to 6:00 AM. During this time, you will not be able to access the system. We apologize for any inconvenience.",
    "scheduled_for": "2025-10-05T20:00:00Z"
  }'
```

---

## 🎨 ADMIN INTERFACE TESTING

### 1. Access Admin Panel
Open browser: `http://localhost:8080/admin/`

Login with admin credentials

### 2. View Notification Templates
Navigate to: **Notifications App → Notification Templates**

**What to look for:**
- ✅ Color-coded template type badges
- ✅ Channel icons (📧 💬 🔔 📱)
- ✅ Active/Inactive status badges
- ✅ Filter by template type, channel, active status
- ✅ Search by name, subject, body

### 3. View Notifications
Navigate to: **Notifications App → Notifications**

**What to look for:**
- ✅ Type badges (color-coded)
- ✅ Channel icons
- ✅ Priority badges (LOW/NORMAL/HIGH/URGENT)
- ✅ Status badges (⏳ pending, 📤 sent, ✓ delivered, ✗ failed, ✓✓ read)
- ✅ Read/Unread indicators (👁 / ○)
- ✅ Filter by type, channel, priority, status, read status
- ✅ Date hierarchy

### 4. Test Admin Actions
**Select multiple notifications** → Choose action:
- **Mark as read** - Marks selected notifications as read
- **Mark as sent** - Marks as sent (for testing)
- **Resend failed** - Resends failed notifications

### 5. View Notification Preferences
Navigate to: **Notifications App → Notification Preferences**

**What to look for:**
- ✅ Channel badges (enabled/disabled with opacity)
- ✅ Quiet hours badge (🌙)
- ✅ All preference fields
- ✅ Filter by boolean preferences

### 6. View Notification Logs
Navigate to: **Notifications App → Notification Logs**

**What to look for:**
- ✅ Action badges (color-coded)
- ✅ Truncated details
- ✅ Date hierarchy
- ✅ Read-only (no add/change permissions)

---

## 🧪 TESTING CHECKLIST

### Template Management
- [ ] Create email template
- [ ] Create SMS template
- [ ] Create push notification template
- [ ] List all templates
- [ ] Filter templates by type
- [ ] Filter templates by channel
- [ ] Search templates
- [ ] Test send template
- [ ] Update template
- [ ] Deactivate template
- [ ] Delete template

### Notification Operations
- [ ] Create in-app notification
- [ ] Create email notification
- [ ] Create scheduled notification
- [ ] View my notifications
- [ ] Filter notifications by type
- [ ] Filter notifications by status
- [ ] Get unread count
- [ ] Mark single notification as read
- [ ] Mark all notifications as read
- [ ] Clear read notifications
- [ ] Get notification statistics
- [ ] Send bulk notifications
- [ ] Resend failed notification

### User Preferences
- [ ] Get my preferences (auto-created)
- [ ] Enable SMS notifications
- [ ] Set quiet hours
- [ ] Disable specific notification types
- [ ] Enable digest emails
- [ ] Update push token
- [ ] Opt out of email notifications

### Notification Logs
- [ ] View all logs
- [ ] Filter logs by notification
- [ ] Filter logs by action
- [ ] Get logs for specific notification

### Admin Interface
- [ ] View templates in admin
- [ ] View notifications in admin
- [ ] Use admin actions (mark as read, resend)
- [ ] View preferences in admin
- [ ] View logs in admin
- [ ] Filter and search in admin

### Integration Testing
- [ ] Send appointment reminder
- [ ] Send invoice notification
- [ ] Send low stock alert
- [ ] Send system announcement
- [ ] Verify email delivery (check inbox)
- [ ] Verify status tracking (pending → sent → delivered → read)
- [ ] Verify preference enforcement (quiet hours, opt-outs)

---

## 📧 EMAIL TESTING

### Check Email Delivery (Console)
If using console email backend (default), check terminal output:

```bash
# Terminal will show:
# Subject: Appointment Reminder - October 5, 2025
# From: noreply@smartvehiclerepairs.com
# To: john@example.com
# ---
# Hi John Doe,
# ...
```

### Configure Real Email (Optional)
Edit `config/settings.py`:

```python
# For Gmail
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'your_email@gmail.com'
EMAIL_HOST_PASSWORD = 'your_app_password'  # Use app password, not regular password
DEFAULT_FROM_EMAIL = 'your_email@gmail.com'
```

Then restart server and test again.

---

## 🔧 TROUBLESHOOTING

### Issue: Notification not sent
**Check:**
1. User preferences - Is channel enabled?
2. Quiet hours - Is it during quiet hours?
3. Notification status - Check status field
4. Notification logs - View detailed logs
5. Email configuration - Is email backend configured?

### Issue: Template not rendering
**Check:**
1. Template syntax - Use Django template syntax
2. Variable names - Match variables in data field
3. Template active - Is template marked as active?

### Issue: Can't see notifications
**Check:**
1. Authentication - Is token valid?
2. Permissions - Customers see only their own, admins see all
3. Filters - Are filters applied correctly?

### Issue: Bulk send not working
**Check:**
1. User IDs - Are all user IDs valid?
2. Permissions - Need admin/manager role for bulk operations
3. Request format - Check recipient_ids array format

---

## ✅ EXPECTED RESULTS

After completing all tests, you should have:

✅ **Templates Created:**
- At least 2 templates (email + SMS)
- Templates visible in admin
- Templates tested and working

✅ **Notifications Sent:**
- At least 5 notifications created
- Multiple channels tested (email, in-app)
- Status tracking working (pending → sent → delivered → read)
- Scheduled notifications created

✅ **Preferences Configured:**
- User preferences auto-created
- Channel preferences updated
- Quiet hours configured
- Type preferences customized

✅ **Logs Generated:**
- Notification logs created for all actions
- Logs visible in admin
- Filtering working correctly

✅ **Admin Interface:**
- Color-coded badges visible
- Filters working
- Actions functioning
- Search working

---

## 🎉 Testing Complete!

You now have a fully functional notification system with:
- ✅ Multi-channel delivery (email, SMS, push, in-app)
- ✅ Template management
- ✅ User preference controls
- ✅ Scheduled notifications
- ✅ Bulk operations
- ✅ Complete audit trail
- ✅ Beautiful admin interface

**Next:** Integrate with appointments, work orders, invoices, and inventory for automated notifications!

**Phase 9 Preview:** Document Management System (file uploads, version control, sharing)
