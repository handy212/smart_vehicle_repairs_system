# Owner QBO Go-Live Checklist

Use this checklist before turning on QuickBooks Online sync for production. It is designed for the **owner**, **accountant**, and **SVR administrator** to sign off together.

**Related docs:** [OWNER-QBO-COA-MAPPING.md](OWNER-QBO-COA-MAPPING.md) · [QBO-INTEGRATION-GUIDE.md](QBO-INTEGRATION-GUIDE.md)

---

## How to use this document

1. Complete sections **in order** (Phase 1 → Phase 5).
2. Check each box when verified; add initials and date in the sign-off table at the end.
3. Run branch smoke tests (Phase 4) **once per branch** before production cutover.
4. Do not enable auto-sync for all branches until Phase 4 passes for every branch.

**Legend**


| Symbol | Meaning                            |
| ------ | ---------------------------------- |
| ☐      | Not started                        |
| ☑      | Verified                           |
| N/A    | Not applicable for this deployment |


---



## Phase 1 — Policy sign-off (accountant + owner)

Confirm the team accepts the SVR ↔ QBO model (not a copy of the legacy desktop chart inside SVR).


| #   | Item                                                                                                    | Owner | Accountant | Notes                                 |
| --- | ------------------------------------------------------------------------------------------------------- | ----- | ---------- | ------------------------------------- |
| 1.1 | SVR keeps a **lean GL** (~45 accounts); owner detail lives in **QBO only**                              | ☐     | ☐          |                                       |
| 1.2 | **Journal entries do not sync** to QBO (documents only)                                                 | ☐     | ☐          | Prevents double-counting              |
| 1.3 | Branch P&L in QBO uses **Locations/Departments**, not accounts 698K / 698T / 698TM                      | ☐     | ☐          |                                       |
| 1.4 | Revenue type (labour / parts / services) uses **QBO Items**, not separate SVR GL per type               | ☐     | ☐          |                                       |
| 1.5 | **Sub-contractors (685)** reclassified: customer revenue + subcontractor **cost**, not duplicate income | ☐     | ☐          | See Phase 2.3                         |
| 1.6 | Invoice **discounts** use contra-revenue (Sales Returns), not 802 Discount Allowed as expense           | ☐     | ☐          |                                       |
| 1.7 | **Vendor names** (MORE FUEL, IT Scope, etc.) stay in AP vendor ledger, not as GL accounts               | ☐     | ☐          |                                       |
| 1.8 | **Admin/overhead (800 series)**, director loans, equity, period-end JEs are **QBO/accountant** entries  | ☐     | ☐          | Not auto-posted from SVR workshop ops |
| 1.9 | **Payroll detail** in QBO may differ from SVR aggregate payroll JE; accountant reconciles               | ☐     | ☐          |                                       |


**Phase 1 gate:** All items checked before proceeding.

---



## Phase 2 — QuickBooks Online setup



### 2.1 Company settings


| #     | Task                                                                                           | Done | Verified by | Date |
| ----- | ---------------------------------------------------------------------------------------------- | ---- | ----------- | ---- |
| 2.1.1 | QBO company created or selected (production, not sandbox)                                      | ☐    |             |      |
| 2.1.2 | **Locations** enabled: Settings → Account and settings → Advanced → Categories → **Locations** | ☐    |             |      |
| 2.1.3 | Ghana **tax codes** configured (VAT, NHIL, GETFund, HRL or composite)                          | ☐    |             |      |
| 2.1.4 | Opening balances / migration plan agreed with accountant                                       | ☐    |             |      |




### 2.2 Owner chart in QBO


| #     | Task                                                                                                                     | Done | Verified by | Date                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | ---- | ----------- | -------------------------------------------- |
| 2.2.1 | Owner legacy COA imported or created in QBO (~250 accounts)                                                              | ☐    |             |                                              |
| 2.2.2 | Rollup accounts present: 120 AR, 400 AP, 650 revenue parent, 700 COGS, 12100 inventory, 100 cash/bank                    | ☐    |             |                                              |
| 2.2.3 | Supplemental accounts created (if missing): **Customer Prepayments**, **Sales Returns and Allowances**, optional **WIP** | ☐    |             | Run `python manage.py setup_owner_qbo_chart` |




### 2.3 Accounting corrections in QBO (mandatory)


| #     | Correction                                                                           | Done | Verified by | Date                                   |
| ----- | ------------------------------------------------------------------------------------ | ---- | ----------- | -------------------------------------- |
| 2.3.1 | Sub-contractor accounts (685–697) **not** used as customer invoice income            | ☐    |             | Map sublet to service/labour Items     |
| 2.3.2 | Branch sales GL (698K, 698T, 698TM) **not** used for new postings                    | ☐    |             | Use Departments instead                |
| 2.3.3 | Discounts/credit notes → Sales Returns (contra-revenue), not 802 expense             | ☐    |             |                                        |
| 2.3.4 | L/O vs Stores vs Warehouse splits: agree whether kept in QBO for legacy reports only | ☐    |             | Optional; SVR uses inventory locations |


**Phase 2 gate:** Chart exists, Locations on, corrections applied.

---



## Phase 3 — SVR configuration



### 3.1 Connect QuickBooks


| #     | Task                                                         | Done | Verified by | Date     |
| ----- | ------------------------------------------------------------ | ---- | ----------- | -------- |
| 3.1.1 | QBO app credentials in **Admin → Integrations → QuickBooks** | ☐    |             |          |
| 3.1.2 | OAuth connect completed; status shows **Connected**          | ☐    |             |          |
| 3.1.3 | Webhook configured (recommended)                             | ☐    |             | Optional |




### 3.2 SVR lean chart


| #     | Task                                                                                                      | Done | Verified by | Date |
| ----- | --------------------------------------------------------------------------------------------------------- | ---- | ----------- | ---- |
| 3.2.1 | Run `python manage.py setup_chart_of_accounts`                                                            | ☐    |             |      |
| 3.2.2 | Run `python manage.py wire_accounting_controls` (or **Accounting → Controls → Wire from standard chart**) | ☐    |             |      |
| 3.2.3 | Confirm **17 control accounts** wired (AR, AP, revenue, tax, inventory, COGS, bank, etc.)                 | ☐    |             |      |
| 3.2.4 | Confirm owner 650-tree **not** imported into SVR chart                                                    | ☐    |             |      |




### 3.3 Auto-map to owner chart


| #     | Task                                                                          | Done | Verified by | Date |
| ----- | ----------------------------------------------------------------------------- | ---- | ----------- | ---- |
| 3.3.1 | Run `python manage.py apply_owner_qbo_mappings --wire-svr` (or dry-run first) | ☐    |             |      |
| 3.3.2 | Review mapping overview: **Accounting → Controls → QuickBooks mapping**       | ☐    |             |      |
| 3.3.3 | Fix any **unmapped** or **wrong** control rows manually in UI                 | ☐    |             |      |




### 3.4 Control account mapping matrix (verify in UI)


| SVR control                   | Target owner QBO account (example)             | Mapped | QBO acct ID |
| ----------------------------- | ---------------------------------------------- | ------ | ----------- |
| Accounts Receivable           | 120                                            | ☐      |             |
| Accounts Payable              | 400                                            | ☐      |             |
| Customer Prepayments          | Customer Prepayments / deposits liability      | ☐      |             |
| Sales Revenue                 | 650 Operating Service/Sales Revenue            | ☐      |             |
| Sales Returns & Allowances    | Sales Returns (not 802)                        | ☐      |             |
| Sales Tax Payable             | 2553 / GRA tax liability                       | ☐      |             |
| Input Sales Tax               | Withholding / input tax receivable             | ☐      |             |
| Withholding Tax Payable       | 429                                            | ☐      |             |
| Inventory Asset               | Stock:12100                                    | ☐      |             |
| Cost of Goods Sold            | 700                                            | ☐      |             |
| Default expense / purchases   | 800 or 500 rollup                              | ☐      |             |
| AP clearing / vendor payments | 400 AP + bank/cash settlement                  | ☐      |             |
| Default bank                  | Primary operating bank (e.g. 118.4 Absa Accra) | ☐      |             |
| Till / cash counterparty      | Main Cash / Petty Cash                         | ☐      |             |




### 3.5 Payment deposit accounts (100-series)

Map each settlement path to the correct owner bank/cash account.


| SVR path               | Owner QBO account (example)   | Mapped | QBO acct ID |
| ---------------------- | ----------------------------- | ------ | ----------- |
| Cash / till (Accra)    | 101.1 Main Ckash (ACCRA)      | ☐      |             |
| Cash / till (Kumasi)   | 101.3 Main Cash (Kumasi)      | ☐      |             |
| Cash / till (Takoradi) | 101.2 Main Cash (Takoradi)    | ☐      |             |
| Cash / till (Tamale)   | 101.4 Main Cash (Tamale)      | ☐      |             |
| MTN MoMo (Accra)       | 103 MOMO (ACCRA)              | ☐      |             |
| MTN MoMo (Kumasi)      | 118.04 Kumasi Momo            | ☐      |             |
| MTN MoMo (Takoradi)    | 118.05 Takoradi Momo          | ☐      |             |
| MTN MoMo (Tamale)      | 118.06 Tamale Momo            | ☐      |             |
| Card / bank transfer   | Branch operating bank         | ☐      |             |
| Default bank fallback  | 118.4 Accra Absa (or HQ bank) | ☐      |             |




### 3.6 Invoice line types → QBO Items


| SVR line type | QBO Item name (auto or custom)          | Income → owner acct | Mapped |
| ------------- | --------------------------------------- | ------------------- | ------ |
| labor         | SVR Labor Revenue (or discipline Items) | 655 / 658 Labour    | ☐      |
| part          | SVR Parts Revenue                       | 661 Materials       | ☐      |
| fee           | SVR Service Fee Revenue                 | 679 Services        | ☐      |
| sublet        | SVR Sublet Service Revenue              | 679 / 681 (not 685) | ☐      |
| discount      | SVR Sales Discount                      | Sales Returns       | ☐      |
| other         | SVR Miscellaneous Revenue               | 699 Miscellaneous   | ☐      |




### 3.7 Ghana tax codes


| SVR tax key | QBO TaxCode name           | Mapped |
| ----------- | -------------------------- | ------ |
| composite   | Composite / standard Ghana | ☐      |
| vat         | VAT                        | ☐      |
| nhil        | NHIL                       | ☐      |
| getfund     | GETFund                    | ☐      |
| hrl         | Health Recovery Levy       | ☐      |
| exempt      | Exempt / zero-rated        | ☐      |




### 3.8 Branches → QBO Departments


| SVR branch   | Branch code | QBO Location name | Mapped | QBO Dept ID |
| ------------ | ----------- | ----------------- | ------ | ----------- |
| Accra        |             |                   | ☐      |             |
| Kumasi       |             |                   | ☐      |             |
| Takoradi     |             |                   | ☐      |             |
| Tamale       |             |                   | ☐      |             |
| *(add rows)* |             |                   | ☐      |             |


Configure in **Branches** → QBO mapping panel, or via `apply_owner_qbo_mappings`.

**Phase 3 gate:** QBO connected; all critical mappings green; every active branch has a Department.

---



## Phase 4 — Branch smoke tests (repeat per branch)

Run these tests **in QBO sandbox first**, then production. Use a test customer where possible.

### Branch: _________________  Code: _______  Tester: _______  Date: _______



#### 4.1 Outbound sync


| #     | Test                                             | SVR                | QBO                                                 | Pass |
| ----- | ------------------------------------------------ | ------------------ | --------------------------------------------------- | ---- |
| 4.1.1 | Create/sync **customer** with customer number    | Synced             | Customer exists                                     | ☐    |
| 4.1.2 | Issue **estimate** (sent)                        | Synced             | Estimate + Department                               | ☐    |
| 4.1.3 | Issue **invoice** with labour line               | Synced             | Invoice line → Labour Item; **not** 698K/T/698TM GL | ☐    |
| 4.1.4 | Same invoice with **part** line (inventory part) | Synced             | Part Item; COGS/asset refs valid                    | ☐    |
| 4.1.5 | Same invoice with **fee** line                   | Synced             | Service Item → 679 series                           | ☐    |
| 4.1.6 | Invoice shows correct **Ghana tax**              | tax_amount correct | TxnTaxDetail / TaxCode                              | ☐    |
| 4.1.7 | Invoice **Department** = this branch             | branch set         | Location matches branch                             | ☐    |
| 4.1.8 | Record **payment** (cash or MoMo)                | Completed          | Payment → correct deposit account                   | ☐    |
| 4.1.9 | Receive **vendor bill** (parts PO flow)          | Bill open/paid     | Bill → inventory/expense account                    | ☐    |




#### 4.1A Accounts Payable (QBO parity)


| #      | Test                                                    | SVR                                  | QBO                                  | Pass |
| ------ | ------------------------------------------------------- | ------------------------------------ | ------------------------------------ | ---- |
| 4.1A.1 | Create **purchase order** → confirm supplier            | PO confirmed                         | PurchaseOrder (after confirm)        | ☐    |
| 4.1A.2 | **Receive** PO (full or partial)                        | PO partially_received / received     | —                                    | ☐    |
| 4.1A.3 | **Convert to bill** from PO                             | Bill open, linked to PO              | Bill with LinkedTxn to PO            | ☐    |
| 4.1A.4 | Create **standalone bill** → approve                    | Bill open                            | Bill (no PO link)                    | ☐    |
| 4.1A.5 | **Pay Bills** — select bank/cash account, pay open bill | BillPayment recorded                 | BillPayment → correct bank/cash      | ☐    |
| 4.1A.6 | **Vendor expense** (immediate pay, no AP bill)          | Posted expense                       | Purchase (Expense)                   | ☐    |
| 4.1A.7 | **Vendor credit** issued → apply to bill                | Credit applied, bill balance reduced | VendorCredit + Bill link             | ☐    |
| 4.1A.8 | **Void vendor expense** (before/after QBO sync policy)  | GL reversed in SVR                   | Manual void in QBO if already synced | ☐    |


**AP workflow reference:** PO → Receive → Bill (or standalone bill → approval) → **Pay Bills** hub. Vendor expenses bypass AP bills and sync as QBO Purchases.

#### 4.2 SVR GL (internal books)


| #     | Check                                                         | Expected                       | Pass |
| ----- | ------------------------------------------------------------- | ------------------------------ | ---- |
| 4.2.1 | Invoice JE: Dr **1200 AR**, Cr **4000** revenue (+ tax, fees) | Balanced                       | ☐    |
| 4.2.2 | COGS JE: Dr **5100**, Cr **1500** (parts on invoice)          | Balanced                       | ☐    |
| 4.2.3 | Payment JE: Dr cash/bank, Cr AR                               | Balanced                       | ☐    |
| 4.2.4 | JE tagged with **branch** on journal entry                    | branch_id set                  | ☐    |
| 4.2.5 | **No duplicate** revenue in QBO from SVR JEs                  | QBO P&L matches documents only | ☐    |




#### 4.3 QBO reporting


| #     | Report                                                  | Check                              | Pass |
| ----- | ------------------------------------------------------- | ---------------------------------- | ---- |
| 4.3.1 | P&L filtered by **Location** = this branch              | Revenue appears under branch       | ☐    |
| 4.3.2 | P&L **not** posting to 698K/T/698TM (if deprecated)     | No new activity on branch sales GL | ☐    |
| 4.3.3 | Labour vs parts visible via **Items** or account detail | Matches workshop expectation       | ☐    |


**Branch gate:** All 4.x items pass before enabling production traffic for this branch.

---



## Phase 5 — Production cutover


| #   | Task                                                            | Done | Owner | Accountant | SVR admin | Date |
| --- | --------------------------------------------------------------- | ---- | ----- | ---------- | --------- | ---- |
| 5.1 | All branches passed Phase 4                                     | ☐    | ☐     | ☐          | ☐         |      |
| 5.2 | `QUICKBOOKS_AUTO_SYNC_ENABLED=true` in production               | ☐    |       |            | ☐         |      |
| 5.3 | Celery worker running for QBO sync (not inline-only)            | ☐    |       |            | ☐         |      |
| 5.4 | Staff trained: do not create duplicate invoices in QBO manually | ☐    | ☐     | ☐          | ☐         |      |
| 5.5 | Escalation path for failed sync (`qbo_sync_error` on documents) | ☐    |       |            | ☐         |      |
| 5.6 | Month-end close process documented (SVR GL vs QBO)              | ☐    | ☐     | ☐          |           |      |
| 5.7 | First month reconciliation completed                            | ☐    | ☐     | ☐          |           |      |


---



## Known limitations (acknowledge before sign-off)


| Topic                  | Behaviour                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------ |
| SVR revenue GL         | Single rollup **4000** (not 656/658/662 per line)                                    |
| QBO revenue detail     | Via **Items** + income accounts on Items                                             |
| Branch detail          | QBO **Departments**; SVR `JournalEntry.branch`                                       |
| Sublet / subcontractor | Customer line → service revenue Item; vendor payment → expense/COGS in QBO           |
| Payroll in QBO         | Not auto-synced from SVR payroll JE                                                  |
| Admin 800 expenses     | Entered in QBO (bank feed / manual), not from workshop invoices                      |
| Vendor expenses (SVR)  | Immediate pay → QBO Purchase; edit blocked after QBO sync; void reverses SVR GL only |
| AP pay path            | Use **Pay Bills** (not inline pay dialogs on bill list/detail)                       |
| Owner template setup   | **Accounting → Controls → QuickBooks mapping** — **Apply income template** (or `apply_owner_qbo_mappings --wire-svr`) |
| Part income categories | Set on **Inventory → Categories** and **Revenue products**; parts auto-resolve via `revenue_product` |
| Owner COA in QBO       | Import/create in **QuickBooks** (~250 accounts); SVR keeps lean chart only — no CSV import into SVR |


---



## Sign-off


| Role                 | Name | Signature | Date |
| -------------------- | ---- | --------- | ---- |
| Business owner       |      |           |      |
| Accountant / auditor |      |           |      |
| SVR administrator    |      |           |      |


**Go-live approved:** ☐ Yes  ☐ No — blockers: _______________________________

---



## Quick command reference

```bash
# SVR chart
python manage.py setup_chart_of_accounts
python manage.py wire_accounting_controls

# QBO owner chart bridge
python manage.py setup_owner_qbo_chart
python manage.py apply_owner_qbo_mappings --wire-svr --dry-run   # preview
python manage.py apply_owner_qbo_mappings --wire-svr             # apply

# Tests
pytest apps/quickbooks_online/test_owner_coa_separation.py --no-cov -o addopts=
```

**API (when QBO connected):** `POST /api/quickbooks/account-mappings/apply-owner-template/`