# Invoice Edit Form Bug Fix

## Problem Description
When editing an invoice at `http://localhost:3001/billing/invoices/29/edit`, the form had the following issues:
1. Selected customer, vehicle, and sales agent fields were not displaying the pre-populated values
2. Users had to re-select these values every time they edited an invoice
3. Console errors showing "Invalid input: expected number, received NaN"

## Root Causes

### 1. **parseInt() returning NaN**
The Select components were calling `parseInt()` directly on values without checking if the parsing was successful:
```tsx
onValueChange={(val) => setValue("customer", parseInt(val), { shouldValidate: true })}
```

When the form loaded, if `val` was an empty string or undefined, `parseInt("")` would return `NaN`, which then got set as the value, causing validation errors.

### 2. **Nested Object ID Extraction**
The form initialization wasn't properly handling cases where the API returned nested objects vs. direct IDs:
```tsx
// Before - didn't handle sales_agent being an object
const salesAgentId = invoice.sales_agent;

// After - properly extracts ID from object or uses the direct value
const salesAgentId = typeof invoice.sales_agent === 'object' && invoice.sales_agent
  ? (invoice.sales_agent as any).id
  : invoice.sales_agent;
```

### 3. **Undefined/Null Value Handling**
The form wasn't gracefully handling undefined or null values when resetting:
```tsx
// Before
reset({
  customer: customerId,
  vehicle: vehicleId,
  sales_agent: invoice.sales_agent,
});

// After
reset({
  customer: customerId || 0,
  vehicle: vehicleId || undefined,
  sales_agent: salesAgentId || undefined,
});
```

### 4. **Invalid URL Parameter Parsing**
The page was parsing the invoice/estimate ID from the URL without validating it:
```tsx
// Before - could result in NaN being used in API calls
const invoiceId = parseInt(params.id as string);
const { data: invoice } = useQuery({
  queryKey: ["invoice", invoiceId],
  queryFn: () => billingApi.invoices.get(invoiceId), // Called even if invoiceId is NaN!
});

// After - validates ID before making API calls
const invoiceId = parseInt(params.id as string);
const isValidId = !isNaN(invoiceId) && invoiceId > 0;
const { data: invoice } = useQuery({
  queryKey: ["invoice", invoiceId],
  queryFn: () => billingApi.invoices.get(invoiceId),
  enabled: isValidId, // Only call API if ID is valid
});
```

This was causing errors like `GET /api/billing/invoices/NaN/ HTTP/1.1 404`

### 5. **Undefined Invoice ID in Redirect After Save**
After updating an invoice, the redirect was trying to use `res.id` from the API response, which might be undefined:
```tsx
// Before - could redirect to /billing/invoices/undefined
.then((res) => {
  router.push(`/billing/invoices/${res.id}`);
})

// After - uses existing invoiceId as fallback
.then((res) => {
  const id = res?.id || invoiceId;
  router.push(`/billing/invoices/${id}`);
})
```

This was causing redirects to `/billing/invoices/undefined` after saving

## Solutions Implemented

### Invoice Edit Page (`/frontend/app/(dashboard)/billing/invoices/[id]/edit/page.tsx`)

#### 1. Added NaN Validation to Select onChange Handlers
```tsx
// Customer field
onValueChange={(val) => {
  const parsed = parseInt(val);
  if (!isNaN(parsed)) {
    setValue("customer", parsed, { shouldValidate: true });
  }
}}

// Vehicle field  
onValueChange={(val) => {
  const parsed = parseInt(val);
  if (!isNaN(parsed)) {
    setValue("vehicle", parsed, { shouldValidate: true });
  }
}}

// Sales Agent field
onValueChange={(val) => {
  const parsed = parseInt(val);
  if (!isNaN(parsed)) {
    setValue("sales_agent", parsed, { shouldValidate: true });
  }
}}
```

#### 2. Improved Form Initialization
Enhanced the `useEffect` that initializes form data to properly extract IDs from nested objects:
```tsx
useEffect(() => {
  if (invoice && !isLoading) {
    // Extract IDs from objects, handling both nested objects and direct IDs
    const customerId = typeof invoice.customer === 'object' && invoice.customer 
      ? (invoice.customer as any).id 
      : invoice.customer;
    
    const vehicleId = typeof invoice.vehicle === 'object' && invoice.vehicle 
      ? (invoice.vehicle as any).id 
      : invoice.vehicle;
    
    const salesAgentId = typeof invoice.sales_agent === 'object' && invoice.sales_agent
      ? (invoice.sales_agent as any).id
      : invoice.sales_agent;

    // Only set selected customer if we have a valid ID
    if (customerId) {
      setSelectedCustomer(customerId);
    }

    // ... rest of initialization with proper fallback values
    reset({
      customer: customerId || 0,
      vehicle: vehicleId || undefined,
      sales_agent: salesAgentId || undefined,
      // ... other fields
    });
  }
}, [invoice, isLoading, reset]);
```

### Proforma Invoice Page (`/frontend/app/(dashboard)/billing/proformas/new/page.tsx`)

Applied the same NaN validation fixes to prevent similar issues:

```tsx
// Customer field
onValueChange={(val) => {
  const id = parseInt(val);
  if (!isNaN(id)) {
    field.onChange(id);
    setSelectedCustomer(id);
  }
}}

// Vehicle field
onValueChange={(val) => {
  const id = parseInt(val);
  if (!isNaN(id)) field.onChange(id);
}}

// Sales Agent field
onValueChange={(val) => {
  const id = parseInt(val);
  if (!isNaN(id)) field.onChange(id);
}}
```

## Files Modified
1. `/home/dev/smart_vehicle_repairs_system/frontend/app/(dashboard)/billing/invoices/[id]/edit/page.tsx`
2. `/home/dev/smart_vehicle_repairs_system/frontend/app/(dashboard)/billing/proformas/new/page.tsx`
3. `/home/dev/smart_vehicle_repairs_system/frontend/app/(dashboard)/billing/estimates/[id]/edit/page.tsx`

## Expected Behavior After Fix
1. When editing an invoice or estimate, the customer, vehicle, and sales agent fields should display the currently selected values
2. When creating a new proforma invoice, the form should work without NaN errors
3. No NaN validation errors in the console
4. Users can save the forms without having to re-select these values
5. The forms properly handle cases where some fields (like vehicle or sales_agent) might be optional/null

## Testing Recommendations
1. Navigate to an existing invoice edit page (e.g., `/billing/invoices/29/edit`)
2. Navigate to an existing estimate edit page (e.g., `/billing/estimates/[id]/edit`)
3. Navigate to the new proforma page (`/billing/proformas/new`)
4. For each page:
   - Verify that all fields are pre-populated with existing values (edit pages)
   - Try changing and saving values
   - Check browser console for any NaN-related errors
   - Test with documents that have:
     - All fields populated
     - Only required fields (no vehicle, no sales agent)
     - Different data types from the API (object vs ID)
