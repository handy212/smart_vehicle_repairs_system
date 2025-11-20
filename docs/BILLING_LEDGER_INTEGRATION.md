# Billing Module - Django Ledger Integration Guide

## Overview

This document explains how the Billing module is integrated with Django Ledger for full double-entry accounting.

## ✅ What's Already Integrated

### 1. **Invoice → DL InvoiceModel Integration**

**Model Link:**
- `Invoice.ledger_invoice` (OneToOneField) links to Django Ledger's `InvoiceModel`
- Automatically created when invoice is created (via signal)

**Automatic Features:**
- ✅ AR (Accounts Receivable) automatically posted when invoice created
- ✅ Line items (labor, parts) automatically added to DL Invoice
- ✅ All required accounts (cash_account, prepaid_account, unearned_account) configured
- ✅ Ledger created per invoice for transaction tracking

**Signal:** `apps/billing/signals.py::invoice_post_save`

### 2. **Payment → Cash Posting**

**Automatic Features:**
- ✅ When payment is completed, journal entry automatically posted:
  - Debit: Cash (1110)
  - Credit: Accounts Receivable (1120)

**Signal:** `apps/billing/signals.py::payment_post_save`

### 3. **Work Order COGS Posting**

**Automatic Features:**
- ✅ When work order is completed, COGS automatically posted:
  - Parts Cost: Debit COGS-Parts (5110), Credit Inventory (1130)
  - Labor Cost: Debit COGS-Labor (5120), Credit Cash (1110)

**Trigger:** `WorkOrder.transition_to('completed')`

### 4. **Purchase Order → DL BillModel Integration**

**Model Link:**
- `PurchaseOrder.ledger_bill` (OneToOneField) links to Django Ledger's `BillModel`
- Automatically created when PO status changes to 'received'

**Automatic Features:**
- ✅ AP (Accounts Payable) automatically posted when PO received
- ✅ Line items automatically added to DL Bill

**Signal:** `apps/billing/signals.py::purchase_order_post_save`

---

## 🔧 How It Works

### Invoice Creation Flow

```
1. User creates Invoice (via API or frontend)
   ↓
2. Invoice.save() called
   ↓
3. Signal fires: invoice_post_save()
   ↓
4. AccountingService.create_dl_invoice(invoice)
   - Gets/Creates Entity from branch
   - Gets/Creates CustomerModel
   - Creates LedgerModel for invoice
   - Creates InvoiceModel with all accounts
   - Adds line items (labor, parts) as ItemTransactionModel
   - Links Invoice.ledger_invoice = dl_invoice
   ↓
5. DL InvoiceModel automatically posts AR entry
   - Debit: Accounts Receivable (1120)
   - Credit: Revenue (4100)
```

### Payment Flow

```
1. User creates Payment (status='completed')
   ↓
2. Payment.save() called
   ↓
3. Signal fires: payment_post_save()
   ↓
4. AccountingService.post_payment_received(payment)
   - Creates JournalEntryModel
   - Debit: Cash (1110)
   - Credit: Accounts Receivable (1120)
   ↓
5. Invoice.amount_paid updated
```

---

## ⚠️ Critical Requirements

### 1. **Branch Must Be Set**

**CRITICAL:** Every invoice MUST have a `branch` assigned for Django Ledger integration to work.

**Why?**
- Branch → Entity mapping (each branch = one entity in Django Ledger)
- Chart of Accounts is per-entity
- All accounts are entity-specific

**How to Ensure Branch is Set:**

**In API (serializers):**
```python
# Already handled in InvoiceCreateSerializer
validated_data['branch'] = work_order.branch or resolve_branch(request)
```

**In Frontend Views:**
```python
# Fixed in invoice_create view
branch = work_order.branch if work_order else resolve_branch(request)
invoice = Invoice.objects.create(..., branch=branch)
```

**In Admin:**
- Always select a branch when creating invoices

### 2. **Chart of Accounts Must Be Set Up**

**Required Accounts:**
- `1110` - Cash
- `1120` - Accounts Receivable
- `1130` - Inventory - Parts
- `4100` - Revenue - Service
- `5110` - COGS - Parts
- `5120` - COGS - Labor

**Setup Command:**
```bash
python manage.py setup_chart_of_accounts
```

---

## 📋 Integration Checklist

### For New Invoices

- [x] Invoice has `branch` field set
- [x] Signal automatically creates DL InvoiceModel
- [x] DL InvoiceModel has all required accounts
- [x] Line items automatically added
- [x] AR automatically posted

### For Payments

- [x] Payment has `invoice` with `branch`
- [x] Signal automatically posts cash entry
- [x] Invoice.amount_paid updated

### For Work Orders

- [x] Work order has `branch` field
- [x] COGS automatically posted on completion
- [x] Parts and labor costs tracked

### For Purchase Orders

- [x] PO has `branch` field
- [x] DL BillModel created when status='received'
- [x] AP automatically posted

---

## 🔍 Verification Steps

### 1. Check Invoice Integration

```python
from apps.billing.models import Invoice
from django_ledger.models import InvoiceModel

invoice = Invoice.objects.get(invoice_number='KSI-INV000010')
print(f"Has DL Invoice: {invoice.ledger_invoice is not None}")
print(f"DL Invoice UUID: {invoice.ledger_invoice.uuid}")
print(f"Has cash_account: {invoice.ledger_invoice.cash_account is not None}")
```

### 2. Check Payment Integration

```python
from apps.billing.models import Payment
from django_ledger.models import JournalEntryModel

payment = Payment.objects.filter(status='completed').first()
# Check for journal entry
je = JournalEntryModel.objects.filter(
    description__icontains=payment.payment_number
).first()
print(f"Payment journal entry: {je is not None}")
```

### 3. Check Work Order COGS

```python
from apps.workorders.models import WorkOrder
from django_ledger.models import JournalEntryModel

wo = WorkOrder.objects.filter(status='completed').first()
# Check for COGS entries
je = JournalEntryModel.objects.filter(
    description__icontains=wo.work_order_number
).first()
print(f"COGS journal entry: {je is not None}")
```

---

## 🚨 Common Issues & Fixes

### Issue 1: Invoice Created But No DL InvoiceModel

**Cause:** Branch not set on invoice

**Fix:**
```python
# Ensure branch is set
invoice.branch = work_order.branch or resolve_branch(request)
invoice.save()
```

### Issue 2: Signal Not Firing

**Cause:** Signals not imported in `apps.py`

**Fix:** Already handled in `apps/billing/apps.py`:
```python
def ready(self):
    import apps.billing.signals  # noqa
```

### Issue 3: Missing Accounts Error

**Cause:** Chart of Accounts not set up

**Fix:**
```bash
python manage.py setup_chart_of_accounts
```

### Issue 4: NoReverseMatch for account-detail

**Cause:** InvoiceModel missing cash_account or other required accounts

**Fix:** Already handled - `create_dl_invoice` sets all required accounts

---

## 📊 Viewing in Django Ledger UI

### Access Django Ledger

1. Go to `/ledger/` in your Django admin
2. Select an entity (branch)
3. View:
   - **Invoices** → See all DL InvoiceModels
   - **Bills** → See all DL BillModels
   - **Customers** → See all CustomerModels
   - **Vendors** → See all VendorModels
   - **Financial Reports** → AR/AP aging, P&L, Balance Sheet

### AR Aging Report

1. Navigate to: `/ledger/entity/{entity_slug}/ar-aging/`
2. See customer balances by aging buckets (0-30, 31-60, 61-90, 90+ days)

### AP Aging Report

1. Navigate to: `/ledger/entity/{entity_slug}/ap-aging/`
2. See vendor balances by aging buckets

---

## 🔄 Sync Existing Data

If you have existing invoices without DL InvoiceModels:

```bash
python manage.py sync_django_ledger
```

This command:
- Creates DL InvoiceModels for existing invoices
- Creates DL BillModels for received POs
- Syncs customers and vendors to all entities
- Creates ItemModels for parts

---

## 📝 Best Practices

1. **Always Set Branch**
   - When creating invoices via API, ensure branch is in request data
   - When creating via frontend, use `resolve_branch(request)`
   - When creating from work order, use `work_order.branch`

2. **Verify Integration**
   - After creating invoice, check `invoice.ledger_invoice` is not None
   - View invoice in Django Ledger UI to verify AR posting

3. **Monitor Errors**
   - Check logs for signal errors
   - Django Ledger errors are logged but don't fail invoice creation

4. **Test Payments**
   - Create test payment and verify journal entry created
   - Check AR balance decreases after payment

---

## 🎯 Summary

**Integration Status:** ✅ **FULLY INTEGRATED**

- ✅ Invoices → DL InvoiceModel (automatic)
- ✅ Payments → Cash posting (automatic)
- ✅ Work Orders → COGS posting (automatic)
- ✅ Purchase Orders → DL BillModel (automatic)
- ✅ All signals configured
- ✅ All accounts configured
- ✅ Branch assignment fixed

**Next Steps:**
1. Test creating new invoices → verify DL InvoiceModel created
2. Test receiving payments → verify cash posting
3. View financial reports in Django Ledger UI
4. Monitor AR/AP aging reports

