# 🔥 Firebase Push Notifications - Quick Testing Guide

## 🚀 Quick Start (5 Minutes)

### Step 1: Open Test Page
```
http://127.0.0.1:8000/test-fcm/
```

### Step 2: Allow Notifications
When browser asks, click **"Allow"**

### Step 3: Copy Your Token
Click the **"Copy Token"** button on the page

### Step 4: Save Token to Django
```bash
python manage.py shell
```

```python
from django.contrib.auth import get_user_model
from apps.notifications_app.models import NotificationPreference

User = get_user_model()
user = User.objects.get(email='test@example.com')

prefs = user.notification_preferences
prefs.push_token = "PASTE_YOUR_TOKEN_HERE"  # Paste the token you copied
prefs.push_enabled = True
prefs.save()

print(f"✅ Token saved for {user.email}")
```

### Step 5: Send Test Notification
```bash
python manage.py test_push_notification test@example.com
```

### Step 6: Check Your Browser
You should see a notification! 🎉

---

## 📋 Detailed Instructions

### What You Need
- ✅ Django server running (`python manage.py runserver`)
- ✅ Modern browser (Chrome, Firefox, Edge)
- ✅ User account in Django (test@example.com)

### Browser Compatibility
| Browser | Support |
|---------|---------|
| Chrome/Edge | ✅ Full support |
| Firefox | ✅ Full support |
| Safari | ⚠️ macOS 13+ / iOS 16.4+ |

### Test Page Features
The test page (`http://127.0.0.1:8000/test-fcm/`) will:
1. Request notification permission
2. Initialize Firebase
3. Generate and display your FCM token
4. Show copy button for easy token copying
5. Display step-by-step instructions

---

## 🧪 Complete Test Flow

### 1. Get FCM Token (Web Browser)
```
👉 Open: http://127.0.0.1:8000/test-fcm/
👉 Click "Allow" when prompted
👉 Copy the FCM token that appears
```

### 2. Register Token in Django
```python
# Option A: Via Django Shell
python manage.py shell

from django.contrib.auth import get_user_model
from apps.notifications_app.models import NotificationPreference

User = get_user_model()
user = User.objects.get(email='test@example.com')

# Create or update notification preferences
prefs, created = NotificationPreference.objects.get_or_create(user=user)
prefs.push_token = "YOUR_COPIED_TOKEN_HERE"
prefs.push_enabled = True
prefs.save()

print(f"✅ Token registered for {user.email}")
```

```python
# Option B: Via Python Code
from apps.notifications_app.firebase import send_push_notification

# Direct test (doesn't save to database)
success, response = send_push_notification(
    token="YOUR_FCM_TOKEN",
    title="Test Notification",
    body="Testing Firebase push notifications!",
    data={"test": "true"}
)

if success:
    print(f"✅ Sent! Message ID: {response}")
else:
    print(f"❌ Failed: {response}")
```

### 3. Send Test Notification

**Option A: Management Command**
```bash
python manage.py test_push_notification test@example.com
```

**Option B: Via Notification System**
```python
from django.contrib.auth import get_user_model
from apps.notifications_app.models import Notification

User = get_user_model()
user = User.objects.get(email='test@example.com')

# Create notification - automatically sends via Firebase
notification = Notification.objects.create(
    recipient=user,
    title="Test Push Notification",
    message="This is a test message from Django!",
    notification_type="test",
    channel="push",
    priority="high"
)

print(f"Status: {notification.status}")
```

**Option C: Via Trigger**
```python
from apps.notifications_app.triggers import notification_triggers

# Example: Trigger appointment confirmation
notification_triggers.appointment_confirmed(appointment_object)
```

### 4. Verify Notification
- Check your browser - notification should appear
- Check Django admin - NotificationLog should show delivery
- Check Firebase Console - messaging metrics should update

---

## 🐛 Troubleshooting

### Problem: "Page not found (404)"
**Solution:** 
- Make sure URL is exactly: `http://127.0.0.1:8000/test-fcm/`
- Check Django server is running: `python manage.py runserver`

### Problem: "Permission denied" for notifications
**Solution:**
1. Open browser settings
2. Go to Site Settings → Notifications
3. Add `http://127.0.0.1:8000` to allowed list

**Chrome:** `chrome://settings/content/notifications`  
**Firefox:** Settings → Privacy & Security → Permissions → Notifications

### Problem: No token appears on page
**Solution:**
1. Open browser console (F12)
2. Check for JavaScript errors
3. Verify Firebase config is correct in `test_fcm.html`
4. Try a different browser

### Problem: "Invalid FCM token" error
**Cause:** Token format is invalid or expired

**Solution:**
1. Get a fresh token from test page
2. Make sure you copied the entire token (they're long!)
3. Check no extra spaces were added when pasting

### Problem: Token not saving in Django
**Solution:**
```python
# Make sure NotificationPreference exists first
from apps.notifications_app.models import NotificationPreference

prefs, created = NotificationPreference.objects.get_or_create(user=user)
# Now save the token
prefs.push_token = "YOUR_TOKEN"
prefs.save()
```

### Problem: Notification sent but not received
**Possible causes:**
1. Browser is closed (must be running to receive)
2. Token expired (get a new one)
3. Notifications blocked in browser settings
4. Wrong user/token in database

**Check:**
```python
# Verify token is saved correctly
user = User.objects.get(email='test@example.com')
prefs = user.notification_preferences
print(f"Token: {prefs.push_token[:50]}...")
print(f"Enabled: {prefs.push_enabled}")
```

---

## 📊 Verification Checklist

Before testing, verify:

- [ ] Django server is running
- [ ] Firebase credentials configured in `.env`
- [ ] Firebase initialized (check logs: "Firebase Admin SDK initialized successfully")
- [ ] User exists in database
- [ ] User has `NotificationPreference` record
- [ ] Browser supports notifications
- [ ] Test page accessible at `/test-fcm/`

During testing, verify:

- [ ] Browser asked for notification permission
- [ ] FCM token appeared on test page
- [ ] Token successfully copied
- [ ] Token saved to Django user
- [ ] Management command runs without errors
- [ ] Notification appears in browser

After testing, check:

- [ ] `NotificationLog` has entry in Django admin
- [ ] Log status shows "sent" and "delivered"
- [ ] Firebase Console shows message sent
- [ ] No errors in Django logs

---

## 🎯 What to Expect

### Successful Test Output

**Django Shell:**
```
✅ Token saved for test@example.com
```

**Management Command:**
```bash
$ python manage.py test_push_notification test@example.com

INFO 2025-10-02 20:38:58,384 firebase Firebase Admin SDK initialized successfully
✅ Firebase is initialized
Found user: test@example.com
✅ Push token found: eAbCdEfGh...
Sending test push notification...
✅ Push notification sent successfully!
Message ID: projects/vehicle-repairs-sys/messages/0:1234567890abcdef
Notification record created: #123
```

**Browser:**
- Notification popup appears (top-right corner typically)
- Shows your title and message
- Can click to interact (if handler configured)

---

## 🔒 Production Considerations

### Security
- Use HTTPS (required for web push notifications)
- Store tokens securely
- Implement token refresh logic
- Validate tokens before sending

### Performance
- Batch notifications when possible (use `send_multicast_notification`)
- Handle expired tokens gracefully
- Implement retry logic for failed sends
- Monitor Firebase quotas

### Best Practices
- Get explicit user consent before requesting permission
- Provide option to disable notifications
- Clear, actionable notification messages
- Don't spam - respect user preferences
- Handle token expiration and refresh

---

## 📚 Additional Resources

- **Full Documentation:** `docs/FIREBASE_TESTING_GUIDE.md`
- **Setup Guide:** `docs/FIREBASE_PUSH_NOTIFICATIONS.md`
- **Quick Start:** `docs/FIREBASE_QUICK_START.md`
- **Implementation Summary:** `docs/FIREBASE_IMPLEMENTATION_SUMMARY.md`

---

## ✅ Summary

Firebase push notifications are fully integrated and ready to test!

**Test URL:** http://127.0.0.1:8000/test-fcm/

**Quick Test:**
1. Open test page → Allow notifications
2. Copy token → Save to Django user
3. Run: `python manage.py test_push_notification test@example.com`
4. See notification in browser! 🎉

**Status:** ✅ Backend complete, ready for client integration
