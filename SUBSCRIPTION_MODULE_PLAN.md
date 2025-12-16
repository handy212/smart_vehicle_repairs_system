# Customer Subscription Module - Implementation Plan

## Overview
A comprehensive subscription management system that allows customers to subscribe to service packages (e.g., "Lite Package", "Premium Package") that include predefined service allowances (100KM, 2 call out charges, 2 towing services, etc.) valid for a specific duration (typically 1 year).

---

## Database Models

### 1. **Package Model**
Stores subscription package definitions (templates).

**Fields:**
- `name` (CharField) - Package name (e.g., "Lite Package", "Premium Package")
- `code` (CharField, unique) - Package code (e.g., "LITE", "PREMIUM")
- `description` (TextField) - Package description
- `price` (DecimalField) - Package price
- `duration_months` (IntegerField) - Subscription duration in months (default: 12)
- `is_active` (BooleanField) - Whether package is available for purchase
- `features` (JSONField) - Package features/inclusions (flexible structure)
- `metadata` (JSONField, optional) - Additional package metadata
- `created_at`, `updated_at` - Timestamps
- `created_by` (ForeignKey to User)

**Package Features Structure:**
```json
{
  "kilometers": 100,
  "call_out_charges": 2,
  "towing_services": 2,
  "roadside_assistance": true,
  "free_inspections": 1,
  "discount_percentage": 10
}
```

### 2. **Subscription Model**
Stores customer subscriptions to packages.

**Fields:**
- `subscription_number` (CharField, unique) - Auto-generated subscription ID
- `customer` (ForeignKey to Customer) - Customer who owns the subscription
- `package` (ForeignKey to Package) - Package type
- `start_date` (DateField) - Subscription start date
- `end_date` (DateField) - Subscription end date (calculated)
- `status` (CharField) - Status choices: 'active', 'expired', 'cancelled', 'suspended'
- `auto_renew` (BooleanField) - Whether to auto-renew subscription
- `purchase_price` (DecimalField) - Price at time of purchase (for historical tracking)
- `payment_status` (CharField) - 'pending', 'paid', 'failed', 'refunded'
- `purchased_at` (DateTimeField) - When subscription was purchased
- `cancelled_at` (DateTimeField, nullable) - When subscription was cancelled
- `cancellation_reason` (TextField, optional) - Reason for cancellation
- `created_at`, `updated_at` - Timestamps

**Methods:**
- `is_active()` - Check if subscription is currently active
- `is_expired()` - Check if subscription has expired
- `days_remaining()` - Calculate days until expiration
- `renew()` - Renew the subscription for another period

### 3. **SubscriptionUsage Model**
Tracks usage of subscription benefits (consumption tracking).

**Fields:**
- `subscription` (ForeignKey to Subscription) - Related subscription
- `usage_type` (CharField) - Type of usage: 'kilometer', 'call_out', 'towing', 'inspection', etc.
- `quantity_used` (DecimalField) - Amount/quantity consumed
- `service_date` (DateField) - Date when service was used
- `reference_type` (CharField, nullable) - Type of related object (e.g., 'workorder', 'appointment')
- `reference_id` (IntegerField, nullable) - ID of related object (e.g., WorkOrder ID)
- `description` (TextField) - Description of the usage
- `created_at` (DateTimeField) - When usage was recorded
- `created_by` (ForeignKey to User, nullable) - User who recorded the usage

**Methods:**
- Calculate total usage for a subscription by type
- Check remaining allowance

---

## Backend API Structure

### 1. **Package Management (Admin/Staff)**
- `GET /api/subscriptions/packages/` - List all packages
- `GET /api/subscriptions/packages/{id}/` - Get package details
- `POST /api/subscriptions/packages/` - Create new package (Admin only)
- `PATCH /api/subscriptions/packages/{id}/` - Update package (Admin only)
- `DELETE /api/subscriptions/packages/{id}/` - Delete/deactivate package (Admin only)

### 2. **Subscription Management**
- `GET /api/subscriptions/` - List subscriptions (filtered by customer/user role)
- `GET /api/subscriptions/{id}/` - Get subscription details
- `POST /api/subscriptions/` - Create new subscription (purchase package)
- `PATCH /api/subscriptions/{id}/` - Update subscription (e.g., cancel, renew)
- `GET /api/subscriptions/{id}/usage/` - Get subscription usage history
- `GET /api/subscriptions/{id}/remaining/` - Get remaining allowances
- `POST /api/subscriptions/{id}/renew/` - Renew subscription
- `POST /api/subscriptions/{id}/cancel/` - Cancel subscription

### 3. **Usage Tracking**
- `GET /api/subscriptions/usage/` - List all usage records (filtered by user role)
- `POST /api/subscriptions/usage/` - Record usage (consumption)
- `GET /api/subscriptions/usage/{id}/` - Get usage details
- `DELETE /api/subscriptions/usage/{id}/` - Delete usage record (Admin only)

### 4. **Customer Portal Endpoints**
- `GET /api/subscriptions/my-subscriptions/` - Get current customer's subscriptions
- `GET /api/subscriptions/available-packages/` - Get available packages for purchase

---

## Frontend Structure

### Admin/Staff Pages
1. **Package Management Page** (`/admin/subscriptions/packages`)
   - List all packages
   - Create/Edit/Delete packages
   - Set package features and pricing
   - Activate/Deactivate packages

2. **Subscription Management Page** (`/admin/subscriptions`)
   - List all customer subscriptions
   - Filter by status, customer, package
   - View subscription details
   - Cancel/Renew subscriptions
   - View usage history

3. **Usage Tracking Page** (`/admin/subscriptions/usage`)
   - Record usage for subscriptions
   - View usage history
   - Track consumption

### Customer Portal Pages
1. **My Subscriptions Page** (`/portal/subscriptions`)
   - View active subscriptions
   - View subscription details and remaining benefits
   - Purchase new subscriptions
   - Renew subscriptions
   - Cancel subscriptions

2. **Available Packages Page** (`/portal/subscriptions/packages`)
   - Browse available packages
   - View package features
   - Purchase packages

---

## Key Features & Functionality

### 1. **Package Features Definition**
Each package can include:
- **Kilometers**: Distance allowance (e.g., 100KM)
- **Call Out Charges**: Number of free call-out services
- **Towing Services**: Number of towing services included
- **Roadside Assistance**: Boolean flag
- **Free Inspections**: Number of free inspections
- **Discount Percentage**: Discount on additional services
- **Custom Features**: Flexible JSON structure for future additions

### 2. **Usage Tracking**
- Automatically track usage when services are provided
- Link usage to work orders/appointments
- Support manual usage recording
- Calculate remaining allowances in real-time

### 3. **Subscription Lifecycle**
- **Purchase**: Customer buys a package → creates subscription
- **Active**: Subscription is valid and can be used
- **Expired**: Subscription has reached end date
- **Cancelled**: Subscription was cancelled before expiration
- **Suspended**: Temporarily disabled (admin action)

### 4. **Auto-Renewal**
- Optional auto-renewal feature
- Renew subscriptions automatically on expiration
- Charge customer for renewal

### 5. **Remaining Allowances Calculation**
Real-time calculation of:
- Remaining kilometers
- Remaining call-outs
- Remaining towing services
- Remaining inspections
- etc.

---

## Integration Points

### 1. **Work Orders**
- Check subscription before creating work order
- Deduct kilometers/towing/call-out charges automatically
- Apply discounts based on subscription

### 2. **Appointments**
- Check subscription for free inspections
- Apply subscription benefits

### 3. **Billing**
- Link subscription purchases to billing
- Handle payment processing
- Track payment status

### 4. **Customer Model**
- Add relationship to subscriptions
- Quick access to active subscriptions

---

## Permissions

- **View Packages**: All authenticated users
- **Manage Packages**: Admin only
- **View Subscriptions**: Admin, Manager, and own subscriptions (customers)
- **Create Subscriptions**: Admin, Manager, Customers
- **Cancel Subscriptions**: Admin, Manager, and own subscriptions
- **View Usage**: Admin, Manager, and own subscription usage
- **Record Usage**: Admin, Manager, Service Coordinator

---

## Data Flow Example

### Purchase Flow:
1. Customer views available packages
2. Customer selects a package
3. System creates subscription with:
   - Start date: today
   - End date: today + package duration
   - Status: 'active'
   - Initial allowances from package features
4. Payment processing
5. Subscription activated

### Usage Flow:
1. Service is provided (e.g., towing service)
2. System checks if customer has active subscription
3. If yes, check remaining allowance
4. If allowance available, deduct usage and create SubscriptionUsage record
5. Update subscription if needed
6. Continue with service

### Renewal Flow:
1. Subscription nears expiration (e.g., 30 days before)
2. System checks auto_renew flag
3. If enabled, process renewal:
   - Extend end_date by package duration
   - Reset or add allowances based on package
   - Process payment
   - Update subscription status

---

## Implementation Steps

1. **Phase 1: Database Models**
   - Create Package model
   - Create Subscription model
   - Create SubscriptionUsage model
   - Run migrations

2. **Phase 2: Backend API**
   - Create serializers
   - Create viewsets
   - Create URLs
   - Add permissions

3. **Phase 3: Frontend API Client**
   - Create TypeScript interfaces
   - Create API client functions

4. **Phase 4: Admin Pages**
   - Package management page
   - Subscription management page
   - Usage tracking page

5. **Phase 5: Customer Portal**
   - My subscriptions page
   - Package purchase page

6. **Phase 6: Integration**
   - Integrate with work orders
   - Integrate with appointments
   - Integrate with billing

7. **Phase 7: Testing & Refinement**
   - Test all flows
   - Add validation
   - Error handling
   - UI polish

---

## Future Enhancements

- Email notifications for subscription expiration
- Usage analytics and reporting
- Package recommendations based on customer history
- Tiered pricing (monthly vs yearly)
- Promotional codes and discounts
- Subscription upgrade/downgrade paths
- Usage limits per service type
- Family/fleet subscription packages


