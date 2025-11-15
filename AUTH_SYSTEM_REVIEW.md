# Authentication Systems Review

## ⚠️ CRITICAL FINDING: Two Customer Portals Exist!

There are **TWO separate customer portals** using the same URL path (`/portal/*`):

### 1. **Django Template Portal (Legacy)** 
- **URL**: `/portal/*` (Django URLs)
- **Auth**: Django Session-based
- **Login**: `/customer/login/`
- **Templates**: `templates/portal/*.html`
- **Backend**: `apps/customers/portal_views.py`
- **URL Config**: `apps/customers/portal_urls.py`

### 2. **Next.js Portal (New)**
- **URL**: `/portal/*` (Next.js routes)
- **Auth**: JWT Token-based
- **Login**: `/login` (unified)
- **Pages**: `frontend/app/portal/*.tsx`
- **Backend**: Same API endpoints, different frontend

## ⚠️ CONFLICT

Both portals use `/portal/*` paths, which creates a routing conflict:
- Django URLs: `path('portal/', include('apps.customers.portal_urls'))`
- Next.js Routes: `frontend/app/portal/*.tsx`

**Current Behavior**: Next.js likely takes precedence when running on port 3000, Django on port 8080.

## Authentication Systems

### System 1: JWT Authentication (API/Frontend) ✅
- **Purpose**: Used by Next.js frontend (React app)
- **Endpoint**: `/api/auth/token/`
- **Method**: JWT tokens (access + refresh)
- **Used by**: 
  - Staff Dashboard (`/dashboard/*`)
  - **Next.js Customer Portal** (`/portal/*`)
- **Storage**: localStorage (access_token, refresh_token)
- **Backend**: `apps/accounts/views.py` - `TokenObtainPairView`
- **Frontend**: `frontend/lib/api/auth.ts`

### System 2: Session Authentication (Django Templates) ⚠️
- **Purpose**: Used by Django template-based customer portal (legacy)
- **Endpoint**: `/customer/login/`
- **Method**: Django sessions
- **Used by**: 
  - **Django Template Customer Portal** (`/portal/*` - Django URLs)
- **Storage**: Django session cookies
- **Backend**: `apps/customers/auth_views.py` - `customer_login()`
- **Frontend**: Django templates

## Current Status

### ✅ What's Working

1. **JWT Authentication (Unified)**
   - Single login endpoint (`/api/auth/token/`) works for **both** staff and customers
   - Frontend login page (`/login`) uses JWT for everyone
   - Role-based redirect: customers → `/portal`, staff → `/dashboard`
   - Next.js portal pages use JWT tokens from localStorage

2. **Next.js Customer Portal**
   - All portal pages use JWT authentication
   - Portal layout checks user role and redirects non-customers
   - Works seamlessly with the unified JWT system

### ⚠️ Issues Identified

1. **URL Path Conflict**
   - Both Django and Next.js portals use `/portal/*`
   - Next.js (port 3000) and Django (port 8080) serve different apps
   - Need to clarify which is primary

2. **Two Authentication Systems**
   - JWT for Next.js portal
   - Sessions for Django template portal
   - They don't share authentication state

3. **Duplicate Functionality**
   - Both portals provide similar features
   - Maintenance burden
   - User confusion

## Recommendations

### Option 1: Use Next.js Portal Only (Recommended) ✅
**Action**:
1. Keep Next.js portal as primary (`/portal/*`)
2. Deprecate Django template portal
3. Remove or redirect Django portal URLs
4. Keep JWT authentication only

**Pros**:
- Single, modern frontend
- Better UX with React
- Unified authentication
- Easier maintenance

**Cons**:
- Breaking change if Django portal is in use
- Need to migrate any existing users

### Option 2: Use Different Paths
**Action**:
1. Keep Next.js portal at `/portal/*`
2. Move Django portal to `/portal-legacy/*` or `/customer-portal/*`
3. Update Django URLs

**Pros**:
- No breaking changes
- Both can coexist
- Gradual migration

**Cons**:
- Two systems to maintain
- User confusion

### Option 3: Keep Django Portal, Remove Next.js
**Action**:
1. Remove Next.js portal routes
2. Use Django template portal only
3. Keep session authentication

**Pros**:
- No new code needed
- Existing system works

**Cons**:
- Less modern UX
- Misses React benefits
- Two auth systems still

## Current Flow

### For Staff Users (JWT):
```
1. Visit /login (Next.js)
2. Enter credentials
3. POST to /api/auth/token/ (JWT)
4. Receive access + refresh tokens
5. Store in localStorage
6. Redirect to /dashboard
7. All API calls use JWT Bearer token
```

### For Customer Users - Next.js Portal (JWT):
```
1. Visit /login (Next.js)
2. Enter credentials
3. POST to /api/auth/token/ (JWT)
4. Receive access + refresh tokens
5. Store in localStorage
6. Redirect to /portal (role-based)
7. All API calls use JWT Bearer token
```

### For Customer Users - Django Portal (Session):
```
1. Visit /customer/login/ (Django template)
2. Enter credentials
3. Django session authentication
4. Session cookie stored
5. Redirect to /portal/ (Django URLs)
6. Uses session-based auth
```

## Decision Required

**Question 1**: Which portal should be the primary one?
- [ ] Next.js Portal (modern, React-based)
- [ ] Django Template Portal (legacy, template-based)
- [ ] Both (different paths)

**Question 2**: Should we unify authentication?
- [ ] Yes - Use JWT only (recommended)
- [ ] No - Keep both systems

## Code Locations

### JWT Authentication
- **Backend**: `apps/accounts/views.py` - `TokenObtainPairView`
- **Backend URLs**: `apps/accounts/urls.py` - `/api/auth/token/`
- **Frontend API**: `frontend/lib/api/auth.ts`
- **Frontend Login**: `frontend/app/login/page.tsx`
- **Frontend Client**: `frontend/lib/api/client.ts` (axios with JWT interceptor)

### Session Authentication (Customer)
- **Backend**: `apps/customers/auth_views.py` - `customer_login()`
- **Backend URLs**: `config/urls.py` - `/customer/login/`
- **Portal Views**: `apps/customers/portal_views.py`
- **Portal URLs**: `apps/customers/portal_urls.py` - `/portal/*`
- **Templates**: `templates/portal/*.html`

### Next.js Portal
- **Pages**: `frontend/app/portal/*.tsx`
- **Layout**: `frontend/app/portal/layout.tsx`
- **API**: Uses same backend API endpoints with JWT

## Next Steps

1. ✅ Documented both systems (DONE)
2. ⏳ **DECIDE**: Which portal to use as primary
3. ⏳ **DECIDE**: Unify authentication or keep both
4. ⏳ Update routing to avoid conflicts
5. ⏳ Update documentation
6. ⏳ Test both systems
