# Firebase Push Notifications Integration

## ✅ IMPLEMENTATION COMPLETE

Firebase Cloud Messaging (FCM) has been fully integrated into the Smart Vehicle Repairs System.

---

## 📦 What Was Installed

```bash
pip install firebase-admin>=7.1.0
```

**Dependencies Added:**
- firebase-admin
- google-cloud-firestore
- google-cloud-storage
- google-api-core
- grpcio (for gRPC communication)
- cryptography (for authentication)

---

## 🏗️ Implementation Details

### 1. Files Created/Modified

#### **NEW FILES:**
- `apps/notifications_app/firebase.py` - Firebase integration module
  - `initialize_firebase()` - Initialize Firebase Admin SDK
  - `send_push_notification()` - Send to single device
  - `send_multicast_notification()` - Send to multiple devices
  - `validate_token()` - Token validation
  - `is_firebase_available()` - Check Firebase status

#### **MODIFIED FILES:**
- `apps/notifications_app/services.py` - Updated `_send_push()` method
- `apps/notifications_app/apps.py` - Auto-initialize Firebase on startup
- `config/settings.py` - Added Firebase configuration
- `requirements.txt` - Added firebase-admin dependency

### 2. Configuration Added

**In `config/settings.py`:**
```python
# Firebase Configuration
FIREBASE_CREDENTIALS_PATH = env('FIREBASE_CREDENTIALS_PATH', default='')
FIREBASE_ENABLED = env.bool('FIREBASE_ENABLED', default=False)
```

---

## 🚀 Setup Instructions

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or select existing project
3. Enter project name: `smart-vehicle-repairs` (or your choice)
4. Disable Google Analytics (optional for this use case)
5. Click **"Create project"**

### Step 2: Enable Firebase Cloud Messaging

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Navigate to **Cloud Messaging** tab
3. Enable **Firebase Cloud Messaging API** (if not already enabled)

### Step 3: Generate Service Account Key

1. In Firebase Console, go to **Project Settings** → **Service Accounts**
2. Click **"Generate new private key"**
3. Click **"Generate key"** in the confirmation dialog
4. A JSON file will be downloaded (e.g., `serviceAccountKey.json`)
5. **IMPORTANT:** Keep this file secure! Never commit to version control!

### Step 4: Configure Django Settings

1. **Place the JSON file securely:**
   ```bash
   mkdir -p /home/handy/smart_vehicle_repairs_system/firebase
   mv ~/Downloads/serviceAccountKey.json /home/handy/smart_vehicle_repairs_system/firebase/
   chmod 600 /home/handy/smart_vehicle_repairs_system/firebase/serviceAccountKey.json
   ```

2. **Update `.env` file:**
   ```bash
   # Add to /home/handy/smart_vehicle_repairs_system/.env
   FIREBASE_ENABLED=True
   FIREBASE_CREDENTIALS_PATH=/home/handy/smart_vehicle_repairs_system/firebase/serviceAccountKey.json
   ```

3. **Add to `.gitignore`:**
   ```bash
   echo "firebase/" >> .gitignore
   echo "serviceAccountKey.json" >> .gitignore
   ```

### Step 5: Restart Django Server

```bash
cd /home/handy/smart_vehicle_repairs_system
source venv/bin/activate
python manage.py runserver
```

Firebase will initialize automatically on startup.

---

## 📱 Client-Side Integration

### For Web Apps (Progressive Web Apps)

**1. Add Firebase SDK to your frontend:**
```html
<!-- In your HTML -->
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js"></script>
```

**2. Initialize Firebase:**
```javascript
// firebase-init.js
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
async function requestNotificationPermission() {
  try {
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      const token = await messaging.getToken({
        vapidKey: 'YOUR_VAPID_KEY'
      });
      
      console.log('FCM Token:', token);
      
      // Send token to Django backend
      await fetch('/api/notifications/preferences/', {
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
      
      return token;
    }
  } catch (error) {
    console.error('Error getting permission:', error);
  }
}
```

**4. Handle Incoming Messages:**
```javascript
messaging.onMessage((payload) => {
  console.log('Message received:', payload);
  
  const { title, body } = payload.notification;
  
  new Notification(title, {
    body: body,
    icon: '/static/images/icon.png',
    badge: '/static/images/badge.png'
  });
});
```

### For Android Apps (Java/Kotlin)

**1. Add Firebase to your Android project:**
```gradle
// app/build.gradle
dependencies {
    implementation 'com.google.firebase:firebase-messaging:23.3.1'
}
```

**2. Create FirebaseMessagingService:**
```kotlin
class MyFirebaseMessagingService : FirebaseMessagingService() {
    
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Send token to your Django backend
        sendTokenToServer(token)
    }
    
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        // Handle notification
        message.notification?.let {
            showNotification(it.title, it.body)
        }
    }
    
    private fun sendTokenToServer(token: String) {
        // Make API call to Django
        val apiService = RetrofitClient.getService()
        apiService.updatePushToken(token).enqueue(...)
    }
}
```

### For iOS Apps (Swift)

**1. Add Firebase to your iOS project:**
```swift
// Import Firebase
import FirebaseMessaging
import UserNotifications

// In AppDelegate
func application(_ application: UIApplication, 
                 didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    FirebaseApp.configure()
    
    UNUserNotificationCenter.current().delegate = self
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

// Handle token
func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
    guard let token = fcmToken else { return }
    
    // Send to Django backend
    sendTokenToServer(token)
}
```

---

## 🧪 Testing

### 1. Check Firebase Initialization

```bash
cd /home/handy/smart_vehicle_repairs_system
source venv/bin/activate
python manage.py shell
```

```python
from apps.notifications_app.firebase import is_firebase_available

if is_firebase_available():
    print("✅ Firebase is initialized and ready!")
else:
    print("❌ Firebase not initialized. Check configuration.")
```

### 2. Test Push Notification

```python
from apps.notifications_app.firebase import send_push_notification

# Replace with actual test token from your device
test_token = "your-device-fcm-token-here"

success, response = send_push_notification(
    token=test_token,
    title="Test Notification",
    body="If you see this, Firebase is working!",
    data={"test": "true"}
)

if success:
    print(f"✅ Success! Message ID: {response}")
else:
    print(f"❌ Failed: {response}")
```

### 3. Send Test via Django Admin

1. Create a test user with notification preferences
2. Add a push token to the user's preferences
3. Create a notification with channel='push'
4. The notification service will automatically send it

### 4. Management Command (Optional)

Create a test command:

```bash
python manage.py test_push_notification <user_email>
```

---

## 📊 API Usage

### Register/Update Push Token

**Endpoint:** `PATCH /api/notifications/preferences/`

**Request:**
```json
{
  "push_token": "device-fcm-token-here",
  "push_enabled": true
}
```

**Response:**
```json
{
  "id": 1,
  "user": 1,
  "push_token": "device-fcm-token-here",
  "push_enabled": true,
  "email_enabled": true,
  "sms_enabled": false,
  "in_app_enabled": true
}
```

### Create Push Notification

**Endpoint:** `POST /api/notifications/notifications/`

**Request:**
```json
{
  "recipient": 1,
  "title": "Appointment Reminder",
  "message": "Your vehicle service is scheduled for tomorrow at 10 AM",
  "notification_type": "appointment_reminder",
  "channel": "push",
  "priority": "high"
}
```

---

## 🔧 Advanced Features

### 1. Multicast Notifications

Send to multiple devices at once:

```python
from apps.notifications_app.firebase import send_multicast_notification

tokens = ["token1", "token2", "token3"]

success_count, failure_count, responses = send_multicast_notification(
    tokens=tokens,
    title="System Update",
    body="New features are now available!",
    data={"version": "2.0"}
)

print(f"Sent to {success_count} devices, {failure_count} failed")
```

### 2. Token Validation

Automatically handles invalid tokens:

- Invalid tokens are automatically cleared from user preferences
- Failed deliveries are logged in `NotificationLog`
- Errors like `registration-token-not-registered` trigger token removal

### 3. Rich Notifications

Add custom data payload:

```python
send_push_notification(
    token=user_token,
    title="New Work Order",
    body="Work order #12345 assigned to you",
    data={
        "notification_id": "123",
        "type": "workorder_assigned",
        "workorder_id": "12345",
        "action": "view_workorder",
        "url": "/workorders/12345/"
    }
)
```

---

## 🔒 Security Best Practices

1. **Never commit service account JSON to Git**
   ```bash
   # Already added to .gitignore
   firebase/
   serviceAccountKey.json
   ```

2. **Use environment variables in production**
   ```bash
   FIREBASE_CREDENTIALS_PATH=/secure/path/to/serviceAccountKey.json
   FIREBASE_ENABLED=True
   ```

3. **Restrict service account permissions**
   - Use least privilege principle
   - Only grant Cloud Messaging permissions
   - Rotate keys periodically

4. **Validate tokens on registration**
   ```python
   from apps.notifications_app.firebase import validate_token
   
   if not validate_token(user_token):
       return Response({'error': 'Invalid token'}, status=400)
   ```

5. **Rate limiting**
   - Firebase has rate limits (avoid excessive sends)
   - Batch notifications when possible
   - Use multicast for multiple recipients

---

## 🐛 Troubleshooting

### Firebase not initializing

**Symptoms:** `Firebase not configured` errors

**Solutions:**
1. Check `.env` file has correct settings
2. Verify JSON file path exists and is readable
3. Check file permissions: `chmod 600 serviceAccountKey.json`
4. Restart Django server after config changes

### Invalid token errors

**Symptoms:** `registration-token-not-registered`

**Solutions:**
1. Token may have expired (regenerate from client)
2. App was uninstalled (token invalidated)
3. Token is from wrong Firebase project (check project ID)

### Permissions denied

**Symptoms:** `Permission denied` errors

**Solutions:**
1. Check service account has Cloud Messaging permissions
2. Enable Firebase Cloud Messaging API in Google Cloud Console
3. Verify project ID matches in all configurations

### Import errors

**Symptoms:** `No module named 'firebase_admin'`

**Solutions:**
```bash
source venv/bin/activate
pip install firebase-admin
python manage.py runserver
```

---

## 📈 Monitoring

### Check Logs

```bash
tail -f /home/handy/smart_vehicle_repairs_system/logs/django.log | grep -i firebase
```

### Firebase Console

Monitor delivery statistics:
1. Go to Firebase Console → Cloud Messaging
2. View impressions, opens, and errors
3. Check token validity

### Django Admin

View notification logs:
- Navigate to **Notifications** → **Notification Logs**
- Filter by status='failed' to see errors
- Check details for Firebase error messages

---

## 🎯 Next Steps

1. **Configure Firebase** (follow Step 1-5 above)
2. **Implement client-side** (Web/iOS/Android)
3. **Test with real devices** (get FCM tokens)
4. **Monitor in production** (check logs and Firebase Console)

---

## 📚 Resources

- [Firebase Cloud Messaging Documentation](https://firebase.google.com/docs/cloud-messaging)
- [Firebase Admin Python SDK](https://firebase.google.com/docs/admin/setup)
- [FCM HTTP v1 API](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages)

---

## ✅ Status

- ✅ Firebase Admin SDK installed
- ✅ Integration module created
- ✅ Notification service updated
- ✅ Auto-initialization configured
- ✅ Error handling implemented
- ✅ Token validation added
- ⏳ Awaiting Firebase credentials setup
- ⏳ Awaiting client-side integration

**Ready for production once Firebase project is configured!**
