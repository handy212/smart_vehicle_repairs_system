# Finance Suite — Customer Feature Guide

**Product:** Smart Vehicle Repairs ERP  
**Audience:** Business owners, finance managers, bookkeepers, cashiers, and AP/AR staff  
**Modules covered:** Accounting · Billing · Fixed Assets  
**Last updated:** June 2026

**Deep dive (accounting only):** See [Accounting User Guide](./ACCOUNTING-USER-GUIDE.md) for journal entries, control accounts, period close, and GL detail.

---

## What this guide is for

This guide explains **what you can do** in the finance suite, **where to find it**, and **how the pieces fit together** — without technical setup or admin commands.

If you run a workshop, fleet, or multi-branch service business, this suite helps you:

- Quote and invoice customers  
- Collect payments and manage overdue accounts  
- Enter and pay supplier bills  
- Keep books in the general ledger  
- Reconcile bank and cash  
- Report profit, tax, and management KPIs  
- Track equipment and run depreciation  

---

## The big picture

Money flows through three connected areas:

```
  CUSTOMERS                    VENDORS
      │                            │
      ▼                            ▼
   BILLING  ──────────────────  BILLING
  (Invoices,                  (Bills,
   Payments)                   Payments)
      │                            │
      └──────────┬─────────────────┘
                 ▼
           ACCOUNTING
    (Ledger, Bank, Reports, Tax)
                 ▲
                 │
          FIXED ASSETS
    (Register, Depreciation)
```

| Area | You use it to… |
|------|----------------|
| **Billing** | Day-to-day money in and out — invoices, payments, bills |
| **Accounting** | Financial control — ledger, bank reconciliation, reports, tax, period close |
| **Fixed Assets** | Long-term equipment — register, buy, depreciate, dispose |

**Dashboard → Dashboard Requirements** on the home screen groups shortcuts into Financial Overview, Customers & Sales, Vendors & Purchases, and more.

---

## Who does what

| Role | Main areas | Typical tasks |
|------|------------|---------------|
| **Front desk / service advisor** | Billing | Estimates, invoices, take payment, print/email documents |
| **AR clerk** | Billing, Customers | Invoices, payments, credit notes, statements, collections follow-up |
| **AP clerk** | Billing, Inventory | Vendor bills, approvals, payments, vendor credits |
| **Cashier** | Billing, Accounting (Tills) | Cash payments, open/close till, pay-in/pay-out |
| **Bookkeeper / accountant** | Accounting | Journal entries, reconciliation, accruals, reports, period lock |
| **Finance manager** | Accounting, Billing reports | Budgets, management KPIs, VAT filing, board reports |
| **Asset manager** | Fixed Assets | Acquisitions, register, depreciation, disposal |

Your administrator assigns permissions — you only see screens your role allows.

---

## Billing — money from customers and to vendors

Billing is split into **Receivables** (money in) and **Payables** (money out).

### Receivables — Customers & Sales

| Feature | Where to find it | What you can do |
|---------|------------------|-----------------|
| **Invoices** | Billing → Invoices | Create, send, print, and track customer invoices |
| **Estimates** | Billing → Estimates | Quote jobs; convert to work order or invoice when approved |
| **Proforma invoices** | Billing → Proforma Invoices | Issue proforma; convert to standard invoice |
| **Payments** | Billing → Payments | Receive payment; allocate across multiple invoices |
| **Credit notes** | Billing → Credit Notes | Issue credits; apply to open invoices |
| **Refunds** | Billing → Refunds | Process refund requests (approval workflow) |
| **Collections** | Billing → Collections | View overdue invoices and follow up |
| **Sales orders** | Billing → Sales Orders | Track commercial orders linked to estimates/work orders |
| **Sales reports** | Billing → Sales Reports | Shortcuts to revenue and management reports |
| **Customer statements** | Customers → Statements | Period statement with running balance and PDF download |

#### Quote-to-cash (typical shop flow)

1. **Create an estimate** for the customer and vehicle.  
2. **Send** to the customer; mark **approved** when they agree.  
3. **Convert to work order** — job is performed in the workshop.  
4. **Create invoice** from the completed job (or manually).  
5. **Record payment** — cash, card, bank transfer, or mobile money.  
6. **Print or email** the invoice and receipt.

**Credit note:** If you need to reduce an invoice after issue, create a credit note and apply it to the open invoice.

**Overpayment:** The system can hold excess payment as a prepayment for future invoices (your accountant configures this).

---

### Payables — Vendors & Purchases

| Feature | Where to find it | What you can do |
|---------|------------------|-----------------|
| **Bills** | Billing → Bills | Enter vendor bills; submit for approval; pay |
| **Vendor credits** | Billing → Vendor Credits | Record supplier credits; apply to open bills |
| **Vendor payments** | Billing → Vendor Payments | View payment history by vendor and date |
| **AP Due** | Billing → AP Due | See bills due this week, this month, and overdue |
| **Vendor balances** | Billing → Vendor Balances | Rank suppliers by open balance owed |
| **Purchase reports** | Billing → Purchase Reports | AP cycle time and purchase compliance metrics |

#### Procure-to-pay (typical flow)

1. **Enter a bill** for parts or services received.  
2. **Submit for approval** — manager reviews.  
3. After **approval**, bill status becomes open for payment.  
4. **Pay the bill** — select cash (till) or bank account.  
5. Use **vendor credits** if the supplier issued a return or adjustment.

Bills can link to purchase orders and goods receipts when your process uses inventory procurement.

---

## Accounting — books, cash, and reporting

Accounting is your **financial command center**. Daily billing posts to the ledger automatically; accounting is where you verify, adjust, reconcile, and report.

### Navigation overview

| Area | Screens | Purpose |
|------|---------|---------|
| **Overview** | Accounting dashboard | KPIs, alerts, cash, AR/AP snapshot, quick actions |
| **Ledger** | Journal Entries, Chart of Accounts, Accruals | GL structure, manual entries, period accruals |
| **Banking** | Bank Reconciliation, Fund Transfers, Till Management | Bank, cash, and inter-account moves |
| **Planning** | Budgets, Fiscal Year view | Budgets and budget-vs-actual; period lock summary |
| **Reports** | Financial Reports (18 types) | P&L, balance sheet, aging, tax, management |
| **Governance** | Controls & Compliance, Subledger Integrity | System wiring, period lock, AR/AP vs GL checks |

> **Note:** The screen labeled **Fiscal Year** shows budgets grouped by year and your period lock date — it is not a separate fiscal-year wizard. Use **Budgets** to create plans and **Controls** to lock periods.

---

### Daily cash and banking

#### Till management (counter cash)

**Accounting → Banking → Till Management**

| Step | Action |
|------|--------|
| Start of shift | **Open till** — count opening cash |
| During shift | **Pay-in / pay-out** when moving cash to or from the safe |
| Customer cash payment | Record on invoice — select till-enabled cash account |
| End of shift | **Close till** — count closing cash; approve variance if needed |

**Rule:** Card, bank transfer, and mobile money payments use **bank accounts**, not the till.

#### Bank reconciliation

**Accounting → Banking → Bank Reconciliation**

1. Create or import a bank statement for the period.  
2. **Match** statement lines to system receipts and payments.  
3. Create adjusting entries for unmatched items if needed.  
4. **Complete** reconciliation when the statement agrees with your books.

Reconcile each bank account **at least monthly**.

#### Fund transfers

**Accounting → Banking → Fund Transfers**

Move money between bank accounts or cash accounts (e.g. deposit to bank). Transfers may require approval depending on your setup.

---

### Ledger and adjustments

| Task | Where | When to use |
|------|-------|-------------|
| **Manual journal entry** | Ledger → Journal Entries → New | Corrections, reclassifications, non-billing adjustments |
| **Reverse an entry** | Journal entry detail | Undo a posted entry — do not edit posted entries |
| **Accruals** | Ledger → Accruals | Month-end expenses or revenue before cash moves |
| **Chart of accounts** | Ledger → Chart of Accounts | View account tree and balances |

---

### Planning and budgets

**Accounting → Planning → Budgets**

1. Create a budget for a fiscal year or period.  
2. Add budget lines by account.  
3. Approve and activate the budget.  
4. Open **Budget vs Actual** from the budget to compare plan to results.

Budgets are for **planning and variance** — they do not post to the ledger.

---

### Financial reports

**Accounting → Reports → Financial Reports**

Open the reports hub, then choose a report. Common reports:

| Report | Use it to… |
|--------|------------|
| **Profit & Loss** | Revenue vs expenses for a period |
| **Balance Sheet** | Assets, liabilities, and equity at a date |
| **Trial Balance** | Verify debits equal credits |
| **Cash Flow** | How cash moved (operating, investing, financing) |
| **AR/AP Aging** | How old receivables and payables are |
| **General Ledger** | All posted journal lines |
| **Account Register** | Running balance for one account |
| **Management** | Executive KPIs and branch scorecards |
| **Financial Ratios** | Liquidity, leverage, profitability metrics |
| **Tax Report** | VAT, NHIL, GETFund, HRL collected vs paid |
| **VAT Return** | Prepare and file VAT returns (Ghana GRA workflow) |
| **Tax Reconciliation** | Compare tax GL to operational totals |
| **Withholding Tax** | WHT liability tracking |

Most reports support **export to Excel**, **print**, and **PDF**.

---

### Month-end and year-end

**Recommended monthly checklist**

1. Review **Accounting dashboard** alerts.  
2. Post **accruals** for the period.  
3. **Reconcile** all bank accounts.  
4. Run **Trial Balance**, **P&L**, and **Balance Sheet**.  
5. Check **Subledger Integrity** — GL vs operational AR/AP.  
6. Prepare **VAT return** if applicable.  
7. **Lock the period** in Controls when review is complete.

**Accounting → Governance → Controls & Compliance**

- **Control accounts** — maps system posting to the correct GL accounts (run “Wire from standard chart” on first setup).  
- **Period lock** — blocks changes on or before a date.  
- **Period close** — year-end entry to retained earnings (with accountant review).

---

### Tax (Ghana)

If your organization uses Ghana tax:

- Invoices and estimates calculate **VAT, NHIL, GETFund, and HRL** where configured.  
- **VAT Return** supports draft → review → file → submit to GRA → record payment.  
- Export **GRA CSV/XML** from the VAT return filing screen.

Ask your administrator for GRA credentials and TIN settings.

---

## Fixed Assets — equipment and depreciation

Track vehicles, tools, and other long-term assets from purchase through depreciation to disposal.

### Navigation

| Screen | Purpose |
|--------|---------|
| **Asset Register** | List all assets with cost, book value, and status |
| **Acquisitions** | Request → approve → receive → capitalize |
| **Depreciation** | Run monthly depreciation (optional GL posting) |
| **Valuation Report** | Portfolio summary and export |
| **Disposals** | Record sale, retirement, or write-off |
| **Transfers** | Change branch, location, or assignee |

Disposals and Transfers are also available from **Dashboard Requirements** and cross-links on related pages.

### Register an asset (two ways)

**Direct registration**

1. Fixed Assets → **Add Asset**.  
2. Enter category, cost, dates, depreciation method, location, assignee.  
3. Save — asset appears in the register.

**Via acquisition (recommended for purchases)**

1. Fixed Assets → Acquisitions → **New request**.  
2. Enter proposed asset, supplier, expected cost.  
3. **Submit for approval**.  
4. Approver **approves** or rejects.  
5. Upload **invoice and receipt**.  
6. **Receive and capitalize** — creates the asset in the register.

### Monthly depreciation

**Fixed Assets → Depreciation**

1. Select month and year (defaults to previous month).  
2. Choose whether to **post journal entries** to the general ledger.  
3. **Run depreciation** — review assets processed, skipped, and total amount.

Coordinate with your accountant before the first production run.

### Dispose or transfer

- **Transfer:** Search asset → set new branch, location, or assignee → save.  
- **Dispose:** Search asset → set disposition (disposed, sold, retired), date, proceeds, notes → record.

---

## End-to-end scenarios

### Scenario A — Complete a job and get paid

| Step | Module | Action |
|------|--------|--------|
| 1 | Billing | Create and approve estimate |
| 2 | Work Orders | Complete the job |
| 3 | Billing | Create invoice from work order |
| 4 | Billing | Record payment (cash or bank) |
| 5 | Accounting | Verify receipt on dashboard / bank account |

### Scenario B — Pay a parts supplier

| Step | Module | Action |
|------|--------|--------|
| 1 | Inventory | Receive purchase order (if used) |
| 2 | Billing | Enter vendor bill |
| 3 | Billing | Submit for approval |
| 4 | Billing | Pay bill after approval |
| 5 | Accounting | Reconcile bank when payment clears |

### Scenario C — Month-end close

| Step | Module | Action |
|------|--------|--------|
| 1 | Accounting | Clear dashboard alerts |
| 2 | Accounting | Post accruals; reconcile banks |
| 3 | Accounting | Run trial balance, P&L, balance sheet |
| 4 | Accounting | Check subledger integrity |
| 5 | Accounting | File VAT return if due |
| 6 | Accounting | Lock period in Controls |

### Scenario D — Buy workshop equipment

| Step | Module | Action |
|------|--------|--------|
| 1 | Fixed Assets | Create acquisition request |
| 2 | Fixed Assets | Approval and document upload |
| 3 | Fixed Assets | Receive and capitalize |
| 4 | Fixed Assets | Run monthly depreciation |
| 5 | Accounting | Verify depreciation in GL reports |

---

## Getting started checklist

Use this for new site setup or onboarding a finance team.

### Administrator (one-time)

- [ ] Enable modules: **Billing**, **Accounting**, **Fixed Assets** (if needed)  
- [ ] Assign roles: cashier, AR, AP, accountant, finance manager  
- [ ] **Accounting → Controls → Wire from standard chart**  
- [ ] Configure tax and GRA settings (if Ghana)  
- [ ] Set up bank accounts and till-enabled cash accounts  
- [ ] Create fixed asset **categories**  

### Daily operations

- [ ] Open till at start of cash shift  
- [ ] Invoice and collect payments through Billing  
- [ ] Enter and approve vendor bills  
- [ ] Review accounting dashboard alerts  

### Weekly

- [ ] Review **AP Due** and **Collections** (overdue)  
- [ ] Follow up on unmatched bank items  

### Monthly

- [ ] Bank reconciliation for each account  
- [ ] Depreciation run (fixed assets)  
- [ ] Financial reports and VAT (if applicable)  
- [ ] Period lock after review  

---

## What’s included vs. what’s still growing

### Ready for daily use

- Estimates, invoices, payments, credit notes  
- Vendor bills, approvals, payments, vendor credits  
- Customer statements (PDF)  
- Full GL, journal entries, chart of accounts  
- Bank reconciliation and till management  
- 18 financial and management reports  
- VAT return workflow (Ghana)  
- Asset register, acquisitions, depreciation, valuation report  

### Still maturing (manage expectations)

| Feature | Current state |
|---------|---------------|
| **Collections** | Overdue invoice list — not a full collections CRM |
| **Sales orders** | Lightweight tracking — not full order management |
| **Sales reports (billing)** | Shortcut hub — detailed analytics live in Accounting/Reports |
| **Fixed asset transfers** | Updates location/assignee — limited history view |
| **Fixed asset reports** | Valuation report — additional reports planned |
| **Refunds** | Two paths (approval workflow vs direct) — follow your admin’s policy |

See [Finance Fix Backlog](./FINANCE-FIX-BACKLOG.md) for the prioritized improvement list (internal/product use).

---

## Quick reference — where to find common tasks

| I need to… | Go to… |
|------------|--------|
| Invoice a customer | Billing → Invoices → New |
| Take a payment | Billing → Payments → Receive Payment |
| See who owes money | Billing → Collections · Accounting → AR Aging |
| Pay a supplier | Billing → Bills → Pay Bill |
| See what we owe vendors | Billing → AP Due · Vendor Balances |
| Customer statement | Customers → Statements |
| Reconcile the bank | Accounting → Bank Reconciliation |
| Open or close the till | Accounting → Till Management |
| Post a correction | Accounting → Journal Entries → New |
| Run P&L or balance sheet | Accounting → Reports |
| File VAT | Accounting → Reports → VAT Return |
| Lock the month | Accounting → Controls → Period lock |
| Add an asset | Fixed Assets → Add Asset or Acquisitions |
| Run depreciation | Fixed Assets → Depreciation |
| Finance shortcuts | Dashboard → Dashboard Requirements |

---

## Support and training

- **Accounting detail:** [Accounting User Guide](./ACCOUNTING-USER-GUIDE.md)  
- **In-app help:** Help menu (role-based guides where configured)  
- **Implementation issues:** Contact your system administrator  

For permission errors (“access denied”), ask your administrator to review your role — finance features are permission-controlled by design.

---

*This guide describes customer-facing capabilities as of June 2026. Screens and labels may improve as the product evolves; refer to in-app navigation for the latest menu structure.*
