# Accounting Posting Standard

**Version:** 1.0  
**Status:** Authoritative — all GL automation must conform to this document  
**Audience:** Backend engineers, accounting module contributors, code reviewers  
**System:** Smart Vehicle Repairs ERP — Ghana VAT (NHIL / GETFund / VAT)

---

## Purpose

This document defines the **canonical journal entry patterns** for every automated posting path. If code behavior diverges from this standard, either fix the code or update this document in the same PR with accountant sign-off.

**Rules:**

1. Every journal entry must balance (debits = credits).
2. Post only to **active leaf accounts** (no parent/category accounts).
3. Use **control accounts** from `AccountingControl` — never hardcode account codes in new code.
4. One primary JE per source document reference (idempotent by `content_type` + `object_id` + `reference`).
5. Corrections use **reversals**, not edits to posted entries.
6. All amounts in base currency; round to 2 decimal places at line level.

---

## Control Account Map

| Control field | Default code | Type | Used for |
|---------------|--------------|------|----------|
| `accounts_receivable_account` | 1200 | Asset | Customer invoices, payments, credit notes |
| `accounts_payable_account` | 2000 | Liability | Vendor bills, bill payments |
| `sales_revenue_account` | 4000 | Income | Invoice revenue (net of fees/tax) |
| `sales_discount_account` | 4100 | Income (contra) | Invoice discounts; credit note returns |
| `sales_tax_payable_account` | 2100 | Liability | Output VAT + NHIL + GETFund (combined) |
| `shop_supplies_revenue_account` | 4050 | Income | Shop supplies fee |
| `environmental_fee_revenue_account` | 4060 | Income | Environmental fee |
| `input_tax_account` | 2200 | Asset | Recoverable input VAT on bills |
| `default_expense_account` | 5000 | Expense | Non-inventory bill lines |
| `inventory_asset_account` | 1500 | Asset | Inventory purchases on bills |
| `cost_of_goods_sold_account` | 5100 | Expense | Parts COGS on invoice |
| `cash_over_short_account` | 5950 | Expense | Till variance |
| `till_counterparty_cash_account` | 1010 | Asset | Till pay-in/pay-out counterparty |
| `default_bank_account` | 1100 | Asset | Default non-cash settlement |
| `customer_prepayment_account` | 2150 | Liability | **Planned** — customer overpayments |
| `purchase_returns_account` | 5050 | Expense (contra) | Vendor credit returns (non-inventory) |

Settlement accounts (cash/bank) are selected per transaction, not from `AccountingControl`.

---

## 1. Customer Invoice (Revenue Recognition)

**Trigger:** Invoice status enters finalized set (`sent`, `viewed`, `partial`, `paid`, `overdue`, etc.)  
**Service:** `AccountingService.post_invoice()`  
**Reference:** `invoice.invoice_number`

### Standard entry

```
Dr  Accounts Receivable          total
Dr  Sales Discounts (contra)     discount_amount     (if > 0)
    Cr  Sales Revenue            revenue_amount
    Cr  Sales Tax Payable        tax_amount          (if > 0)
    Cr  Shop Supplies Revenue    shop_supplies_fee   (if > 0)
    Cr  Environmental Fee Rev.   environmental_fee   (if > 0)
```

Where:

- `revenue_amount` = `total + discount - tax - shop_supplies - environmental`
- `tax_amount` = NHIL + GETFund + VAT (combined operational field)

### Separate COGS entry

**Trigger:** Same invoice finalize  
**Service:** `AccountingService.post_cogs()`  
**Reference:** `COGS-{invoice_number}`

```
Dr  Cost of Goods Sold          parts_cost (from inventory issue unit_cost)
    Cr  Inventory Asset          parts_cost
```

**Target policy (Wave 2):** COGS must use inventory `sale` transaction `unit_cost`, not `part.cost_price`.

**Status:** Implemented in `AccountingService.post_cogs()` — sums `InventoryTransaction` sale rows for the invoice work order; falls back to `part.cost_price` only when no sale transactions exist.

### Reversal

**Trigger:** Invoice void (after remediation)  
**Pattern:** Full reversal JE with reference `REV-JE-{original_je_id}`

---

## 2. Customer Payment

**Trigger:** `Payment.status = completed`  
**Service:** `AccountingService.post_payment()`  
**Reference:** `payment.payment_number` or `reference_number`

### Standard entry (fully allocated)

```
Dr  Cash / Bank                  payment.amount
    Cr  Accounts Receivable      allocated_amount (per branch/invoice)
```

### Cash vs bank

| Method | Debit account |
|--------|---------------|
| `cash` | Till-enabled cash account from open `CashierTill` |
| All other methods | Selected `bank_account` (must be bank/cash-equivalent leaf) |

### Overpayment (target — Wave 2)

When `payment.amount > sum(allocations)`:

```
Dr  Cash / Bank                  payment.amount
    Cr  Accounts Receivable      amount_due
    Cr  Customer Prepayments     excess
```

**Current gap:** Excess posts entirely to AR on primary invoice branch. Must be fixed in Wave 2.

**Status (implemented):** Overpayment remainder posts to `customer_prepayment_account` (2150) when wired.

---

## 3. Credit Note

**Trigger (current):** `status = issued` — **non-compliant; change in Wave 2**  
**Target trigger:** `CreditNoteApplication` created (apply to invoice)  
**Service:** `AccountingService.post_credit_note_application()` (to be created)

### Target entry (per application)

```
Dr  Sales Returns & Allowances   applied_subtotal
Dr  Sales Tax Payable            applied_tax          (reverses output tax)
    Cr  Accounts Receivable     applied_total
```

### Tax

Credit note lines must run through `TaxService` (same as invoice). **Current gap:** `tax_amount = 0` hardcoded.

### COGS reversal (if parts returned)

```
Dr  Inventory Asset
    Cr  Cost of Goods Sold
```

(Implement when returns workflow exists.)

---

## 4. Customer Refund

**Trigger:** `Refund.status = completed`  
**Service:** `AccountingService.post_refund()`

```
Dr  Accounts Receivable          refund.amount
    Cr  Cash / Bank              refund.amount
```

Cash/bank credit uses same settlement rules as payments.

---

## 5. Vendor Bill

**Trigger:** `Bill.status` in (`open`, `paid`)  
**Service:** `AccountingService.post_bill()`  
**Reference:** `bill.bill_number`

### Standard entry

```
Dr  Expense / Inventory          line amounts (inventory → 1500, else 5000)
Dr  Input Tax (recoverable)      tax_amount          (if > 0)
    Cr  Accounts Payable         bill.total
```

**Target policy (Wave 3):** `tax_amount` computed via `TaxService`, not manual entry.

---

## 6. Vendor Bill Payment

**Trigger:** `BillPayment` saved  
**Service:** `AccountingService.post_bill_payment()`

```
Dr  Accounts Payable             payment.amount
    Cr  Cash / Bank              payment.amount
```

---

## 7. Vendor Credit (Wave 4 — GL on apply)

**Trigger:** `VendorCreditApplication` to bill  
**Reference:** `VC-APP-{id}`

```
Dr  Accounts Payable
    Cr  Purchase Returns / Expense   (non-inventory lines)
    Cr  Inventory Asset              (inventory lines)
    Cr  Input Tax                    (if applicable)
```

Non-inventory credits use `purchase_returns_account` when configured (Wave 5).

---

## 8. Fund Transfer

**Trigger:** `FundTransfer.status = completed`  
**Service:** `AccountingService.post_fund_transfer()`

```
Dr  To account (cash/bank)
    Cr  From account (cash/bank)
```

**Target policy (Wave 3):** Both accounts must be bank/cash-equivalent leaf accounts.

---

## 9. Till Operations

### Till open float

```
Dr  Till cash account
    Cr  Till counterparty cash
```

### Till close — balanced

```
Dr  Till counterparty cash
    Cr  Till cash account
```

### Till close — shortage

```
Dr  Till counterparty cash
Dr  Cash Over/Short (expense)
    Cr  Till cash account
```

### Till close — overage

```
Dr  Till counterparty cash
    Cr  Till cash account
    Cr  Cash Over/Short (expense)   [credit side for overage]
```

---

## 10. Payroll (summary)

**Trigger:** Payroll run approved/posted  
**Service:** `AccountingService.post_payroll()`

```
Dr  Salary / Overtime / Allowance expense accounts
    Cr  PAYE Tax Payable
    Cr  Payroll Deductions Payable
    Cr  Cash / Bank (net pay)
```

---

## 11. Fixed Assets (existing module)

### Acquisition (on capitalization)

```
Dr  Fixed Asset account
    Cr  Cash / AP / Clearing
```

### Monthly depreciation

```
Dr  Depreciation Expense
    Cr  Accumulated Depreciation (contra-asset)
```

**Service:** `apps/fixed_assets/depreciation_service.py`  
**Wave 4.9:** Audit GL integration, period lock, branch scoping, disposal entries.

### Disposal (target)

```
Dr  Cash (proceeds)
Dr  Accumulated Depreciation
Dr  Loss on disposal (if loss)
    Cr  Fixed Asset (cost)
    Cr  Gain on disposal (if gain)
```

---

## 12. Accruals

### Expense accrual

```
Dr  Expense
    Cr  Accrued Expenses (2050)
```

### Revenue accrual (uninvoiced WO)

```
Dr  Accrued Revenue (1250)
    Cr  Revenue
```

### Reversal

Mirror entry on `reversal_date` with reference `REV-ACCRUAL-{id}`.

---

## 13. Period Close

**Service:** `AccountingService.close_income_statement_period()`

For each income/expense account with non-zero balance in period:

```
Dr/Cr  Income/Expense account     (close to zero using balance_type normal)
    Cr/Dr  Retained Earnings (3200)
```

**Critical:** Use `balance_type`, not `account_type`, for contra accounts (e.g. 4100 Sales Returns).

---

## 14. Subledger Reconciliation (target — Wave 2.7)

### AR control reconciliation

```
GL balance(AR control account)
  −
Σ open customer invoice amount_due
  + Σ unapplied customer prepayments
  − Σ issued-but-unapplied credit notes (operational)
  =
  0
```

### AP control reconciliation

```
GL balance(AP control account)
  −
Σ open vendor bill amount_due
  + Σ unapplied vendor credits
  =
  0
```

Report: `GET /accounting/reports/subledger-reconciliation/`

---

## 15. Document Numbering (target — Wave 3.9)

| Document | Format | Example |
|----------|--------|---------|
| Invoice | `INV-{YYYY}-{branch}-{seq:6}` | `INV-2026-HQ-000042` |
| Credit Note | `CN-{YYYY}-{branch}-{seq:6}` | `CN-2026-HQ-000003` |
| Payment | `PAY-{YYYY}-{branch}-{seq:6}` | `PAY-2026-HQ-000118` |
| Bill | `BILL-{YYYY}-{branch}-{seq:6}` | `BILL-2026-HQ-000007` |

Allocated atomically via `DocumentNumberSequence` with fiscal-year rollover and period-lock protection.

---

## 16. Posting Prohibitions

| Action | Rule |
|--------|------|
| Edit posted JE | Blocked — use reversal |
| Post to parent account | Blocked |
| Post to inactive account | Blocked (target Wave 3) |
| Post into locked period | Blocked by `period_lock_date` signal |
| Void invoice without reversal | Blocked (target Wave 2) |
| Credit note GL before apply | Blocked (target Wave 2) |

---

## 17. Change Control

Any PR touching `apps/accounting/services.py`, `signals.py`, or billing posting hooks must:

1. Reference the relevant section of this document.
2. Include or update tests in `apps/accounting/tests/test_posting_standard.py`.
3. Run `python manage.py validate_accounting_integrity`.

---

## Revision History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-06-16 | Initial standard from audit remediation Wave 0.3 |
