# Frontend Billing - Django Ledger Integration Guide

## Overview

This document explains how the frontend billing module integrates with Django Ledger through the backend API.

## ✅ Current Integration Status

### Backend Integration (Complete)
- ✅ Invoice creation automatically creates DL InvoiceModel
- ✅ Branch is automatically set from work_order or resolved from request
- ✅ All accounting entries automatically posted
- ✅ Signals configured and working

### Frontend Integration (Needs Verification)

The frontend **should work** because:
1. Backend serializer automatically sets branch from `work_order.branch`
2. If no work_order, backend resolves branch from request session
3. All Django Ledger integration happens server-side

However, we should verify and potentially enhance the frontend to:
- Explicitly pass branch when available
- Show Django Ledger invoice link in invoice detail view
- Display accounting status/links

---

## 🔍 Current Frontend Implementation

### Invoice Creation (`/billing/invoices/new`)

**Current Flow:**
```typescript
// Frontend sends:
{
  customer: number,
  vehicle?: number,
  work_order?: number,  // ← If provided, backend gets branch from this
  invoice_date: string,
  due_date: string,
  line_items: [...],
  // branch is NOT explicitly sent
}

// Backend handles:
// 1. Gets branch from work_order.branch (if work_order provided)
// 2. Falls back to resolve_branch(request) (from session/user)
// 3. Creates Invoice with branch
// 4. Signal fires → creates DL InvoiceModel
```

**Status:** ✅ **Should work** - Backend handles branch automatically

### Invoice List (`/billing`)

**Current Display:**
- Invoice number
- Customer
- Date, Due Date
- Total, Paid, Balance
- Status

**Missing:**
- Link to Django Ledger invoice (if available)
- Accounting status indicator

---

## 🚀 Recommended Enhancements

### 1. Add Branch Field to Invoice Form (Optional but Recommended)

**Why:** Explicitly passing branch ensures proper entity assignment even if work_order doesn't have branch.

**Implementation:**

```typescript
// In /billing/invoices/new/page.tsx

// Add branch to form schema
const invoiceSchema = z.object({
  // ... existing fields
  branch: z.number().optional(), // Add branch field
});

// Get active branch from context/hook
const { activeBranch } = useBranch(); // Or get from session/context

// In form submission
const onSubmit = async (data: InvoiceFormData) => {
  await createMutation.mutateAsync({
    ...data,
    branch: data.branch || activeBranch?.id, // Explicitly pass branch
    // ... rest of data
  });
};
```

**Note:** This is optional since backend handles it, but makes integration more explicit.

### 2. Display Django Ledger Link in Invoice Detail

**Implementation:**

```typescript
// In /billing/invoices/[id]/page.tsx

// Add to invoice detail view
{invoice.ledger_invoice && (
  <Card>
    <CardHeader>
      <CardTitle>Accounting</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">Django Ledger Invoice:</span>
        <Link 
          href={`/ledger/invoice/${entitySlug}/detail/${invoice.ledger_invoice}/`}
          target="_blank"
          className="text-blue-600 hover:underline"
        >
          View in Ledger
        </Link>
      </div>
      <Badge variant="success">AR Posted</Badge>
    </CardContent>
  </Card>
)}
```

### 3. Add Accounting Status to Invoice List

**Implementation:**

```typescript
// In /billing/page.tsx

// Add column to table
<TableHead>Accounting</TableHead>

// In table row
<TableCell>
  {invoice.ledger_invoice ? (
    <Badge variant="success">Synced</Badge>
  ) : (
    <Badge variant="warning">Not Synced</Badge>
  )}
</TableCell>
```

### 4. Update Invoice Interface

**Add to `lib/api/billing.ts`:**

```typescript
export interface Invoice {
  // ... existing fields
  branch?: number | { id: number; name: string }; // Add branch
  ledger_invoice?: string; // UUID of DL InvoiceModel
  ledger_invoice_url?: string; // URL to view in Django Ledger
}
```

---

## 📋 Verification Checklist

### For Invoice Creation

- [x] Backend automatically sets branch from work_order
- [x] Backend falls back to resolve_branch(request) if no work_order
- [x] Signal fires and creates DL InvoiceModel
- [ ] Frontend explicitly passes branch (optional enhancement)
- [ ] Frontend displays accounting status (optional enhancement)

### For Invoice Display

- [ ] Invoice detail shows Django Ledger link
- [ ] Invoice list shows accounting sync status
- [ ] Payment recording shows accounting entries

---

## 🔧 Testing Frontend Integration

### Test 1: Create Invoice from Work Order

```typescript
// 1. Navigate to /billing/invoices/new?work_order=123
// 2. Fill form and submit
// 3. Verify invoice created
// 4. Check backend: invoice.ledger_invoice should be set
```

### Test 2: Create Invoice without Work Order

```typescript
// 1. Navigate to /billing/invoices/new
// 2. Select customer and vehicle
// 3. Fill form and submit
// 4. Verify invoice created with branch from session
// 5. Check backend: invoice.ledger_invoice should be set
```

### Test 3: Verify Accounting Entries

```typescript
// 1. Create invoice via frontend
// 2. Go to Django Ledger UI: /ledger/
// 3. Select entity (branch)
// 4. Navigate to Invoices
// 5. Verify invoice appears in list
// 6. Verify AR entry posted
```

---

## 🚨 Common Issues

### Issue 1: Invoice Created But No DL InvoiceModel

**Possible Causes:**
- Branch not set on invoice
- Signal not firing
- Chart of Accounts not set up

**Debug:**
```python
# Check invoice
invoice = Invoice.objects.get(id=...)
print(f"Branch: {invoice.branch}")
print(f"DL Invoice: {invoice.ledger_invoice}")

# Check signal
from django.db.models.signals import post_save
receivers = [r for r in post_save.receivers if r[0][0] == Invoice]
print(f"Signal receivers: {len(receivers)}")
```

### Issue 2: Frontend Shows "Not Synced" But Invoice Has DL Invoice

**Cause:** Frontend not fetching `ledger_invoice` field

**Fix:** Update API serializer to include `ledger_invoice` in response

---

## 📊 API Response Enhancement

### Update Backend Serializer

```python
# In apps/billing/serializers.py

class InvoiceDetailSerializer(serializers.ModelSerializer):
    # ... existing fields
    ledger_invoice = serializers.UUIDField(source='ledger_invoice.uuid', read_only=True)
    ledger_invoice_url = serializers.SerializerMethodField()
    
    def get_ledger_invoice_url(self, obj):
        if obj.ledger_invoice and obj.branch:
            entity_slug = obj.branch.ledger_entity.slug
            return f"/ledger/invoice/{entity_slug}/detail/{obj.ledger_invoice.uuid}/"
        return None
```

---

## 🎯 Summary

**Current Status:**
- ✅ Backend fully integrated with Django Ledger
- ✅ Frontend should work (backend handles branch automatically)
- ⚠️ Frontend could be enhanced to show accounting status/links

**Recommended Next Steps:**
1. Test invoice creation from frontend
2. Verify DL InvoiceModel is created
3. Add accounting status display (optional)
4. Add Django Ledger links (optional)

**Critical:** The frontend **doesn't need changes** to work with Django Ledger - the backend handles everything automatically. Enhancements are optional for better UX.

