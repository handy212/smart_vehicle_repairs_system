# How Subscription Deductions Work

## Overview
Subscription deductions automatically consume allowances when customers use subscription benefits (e.g., towing services, call-outs, free inspections, kilometers).

## Deduction Flow

### 1. **Automatic Deduction on Service Usage**

Deductions happen automatically when certain services are created:

#### **Work Orders**
- **Towing Service**: When a work order is created with `service_type='towing'`
  - Location: `apps/workorders/views.py` (lines 112-125)
  - Deducts: 1 unit from `towing_services` allowance
  - Links to: Work Order ID

- **Call-Out Service**: When a work order is created with `service_type='call_out'`
  - Location: `apps/workorders/views.py` (lines 134-147)
  - Deducts: 1 unit from `call_out_charges` allowance
  - Links to: Work Order ID

#### **Appointments**
- **Free Inspections**: When an appointment is created with `appointment_type='inspection'`
  - Location: `apps/appointments/views.py` (lines 175-188)
  - Deducts: 1 unit from `free_inspections` allowance
  - Links to: Appointment ID

### 2. **Manual Deduction via API**

You can also manually record usage via the API:

**Endpoint**: `POST /api/subscriptions/usage/`

**Request Body**:
```json
{
  "subscription": 1,
  "usage_type": "towing",
  "quantity_used": 1,
  "reference_type": "workorder",
  "reference_id": 123,
  "description": "Towing service for work order WO-001"
}
```

**Usage Types**:
- `kilometer` - Kilometers used
- `call_out` - Call-out charges
- `towing` - Towing services
- `inspection` - Free inspections
- `roadside_assistance` - Roadside assistance
- `other` - Other services

### 3. **How Deduction Works (Technical)**

The `SubscriptionUsageService.consume_allowance()` method:

1. **Validates Subscription**:
   - Checks if subscription is active (`status='active'`)
   - Checks if subscription is not expired (`end_date >= today`)

2. **Maps Usage Type to Feature**:
   ```python
   usage_to_feature = {
       'towing': 'towing_services',
       'call_out': 'call_out_charges',
       'kilometer': 'kilometers',
       'inspection': 'free_inspections',
   }
   ```

3. **Checks Remaining Allowance**:
   - Gets initial allowance from `package.features[feature_key]`
   - Calculates total used: `SUM(usage_records.quantity_used)`
   - Calculates remaining: `initial_allowance - total_used`

4. **Validates Sufficient Allowance**:
   - If `remaining < quantity_used`: Raises `ValidationError`
   - If sufficient: Proceeds to deduct

5. **Creates Usage Record**:
   - Creates `SubscriptionUsage` record with:
     - `subscription` - The subscription being used
     - `usage_type` - Type of usage (e.g., 'towing', 'call_out')
     - `quantity_used` - Amount consumed
     - `service_date` - Date of service
     - `reference_type` - Type of related object ('workorder', 'appointment', etc.)
     - `reference_id` - ID of related object
     - `description` - Description of usage
     - `created_by` - User who recorded the usage

6. **Sends Low Allowance Notification**:
   - If remaining allowance ≤ 1 after deduction, sends notification

### 4. **Checking Remaining Allowance**

**Method**: `subscription.get_remaining_allowance(feature_type)`

**How it works**:
```python
# Get initial allowance from package
initial_allowance = package.features.get(feature_type, 0)

# Calculate total used from all usage records
total_used = usage_records.filter(usage_type=feature_type).aggregate(
    total=Sum('quantity_used')
)['total'] or 0

# Return remaining
remaining = initial_allowance - total_used
return max(0, remaining)
```

**API Endpoint**: `GET /api/subscriptions/{id}/remaining/`

Returns all remaining allowances for a subscription.

### 5. **Example Scenarios**

#### Scenario 1: Customer Uses Towing Service
1. Customer has subscription with `towing_services: 5` in package
2. Work order created with `service_type='towing'`
3. System automatically:
   - Checks if customer has active subscription
   - Checks remaining towing allowance (e.g., 5 remaining)
   - Deducts 1 unit
   - Creates usage record linked to work order
   - Remaining allowance now: 4

#### Scenario 2: Customer Uses All Allowance
1. Customer has 1 remaining towing service
2. Work order created with `service_type='towing'`
3. System:
   - Deducts 1 unit (remaining becomes 0)
   - Sends low allowance notification
   - Next towing service will require payment (no subscription benefit)

#### Scenario 3: Insufficient Allowance
1. Customer has 0 remaining towing services
2. Work order created with `service_type='towing'`
3. System:
   - Raises `ValidationError`: "Insufficient allowance"
   - Work order still created, but towing is charged normally (not covered by subscription)

### 6. **Usage Records**

All deductions are tracked in `SubscriptionUsage` model:
- **View Usage History**: `GET /api/subscriptions/{id}/usage/`
- **View Remaining**: `GET /api/subscriptions/{id}/remaining/`
- **Manual Record**: `POST /api/subscriptions/usage/`

### 7. **Integration Points**

Deductions are integrated into:
- ✅ **Work Orders** - Automatic deduction for towing/call-out services
- ✅ **Appointments** - Automatic deduction for free inspections
- ⚠️ **Invoices** - Not yet integrated (could deduct discount_percentage)
- ⚠️ **Inspections** - Not yet integrated (could deduct free_inspections)

### 8. **Best Practices**

1. **Always check allowance before deducting**:
   ```python
   has_allowance, subscription, remaining = SubscriptionUsageService.check_allowance(
       customer, 'towing_services', 1
   )
   if has_allowance:
       SubscriptionUsageService.consume_allowance(...)
   ```

2. **Handle errors gracefully**:
   - If deduction fails, service should still be provided
   - Customer pays normally if subscription doesn't cover it

3. **Link usage to related objects**:
   - Always provide `reference_type` and `reference_id`
   - This allows tracking which work order/appointment used the subscription

4. **Provide descriptions**:
   - Helps with auditing and customer understanding

## Summary

**Subscription deductions are automatic** when:
- Work orders are created (towing/call-out services)
- Appointments are created (free inspections)

**Deductions are tracked** via `SubscriptionUsage` records that:
- Link to the subscription
- Link to the related service (work order/appointment)
- Track quantity used and date
- Enable calculation of remaining allowances

**Remaining allowances** are calculated in real-time by:
- Getting initial allowance from package features
- Subtracting all usage records for that feature type
- Returning the difference
