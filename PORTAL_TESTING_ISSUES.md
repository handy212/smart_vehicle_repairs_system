# Portal Testing Issues Found

## Critical Issue Found: Missing customer_profile in API Response

### Problem
The `UserSerializer` in `apps/accounts/serializers.py` doesn't include `customer_profile` in the response. This means when the frontend calls `/auth/users/me/`, it won't get the customer profile ID needed to fetch customer data.

### Impact
- Portal dashboard won't load (can't get customer ID)
- All portal pages that need customer ID will fail
- Vehicles, appointments, invoices won't load

### Fix Applied
✅ Updated `UserSerializer` to include `customer_profile` as a `SerializerMethodField` that returns:
- `id`: Customer profile ID
- `customer_type`: Type of customer
- `customer_number`: Customer number (if available)

### Testing Checklist

After this fix, test:

1. **Login Flow**
   - [ ] Customer can login via `/login`
   - [ ] Redirects to `/portal` (not `/dashboard`)
   - [ ] User object includes `customer_profile.id`

2. **Portal Dashboard** (`/portal`)
   - [ ] Loads without errors
   - [ ] Shows stats (vehicles, appointments, invoices)
   - [ ] Shows recent activity

3. **My Vehicles** (`/portal/vehicles`)
   - [ ] Lists customer's vehicles
   - [ ] Shows "No vehicles" if none exist

4. **My Appointments** (`/portal/appointments`)
   - [ ] Lists customer's appointments
   - [ ] Filter by status works

5. **My Invoices** (`/portal/invoices`)
   - [ ] Lists customer's invoices
   - [ ] Shows payment buttons for pending invoices

6. **My Estimates** (`/portal/estimates`)
   - [ ] Lists customer's estimates
   - [ ] Approve/decline buttons work

7. **Service History** (`/portal/history`)
   - [ ] Shows work orders
   - [ ] Shows inspections
   - [ ] Filter by vehicle works

8. **Book Appointment** (`/portal/book`)
   - [ ] Form loads
   - [ ] Can select vehicle
   - [ ] Can submit appointment

9. **Settings** (`/portal/settings`)
   - [ ] Profile form loads with user data
   - [ ] Can update profile
   - [ ] Password change works

## Other Potential Issues to Check

1. **API Endpoint Compatibility**
   - Verify `/vehicles/vehicles/?owner={customerId}` works
   - Verify `/appointments/appointments/?customer={customerId}` works
   - Verify `/billing/invoices/?customer={customerId}` works

2. **Error Handling**
   - Check what happens if customer has no vehicles
   - Check what happens if API returns errors
   - Check loading states

3. **Authentication**
   - Verify JWT tokens are stored correctly
   - Verify tokens refresh automatically
   - Verify logout clears tokens

4. **Role-Based Access**
   - Verify non-customers are redirected from `/portal`
   - Verify customers are redirected from `/dashboard`

## How to Test

1. Create a test customer:
   ```bash
   python3 create_test_customer.py
   ```

2. Start frontend:
   ```bash
   cd frontend && npm run dev
   ```

3. Start backend:
   ```bash
   python manage.py runserver
   ```

4. Login at `http://localhost:3000/login`
   - Email: `customer@example.com`
   - Password: `test123`

5. Verify redirect to `/portal`

6. Test each portal page

## Expected API Response Structure

After the fix, `/auth/users/me/` should return:
```json
{
  "id": 1,
  "email": "customer@example.com",
  "first_name": "Test",
  "last_name": "Customer",
  "role": "customer",
  "customer_profile": {
    "id": 1,
    "customer_type": "individual",
    "customer_number": "CUST-001"
  }
}
```

