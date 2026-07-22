# Smart Vehicle Repairs ↔ QuickBooks Online

## Integration Status for American Autoparts

**Prepared for:** American Autoparts Limited / American Autoparts Mobility Group  
**Date:** 22 July 2026  

This note explains, in plain language, what is already connected between Smart Vehicle Repairs (SVR) and QuickBooks Online (QBO), what each branch uses, and **what still needs to be done on the QuickBooks side** before the finance team can treat the link as complete.

---

## 1. Bottom line


| Area                                                   | Status                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Connection to QuickBooks                               | Connected and working                                                         |
| Customers, invoices, payments, estimates, credit notes | Syncing from SVR → QuickBooks when records are finalized                      |
| Branches as QuickBooks locations                       | All 10 branches linked                                                        |
| Income accounts by workshop category and city          | Mapped for labour, parts, and key services                                    |
| Branch bank / MoMo / cash tills in QuickBooks          | **Not ready** — QuickBooks currently has only one bank account                |
| Payroll / tax payable accounts                         | **Not fully mapped** — matching accounts are missing or unclear in QuickBooks |


**What this means for you:** Day-to-day workshop billing can flow into QuickBooks. Cash and bank reconciliation by branch, and full payroll/tax posting, wait on chart updates **in QuickBooks** (see section 5).

---



## 2. What is already working (system-wide)

When staff complete normal work in SVR, the system can send the following to QuickBooks automatically:


| In SVR                                               | In QuickBooks            | When it syncs                                  |
| ---------------------------------------------------- | ------------------------ | ---------------------------------------------- |
| Customer                                             | Customer                 | When saved (with a customer number)            |
| Invoice (issued / sent / paid, etc.)                 | Invoice + PDF attachment | When the invoice is no longer a draft/proforma |
| Payment (completed)                                  | Payment                  | When marked completed                          |
| Estimate (sent / approved / declined / converted)    | Estimate + PDF           | When sent or decided                           |
| Credit note (issued)                                 | Credit memo + PDF        | When issued                                    |
| Supplier                                             | Vendor                   | When saved                                     |
| Purchase order (confirmed / received)                | Purchase order           | When confirmed                                 |
| Vendor bill / bill payment / vendor credit / expense | Matching AP documents    | When posted / issued                           |
| Parts catalogue                                      | Items                    | When saved                                     |
| Stock adjustments                                    | Inventory adjustment     | When created                                   |
| Branch                                               | Location (department)    | When created or renamed                        |


**Important behaviours (simple terms):**

- Draft and proforma invoices stay in SVR until they become real invoices.
- Paid status in QuickBooks follows money applied (payments), not a separate “Paid” switch.
- Voiding or refunding in SVR does **not** currently void the document in QuickBooks — that still needs a manual check in QBO if used.



### Company-wide account links already set

These shared accounts are linked for the whole company:

- Accounts Receivable  
- Cost of sales  
- Warehouse Inventory Sales (default product income)  
- Materials, Parts & Accessories Sales  
- Inventory Asset  
- Cash and cash equivalents (only bank account available today)  
- Undeposited Funds  
- Purchases  
- Wage expenses / Income tax payable  
- Customer Prepayments  
- Sales Returns and Allowances  
- Billable Expense Income

---



## 3. What is mapped per branch

All **10 active branches** are linked to QuickBooks locations, and each has:

1. Shared receivables and cost-of-sales accounts
2. A default sales income account for that city, e.g.
  - Accra → *Warehouse Inventory Sales – Accra*  
  - Kumasi → *Warehouse Inventory Sales – Kumasi*  
  - …and the same pattern for Takoradi, Tamale, Tema, Tarkwa, Koforidua, Bolgatanga, Sunyani, HO
3. **Workshop income categories by city** using the newer QuickBooks **Works / Services** accounts, for example:
  - AC / Mechanical / Electrical / Body / Spraying **Works** (labour billing)  
  - Matching **materials** (including tires, oils, warehouse parts)  
  - Services such as vehicle assessment, diagnosis, programming, alignment, skimming, exhaust, upholstery, other works, and subcontracted services

When a job is billed under the right category at a branch, QuickBooks posts to the **city leaf** for that category (for example *Mechanical Works – Kumasi*), not only a single company bucket.

**Branches covered:** Accra, Kumasi, Takoradi, Tamale, Tema, Tarkwa, Koforidua, Bolgatanga, Sunyani, HO.

---



## 4. Cleaner document numbers

New accounting documents no longer include the year in the number, so they stay short and readable in both SVR and QuickBooks.


| Before              | Now (examples)     |
| ------------------- | ------------------ |
| INV-2026-ACC-000003 | **INV-ACC-000004** |
| PAY-2026-HQ-000001  | **PAY-ACC-000001** |
| CN-2026-ACC-000001  | **CN-ACC-000001**  |


---



## 5. What American Autoparts still needs to do in QuickBooks

These items are **on the QuickBooks / finance side**. SVR cannot invent bank accounts that do not exist in your QuickBooks company file.

### A. Branch cash and bank accounts (required for till / MoMo / ABSA settlement)

Today QuickBooks shows only:

> **Cash and cash equivalents**

To finish branch cash handling, please create (or restore) bank accounts in QuickBooks for each branch as needed, for example:

- Accra Main Cash / Accra Cash Receipts / Accra MoMo / Accra ABSA  
- Same pattern for Kumasi, Takoradi, Tamale, and other branches you use

**Once those accounts exist and are named clearly with the city**, we can map them in SVR and settlement sync can be completed.

### B. Confirm optional company accounts (if you use them in SVR)

If you want these controlled from SVR as well, please confirm or create matching QuickBooks accounts for:

- Accounts Payable (if not using the default AP)  
- Sales tax / GRA tax payable  
- Withholding tax payable  
- Cash over/short  
- Payroll extras (overtime, allowances, statutory payables) beyond the basic wage / income-tax accounts already linked



### C. One QuickBooks chart gap (optional, Tarkwa skimming only)

Almost all newer Works / Services city accounts are in place. One leaf is missing in QuickBooks:

- **Skimming – Tarkwa**

Until that account is created (or the existing mis-coded Tarkwa AC Works leaf is corrected), Tarkwa skimming jobs may fall back to the company default. All other branches and categories are mapped.

### D. Operational checklist for your team

1. Keep QuickBooks connected under Admin → Integrations (do not disconnect without notice).
2. Use the correct **task type / income category** on jobs so the right city income account is chosen.
3. Do not void/refund only in SVR if the document must also be cleared in QuickBooks — handle both sides until void sync is added.
4. After branch bank accounts are created in QBO, notify the SVR team to finish settlement mapping.
5. (Optional) Create **Skimming – Tarkwa** in QuickBooks so Tarkwa skimming posts to its own city account.

---



## 6. How to read “done”

We can call the QuickBooks link **complete for workshop billing** when:

- [x] Company connected  
- [x] Branches linked as locations  
- [x] Customers / invoices / payments / estimates / credit notes syncing  
- [x] City income categories mapped for labour, parts, and main services  
- [ ] Branch bank / MoMo / cash accounts exist in QuickBooks and are mapped  
- [ ] Any extra tax/payroll accounts you need are confirmed and mapped  

Until the branch bank accounts exist in QuickBooks, **invoice and income posting can proceed**; **branch cash settlement cannot be finished**.

---



## 7. Who owns the remaining delay


| Waiting on                                | Item                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **American Autoparts (QuickBooks chart)** | Create/name branch cash & bank accounts; confirm tax/payroll accounts if required; optional *Skimming – Tarkwa* leaf |
| **SVR implementation team**               | Map those new bank/tax accounts as soon as they appear                                                               |


The integration work on the SVR side for core billing and branch income is in place. Completing cash-by-branch and optional tax/payroll controls depends on the QuickBooks chart being updated as above.

---

*If you need a walkthrough of any section in a meeting, we can review one Accra invoice and one Kumasi job end-to-end in both systems.*