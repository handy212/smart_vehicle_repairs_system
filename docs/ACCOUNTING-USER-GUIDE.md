# Accounting User Guide

**Audience:** Workshop managers, bookkeepers, cashiers, and administrators  
**System:** Smart Vehicle Repairs ERP  
**Last updated:** June 2026

This guide explains how money flows through the system — from invoices and payments to the general ledger — and how to use every screen under **Accounting** in the sidebar.

---

## Navigation map

The Accounting module is organized into six areas. Use the collapsible groups in the left sub-navigation to move between them.

| Area | Screens | What you do here |
|------|---------|------------------|
| **Overview** | Overview | KPIs, alerts, shortcuts to common tasks |
| **Ledger** | Journal Entries, Chart of Accounts, Accruals | GL structure, manual entries, period accruals |
| **Banking** | Bank Reconciliation, Fund Transfers, Till Management | Cash, bank, transfers, and till sessions |
| **Planning** | Budgets | Annual budgets and budget-vs-actual |
| **Reports** | Financial Reports | P&L, balance sheet, aging, tax, and management reports |
| **Governance** | Controls & Compliance, Subledger Integrity | Control wiring, period lock, AR/AP reconciliation |

Operational billing (invoices, payments, bills, vendor credits) lives under **Billing**, but those transactions post to the accounts configured here.

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

## 2. Accounting overview dashboard

**Path:** Accounting → Overview (`/accounting`)

The overview is your command center. It surfaces:

- **Open AR/AP** and cash position at a glance
- **Alerts** such as missing control accounts, open tills, or subledger drift
- **Shortcuts** to common tasks (record payment, open reports, wire controls)

Check the overview at the start of each day. Resolve red alerts before processing new payments or period close.

---

## 3. Chart of accounts overview

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

View and maintain accounts at **Accounting → Ledger → Chart of Accounts**.

**Tips**

- Create new leaf accounts under the correct parent (Asset, Liability, Income, Expense).
- Do not post to header/summary accounts — only detail accounts accept journal lines.
- After adding accounts that will receive automated postings, update **Controls & Compliance**.

---

## 4. Journal entries

**Path:** Accounting → Ledger → Journal Entries

Use journal entries for adjustments that are not created by Billing (e.g. depreciation, corrections, reclassifications).

| Action | Steps |
|--------|-------|
| **Create** | Journal Entries → New → add balanced debit/credit lines → Post |
| **View** | Open any entry for line detail, source document links, and audit trail |
| **Correct a mistake** | Post a **reversal** entry — do not edit a posted entry |

Posted entries are **immutable** when the entry date falls inside a locked period. See **Controls & Compliance** for period lock rules.

---

## 5. Accruals

**Path:** Accounting → Ledger → Accruals

Accruals record expenses or revenue in the correct period before cash moves (e.g. month-end utilities, prepaid amortization).

1. Create an accrual schedule or one-time accrual.
2. Review the proposed debit/credit accounts.
3. Post to the GL for the target period.

Reverse or settle accruals when the related invoice or payment is recorded, per your accountant’s policy.

---

## 6. Control accounts (system wiring)

**Control accounts** tell the system which GL accounts to use when posting invoices, payments, bills, and credit notes. They are configured once (or when your chart changes) at:

**Accounting → Governance → Controls & Compliance → Control account mapping**

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

1. Go to **Accounting → Governance → Controls & Compliance**.
2. Click **Wire from standard chart** — this maps all 16 control fields to the correct leaf accounts.
3. Confirm each row shows a green “Configured” status.

If control accounts are missing, automated posting may fail or post to the wrong account.

---

## 7. Customer billing flow

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

## 8. Vendor bills flow (accounts payable)

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

Use **Billing → Vendor Credits** to record returns to suppliers. Issue the credit, then **apply** it to open bills from either the bill or vendor credit screen. Unapplied vendor credits reduce your AP subledger balance.

---

## 9. Banking

### Bank reconciliation

**Path:** Accounting → Banking → Bank Reconciliation

1. Import or enter bank statement lines for a statement period.
2. Match statement lines to GL payments and receipts.
3. Mark the reconciliation complete when the statement balance agrees with the GL bank account.

Reconcile each bank account monthly. Unmatched items often indicate missing payments, duplicate postings, or wrong settlement account selection.

### Fund transfers

**Path:** Accounting → Banking → Fund Transfers

Move money between bank accounts, cash accounts, or branches:

1. Create a transfer request with from/to accounts and amount.
2. Submit for approval if your workflow requires it.
3. On approval, the system posts the paired GL entries (Dr destination / Cr source).

### Cash tills vs bank accounts

| Situation | Account to use |
|-----------|----------------|
| Cashier takes cash at counter | Till-enabled cash account (open till required) |
| Card terminal, bank transfer, mobile money | Bank account (leaf, e.g. 1100) |
| Paying a vendor in cash from till | Till-enabled cash account |
| Paying by cheque or EFT | Bank account |

**Till management:** **Accounting → Banking → Till Management**

- **Open till** at start of shift (count opening cash).
- Record **pay-ins** and **pay-outs** during the shift when moving cash to/from the safe.
- **Close till** at end of shift (count closing cash; system posts variance to Cash Over/Short if needed).
- Review the **till reconciliation** report before signing off the shift.
- Never leave tills open overnight — integrity checks flag open tills.

---

## 10. Budgets

**Path:** Accounting → Planning → Budgets

1. **Create a budget** for a fiscal year (or period).
2. Add **budget lines** by account or category.
3. Open **Budget vs Actual** from the budget detail page to compare plan to GL actuals.

Use budgets for workshop OPEX planning and variance review with management. Budget figures do not post to the GL — they are for comparison only.

---

## 11. Period lock and year-end close

**Accounting → Governance → Controls & Compliance**

### Period lock

Set a **lock through date** to prevent creating, editing, or deleting journal entries on or before that date. Use this after month-end review.

### Period close

Post a **closing entry** for a date range to move net income to retained earnings. Typically done at fiscal year-end with accountant review.

**Rule:** Posted journal entries are **immutable**. Corrections use **reversal entries**, not edits.

---

## 12. Financial reports

**Path:** Accounting → Reports → Financial Reports

The reports hub lists all financial statements. Use the horizontal tabs to switch between reports.

| Report | Purpose |
|--------|---------|
| **General Ledger** | Transaction detail by account for an date range |
| **Balance Sheet** | Assets, liabilities, and equity at a point in time |
| **Profit & Loss** | Revenue vs expenses for a period |
| **Trial Balance** | Confirm total debits equal total credits |
| **Cash Flow** | Cash movement by operating, investing, and financing activity |
| **AR/AP Aging** | Who owes you / what you owe vendors, by age bucket |
| **Tax Report** | Tax collected and payable summary |
| **Management** | Executive summary metrics for leadership review |
| **Margin Analysis** | Gross margin by service or product line |
| **Cost Control** | Expense trends and cost drivers |
| **OPEX Variance** | Operating expense vs budget or prior period |
| **Job Profitability** | Revenue and cost by work order or job |
| **Expense Breakdown** | Expense composition by account or category |

**Reports to run regularly**

| Report | Frequency | Why |
|--------|-----------|-----|
| AR/AP Aging | Weekly | Collections and payment planning |
| Profit & Loss | Monthly | Performance review |
| Balance Sheet | Monthly | Financial position |
| Trial Balance | Month-end | Debits = credits check |
| **Subledger Integrity** | Weekly | GL vs operational AR/AP match |

Run **Subledger Integrity** after bulk imports or payment repairs.

---

## 13. Subledger integrity — what it means

The system maintains two views of AR and AP:

1. **GL balance** — sum of postings to control accounts 1200 and 2000.
2. **Operational subledger** — sum of open invoice/bill balances, minus unapplied credit notes and vendor credits, net of customer prepayments.

These should match within **GHS 0.01**.

| Reading | Meaning |
|---------|---------|
| **In balance** | Books are consistent |
| **AR out of balance** | Payments may not have credited AR, invoices missing GL, or misrouted settlement |
| **AP out of balance** | Bill payments may not have debited AP, or bills missing GL |

**Accounting → Governance → Subledger Integrity** shows the breakdown. Contact your system administrator if out of balance.

---

## 14. Common issues and fixes

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| “Missing control account” alert | Controls not wired | Controls → Wire from standard chart |
| Payment fails — no till | Cash payment without open till | Open till or use bank method |
| AR aging ≠ GL AR balance | Old misrouted payments or demo data | Run integrity repair (admin) |
| Cannot edit old journal entry | Period lock active | Clear lock (admin) or post reversal |
| Open till warning | Till not closed | Banking → Till Management → Close |
| Duplicate GL entries | Re-posted after failed retry | Admin runs duplicate repair |

---

## 15. Demo data and clean resets

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

## 16. Administrator maintenance commands

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

## 17. Roles and permissions

| Task | Typical permission |
|------|-------------------|
| View reports | `view_financial_reports` |
| View accounting | `view_accounting` |
| Create manual journal entries | `create_journal_entries` |
| Lock periods / wire controls | `manage_accounting_periods` |
| Record payments | Billing payment permissions |
| View bank reconciliation | `view_bank_statements` |
| View fund transfers | `view_transfer_requests` |
| View budgets | `view_budgets` |

---

## 18. Golden rules

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
