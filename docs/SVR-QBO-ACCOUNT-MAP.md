# SVR vs QuickBooks Account Map

**Purpose:** One-page reference — which accounts live in SVR (workshop operations) vs QBO (full accounting).  
**Model:** QBO-first. SVR keeps ~27–44 lean accounts; your 1000–9000 framework lives in QBO.

---

## How to read this

| Column | Meaning |
|--------|---------|
| **SVR** | Account needed in Smart Vehicle Repairs for auto-posting |
| **SVR code** | Current seeded code (do not renumber without migration) |
| **QBO (your framework)** | Target in QuickBooks under your standardized chart |
| **SVR need** | Required / Optional / QBO only |

---

## Tier 1 — Control accounts (24 required in SVR)

| SVR need | SVR code | SVR role | QBO target (your framework) | Triggered by |
|:--------:|----------|----------|----------------------------|--------------|
| Required | 1200 | Accounts Receivable | 1200 Accounts Receivable | Invoices, payments, credit notes |
| Required | 2000 | Accounts Payable | 3100 Accounts Payable | Vendor bills, bill payments |
| Required | 2150 | Customer Prepayments | Customer prepayments (liability) | Payment overpayments |
| Required | 4000 | Sales Revenue (rollup) | 5100 or Items → 5210–5380 | Finalized invoices |
| Required | 4100 | Sales Returns & Allowances | Contra-revenue (not 7120 Discount Allowed) | Discounts, credit notes |
| Required | 2100 | Sales Tax Payable (combined) | 3310–3340 NHIL / GETFund / VAT | Invoice tax |
| Required | 4050 | Shop Supplies Revenue | 5310–5380 materials | Shop supplies fee |
| Required | 4060 | Environmental Fee Revenue | 5400 services / 699 misc | Environmental fee |
| Required | 2200 | Input Tax | Input tax receivable | Vendor bill recoverable tax |
| Required | 2320 | Withholding Tax Payable | 3350 Withholding Tax Payable | WHT on bills |
| Required | 5000 | Default Expense | 7100+ or purchases rollup | Non-inventory bill lines |
| Required | 5050 | Purchase Returns | Purchase returns | Vendor credits |
| Required | 1500 | Inventory Asset | 1400–1480 (rollup or category) | Stock receipts, COGS relief |
| Required | 5100 | Cost of Goods Sold | 6100–6190 | Parts on invoices |
| Required | 5950 | Cash Over/Short | Cash over/short expense | Till close variance |
| Required | 1010 | Till Counterparty Cash | Cash in safe / float account | Till open & close |
| Required | 1100 | Default Bank Account | 1110–1114 Absa (HQ default) | Fallback bank, payroll net pay |
| Required | 6000 | Salary Expense | 7332 Gross Salaries | Payroll run |
| Required | 6010 | Overtime Expense | 733x payroll | Payroll run |
| Required | 6020 | Allowances Expense | 7333 Allowances | Payroll run |
| Required | 6030 | Employer Statutory Expense | 7334 Employer SSF | Payroll run |
| Required | 2300 | PAYE Tax Payable | 3414 PAYE Payable | Payroll |
| Required | 2310 | Payroll Deductions Payable | 3412–3413 SSNIT employee | Payroll |
| Required | 2315 | Employer Statutory Payable | 3412–3413 SSNIT employer | Payroll |

---

## Tier 2 — Settlement accounts (cash/bank leaves)

Used when recording **payments**, **tills**, and **fund transfers**. Not control accounts — selected per transaction.

| SVR need | SVR code (today) | Purpose | QBO (your framework) |
|:--------:|------------------|---------|----------------------|
| Required | 1111 | Main Cash (till) | 1141–1144 Main Cash per branch |
| Optional | 1112 | Petty Cash | Petty cash in QBO |
| Optional | 1113 | LPO Cash | 1131–1134 LPO per branch |
| Optional | 1100 + extra leaves | Bank / MoMo per branch | 1111–1114 Absa, 1151–1154 MOMO |

**Minimum:** 1 default bank (`1100`) + 1 till cash per active branch (`1111` or branch-specific leaf).

---

## Tier 3 — Supporting accounts (only if you use the feature)

| SVR need | SVR code | Purpose | QBO |
|:--------:|----------|---------|-----|
| Optional | 3200 | Retained Earnings | 4300 Retained Earnings |
| Optional | 1900 / 2900 | Inter-branch due from/to | Due from/to branches |
| Optional | 1250 | Accrued Revenue | Accrued revenue |
| Optional | 2050 | Accrued Liabilities | 3400 Accrued Liabilities |
| Optional | 1710 / 1720 | Fixed assets | 2000–2090 PPE |
| Optional | 5900 | Inventory shrinkage | Shrinkage expense |
| Headers only | A000, L000, I000, E000, Q000 | Category parents | QBO hierarchy headers — never post |

---

## QBO only — your full framework (not in SVR)

| Range | Contents |
|-------|----------|
| 1110–1150 | Full bank / cash / LPO / MOMO tree (detail) |
| 1300–1334 | Staff loans, salary advances |
| 1400–1480 | Inventory categories (SVR uses single 1500) |
| 2000–2180 | PPE, accumulated depreciation |
| 3200–3230 | Corporate loans |
| 3300–3478 | Tax splits, payroll accrual detail, vendor accruals |
| 4000–4500 | Equity detail |
| 5100–5630 | Revenue by line of business |
| 6100–6230 | COGS detail |
| 7100–7373 | Operating & admin expenses |
| 8000–9000 | Other income, adjustments |

---

## Invoice line types → QBO Items (not SVR GL)

SVR posts revenue to **4000** rollup. QBO detail via Items:

| SVR line type | QBO Item (auto) | Your QBO income account |
|---------------|-----------------|-------------------------|
| labor | SVR Labor Revenue | 5210–5260 Labour sales |
| part | SVR Parts Revenue | 5310–5380 Materials |
| fee | SVR Service Fee Revenue | 5410–5450 Services |
| sublet | SVR Sublet Service Revenue | 5500+ (confirm revenue vs cost) |
| discount | SVR Sales Discount | Contra-revenue |
| other | SVR Miscellaneous Revenue | 699 / misc |

---

## Branch handling (simple rule)

| Question | Answer |
|----------|--------|
| Branch P&L in QBO? | **QBO Department** per branch (Kumasi, Accra, …) |
| Branch revenue GL? | **No** — do not use 698K/T/698TM style accounts |
| Branch bank/MOMO? | **QBO** has full 111x–115x tree; **SVR** only needs leaves you actually pay into |
| Branch tag in SVR? | `JournalEntry.branch` + invoice branch — for internal reports only |

---

## What to verify in SVR (after DB cleanup)

Based on your recent cleanup (60 GL accounts preserved, Kumasi HQ, QBO disconnected):

1. **Accounting → Controls** — all 24 controls wired (none blank).
2. **Chart of accounts** — ~45–60 active accounts; no owner 650-tree imported.
3. **Accounting → Controls → QBO mapping** — likely empty or stale until QBO reconnected.
4. **Admin → Branches** — Kumasi mapped to QBO Department when QBO is back.
5. **Tills** — at least one till-enabled cash account (`1111`).

---

## Decision rule

> **SVR auto-posts it → lean SVR account + QBO mapping.**  
> **Accountant enters it in QBO → QBO only.**

---

*Generated from `setup_chart_of_accounts.py`, `control_accounts.py`, and `owner_coa_specs.py`.*
