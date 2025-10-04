# 🧪 Firebase Push Notifications - Testing Guide

## Quick Answer: How to Test

Firebase push notification testing happens in **3 phases**:

### ✅ Phase 1: Code Verification (DO THIS NOW - No Firebase needed)
### ⏳ Phase 2: Integration Testing (After Firebase setup)
### ⏳ Phase 3: End-to-End Testing (After client app integration)

---

## Phase 1: Code Verification ✅ (No Firebase Credentials Needed)

**Purpose:** Verify the code is properly integrated and won't break your system.

### Test 1: System Check
```bash
cd /home/handy/smart_vehicle_repairs_system
source venv/bin/activate
python manage.py check
```

**Expected:** "System check identified no issues (0 silenced)" or warnings only

---

### Test 2: Module Imports
```bash
python manage.py shell
```

```python
# Test 1: Import Firebase module
from apps.notifications_app import firebase
print("✅ Firebase module imported")

# Test 2: Check functions exist
functions = ['initialize_firebase', 'is_firebase_available', 
             'send_push_notification', 'send_multicast_notification', 
             'validate_token']

for func in functions:
    assert hasattr(firebase, func), f"Missing: {func}"
    print(f"✅ {func} exists")

# Test 3: Check Firebase status
from apps.notifications_app.firebase import is_firebase_available
if is_firebase_available():
    print("✅ Firebase is initialized")
else:
    print("ℹ️  Firebase not configured (expected - awaiting credentials)")

# Test 4: NotificationService integration
from apps.notifications_app.services import NotificationService
service = NotificationService()
print("✅ NotificationService works")

# Test 5: Token validation
from apps.notifications_app.firebase import validate_token

assert validate_token(None) == False, "Should reject None"
assert validate_token("") == False, "Should reject empty"
assert validate_token("short") == False, "Should reject short"
assert validate_token("x" * 152) == True, "Should accept valid length"
print("✅ Token validation works")

print("\n🎉 All Phase 1 tests passed!")
print("Firebase integration is properly installed.")
```

---

### Test 3: Configuration Check
```bash
python manage.py shell
```

```python
from django.conf import settings

print(f"FIREBASE_ENABLED: {settings.FIREBASE_ENABLED}")
print(f"FIREBASE_CREDENTIALS_PATH: {settings.FIREBASE_CREDENTIALS_PATH or '(not set)'}")

if not settings.FIREBASE_ENABLED:
    print("\nℹ️  This is correct! Firebase awaits configuration.")
    print("See Phase 2 below to enable Firebase.")
```

---

### Test 4: Management Command
```bash
# Check command exists
python manage.py test_push_notification --help
```

**Expected:** Help text showing command usage

---

## Phase 2: Integration Testing ⏳ (Requires Firebase Credentials)

**Purpose:** Test actual Firebase Cloud Messaging integration.

### Prerequisites

1. **Create Firebase Project** (5 minutes)
   - Go to: https://console.firebase.google.com/
   - Create project or select existing
   - Enable Cloud Messaging

2. **Get Service Account Key** (2 minutes)
   - Settings → Service Accounts
   - Generate new private key
   - Download `serviceAccountKey.json`

3. **Configure Django** (2 minutes)
   ```bash
   cd /home/handy/smart_vehicle_repairs_system
   
   # Create secure directory
   mkdir -p firebase
   mv ~/Downloads/serviceAccountKey.json firebase/
   chmod 600 firebase/serviceAccountKey.json
   
   # Update .env
   cat >> .env << 'EOF'
   FIREBASE_ENABLED=True
   FIREBASE_CREDENTIALS_PATH=/home/handy/smart_vehicle_repairs_system/firebase/serviceAccountKey.json
   EOF
   
   # Secure it
   echo "firebase/" >> .gitignore
   
   # Restart Django
   python manage.py runserver
   ```

---

### Test 5: Firebase Initialization
```bash
python manage.py shell
```

```python
from apps.notifications_app.firebase import is_firebase_available

if is_firebase_available():
    print("✅ Firebase initialized successfully!")
    print("You can now send real push notifications.")
else:
    print("❌ Firebase failed to initialize")
    print("Check:")
    print("  1. FIREBASE_ENABLED=True in .env")
    print("  2. FIREBASE_CREDENTIALS_PATH points to valid JSON")
    print("  3. Service account JSON file exists and is readable")
    print("  4. Django server was restarted after config changes")
```

---

### Test 6: Send Test Push (Requires Device Token)

First, you need a real FCM device token from a client app (see Phase 3 for client setup).

**Option A: Via Management Command**
```bash
# Create test user first
python manage.py createsuperuser

# In Django shell or admin, create NotificationPreference for user
python manage.py shell
```

```python
from django.contrib.auth import get_user_model
from apps.notifications_app.models import NotificationPreference

User = get_user_model()
user = User.objects.first()  # or get(email='test@example.com')

# Create or update preferences
prefs, created = NotificationPreference.objects.get_or_create(user=user)
prefs.push_token = "YOUR_ACTUAL_FCM_TOKEN_HERE"  # From client app
prefs.push_enabled = True
prefs.save()

print(f"✅ Push token saved for {user.email}")
```

Then test:
```bash
python manage.py test_push_notification user@example.com
```

**Expected Output:**
```
✅ Firebase is initialized
Found user: user@example.com
✅ Push token found: eAbCdEf...
Sending test push notification...
✅ Push notification sent successfully!
Message ID: projects/.../messages/0:1234567890
```

---

**Option B: Via Django Shell**
```python
from apps.notifications_app.firebase import send_push_notification

success, response = send_push_notification(
    token="YOUR_ACTUAL_FCM_TOKEN",
    title="Test Notification",
    body="If you see this on your device, Firebase is working!",
    data={"test": "true"}
)

if success:
    print(f"✅ Sent! Message ID: {response}")
else:
    print(f"❌ Failed: {response}")
```

---

**Option C: Via Notification System**
```python
from django.contrib.auth import get_user_model
from apps.notifications_app.models import Notification

User = get_user_model()
user = User.objects.get(email='test@example.com')

# This will automatically send via Firebase
notification = Notification.objects.create(
    recipient=user,
    title="Test Push Notification",
    message="Testing Firebase integration from Django!",
    notification_type="test",
    channel="push",
    priority="high"
)

print(f"Notification created: {notification.id}")
print(f"Status: {notification.status}")

# Check if it was sent
if notification.status == 'sent':
    print("✅ Push notification sent successfully!")
elif notification.status == 'failed':
    print(f"❌ Failed: {notification.error_message}")
```

---

## Phase 3: End-to-End Testing ⏳ (Requires Client App)

**Purpose:** Test the complete flow from client app to Django to Firebase to device.

### Setup Client App

You need to integrate Firebase SDK in your client application to get FCM tokens.

#### Web App (JavaScript)

**1. Add Firebase to your HTML:**
```html
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js"></script>
```

**2. Initialize Firebase:**
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();
```

**3. Request Permission and Get Token:**
```javascript
async function setupPushNotifications() {
  try {
    // Request permission
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      console.log('Permission granted');
      
      // Get FCM token
      const token = await messaging.getToken({
        vapidKey: 'YOUR_VAPID_KEY'  // From Firebase Console
      });
      
      console.log('FCM Token:', token);
      
      // Send token to Django backend
      const response = await fetch('http://localhost:8000/api/notifications/preferences/', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${yourAuthToken}`
        },
        body: JSON.stringify({
          push_token: token,
          push_enabled: true
        })
      });
      
      if (response.ok) {
        console.log('✅ Token registered with backend');
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Call on page load
setupPushNotifications();
```

**4. Handle Incoming Messages:**
```javascript
messaging.onMessage((payload) => {
  console.log('Message received:', payload);
  
  const { title, body } = payload.notification;
  
  // Show notification
  new Notification(title, {
    body: body,
    icon: '/static/images/icon.png'
  });
});
```

---

#### Android App (Kotlin)

**1. Add dependency (build.gradle):**
```gradle
dependencies {
    implementation 'com.google.firebase:firebase-messaging:23.3.1'
}
```

**2. Create Service:**
```kotlin
class MyFirebaseMessagingService : FirebaseMessagingService() {
    
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d("FCM", "New token: $token")
        
        // Send to Django backend
        sendTokenToServer(token)
    }
    
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        
        message.notification?.let {
            showNotification(it.title, it.body)
        }
    }
    
    private fun sendTokenToServer(token: String) {
        // Make API call to your Django backend
        val retrofit = Retrofit.Builder()
            .baseUrl("http://your-server.com/api/")
            .addConverterFactory(GsonConverterFactory.create())
            .build()
        
        val service = retrofit.create(ApiService::class.java)
        service.updatePushToken(token).enqueue(...)
    }
}
```

---

#### iOS App (Swift)

**1. Add Firebase:**
```swift
import FirebaseMessaging
import UserNotifications

class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate {
    
    func application(_ application: UIApplication, 
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        
        // Request permission
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            if granted {
                DispatchQueue.main.async {
                    application.registerForRemoteNotifications()
                }
            }
        }
        
        return true
    }
    
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        
        print("FCM Token: \(token)")
        
        // Send to Django backend
        sendTokenToServer(token)
    }
}
```

---

### Test 7: End-to-End Flow

1. **User opens your app**
   - App requests notification permission
   - User grants permission
   - App gets FCM token from Firebase

2. **App registers token with Django**
   ```
   PATCH /api/notifications/preferences/
   Body: {"push_token": "...", "push_enabled": true}
   ```

3. **Django stores token**
   - Token saved in `NotificationPreference` model
   - Associated with user account

4. **Trigger notification from Django**
   ```python
   # Example: Appointment confirmed
   from apps.notifications_app.triggers import notification_triggers
   notification_triggers.appointment_confirmed(appointment)
   ```

5. **Notification sent**
   - Django → Firebase Cloud Messaging → User's device
   - User sees notification on their device

6. **Verify**
   - Check notification appears on device
   - Check `NotificationLog` in Django admin
   - Verify status is 'delivered'

---

## 🐛 Troubleshooting

### "Firebase not configured"
```bash
# Check environment variables
cat .env | grep FIREBASE

# Verify file exists
ls -l firebase/serviceAccountKey.json

# Check permissions
chmod 600 firebase/serviceAccountKey.json

# Restart Django
python manage.py runserver
```

### "No push token"
```python
# Check user preferences
from django.contrib.auth import get_user_model
User = get_user_model()
user = User.objects.get(email='user@example.com')

if hasattr(user, 'notification_preferences'):
    prefs = user.notification_preferences
    print(f"Token: {prefs.push_token}")
    print(f"Enabled: {prefs.push_enabled}")
else:
    print("User has no notification preferences")
    # Create them
    from apps.notifications_app.models import NotificationPreference
    NotificationPreference.objects.create(user=user)
```

### "Invalid token" or "registration-token-not-registered"
- Token expired → User needs to re-register from app
- Wrong Firebase project → Check project ID matches
- App uninstalled → Token invalidated (automatically cleaned up)

### Check Logs
```bash
# Django logs
tail -f logs/django.log | grep -i firebase

# Or filter for push notifications
tail -f logs/django.log | grep -i "push"
```

---

## 📊 Test Checklist

### Phase 1: Code Verification ✅
- [ ] Django system check passes
- [ ] Firebase module imports
- [ ] All functions exist
- [ ] Token validation works
- [ ] NotificationService integrates
- [ ] Management command available
- [ ] Configuration settings present

### Phase 2: Integration Testing ⏳
- [ ] Firebase project created
- [ ] Service account key downloaded
- [ ] Django configured (`.env` updated)
- [ ] Firebase initializes successfully
- [ ] Can call Firebase functions without errors
- [ ] Test notification sent (if token available)

### Phase 3: End-to-End Testing ⏳
- [ ] Client app has Firebase SDK
- [ ] App can get FCM tokens
- [ ] Token successfully registered via API
- [ ] Notification created in Django
- [ ] Notification appears on device
- [ ] Status logged correctly
- [ ] Invalid tokens cleaned up automatically

---

## 🎯 Quick Test Commands

```bash
# Test 1: System check
python manage.py check

# Test 2: Firebase status
python manage.py shell -c "from apps.notifications_app.firebase import is_firebase_available; print('Firebase:', 'OK' if is_firebase_available() else 'Not configured')"

# Test 3: Send test (requires configured Firebase + user with token)
python manage.py test_push_notification user@example.com

# Test 4: Check logs
tail -n 50 logs/django.log | grep -i firebase
```

---

## 📚 Related Documentation

- **Full Setup Guide:** `docs/FIREBASE_PUSH_NOTIFICATIONS.md`
- **Implementation Details:** `docs/FIREBASE_IMPLEMENTATION_SUMMARY.md`
- **Quick Start:** `docs/FIREBASE_QUICK_START.md`
- **API Reference:** `docs/PHASE_9_API_ENDPOINTS.md`

---

## ✅ Current Status

**Phase 1:** ✅ COMPLETE - Code verified and working  
**Phase 2:** ⏳ AWAITING - Firebase credentials needed  
**Phase 3:** ⏳ AWAITING - Client app integration needed  

**You can proceed with Phase 1 testing RIGHT NOW!**
