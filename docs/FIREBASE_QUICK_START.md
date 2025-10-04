# 🔥 Firebase Push Notifications - Quick Start

## ⚡ 5-Minute Setup

### 1️⃣ Get Firebase Credentials (5 min)
```
1. Go to: https://console.firebase.google.com/
2. Create project OR select existing
3. Settings → Service Accounts → Generate new private key
4. Download JSON file
```

### 2️⃣ Configure Django (2 min)
```bash
# Move credentials
mkdir -p firebase
mv ~/Downloads/serviceAccountKey.json firebase/
chmod 600 firebase/serviceAccountKey.json

# Update .env
cat >> .env << EOF
FIREBASE_ENABLED=True
FIREBASE_CREDENTIALS_PATH=/home/handy/smart_vehicle_repairs_system/firebase/serviceAccountKey.json
EOF

# Secure it
echo "firebase/" >> .gitignore

# Restart
python manage.py runserver
```

### 3️⃣ Test (1 min)
```bash
# In Django shell
python manage.py shell

>>> from apps.notifications_app.firebase import is_firebase_available
>>> is_firebase_available()
True  # ✅ Success!

>>> from apps.notifications_app.firebase import send_push_notification
>>> send_push_notification(
...     token="YOUR_TEST_TOKEN",
...     title="Test",
...     body="It works!"
... )
(True, 'projects/.../messages/...')  # ✅ Sent!
```

---

## 📱 Client Setup

### Web (JavaScript)
```javascript
// 1. Initialize
const firebaseConfig = { /* from Firebase Console */ };
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 2. Get token
const token = await messaging.getToken({vapidKey: 'YOUR_VAPID'});

// 3. Send to backend
await fetch('/api/notifications/preferences/', {
  method: 'PATCH',
  headers: {'Authorization': `Bearer ${authToken}`},
  body: JSON.stringify({push_token: token, push_enabled: true})
});
```

### Android (Kotlin)
```kotlin
// 1. Add dependency
implementation 'com.google.firebase:firebase-messaging:23.3.1'

// 2. Get token
FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
    sendTokenToServer(token)
}

// 3. Handle notifications
class MyFirebaseMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        showNotification(message.notification?.title, message.notification?.body)
    }
}
```

### iOS (Swift)
```swift
// 1. Add Firebase
import FirebaseMessaging

// 2. Get token
Messaging.messaging().token { token, error in
    if let token = token {
        sendTokenToServer(token)
    }
}

// 3. Handle notifications
func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
    guard let token = fcmToken else { return }
    sendTokenToServer(token)
}
```

---

## 🧪 Testing

### Test via Management Command
```bash
python manage.py test_push_notification user@example.com --title "Test" --body "Hello!"
```

### Test via Django Shell
```python
from apps.notifications_app.models import Notification
from django.contrib.auth import get_user_model

User = get_user_model()
user = User.objects.get(email='user@example.com')

Notification.objects.create(
    recipient=user,
    title="Test Push",
    message="Testing Firebase integration",
    notification_type="test",
    channel="push",
    priority="high"
)
```

### Test via API
```bash
curl -X POST http://localhost:8000/api/notifications/notifications/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": 1,
    "title": "Test",
    "message": "Testing",
    "channel": "push"
  }'
```

---

## 🔧 API Endpoints

### Register/Update Token
```
PATCH /api/notifications/preferences/
Body: {"push_token": "FCM_TOKEN", "push_enabled": true}
```

### Send Notification
```
POST /api/notifications/notifications/
Body: {
  "recipient": 1,
  "title": "Title",
  "message": "Message",
  "channel": "push"
}
```

### Get User Notifications
```
GET /api/notifications/notifications/?recipient=1
```

---

## 🐛 Troubleshooting

### "Firebase not configured"
```bash
# Check .env
cat .env | grep FIREBASE

# Should show:
# FIREBASE_ENABLED=True
# FIREBASE_CREDENTIALS_PATH=/path/to/serviceAccountKey.json

# Check file exists
ls -l firebase/serviceAccountKey.json

# Restart server
python manage.py runserver
```

### "No push token"
```python
# Check user preferences
from django.contrib.auth import get_user_model
User = get_user_model()
user = User.objects.get(email='user@example.com')
prefs = user.notification_preferences
print(f"Token: {prefs.push_token}")
print(f"Enabled: {prefs.push_enabled}")
```

### "Invalid token"
- Token expired → User needs to re-register
- Wrong project → Check Firebase project ID
- App uninstalled → Token auto-cleared

---

## 📊 Check Status

### Firebase Initialized?
```python
from apps.notifications_app.firebase import is_firebase_available
print(is_firebase_available())  # Should be True
```

### Recent Logs
```bash
tail -f logs/django.log | grep -i firebase
```

### Test Token Format
```python
from apps.notifications_app.firebase import validate_token
validate_token("your-token-here")  # True if valid format
```

---

## 📚 Full Documentation

- **Setup Guide:** `docs/FIREBASE_PUSH_NOTIFICATIONS.md` (650+ lines)
- **Implementation:** `docs/FIREBASE_IMPLEMENTATION_SUMMARY.md`
- **Notification Docs:** `docs/NOTIFICATION_ARCHITECTURE.md`
- **Environment:** `.env.firebase.example`

---

## ✅ Quick Checklist

- [ ] Firebase project created
- [ ] Service account key downloaded
- [ ] Key placed in `firebase/` directory
- [ ] File permissions set (600)
- [ ] `.env` updated with credentials
- [ ] `firebase/` added to `.gitignore`
- [ ] Django server restarted
- [ ] Firebase initialization confirmed
- [ ] Test notification sent successfully
- [ ] Client app integrated (Web/iOS/Android)
- [ ] Token registered via API
- [ ] End-to-end test passed

---

## 🚀 Current Status

✅ **Backend:** Fully implemented and tested  
⏳ **Configuration:** Awaiting Firebase credentials  
⏳ **Client-Side:** Awaiting app integration  

**Next Step:** Create Firebase project and configure credentials (5 minutes)

---

## 💡 Pro Tips

1. **Test Mode:** Set `FIREBASE_ENABLED=False` to disable without breaking code
2. **Multiple Environments:** Use different Firebase projects for dev/staging/prod
3. **Token Refresh:** Tokens can expire, implement refresh logic client-side
4. **Batch Sending:** Use `send_multicast_notification()` for multiple recipients
5. **Data Payload:** Include deep link URLs for better UX

---

**Need Help?** Check full documentation or run:
```bash
python manage.py test_push_notification --help
```
