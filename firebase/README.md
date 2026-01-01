# Firebase Cloud Messaging Setup

This directory contains Firebase credentials for push notifications.

## How to Obtain Firebase Credentials

### Step 1: Access Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Sign in with your Google account
3. Select your project or click "Add project" to create a new one

### Step 2: Generate Service Account Key
1. Click on the gear icon ⚙️ next to "Project Overview"
2. Select "Project settings"
3. Navigate to the "Service accounts" tab
4. Click "Generate new private key"
5. Confirm by clicking "Generate key"
6. A JSON file will be downloaded to your computer

### Step 3: Place the Credentials File
1. Rename the downloaded file to something descriptive (e.g., `smart-vehicle-repairs-firebase.json`)
2. Place the file in this `firebase/` directory
3. Update your `.env` file with the exact filename:
   ```
   FIREBASE_ENABLED=True
   FIREBASE_CREDENTIALS_PATH=firebase/your-filename-here.json
   ```

## Security Considerations

> **IMPORTANT**: The credentials file contains sensitive information that provides administrative access to your Firebase project.

- ✅ **DO**: Keep the file in this directory (it's already in `.gitignore`)
- ✅ **DO**: Set restricted file permissions in production (`chmod 600`)
- ✅ **DO**: Use environment variables to reference the file path
- ❌ **DON'T**: Commit the credentials file to version control
- ❌ **DON'T**: Share the credentials file publicly
- ❌ **DON'T**: Include the credentials in Docker images

## Testing Firebase Setup

After placing the credentials file and updating `.env`, test the connection:

```bash
# Test Firebase initialization
python manage.py shell -c "from apps.notifications_app.firebase import initialize_firebase; result = initialize_firebase(); print('✓ Firebase initialized successfully' if result else '✗ Firebase initialization failed')"

# Send a test notification (if you have a device token)
python manage.py test_push_notification
```

## File Structure

```
firebase/
├── .gitkeep                              # Tracks directory in git
├── README.md                             # This file
└── your-firebase-credentials.json        # Your credentials (not tracked)
```

## Troubleshooting

### "Firebase is disabled in settings"
- Verify `FIREBASE_ENABLED=True` in `.env`
- Check that the credentials file path is correct
- Ensure the credentials file is valid JSON

### "Failed to initialize Firebase"
- Verify the credentials file is in the correct location
- Check file permissions (readable by the application)
- Ensure the JSON structure is valid
- Check `logs/django.log` for detailed error messages

## Environment Variables

Required variables in `.env`:
```bash
FIREBASE_ENABLED=True
FIREBASE_CREDENTIALS_PATH=firebase/your-credentials-file.json
```

## Additional Resources

- [Firebase Admin SDK Setup](https://firebase.google.com/docs/admin/setup)
- [FCM Documentation](https://firebase.google.com/docs/cloud-messaging)
- [Service Account Credentials](https://cloud.google.com/iam/docs/service-accounts)
