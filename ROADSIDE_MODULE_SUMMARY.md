# Roadside Assistance Module - Summary

## Overview
A dedicated module for handling roadside breakdown assistance requests, separate from regular workshop work orders and appointments. This module integrates with the subscription system to automatically deduct allowances when customers use their AA membership benefits.

## Key Features

### 1. **Roadside Request Management**
- Create, view, update, and cancel roadside assistance requests
- Track request status through workflow: `requested → dispatched → en_route → on_site → in_progress → completed`
- Support for multiple service types (towing, battery boost, flat tyre, key lockout, etc.)

### 2. **Subscription Integration**
- **Automatic Check**: When a roadside request is created, the system automatically checks if the customer has an active subscription for the specific vehicle
- **Automatic Deduction**: If subscription exists and has allowance, it's automatically deducted
- **Service Type Mapping**:
  - `towing` → deducts actual km from `towing_services_km` allowance
  - `battery_boost` → deducts 1 from `battery_boosts`
  - `flat_tyre` → deducts 1 from `flat_tyre_service`
  - `key_lockout` → deducts 1 from `key_lock_out`
  - `emergency_fuel` → deducts 1 from `emergency_fuel`
  - `extrication` → deducts 1 from `extrication`
  - `mechanical_first_aid` → deducts 1 from `roadside_first_aid`

### 3. **Workflow States**
- **requested**: Initial request created
- **dispatched**: Assigned to technician/service provider
- **en_route**: Service provider is on the way
- **on_site**: Service provider has arrived at breakdown location
- **in_progress**: Service is being performed
- **completed**: Service completed successfully
- **cancelled**: Request cancelled (only allowed in early states)
- **failed**: Service failed (with reason)

### 4. **API Endpoints**

#### List/Create/Retrieve
- `GET /api/roadside/requests/` - List all requests (filtered by user role)
- `POST /api/roadside/requests/` - Create new roadside request
- `GET /api/roadside/requests/{id}/` - Get request details
- `PATCH /api/roadside/requests/{id}/` - Update request

#### Workflow Actions
- `POST /api/roadside/requests/{id}/dispatch/` - Dispatch to technician
- `POST /api/roadside/requests/{id}/en_route/` - Mark en route
- `POST /api/roadside/requests/{id}/arrive/` - Mark arrived on site
- `POST /api/roadside/requests/{id}/in_progress/` - Mark in progress
- `POST /api/roadside/requests/{id}/complete/` - Mark completed
- `POST /api/roadside/requests/{id}/cancel/` - Cancel request
- `POST /api/roadside/requests/{id}/fail/` - Mark as failed

#### Customer Portal
- `GET /api/roadside/requests/my_requests/` - Get customer's requests

### 5. **Filtering & Search**
- Filter by: `status`, `service_type`, `customer`, `vehicle`, `branch`, `is_covered_by_subscription`
- Search by: `request_number`, customer name, vehicle license plate, breakdown location
- Order by: `requested_at`, `dispatched_at`, `completed_at`, `status`

### 6. **Permissions**
- **Customers**: Can create their own requests and view their own requests
- **Staff**: Can view requests for their branch
- **Admin/Manager**: Can view all requests and manage them

## Usage Example

### Creating a Roadside Request

```json
POST /api/roadside/requests/
{
  "customer": 1,
  "vehicle": 5,
  "service_type": "towing",
  "breakdown_location": "Accra-Tema Motorway, KM 15",
  "latitude": 5.6037,
  "longitude": -0.1870,
  "description": "Engine breakdown, vehicle won't start",
  "customer_phone": "+233241234567",
  "tow_distance_km": 25.5,
  "destination": "AAPL Service Center, Awudome Estates"
}
```

**What happens:**
1. Request is created with status `requested`
2. System checks if customer has active subscription for vehicle 5
3. If subscription exists and has `towing_services_km` allowance ≥ 25.5:
   - Deducts 25.5 km from subscription
   - Marks request as `is_covered_by_subscription = true`
   - Links subscription and usage record to request
4. If no subscription or insufficient allowance:
   - Request is created but `is_covered_by_subscription = false`
   - Service will be charged normally

### Dispatching a Request

```json
POST /api/roadside/requests/1/dispatch/
{
  "technician_id": 10
}
```

Updates status to `dispatched` and assigns technician.

## Model Fields

### RoadsideRequest
- **request_number**: Auto-generated (RSA-000001, RSA-000002, etc.)
- **customer**: Customer requesting service
- **vehicle**: Vehicle requiring service (must belong to customer)
- **service_type**: Type of roadside service
- **status**: Current workflow status
- **breakdown_location**: Where vehicle broke down
- **latitude/longitude**: GPS coordinates
- **tow_distance_km**: Distance for towing (required for towing service)
- **subscription_used**: Subscription that covered this service
- **subscription_allowance_deducted**: Whether allowance was deducted
- **is_covered_by_subscription**: Whether service is covered
- **charge_amount**: Amount charged if not covered

## Improvements Made

1. ✅ **Better Error Handling**: All workflow transitions validate current state
2. ✅ **Enhanced Validation**: Required fields validated (phone, location, tow distance for towing)
3. ✅ **Additional Workflow States**: Added `en_route` and `in_progress` states
4. ✅ **Filtering & Search**: Added comprehensive filtering and search capabilities
5. ✅ **Better Logging**: Improved error logging for subscription failures
6. ✅ **State Validation**: Model methods validate state transitions
7. ✅ **Fail Action**: Added ability to mark requests as failed with reason

## Integration Points

- **Subscriptions**: Automatic allowance deduction on request creation
- **Branches**: Requests are assigned to branches
- **Users**: Technicians can be assigned to requests
- **Vehicles**: Requests are tied to specific vehicles
- **Customers**: Requests belong to customers

## Next Steps (Optional)

1. **Notifications**: Send SMS/email when request is dispatched, arrived, completed
2. **Real-time Updates**: WebSocket support for live status updates
3. **GPS Tracking**: Track technician location in real-time
4. **Mobile App**: Mobile app for technicians to update status
5. **Analytics**: Dashboard for roadside service metrics
6. **Invoicing**: Auto-generate invoices for non-subscription services
