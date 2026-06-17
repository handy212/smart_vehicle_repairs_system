# Accounting User Guide

**Audience:** Workshop managers, bookkeepers, cashiers, and administrators  
**System:** Smart Vehicle Repairs ERP  
**Last updated:** June 2026

This guide explains how money flows through the system — from invoices and payments to the general ledger — and how to keep your books accurate.

---

## 1. How accounting works in this system

The ERP links **daily operations** (invoices, payments, bills) to the **general ledger (GL)** automatically. You do not need to post every transaction by hand, but you must understand the rules so you can spot problems early.

```
Customer invoice finalized  →  Dr Accounts Receivable (1200)  /  Cr Revenue + Tax
Customer payment received   →  Dr Cash or Bank              /  Cr Accounts Receivable
Vendor bill approved        →  Dr Expense or Inventory     /  Cr Accounts Payable (2000)
Vendor bill paid            →  Dr Accounts Payable         /  Cr Cash or Bank
```

**Key idea:** Operational screens (Billing, Payments) drive the numbers. Accounting screens (Journal Entries, Reports) show the result.

---

## 2. Chart of accounts overview

Accounts are organized by type. Only **leaf (detail) accounts** receive postings — never parent/header accounts like “Assets” or “1000 Cash & Bank.”

| Code | Account | Type | Used for |
|------|---------|------|----------|
| **1200** | Accounts Receivable | Asset | Money customers owe you |
| **2000** | Accounts Payable | Liability | Money you owe vendors |
| **2150** | Customer Prepayments | Liability | Customer overpayments not yet applied |
| **1100** | Operating Bank Account | Asset | Card, transfer, mobile money settlements |
| **1010** | Cash in Safe | Asset | Till pay-in/pay-out counterparty |
| **4000** | Sales Revenue | Income | Invoice labor and service revenue |
| **4100** | Sales Returns & Allowances | Income (contra) | Discounts and credit note returns |
| **2100** | Sales Tax Payable | Liability | VAT, NHIL, GETFund collected |
| **1500** | Inventory Asset | Asset | Parts on hand |
| **5100** | Cost of Goods Sold | Expense | Parts cost when invoiced |
| **5000** | Purchases / Operating Expense | Expense | Non-inventory vendor bills |
| **5050** | Purchase Returns | Expense (contra) | Vendor credits |

View and maintain accounts at **Accounting → Chart of Accounts**.

---

## 3. Control accounts (system wiring)

**Control accounts** tell the system which GL accounts to use when posting invoices, payments, bills, and credit notes. They are configured once (or when your chart changes) at:

**Accounting → Controls & Compliance → Control account mapping**

| Setting | Default code | What it controls |
|---------|--------------|------------------|
| Accounts Receivable | 1200 | Customer invoices, payments, credit notes |
| Accounts Payable | 2000 | Vendor bills and bill payments |
| Customer Prepayments | 2150 | Overpayments held for future invoices |
| Sales Revenue | 4000 | Invoice revenue lines |
| Default Bank Account | 1100 | Non-cash payments when no specific bank is chosen |
| Cost of Goods Sold | 5100 | Parts cost on invoices |
| … | … | See Controls page for the full list |

**First-time setup**

1. Go to **Accounting → Controls & Compliance**.
2. Click **Wire from standard chart** — this maps all 16 control fields to the correct leaf accounts.
3. Confirm each row shows a green “Configured” status.

If control accounts are missing, automated posting may fail or post to the wrong account.

---

## 4. Customer billing flow

### Step 1 — Create and finalize an invoice

1. **Billing → Invoices → New** (or from a work order).
2. Add line items (labor, parts, fees).
3. Change status from Draft to **Sent** (or Partial/Paid when applicable).

**What posts automatically**

- **Revenue entry:** Debits AR (1200), credits revenue and tax accounts.
- **COGS entry** (if parts were issued from inventory): Debits COGS (5100), credits Inventory (1500).

### Step 2 — Receive payment

1. Open the invoice → **Record Payment**, or use **Billing → Payments → Receive Payment**.
2. Choose payment method:
   - **Cash** → select a **till-enabled cash account** (requires an open till session).
   - **Card / Bank / Transfer** → select a **bank or cash-equivalent leaf account**.
3. Complete the payment.

**What posts:** Debit Cash/Bank, Credit AR (1200).

### Step 3 — Credit notes (returns / adjustments)

1. **Billing → Credit Notes → New**.
2. Issue the credit note.
3. Apply to an invoice when ready.

**What posts:** Reverses revenue/AR proportionally; application reduces the customer’s balance.

### Customer prepayments (overpayments)

If a customer pays more than they owe, the excess should post to **Customer Prepayments (2150)**. This amount can be applied to future invoices. Ask your administrator to ensure the prepayment control account is wired.

---

## 5. Vendor bills flow (accounts payable)

### Step 1 — Enter a bill

1. **Billing → Bills → New**.
2. Add lines (inventory parts → Inventory asset; services → Expense).
3. Approve the bill.

**What posts:** Debit Expense/Inventory, Credit AP (2000).

### Step 2 — Pay the bill

1. Open the bill → **Pay Bill**.
2. Select cash (till) or bank account, same rules as customer payments.

**What posts:** Debit AP (2000), Credit Cash/Bank.

### Vendor credits

Use **Billing → Vendor Credits** to record returns to suppliers. Unapplied vendor credits reduce your AP subledger balance.

---

## 6. Cash tills vs bank accounts

| Situation | Account to use |
|-----------|----------------|
| Cashier takes cash at counter | Till-enabled cash account (open till required) |
| Card terminal, bank transfer, mobile money | Bank account (leaf, e.g. 1100) |
| Paying a vendor in cash from till | Till-enabled cash account |
| Paying by cheque or EFT | Bank account |

**Till management:** **Accounting → Till Management**

- **Open till** at start of shift (count opening cash).
- **Close till** at end of shift (count closing cash; system posts variance to Cash Over/Short if needed).
- Never leave tills open overnight — integrity checks flag open tills.

---

## 7. Period lock and year-end close

**Accounting → Controls & Compliance**

### Period lock

Set a **lock through date** to prevent creating, editing, or deleting journal entries on or before that date. Use this after month-end review.

### Period close

Post a **closing entry** for a date range to move net income to retained earnings. Typically done at fiscal year-end with accountant review.

**Rule:** Posted journal entries are **immutable**. Corrections use **reversal entries**, not edits.

---

## 8. Reports you should use regularly

| Report | Path | Purpose |
|--------|------|---------|
| Accounts Receivable Aging | Accounting → Reports → Aging (AR) | Who owes you |
| Accounts Payable Aging | Accounting → Reports → Aging (AP) | What you owe |
| Profit & Loss | Accounting → Reports → Profit & Loss | Revenue vs expenses |
| Balance Sheet | Accounting → Reports → Balance Sheet | Assets, liabilities, equity |
| Trial Balance | Accounting → Reports → Trial Balance | Debits = credits check |
| **Subledger integrity** | Accounting → Subledger Integrity | GL vs operational AR/AP match |

Run **Subledger Integrity** weekly (or after bulk imports) to confirm GL control balances match open invoices and bills.

---

## 9. Subledger integrity — what it means

The system maintains two views of AR and AP:

1. **GL balance** — sum of postings to control accounts 1200 and 2000.
2. **Operational subledger** — sum of open invoice/bill balances, minus unapplied credit notes and vendor credits, net of customer prepayments.

These should match within **GHS 0.01**.

| Reading | Meaning |
|---------|---------|
| **In balance** | Books are consistent |
| **AR out of balance** | Payments may not have credited AR, invoices missing GL, or misrouted settlement |
| **AP out of balance** | Bill payments may not have debited AP, or bills missing GL |

**Accounting → Subledger Integrity** shows the breakdown. Contact your system administrator if out of balance.

---

## 10. Common issues and fixes

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| “Missing control account” alert | Controls not wired | Controls → Wire from standard chart |
| Payment fails — no till | Cash payment without open till | Open till or use bank method |
| AR aging ≠ GL AR balance | Old misrouted payments or demo data | Run integrity repair (admin) |
| Cannot edit old journal entry | Period lock active | Clear lock (admin) or post reversal |
| Open till warning | Till not closed | Accounting → Till Management → Close |
| Duplicate GL entries | Re-posted after failed retry | Admin runs duplicate repair |

---

## 11. Demo data and clean resets

**Admin → Demo Data** seeds sample customers, invoices, and GL entries for training. Demo records use markers like `CDINV*` and `CDPAY*`.

**To reset demo accounting only (staging/training servers):**

```bash
# Preview
python manage.py reset_demo_accounting --dry-run

# Purge demo GL + billing, re-wire controls
python manage.py reset_demo_accounting --confirm

# Full purge and re-seed demo billing + accounting
python manage.py reset_demo_accounting --confirm --reseed
```

**Never run permanent data purge on a production server** unless you intend to delete all real invoices and journal entries.

---

## 12. Administrator maintenance commands

These are for system administrators with server access. Run after backups.

| Command | When to use |
|---------|-------------|
| `wire_accounting_controls` | First setup or after chart changes |
| `validate_accounting_integrity --summary` | Health check — lists all issues |
| `diagnose_subledger_drift` | Detailed AR/AP drift breakdown |
| `repair_misrouted_settlement_gl` | Payments posted without crediting AR 1200 / debiting AP 2000 |
| `reset_demo_accounting --confirm` | Clean demo GL and billing on training servers |
| `backfill_missing_gl_postings` | Documents exist but have no GL |

Typical recovery sequence after upgrading:

```bash
python manage.py wire_accounting_controls --force
python manage.py repair_misrouted_settlement_gl --dry-run
python manage.py repair_misrouted_settlement_gl --username admin
python manage.py validate_accounting_integrity --summary --no-fail
```

---

## 13. Roles and permissions

| Task | Typical permission |
|------|-------------------|
| View reports | `view_financial_reports` |
| View accounting | `view_accounting` |
| Create manual journal entries | `create_journal_entries` |
| Lock periods / wire controls | `manage_accounting_periods` |
| Record payments | Billing payment permissions |
| Manage tills | Accounting till access |

---

## 14. Golden rules

1. **Finalize invoices** only when amounts are correct — GL posts on finalize.
2. **Always select the correct settlement account** (till for cash, bank for electronic).
3. **Close tills** at end of every cashier shift.
4. **Do not edit posted journal entries** — use reversals.
5. **Wire control accounts** before going live.
6. **Check subledger integrity** regularly.
7. **Lock periods** after month-end sign-off.

---

## Related documentation

- **Developers / posting rules:** `docs/ACCOUNTING-POSTING-STANDARD.md`
- **Dashboard KPIs:** `docs/accounting-dashboard-spec.md`

For technical support or chart-of-accounts changes, involve your accountant before altering control account mappings.
