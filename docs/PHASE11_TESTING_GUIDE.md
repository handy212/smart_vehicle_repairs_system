# Phase 11: Notifications Center - Testing Guide

## Quick Test Checklist

### 1. URL Resolution Test ✅
```bash
cd /home/handy/smart_vehicle_repairs_system
python manage.py show_urls | grep notifications
```

Expected output:
```
/notifications/ notifications:notification-center
/notifications/preferences/ notifications:notification-preferences
/notifications/<int:pk>/ notifications:notification-detail
/notifications/<int:pk>/mark-as-read/ notifications:mark-as-read
/notifications/mark-all-as-read/ notifications:mark-all-as-read
/notifications/<int:pk>/delete/ notifications:delete-notification
/notifications/api/unread-count/ notifications:unread-count
/notifications/api/recent/ notifications:recent-notifications
```

### 2. Database Migration Test
```bash
python manage.py makemigrations
python manage.py migrate
```

### 3. Create Test Notifications (Django Shell)
```bash
python manage.py shell
```

```python
from apps.notifications_app.models import Notification
from django.contrib.auth import get_user_model

User = get_user_model()
user = User.objects.first()  # Get any user

# Create test notifications
Notification.objects.create(
    recipient=user,
    title="Test Appointment Reminder",
    message="Your appointment is scheduled for tomorrow at 2:00 PM",
    notification_type="appointment",
    priority="high",
    action_url="/appointments/1/"
)

Notification.objects.create(
    recipient=user,
    title="Work Order Completed",
    message="Work order #1234 has been completed and is ready for pickup",
    notification_type="work_order",
    priority="normal",
    action_url="/workorders/1234/"
)

Notification.objects.create(
    recipient=user,
    title="Low Stock Alert",
    message="Oil filter inventory is below minimum level",
    notification_type="inventory",
    priority="urgent",
    metadata={"part_id": 123, "current_stock": 5, "minimum_stock": 10}
)

print(f"Created {Notification.objects.filter(recipient=user).count()} test notifications")
```

### 4. Manual Browser Tests

#### Test 1: Notification Center
1. Start server: `python manage.py runserver`
2. Login as any user
3. Navigate to: http://localhost:8000/notifications/
4. ✅ Should see: Notification center with statistics header
5. ✅ Should see: Filter sidebar (status, type, search)
6. ✅ Should see: List of notifications
7. Test filters:
   - Click "Unread" → Should show only unread
   - Select "Appointment" type → Should filter by type
   - Search "work order" → Should find matching notifications

#### Test 2: Notification Bell (Header)
1. Look at top-right header
2. ✅ Should see: Bell icon with red badge showing unread count
3. Click bell icon
4. ✅ Should see: Dropdown with recent 5 notifications
5. ✅ Should see: Each notification shows icon, title, message, time ago
6. ✅ Should see: "View All" and "Settings" links at bottom
7. Click any notification → Should navigate to detail page

#### Test 3: Notification Detail
1. Click any notification from center or dropdown
2. ✅ Should see: Large notification icon
3. ✅ Should see: Full title and message
4. ✅ Should see: Priority badge (color-coded)
5. ✅ Should see: Metadata display (if present)
6. ✅ Should see: "View Related Item" button (if action_url present)
7. ✅ Should auto-mark as read (check badge count decreases)
8. Click "Delete" → Should delete and redirect to center

#### Test 4: Notification Preferences
1. Navigate to: http://localhost:8000/notifications/preferences/
2. ✅ Should see: 4 toggle switches (Email, SMS, Push, In-App)
3. ✅ Should see: 7 notification type checkboxes
4. ✅ Should see: Quiet hours time pickers
5. Toggle some switches → Click "Save Preferences"
6. ✅ Should see: Success message
7. Refresh page → ✅ Settings should persist

#### Test 5: Mark All as Read
1. Go to Notification Center
2. Click "Mark All as Read" button
3. ✅ Should see: All notifications marked as read
4. ✅ Should see: Bell badge shows 0
5. ✅ Should see: Stats update (Unread = 0)

#### Test 6: AJAX Operations
Open browser console (F12), then:
1. Click "Mark as Read" on any notification
   - ✅ Console should show: `Notification marked as read`
   - ✅ Badge count should decrease
2. Click delete button (trash icon)
   - ✅ Console should show: `Notification deleted successfully`
   - ✅ Notification should disappear
3. Watch bell badge update (wait 30 seconds)
   - ✅ Console should show: Fetch requests to `/notifications/api/unread-count/`

#### Test 7: Push Permission Prompt
1. Visit any page (if browser permission not set)
2. ✅ Should see: Blue card with "Enable Push Notifications"
3. Click "Enable Notifications"
4. ✅ Browser should prompt for notification permission
5. Allow → ✅ Should see success message
6. Deny → ✅ Should see "blocked" message with instructions
7. Click "Maybe Later" → Card should disappear for 7 days

#### Test 8: Sidebar Navigation
1. Check left sidebar
2. ✅ Should see: "Notifications" menu item with bell icon
3. ✅ Should highlight when on notification pages
4. Click link → Should navigate to Notification Center

### 5. Responsive Design Test
1. Resize browser window to mobile size (375px width)
2. ✅ Notification center should stack cards vertically
3. ✅ Filter sidebar should collapse or become horizontal
4. ✅ Bell dropdown should fit screen width
5. ✅ Detail page should be fully readable

### 6. Empty State Test
1. Delete all notifications (or use fresh user)
2. Navigate to Notification Center
3. ✅ Should see: "No notifications found" message with icon
4. ✅ Should see: Stats show "0 Total Notifications"
5. Click bell → ✅ Should show "No notifications" in dropdown

### 7. Error Handling Test
1. Try accessing non-existent notification: `/notifications/999999/`
2. ✅ Should see: 404 error page
3. Try accessing another user's notification (if possible)
4. ✅ Should see: 404 error (not permission denied, for security)

### 8. Performance Test
1. Create 100+ notifications using Django shell:
```python
from apps.notifications_app.models import Notification
from django.contrib.auth import get_user_model

User = get_user_model()
user = User.objects.first()

for i in range(100):
    Notification.objects.create(
        recipient=user,
        title=f"Test Notification {i}",
        message=f"This is test notification number {i}",
        notification_type=["appointment", "work_order", "invoice"][i % 3],
        priority=["low", "normal", "high", "urgent"][i % 4]
    )
```

2. Navigate to Notification Center
3. ✅ Should load within 2 seconds
4. ✅ Pagination should show (20 per page)
5. ✅ Filters should work without lag
6. ✅ Bell badge should update correctly

---

## Common Issues & Solutions

### Issue 1: Bell badge not updating
**Solution:** Check browser console for JavaScript errors. Ensure AJAX endpoint is accessible.

### Issue 2: Notifications not appearing
**Solution:** Check that notifications are created for the logged-in user:
```python
Notification.objects.filter(recipient=request.user)
```

### Issue 3: Toggle switches not saving
**Solution:** Check browser console for form validation errors. Ensure CSRF token is present.

### Issue 4: 404 on notification URLs
**Solution:** Verify URL patterns are registered in `config/urls.py`:
```python
path('notifications/', include('apps.notifications_app.frontend_urls', namespace='notifications')),
```

### Issue 5: Push permission not working
**Solution:** 
- Check if HTTPS is enabled (required for push notifications)
- Verify Firebase configuration
- Check browser console for Firebase errors

---

## Test Results Template

```
Phase 11 Test Results
Date: __________
Tester: __________

[ ] URL Resolution - PASS/FAIL
[ ] Database Migration - PASS/FAIL
[ ] Notification Center - PASS/FAIL
[ ] Notification Bell - PASS/FAIL
[ ] Notification Detail - PASS/FAIL
[ ] Preferences Page - PASS/FAIL
[ ] Mark All Read - PASS/FAIL
[ ] AJAX Operations - PASS/FAIL
[ ] Push Permission - PASS/FAIL
[ ] Sidebar Navigation - PASS/FAIL
[ ] Responsive Design - PASS/FAIL
[ ] Empty State - PASS/FAIL
[ ] Error Handling - PASS/FAIL
[ ] Performance - PASS/FAIL

Overall Status: PASS/FAIL
Notes: ___________________________________
```

---

## Automated Test (Optional)

Create `apps/notifications_app/tests/test_frontend_views.py`:
```python
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from apps.notifications_app.models import Notification

User = get_user_model()

class NotificationFrontendTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123',
            role='customer'
        )
        self.client.login(username='testuser', password='testpass123')
        
    def test_notification_center_loads(self):
        response = self.client.get('/notifications/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Notification Center')
        
    def test_preferences_page_loads(self):
        response = self.client.get('/notifications/preferences/')
        self.assertEqual(response.status_code, 200)
        
    def test_mark_as_read(self):
        notif = Notification.objects.create(
            recipient=self.user,
            title="Test",
            message="Test message"
        )
        response = self.client.post(f'/notifications/{notif.id}/mark-as-read/')
        self.assertEqual(response.status_code, 200)
        notif.refresh_from_db()
        self.assertTrue(notif.is_read)
```

Run tests:
```bash
python manage.py test apps.notifications_app.tests.test_frontend_views
```

---

**Happy Testing! 🎉**
