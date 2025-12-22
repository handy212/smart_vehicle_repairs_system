# Subscription Module - Flow Documentation

## Overview
The subscription module allows customers to subscribe to service packages (e.g., Premium Package, Lite Package) that provide benefits like free kilometers, call-out charges, towing services, etc.

## Key Components

### Models
1. **Package**: Defines subscription packages with features, pricing, and duration
2. **Subscription**: Customer subscription instance linked to a package
3. **SubscriptionUsage**: Tracks usage/consumption of subscription benefits

### Status Flow

#### Subscription Statuses
- **pending**: Subscription created but payment not yet received
- **active**: Subscription is active and can be used
- **expired**: Subscription has passed its end date
- **cancelled**: Subscription was manually cancelled
- **suspended**: Subscription is temporarily suspended

#### Payment Statuses
- **pending**: Payment not yet received
- **paid**: Payment completed
- **failed**: Payment failed
- **refunded**: Payment was refunded

## Subscription Creation Flow

### For Customers (Portal)
1. Customer logs into portal
2. Navigates to Subscriptions page
3. Selects a package from available packages
4. Creates subscription (auto-assigned to their customer profile)
5. Invoice is automatically created and linked
6. Customer pays invoice via Paystack
7. Payment callback activates subscription (status: pending → active, payment_status: pending → paid)

### For Admins/Managers (Dashboard)
1. Admin/Manager navigates to Subscriptions page in dashboard
2. Clicks "New Subscription" button (requires `manage_subscriptions` permission)
3. Selects customer and package from dropdowns
4. Optionally sets start date and auto-renew preference
5. Creates subscription
6. Invoice is automatically created and linked
7. Customer receives notification
8. Subscription status is "pending" until payment
9. After payment, subscription activates automatically

### Backend Process (Service Layer)
When `SubscriptionService.create_subscription_with_invoice()` is called:

1. **Validation**:
   - Checks for duplicate active subscriptions for the customer/package
   - Validates package is active
   - Validates customer exists

2. **Subscription Creation**:
   - Creates Subscription instance with:
     - Status: "pending" (will be "active" after payment)
     - Payment status: "pending"
     - Calculated end_date based on start_date + package duration_months
     - Purchase price from package

3. **Vehicle Handling**:
   - Uses customer's first vehicle if available
   - Creates placeholder vehicle (SUB-{customer_id}) if customer has no vehicles
   - (Invoices require a vehicle field)

4. **Invoice Creation**:
   - Creates Invoice with:
     - Description: "Subscription: {package.name} ({duration} months)"
     - Amount: package.price
     - Status: "pending"
   - Creates InvoiceLineItem for the subscription
   - Stores invoice_id in subscription.metadata for linking

5. **Notification**:
   - Sends purchase notification to customer

## Payment and Activation Flow

### Payment Processing
1. Customer pays invoice via Paystack (or admin records payment)
2. Payment callback (`paystack_callback` in `paystack_views.py`) processes payment
3. Payment is recorded in Payment model
4. Invoice status updated to "paid"
5. **Subscription activation triggered**: `SubscriptionService.activate_subscription()` is called

### Activation Process
1. Subscription status changes: pending → active
2. Payment status changes: pending → paid
3. Invoice marked as paid
4. Activation notification sent to customer

## Renewal Flow

### Manual Renewal
1. Admin or Customer initiates renewal (before or after expiration)
2. `SubscriptionService.renew_subscription()` is called
3. New dates calculated (extends from current end_date)
4. Status set to "pending" (requires payment)
5. New invoice created with renewal description
6. renewal_invoice_id stored in metadata
7. Customer pays renewal invoice
8. Subscription reactivated

### Auto-Renewal (Future)
- Can be implemented with scheduled task
- Checks subscriptions with auto_renew=True and end_date approaching
- Automatically creates renewal invoice
- Processes payment if payment method on file

## Usage Tracking Flow

### Recording Usage
When a customer uses a subscription benefit (e.g., free kilometers, towing service):

1. `SubscriptionUsageService.consume_allowance()` is called
2. Validates subscription is active and not expired
3. Checks remaining allowance for the feature
4. If sufficient:
   - Creates SubscriptionUsage record
   - Reduces remaining allowance
   - Sends low allowance notification if remaining ≤ 1
5. If insufficient:
   - Raises ValidationError

### Checking Allowance
Before providing a service, check:
```python
has_allowance, subscription, remaining = SubscriptionUsageService.check_allowance(
    customer=customer,
    feature_key='towing_services',
    quantity_needed=1
)
```

## API Endpoints

### Packages
- `GET /api/subscriptions/packages/` - List all packages
- `GET /api/subscriptions/packages/available/` - List active packages
- `POST /api/subscriptions/packages/` - Create package (admin only)
- `GET /api/subscriptions/packages/{id}/` - Get package details
- `PATCH /api/subscriptions/packages/{id}/` - Update package (admin only)
- `DELETE /api/subscriptions/packages/{id}/` - Delete package (admin only)

### Subscriptions
- `GET /api/subscriptions/subscriptions/` - List subscriptions (filtered by role)
- `POST /api/subscriptions/subscriptions/` - Create subscription
- `GET /api/subscriptions/subscriptions/{id}/` - Get subscription details
- `PATCH /api/subscriptions/subscriptions/{id}/` - Update subscription
- `POST /api/subscriptions/subscriptions/{id}/renew/` - Renew subscription
- `POST /api/subscriptions/subscriptions/{id}/cancel/` - Cancel subscription
- `GET /api/subscriptions/subscriptions/{id}/usage/` - Get usage history
- `GET /api/subscriptions/subscriptions/{id}/remaining/` - Get remaining allowances
- `GET /api/subscriptions/subscriptions/my_subscriptions/` - Get current user's subscriptions (portal)

### Usage
- `GET /api/subscriptions/usage/` - List usage records
- `POST /api/subscriptions/usage/` - Create usage record (admin only)

## Permissions

- `manage_subscriptions`: Full access to subscription management
- `create_subscriptions`: Can create subscriptions (for admins creating for customers)
- `cancel_subscriptions`: Can cancel subscriptions
- `record_usage`: Can record subscription usage

## Key Features

### Package Features
- **kilometers**: Number of free kilometers
- **call_out_charges**: Number of free call-out charges
- **towing_services**: Number of free towing services
- **free_inspections**: Number of free inspections
- **roadside_assistance**: Boolean flag for roadside assistance
- **discount_percentage**: Discount percentage on services

### Subscription Features
- Auto-generated subscription numbers (SUB-00001, SUB-00002, etc.)
- Automatic end date calculation
- Metadata field for storing additional info (invoice IDs, etc.)
- Days remaining calculation
- Remaining allowances tracking

## Best Practices

1. **Always use services**: Use `SubscriptionService` methods instead of directly creating subscriptions
2. **Check allowance before use**: Always check if customer has allowance before consuming it
3. **Handle payment properly**: Ensure subscription activates after payment
4. **Use metadata for linking**: Store invoice IDs in metadata for reliable linking
5. **Validate before creation**: Check for duplicate active subscriptions
6. **Notify customers**: Send notifications for important events (purchase, activation, expiration, etc.)

## Improvements Made

### Recent Enhancements
1. ✅ Fixed STATUS_CHOICES to include 'pending' status
2. ✅ Added admin/manager ability to create subscriptions for customers via dashboard
3. ✅ Enhanced frontend UI with "New Subscription" dialog
4. ✅ Improved subscription creation flow with proper validation
5. ✅ Better invoice linking via metadata

### Potential Future Improvements
1. Auto-renewal automation with scheduled tasks
2. Subscription upgrade/downgrade functionality
3. Prorated pricing for mid-cycle changes
4. Subscription history and audit trail
5. Bulk subscription creation for multiple customers
6. Subscription templates/presets
7. Better reporting and analytics dashboard
