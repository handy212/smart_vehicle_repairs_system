# 🔥 Getting Firebase Web Configuration

## Step 1: Go to Firebase Console

Open this link in your browser:
https://console.firebase.google.com/project/vehicle-repairs-sys/settings/general

## Step 2: Scroll to "Your apps" section

Look for the **Web apps** section, or click "Add app" if you haven't added a web app yet.

## Step 3: Get Your Configuration

You'll see a section called **Firebase SDK snippet**. Choose **Config**.

You should see something like:

```javascript
const firebaseConfig = {
  apiKey: "AIza...XYZ",
  authDomain: "vehicle-repairs-sys.firebaseapp.com",
  projectId: "vehicle-repairs-sys",
  storageBucket: "vehicle-repairs-sys.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};
```

## Step 4: Copy These Values

You need:
- ✅ **apiKey** (starts with "AIza...")
- ✅ **messagingSenderId** (just numbers)
- ✅ **appId** (format: 1:xxx:web:xxx)

## Step 5: Update test_fcm.html

Open: `templates/test_fcm.html`

Replace these lines:

```javascript
const firebaseConfig = {
    apiKey: "PASTE_YOUR_API_KEY_HERE",
    authDomain: "vehicle-repairs-sys.firebaseapp.com",
    projectId: "vehicle-repairs-sys",
    storageBucket: "vehicle-repairs-sys.firebasestorage.app",
    messagingSenderId: "PASTE_YOUR_SENDER_ID_HERE",
    appId: "PASTE_YOUR_APP_ID_HERE"
};
```

And this line:

```javascript
messaging.getToken({
    vapidKey: 'BJ98dXXijHiyE2nxvlTCasvPGWAMT0VcmAs24Mm3H1aWZrWRHBf_YsSFEGZwsSCWl40_WKIm9ERr4q3xvjEybuU'
})
```

## Step 6: Test It!

1. Start Django server:
   ```bash
   python manage.py runserver
   ```

2. Open in browser:
   ```
   http://localhost:8000/test-fcm/
   ```

3. Click "Allow" when browser asks for notification permission

4. Copy the FCM token that appears

5. Save it to a user in Django shell:
   ```python
   from django.contrib.auth import get_user_model
   from apps.notifications_app.models import NotificationPreference
   
   User = get_user_model()
   user = User.objects.get(email='test@example.com')
   prefs = user.notification_preferences
   prefs.push_token = "PASTE_THE_TOKEN_HERE"
   prefs.push_enabled = True
   prefs.save()
   ```

6. Send test notification:
   ```bash
   python manage.py test_push_notification test@example.com
   ```

7. You should see a notification in your browser! 🎉

---

## Quick Reference

**Your VAPID Key (already known):**
```
BJ98dXXijHiyE2nxvlTCasvPGWAMT0VcmAs24Mm3H1aWZrWRHBf_YsSFEGZwsSCWl40_WKIm9ERr4q3xvjEybuU
```

**Your Firebase Project:**
```
project_id: vehicle-repairs-sys
```

**Get from Firebase Console:**
- apiKey: (from Project Settings → General → Your apps)
- messagingSenderId: (from Project Settings → General → Your apps)
- appId: (from Project Settings → General → Your apps)

---

## If You Don't Have a Web App Yet

1. Go to Firebase Console: https://console.firebase.google.com/project/vehicle-repairs-sys/settings/general
2. Scroll to "Your apps"
3. Click the **</>** (Web) icon
4. Register app with nickname: "Vehicle Repairs Web"
5. **Check** "Also set up Firebase Hosting"
6. Click "Register app"
7. Copy the config values shown
8. Click "Continue to console"

Done! Now you have all the values you need.
