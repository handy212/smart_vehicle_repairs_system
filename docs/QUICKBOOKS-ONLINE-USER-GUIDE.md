# QuickBooks Online — User Guide

**Product:** Smart Vehicle Repairs (SVR)  
**Audience:** Workshop owners, finance managers, bookkeepers, and administrators  
**Purpose:** Connect SVR to QuickBooks Online (QBO), configure mappings, and keep invoices, payments, and suppliers in sync  
**Last updated:** June 2026

---

## About this guide

This manual is written for **people who use SVR every day** — not for developers. It explains where to click, what to configure, and how to check that QuickBooks is receiving the right information.

**You will learn:**

- How SVR and QuickBooks work together  
- How to connect your QuickBooks company  
- The difference between **Controls mapping** and **Income Categories**  
- How to classify workshop revenue so each invoice line posts to the correct income account in QuickBooks  
- What documents sync automatically, and how to retry a failed sync  
- How to read sync status on invoices, customers, parts, and payments  
- Common problems and how to fix them  

**Related guides (optional reading):**

- [Finance Suite — Customer Feature Guide](./FINANCE-FEATURE-GUIDE.md) — billing and accounting overview  
- [Accounting User Guide](./ACCOUNTING-USER-GUIDE.md) — general ledger, reports, and period close  

---

## 1. What the integration does

SVR is your **workshop operations system** — work orders, parts, invoices, and payments.  
QuickBooks Online is your **accounting and tax reporting system**.

The integration is a **document bridge**:

| In SVR | In QuickBooks |
|--------|----------------|
| Customers | Customers |
| Estimates | Estimates |
| Invoices | Invoices |
| Customer payments | Receive Payment |
| Credit notes | Credit memos |
| Suppliers | Vendors |
| Vendor bills | Bills |
| Vendor credits | Vendor credits |
| Parts catalog (products & services) | Products and services (Items) |
| Branches | Locations (Departments) |

**Important principles:**

1. **SVR remains the source of truth for workshop work.** You create and edit invoices, estimates, and bills in SVR first.  
2. **QuickBooks receives copies** of those documents for your accountant, tax filing, and bank reconciliation.  
3. **SVR’s internal chart of accounts** (the lean general ledger inside SVR) is separate from the detailed income accounts in QuickBooks. You do not need to duplicate every QuickBooks account inside SVR.  
4. **Work orders, vehicles, and appointments do not sync** to QuickBooks — only financial documents and catalog items that accounting needs.

---

## 2. Who should set this up

| Role | Responsibility |
|------|----------------|
| **Administrator** | Enter QuickBooks app credentials, connect the company, manage integrations |
| **Finance manager / head bookkeeper** | Map control accounts, income categories, branches, and tax codes |
| **Accountant / billing clerk** | Day-to-day sync checks, retry failed documents, reconcile with QuickBooks |
| **Parts manager** | Ensure parts are synced as QuickBooks Items before they appear on synced invoices |

Most staff only need to know how to **read the QuickBooks sync badge** on invoices and payments. Setup is usually a one-time project plus occasional updates when you add new service types or branches.

---

## 3. Before you connect

### 3.1 What you need

- A **QuickBooks Online** subscription (Production for live books, or Sandbox for testing).  
- **Administrator access** in SVR (`manage_settings` permission).  
- **QuickBooks app credentials** (Client ID and Client Secret) from the Intuit Developer portal — your IT provider or Intuit partner usually supplies these.  
- A clear decision on whether you are in **Sandbox** (test) or **Production** (live) mode.

### 3.2 Recommended order

Complete setup in this order to avoid sync errors:

1. Connect QuickBooks under **Admin → Integrations**  
2. Map **GL control accounts** under **Accounting → Controls & Compliance**  
3. Map **QuickBooks accounts, items, and tax codes** on the same screen (QuickBooks tab)  
4. Review or create **Income Categories** under **Accounting → Income Categories**  
5. Link **task types**, **part categories**, and **subscription packages** to income categories  
6. Map **branches** to QuickBooks Locations under **Admin → Branches**  
7. Test with one customer, one estimate, one invoice, and one payment before going live  

---

## 4. Connect QuickBooks Online

**Path:** **Admin → Integrations** → **Accounting** category

### 4.1 Enter credentials

1. Open **Admin → Integrations**.  
2. Under the **QuickBooks Online** section, enter:  
   - **Client ID**  
   - **Client secret**  
   - **Sandbox mode** — turn **on** for testing, **off** for your live QuickBooks company  
3. Click **Save Changes** at the top of the page.

### 4.2 Link your QuickBooks company

1. On the **QuickBooks Online** card, click **Connect QuickBooks**.  
2. Sign in to Intuit and authorize SVR.  
3. When successful, the card shows **Connected**, your **Company ID**, **Environment** (Sandbox or Production), and **Last sync** time.

### 4.3 Pull data from QuickBooks

Use **Pull from QBO** on the connection card when you want SVR to refresh payment statuses and other inbound updates from QuickBooks. This runs in the background — check **QuickBooks Sync History** on the same page for results.

### 4.4 Disconnect (if needed)

Use the disconnect (unplug) button only when you intentionally want to stop all QuickBooks activity. Reconnecting requires going through authorization again.

### 4.5 Sync history

Scroll to **QuickBooks Sync History** on the Integrations page. It lists recent pushes and pulls with:

- Date and time  
- Document type (invoice, payment, customer, part, etc.)  
- Direction (inbound or outbound)  
- Success or failed status  
- Who triggered the run  

Use this when troubleshooting — it tells you whether a problem was on the push to QuickBooks or the pull back.

---

## 5. Two types of mapping (do not confuse them)

Many sync failures happen because these two screens are mixed up. They solve **different** problems.

### 5.1 Controls & Compliance → QuickBooks mapping

**Path:** **Accounting → Controls & Compliance** → **QuickBooks mapping** tab

**Purpose:** Wire SVR’s **system roles** to QuickBooks — the accounts and items used for automatic posting and document sync.

**Examples of what you map here:**

| SVR role | What you select in QuickBooks |
|----------|------------------------------|
| Accounts receivable | AR account |
| Accounts payable | AP account |
| Default sales revenue | Main income account (often your summary sales account) |
| Bank / cash accounts | Matching bank or cash accounts |
| Invoice line types (labor, part, fee, etc.) | QBO Items or income accounts |
| Payment methods (cash, card, mobile money) | Deposit accounts |
| Sales tax | Tax codes (VAT, NHIL, GETFund, etc.) |
| Inventory asset, COGS, sales revenue (for parts) | Correct account types for inventory items |

**When to use:** Once at go-live, then when you add a new payment method, tax code, or change your chart structure.

**Helpful buttons on this screen:**

- **Refresh QBO** — reload accounts, items, and tax codes from QuickBooks  
- **Preview income template** — see what would change if you apply the workshop income template (dry run)  
- **Apply income template** — apply pre-defined mappings for a standard workshop chart (use preview first)  

Each row shows **Mapped**, **Unmapped**, or **Failed**. Select a QuickBooks account or item, click **Save**, and confirm the badge turns green.

### 5.2 Income Categories

**Path:** **Accounting → Income Categories**

**Purpose:** Classify **each invoice line** by type of work or product so QuickBooks receives the **detailed income account** your accountant expects (for example mechanical labour **658**, vehicle assessment **680**, parts **661**).

**This is not your only revenue feature.** SVR still has invoices, estimates, reports, and a full chart of accounts. Income Categories are specifically the **operational classification layer** that tells each billing line which QuickBooks income account applies.

**Each income category has:**

| Field | Meaning |
|-------|---------|
| **Name** | Friendly label (e.g. “Mechanical Work Labour”) |
| **Code** | Internal reference used by the system |
| **QBO income account** | The account number or code from your QuickBooks chart (e.g. 658, 680) |
| **Class** | Labour, workshop service, parts, AA/roadside, subscription, etc. |
| **Line type** | How it appears on invoices (labour, part, fee, other) |

You can add, edit, and deactivate categories here. A seed/bootstrap list may exist from initial setup; ongoing maintenance is done in this screen.

### 5.3 How they work together

```
Work order task  →  Income category  →  Invoice line  →  QuickBooks Item / income account
     ↑                      ↑
Task type mapping    Income Categories screen
```

- **Controls mapping** = “Which QuickBooks account does SVR use for AR, bank, default sales, tax?”  
- **Income Categories** = “Which detailed income account does *this specific line of work* use?”  

SVR’s internal sales total may roll to a single summary account (e.g. 4000). QuickBooks still gets line-level detail through Items and income categories.

---

## 6. Link income categories to daily operations

After income categories exist, connect them to the places where work is defined.

### 6.1 Service task types

**Path:** **Work Orders** → **Manage Service Task Types** (from the work orders list page)

For each task type (Repair, Diagnostic, Inspection, Wheel Alignment, etc.):

1. Click **Edit**.  
2. Set **Income category (QBO income account)** to the matching category.  
3. Save.

When technicians add tasks to a work order, SVR uses this mapping when building invoice lines. The **Add Task** dialog shows which income category will apply.

### 6.2 Inventory part categories

**Path:** **Inventory → Categories** → create or edit a category

Set **Revenue product / Income category** to the default category for parts in that group (e.g. mechanical parts, tyres, A/C materials).

### 6.3 Subscription packages

**Path:** **Subscriptions → Packages** → create or edit a package

Set **Income category** for recurring subscription revenue (e.g. AA membership).

### 6.4 Verify on invoices

When creating an invoice from a work order:

- Open **Billing → Invoices → New** with a work order linked, or use **Create invoice** from the work order.  
- Each line should show an **Income** or **Revenue** badge with the category name and account number.  
- If you see **Unclassified**, map the task type, part category, or line manually before sending to the customer.

---

## 7. Map branches to QuickBooks Locations

If you operate multiple branches and use **Locations** (Departments) in QuickBooks:

**Path:** **Admin → Branches**

For each SVR branch:

1. Select the matching **QuickBooks Location / Department**.  
2. Save the mapping.  
3. Confirm the sync status shows **Mapped** or **Synced**.

Outbound invoices and documents can then carry the correct location in QuickBooks for branch-level reporting.

---

## 8. What syncs to QuickBooks (and when)

### 8.1 Customer sales (money in)

| SVR document | Syncs to QuickBooks when… |
|--------------|---------------------------|
| **Customer** | Saved with a customer number |
| **Estimate** | Status is Sent, Viewed, or Approved |
| **Invoice** | Status is Sent, Viewed, Partial, Paid, Overdue, or Open |
| **Payment** | Status is Completed |
| **Credit note** | Status is Issued or Applied |

**Proforma / deposit invoices:** Prepayment invoices (proforma or PRO-numbered partial invoices) are **not** pushed until converted to a final issued invoice. Customer deposits appear in QuickBooks as **unapplied payments** until linked to the real invoice.

### 8.2 Vendor purchases (money out)

| SVR document | Syncs to QuickBooks when… |
|--------------|---------------------------|
| **Supplier** | On save |
| **Vendor bill** | Open or paid |
| **Vendor credit** | Issued or applied |
| **Purchase order** | **Not pushed directly** — receive goods in SVR, then create the **vendor bill**; the bill syncs to QuickBooks |

### 8.3 Parts catalog

| SVR item | Syncs to QuickBooks as… |
|----------|-------------------------|
| **Inventory part** | Inventory Item (tracks quantity) |
| **Non-inventory part** | Non-inventory Item |
| **Service part** | Service Item |

Sync parts **before** invoicing them so invoice lines use the correct QuickBooks Item.

### 8.4 What does not sync

- Work orders, tasks, inspections, diagnoses  
- Vehicles and appointments  
- Internal journal entries (SVR general ledger postings)  
- Multi-branch stock transfers (SVR holds detailed stock; QuickBooks gets catalog totals for inventory items only)  

---

## 9. Using QuickBooks sync day to day

### 9.1 Sync status badges

On customer, invoice, estimate, payment, supplier, bill, part, and work order screens you may see a **QuickBooks** badge:

| Badge | Meaning |
|-------|---------|
| **Synced** | Document exists in QuickBooks and is up to date |
| **Pending** | Sync is queued or in progress |
| **Failed** | Sync error — read the message and fix the cause |
| **Un-synced** | Not yet sent (or not eligible for sync) |
| **Unmapped** | Branch or mapping configuration missing |

Failed badges usually include a short error message. Hover or expand to read the full text.

### 9.2 Manual sync button

On most financial document detail pages, a **Sync with QuickBooks** (or refresh) button appears when QuickBooks is connected. Use it when:

- You just fixed a mapping and want to retry  
- Auto-sync was delayed  
- A document failed and you corrected the underlying data  

### 9.3 Typical daily checklist (billing clerk)

1. Finalize and send invoices from completed work orders.  
2. Confirm each invoice shows **QuickBooks: Synced** (or retry if failed).  
3. Record payments and confirm payment sync.  
4. Check **Admin → Integrations → Sync History** for any failed runs.  
5. Resolve **Unclassified** income lines before month-end (see Income detail report below).

### 9.4 Month-end checklist (bookkeeper)

1. **Accounting → Controls** — all critical mappings still show **Mapped**.  
2. **Accounting → Income Categories** — new service types from the month have categories assigned.  
3. **Accounting → Reports → Management** → **Income detail** tab — investigate unclassified revenue.  
4. Reconcile QuickBooks AR/AP with SVR aging reports.  
5. Lock the accounting period under **Controls → Periods** after sign-off.

---

## 10. Ghana tax (VAT, NHIL, GETFund, HRL)

SVR calculates Ghana tax on invoices. For QuickBooks to show tax correctly:

1. Map your **composite or individual tax codes** under **Controls → QuickBooks mapping**.  
2. Prefer a **composite** QuickBooks tax code that matches how you file, when available.  
3. After sending a test invoice, open it in QuickBooks and confirm tax matches SVR’s invoice total.

If tax is zero in QuickBooks but correct in SVR, the tax code mapping is missing or wrong — fix mapping before bulk sync.

---

## 11. Income detail report

**Path:** **Accounting → Reports → Management** → **Income detail** tab

This report shows invoiced amounts grouped by **income category** and **QBO income account number**. Use it to:

- Confirm labour and services are hitting the right accounts (658, 680, etc.)  
- Find **unclassified** revenue that still needs task type or category mapping  
- Support management and external accountant reviews  

If unclassified amounts appear, follow the link to **Income Categories** and update task types, part categories, or packages.

---

## 12. Finding documents in QuickBooks

After a successful sync, look in QuickBooks here:

| SVR record | Where in QuickBooks Online |
|------------|----------------------------|
| Part / product | **Sales → Products and services** |
| Customer | **Sales → Customers** |
| Estimate | **Sales → Estimates** |
| Invoice | **Sales → Invoices** |
| Payment | **Sales → All sales** or **Customers → Receive payment** |
| Credit note | **Sales → Credit memos** |
| Supplier | **Expenses → Vendors** |
| Vendor bill | **Expenses → Bills** |
| Vendor credit | **Expenses → Vendor credits** |
| Branch / location | **Settings → Account and settings → Advanced → Categories → Locations** |

Invoice and estimate PDFs from SVR may attach to the QuickBooks transaction after the first successful sync.

---

## 13. Troubleshooting

### “Not classified” or wrong income account on invoice lines

| Check | Action |
|-------|--------|
| Task type mapping | **Work Orders → Manage Service Task Types** — set income category per type |
| Part category | **Inventory → Categories** — set default income category |
| Income category missing | **Accounting → Income Categories** — create or activate the category |
| Picker shows wrong value | Save again after selecting; refresh the page |

### Sync failed on invoice

| Common cause | Fix |
|--------------|-----|
| Customer not in QuickBooks | Open customer → **Sync with QuickBooks**, then retry invoice |
| Line item / part not mapped | Sync the part first; check **Controls → QuickBooks mapping** for line types |
| Tax code not mapped | Map tax codes under Controls |
| Branch not mapped | Map branch under **Admin → Branches** |
| Document number conflict | Your administrator may need to resolve duplicate document numbers in QuickBooks |

### Sync failed on payment

| Common cause | Fix |
|--------------|-----|
| Invoice not synced yet | Sync the invoice first, then the payment |
| Deposit on proforma | Expected until invoice is finalized — convert proforma, sync invoice, then re-sync payment |
| Wrong deposit account | Map payment method under Controls |

### Sync failed on part

| Common cause | Fix |
|--------------|-----|
| Missing sales / COGS / inventory accounts | Map **Sales revenue**, **COGS**, and **Inventory asset** under Controls |
| Wrong account type selected | Inventory parts need asset + COGS + income accounts of the correct types |

### QuickBooks badge missing entirely

- QuickBooks is not connected — go to **Admin → Integrations**  
- You lack permission to view integration status  
- Refresh the page after connecting  

### Numbers differ between SVR and QuickBooks

- SVR is authoritative for **workshop operations**  
- QuickBooks is authoritative for **statutory accounts and tax filing**  
- Small timing differences are normal until both sides are synced and the period is closed  
- Use aging reports on both sides for AR/AP reconciliation  

---

## 14. Sandbox vs production

| Environment | Use for |
|-------------|---------|
| **Sandbox** | Training, mapping tests, dry runs, UAT before go-live |
| **Production** | Live daily operations and real financial data |

Always complete a full test cycle in Sandbox before switching Sandbox mode **off** and connecting Production.

**Sandbox test script (recommended):**

1. Connect Sandbox QuickBooks.  
2. Apply or verify mappings under Controls.  
3. Create a test customer → estimate → approve → invoice → payment.  
4. Create a test supplier → vendor bill → payment.  
5. Create one inventory part and one service part; sync both.  
6. Confirm sync history shows success and documents appear in QuickBooks Sandbox.

---

## 15. Roles and permissions (summary)

| Task | Typical permission |
|------|-------------------|
| Connect / disconnect QuickBooks | Administrator (`manage_settings`) |
| Edit Controls and income categories | Accounting manager (`manage_accounting_periods`) |
| View accounting and reports | `view_accounting` / `view_financial_reports` |
| Create invoices and sync | Billing staff with invoice access |
| Map branches | Administrator or branch manager |

Your administrator assigns these in **Admin → Users**.

---

## 16. Quick reference card

**Connect:** Admin → Integrations → QuickBooks Online → Connect  
**System mappings:** Accounting → Controls & Compliance → QuickBooks mapping  
**Income categories:** Accounting → Income Categories  
**Task type links:** Work Orders → Manage Service Task Types  
**Part category links:** Inventory → Categories  
**Branch links:** Admin → Branches  
**Sync log:** Admin → Integrations → QuickBooks Sync History  
**Income report:** Accounting → Reports → Management → Income detail  
**Retry sync:** Open the document → Sync with QuickBooks button  

---

## 17. Support

1. Check this guide and the **Help** screen inside SVR (**Help** in the main menu).  
2. Review the failed sync message on the document and the Integrations sync history.  
3. Contact your branch administrator or finance lead with:  
   - Branch name  
   - Document type and number (invoice, payment, etc.)  
   - Screenshot of the QuickBooks sync badge and error text  
   - Date and time of the failure  

For technical integration credentials (Client ID, Secret, Intuit app setup), contact your IT provider or SVR implementation partner.

---

*Smart Vehicle Repairs — QuickBooks Online User Guide — For customer distribution. Print double-sided or export to PDF from your markdown viewer.*
