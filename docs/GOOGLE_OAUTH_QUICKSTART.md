# Google OAuth Quick Start

## ⚡ Quick Setup (5 minutes)

### 1. Get Google Credentials

1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select project → APIs & Services → Credentials
3. Create OAuth Client ID (Web application)
4. Add redirect URI: `http://localhost:8000/accounts/google/login/callback/`
5. Copy Client ID and Secret

### 2. Add to `.env`

```bash
GOOGLE_OAUTH_CLIENT_ID=abc123.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xyz789
```

### 3. Run Migrations

```bash
source venv-dev/bin/activate
python manage.py migrate
```

### 4. Test API Endpoint

**Endpoint:** `POST /api/auth/google/login/`

**Request:**
```json
{
  "id_token": "google-id-token-here"
}
```

**Response:**
```json
{
  "user": {...},
  "access": "jwt-token",
  "refresh": "refresh-token"
}
```

## 🎨 Frontend Integration

### Add Google SDK

In your Next.js `app/layout.tsx`:
```tsx
import Script from 'next/script';

<Script src="https://accounts.google.com/gsi/client" strategy="beforeInteractive" />
```

### Use Login Button

```tsx
import GoogleLoginButton from '@/components/auth/GoogleLoginButton';

<GoogleLoginButton redirectUrl="/dashboard" />
```

### Environment Variable

Create `frontend/.env.local`:
```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=abc123.apps.googleusercontent.com
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## ✅ Done!

Users can now sign in with Google. The system will:
- Create new accounts automatically
- Link to existing accounts by email
- Set default role as "customer"
- Return JWT tokens for API authentication

## 📚 Full Documentation

See [GOOGLE_OAUTH_SETUP.md](file:///home/dev/smart_vehicle_repairs_system/docs/GOOGLE_OAUTH_SETUP.md) for detailed setup instructions.
