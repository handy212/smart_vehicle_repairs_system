# Owner Legacy COA ↔ SVR/QBO Mapping Guide

This document implements the **SVR vs QBO Chart of Accounts Separation Plan**. SVR keeps a lean operational GL (~45 accounts). The owner's ~250-account workshop chart lives in QuickBooks Online and is reached through document sync and mappings—not by importing the full tree into SVR.

## Architecture

| Layer | Role |
|-------|------|
| **SVR GL** | Source of truth for workshop operations (invoices, bills, payments, inventory, payroll) |
| **QBO** | Owner's detailed chart for management and statutory reporting |
| **Bridge** | Documents + Items + Departments push to QBO; journal entries never sync |

## SVR accounts (Bucket A)

Run once after deploy:

```bash
python manage.py setup_chart_of_accounts
python manage.py wire_accounting_controls
```

Or via API: `POST /api/accounting/control/wire/`

The lean chart is defined in [`apps/accounting/management/commands/setup_chart_of_accounts.py`](../apps/accounting/management/commands/setup_chart_of_accounts.py) and wired through 17 control accounts in [`apps/accounting/control_accounts.py`](../apps/accounting/control_accounts.py).

**Do not** import owner accounts 651–699, branch sales (698K/T/698TM), or vendor-named GL accounts into SVR.

## QBO setup (Bucket B + C)

### 1. Import owner chart into QBO

Import the owner's chart in QuickBooks (or create manually). Apply these corrections in QBO:

| Issue | Action |
|-------|--------|
| Sub-Contractors (685–697) as Income | Customer invoice → service/labour revenue; subcontractor payment → COGS/expense |
| Branch sales (698K/T/698TM) | Use QBO Department per branch, not separate revenue GL |
| 802 Discount Allowed (expense) | Use contra-revenue (Sales Returns) for invoice discounts |
| Missing Customer Prepayments | Create liability account (see supplemental setup below) |

### 2. Create supplemental QBO accounts

```bash
python manage.py setup_owner_qbo_chart
python manage.py setup_owner_qbo_chart --dry-run   # preview
```

Creates: Customer Prepayments, Sales Returns and Allowances, Work in Progress (optional).

### 3. Apply auto-mappings

```bash
python manage.py apply_owner_qbo_mappings --wire-svr
python manage.py apply_owner_qbo_mappings --dry-run
python manage.py apply_owner_qbo_mappings --overwrite   # replace existing mappings
```

Or via API when QBO is connected:

```http
POST /api/quickbooks/account-mappings/apply-owner-template/
{
  "wire_svr": true,
  "dry_run": false,
  "overwrite": false
}
```

### 4. Mapping matrix (SVR control → owner QBO)

| SVR control field | Owner QBO target (match patterns) |
|-------------------|-----------------------------------|
| `accounts_receivable_account` | 120 · Accounts Receivable |
| `accounts_payable_account` | 400 · Accounts Payable |
| `customer_prepayment_account` | Customer Prepayments (supplemental) |
| `sales_revenue_account` | 650 · Operating Service/Sales Revenue |
| `sales_discount_account` | Sales Returns and Allowances (not 802) |
| `sales_tax_payable_account` | 2553 / GRA Tax Liability |
| `input_tax_account` | 252 · Withholding Tax Receivable |
| `withholding_tax_payable_account` | 429 · Withholding Tax Payable |
| `inventory_asset_account` | Stock:12100 · Inventory Asset |
| `cost_of_goods_sold_account` | 700 · Cost of Goods Sold |
| `default_expense_account` | 800 / Purchases rollup |
| `default_bank_account` | 118.x · Absa / operating bank |
| `till_counterparty_cash_account` | Main Cash / Petty Cash |

Payment methods and SVR bank/till accounts map to owner 100-series via `payment_method` and `svr_account` rows.

### 5. Invoice line types → QBO Items

| SVR line type | QBO Item (auto-created) | Income account |
|---------------|-------------------------|----------------|
| `labor` | SVR Labor Revenue | 655/658 Labour |
| `part` | SVR Parts Revenue | 661 Materials |
| `fee` | SVR Service Fee Revenue | 679 Services |
| `sublet` | SVR Sublet Service Revenue | 679/681 (not 685) |
| `discount` | SVR Sales Discount | Sales Returns |
| `other` | SVR Miscellaneous Revenue | 699 Miscellaneous |

Part catalog lines use linked Part QBO Items when synced.

### 6. Branches → QBO Departments

Branches link by city/name (Kumasi, Takoradi, Tamale, Accra). Configure in **Branches → QBO mapping** or run `apply_owner_qbo_mappings`.

## Validation checklist

After mapping:

1. Issue a test invoice per branch with labor, part, and fee lines.
2. Confirm SVR GL: Dr AR / Cr 4000 (+ tax, COGS Dr 5100 Cr 1500).
3. Confirm QBO invoice shows Item detail and Department—not branch sales GL accounts.
4. Post a payment; confirm deposit account matches branch bank/MoMo mapping.

Run tests:

```bash
pytest apps/quickbooks_online/test_owner_coa_separation.py apps/accounting/tests/test_posting_standard.py --no-cov
```

## Go-live checklist

Before production cutover, complete **[OWNER-QBO-GO-LIVE-CHECKLIST.md](OWNER-QBO-GO-LIVE-CHECKLIST.md)** (branch smoke tests + owner/accountant sign-off).

## Reference modules

- Match patterns: [`apps/quickbooks_online/owner_coa_specs.py`](../apps/quickbooks_online/owner_coa_specs.py)
- Setup service: [`apps/quickbooks_online/owner_coa_services.py`](../apps/quickbooks_online/owner_coa_services.py)
- QBO integration guide: [`docs/QBO-INTEGRATION-GUIDE.md`](QBO-INTEGRATION-GUIDE.md)
