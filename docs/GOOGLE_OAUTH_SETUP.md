# Google OAuth Login - Setup Guide

## Overview

Google OAuth login has been successfully integrated into your Smart Vehicle Repairs System. This guide will walk you through the final setup steps.

## What's Been Implemented

### Backend (✅ Complete)
- ✅ Google OAuth provider configured in Django settings
- ✅ Custom adapters for handling social account signups
- ✅ API endpoint for Google authentication (`/api/auth/google/login/`)
- ✅ Automatic JWT token generation for authenticated users
- ✅ Email-based account linking (if a user with the same email exists)

### Frontend (✅ Complete)
- ✅ React/Next.js Google login button component
- ✅ Google Identity Services integration
- ✅ Automatic token storage and redirect

## Setup Steps

### Step 1: Create Google OAuth Credentials

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Create or Select a Project**
   - Click on the project dropdown at the top
   - Create a new project or select an existing one

3. **Enable Google+ API** (if not already enabled)
   - Go to "APIs & Services" > "Library"
   - Search for "Google+ API"
   - Click "Enable"

4. **Configure OAuth Consent Screen**
   - Go to "APIs & Services" > "OAuth consent screen"
   - Choose "External" user type (or "Internal" if using Google Workspace)
   - Fill in required fields:
     - App name: `Smart Vehicle Repairs`
     - User support email: Your email
     - Developer contact email: Your email
   - Add scopes:
     - `../auth/userinfo.email`
     - `../auth/userinfo.profile`
   - Save and continue

5. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" > "Credentials"
   - Click "+ CREATE CREDENTIALS" > "OAuth client ID"
   - Application type: "Web application"
   - Name: `Smart Vehicle Repairs Web`
   - **Authorized JavaScript origins:**
     ```
     http://localhost:3000
     http://localhost:8000
     http://localhost:8001
     https://yourdomain.com  (add your production domain)
     ```
   - **Authorized redirect URIs:**
     ```
     http://localhost:8000/accounts/google/login/callback/
     http://localhost:8001/accounts/google/login/callback/
     http://localhost:3000/auth/callback/google
     https://yourdomain.com/accounts/google/login/callback/  (production)
     ```
   - Click "Create"

6. **Copy Credentials**
   - You'll see a dialog with your Client ID and Client Secret
   - **IMPORTANT:** Copy both values immediately

### Step 2: Configure Environment Variables

1. **Update `.env` file:**
   ```bash
   # Google OAuth Configuration
   GOOGLE_OAUTH_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=your-actual-client-secret
   ```

2. **For Frontend (if using Next.js), create/update `.env.local`:**
   ```bash
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

### Step 3: Add Google Sign-In SDK to Frontend

If using Next.js, add this to your `app/layout.tsx` or `pages/_document.tsx`:

```tsx
// In app/layout.tsx or pages/_document.tsx
<Script 
  src="https://accounts.google.com/gsi/client" 
  strategy="beforeInteractive"
/>
```

Or add to your HTML `<head>`:
```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

### Step 4: Run Database Migrations

Make sure your database is running, then:

```bash
# Activate virtual environment
source venv-dev/bin/activate

# Run migrations
python manage.py migrate
```

This will create the necessary social account tables:
- `socialaccount_socialaccount`
- `socialaccount_socialapp`
- `socialaccount_socialtoken`

### Step 5: Test the Integration

#### Option A: Using Django Templates (Traditional Login)

1. Start the Django server:
   ```bash
   python manage.py runserver
   ```

2. Visit: `http://localhost:8000/accounts/login/`

3. Click "Sign in with Google" (you'll need to add this button to your template)

#### Option B: Using Frontend API (Recommended for Next.js)

1. Import the component in your login page:
   ```tsx
   import GoogleLoginButton from '@/components/auth/GoogleLoginButton';
   
   export default function LoginPage() {
     return (
       <div>
         <h1>Login</h1>
         
         {/* Traditional email/password form */}
         <form>
           {/* ... */}
         </form>
         
         <div className="mt-4">
           <p className="text-center text-sm text-gray-600 mb-2">Or</p>
           <GoogleLoginButton 
             onSuccess={(data) => {
               console.log('Login successful:', data);
             }}
             onError={(error) => {
               console.error('Login failed:', error);
             }}
           />
         </div>
       </div>
     );
   }
   ```

2. Start your frontend and backend servers:
   ```bash
   # Terminal 1 - Backend
   source venv-dev/bin/activate
   python manage.py runserver
   
   # Terminal 2 - Frontend
   cd frontend
   npm run dev
   ```

3. Click the "Continue with Google" button and test the flow

## API Endpoint Details

### POST `/api/auth/google/login/`

Authenticates a user with Google ID token and returns JWT tokens.

**Request:**
```json
{
  "id_token": "google-id-token-from-frontend"
}
```

**Response (Success - 200):**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "role": "customer"
  },
  "access": "jwt-access-token",
  "refresh": "jwt-refresh-token"
}
```

**Response (Error - 400):**
```json
{
  "id_token": ["Invalid token: Token expired"]
}
```

## How It Works

1. **User clicks "Sign in with Google"**
   - Frontend displays Google's sign-in prompt
   - User selects their Google account and authorizes

2. **Google returns ID Token**
   - Frontend receives a signed JWT from Google
   - This token contains user email, name, and Google ID

3. **Frontend sends ID Token to backend**
   - POST request to `/api/auth/google/login/`
   - Backend verifies the token with Google

4. **Backend creates/links user account**
   - If email exists: Links Google account to existing user
   - If new email: Creates new user with role "customer"
   - Stores Google account data in `socialaccount_socialaccount`

5. **Backend returns JWT tokens**
   - Access token (60 min lifetime)
   - Refresh token (24 hour lifetime)

6. **Frontend stores tokens and redirects**
   - Tokens saved to localStorage
   - User redirected to dashboard

## Security Features

- ✅ Google ID tokens are cryptographically verified
- ✅ Email verification from Google is respected
- ✅ Automatic account linking prevents duplicate accounts
- ✅ JWT tokens have proper expiration
- ✅ Refresh token rotation enabled

## Troubleshooting

### "Google OAuth is not properly configured"
- Check that `GOOGLE_OAUTH_CLIENT_ID` is set in `.env`
- Restart your Django server after updating `.env`

### "Invalid token issuer"
- Make sure you're using a real Google ID token
- Token must be issued by `accounts.google.com`

### "Email already exists"
- This shouldn't happen - accounts should auto-link
- Check that `adapters.py` is properly configured

### "redirect_uri_mismatch"
- Add your redirect URI to Google Cloud Console
- Make sure the URI exactly matches (including trailing slash)

## Next Steps

1. ✅ Set up Google Cloud Console project
2. ✅ Add credentials to `.env`
3. ✅ Run migrations
4. ✅ Test login flow
5. 📋 Add Google login button to your login page(s)
6. 📋 Test with production domain (when ready)

## Support

For issues with Google OAuth integration, check:
- Django logs: `logs/django.log`
- Browser console for frontend errors
- Django admin: `http://localhost:8000/admin/socialaccount/`
