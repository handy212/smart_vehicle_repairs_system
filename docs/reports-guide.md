# Reports Guide

## Branch scoping

| Module | Behavior |
|--------|----------|
| Accounting financial reports | `X-Branch-ID` / active branch via `get_report_branch_id`; superuser without branch sees consolidated |
| Accounting budgets | Current branch **or** company-wide (`branch` null) |
| Inventory compliance (`/api/inventory/reports/*`) | Active branch from `resolve_branch`; single-branch users default to their branch |
| Reporting hub (`/api/reporting/*`) | `_filter_branch_queryset` on work orders, invoices, payments |
| Consolidated reports | Branch P&L scorecard, consolidated P&L — all active branches by design |

## Date fields

| Report | Primary date |
|--------|----------------|
| Revenue (reporting) | Payment `payment_date` for period breakdown; invoice dates for totals |
| Profit & loss | Journal entry / GL period |
| Job profitability | Work order / invoice dates in range |
| Inventory shrinkage / control | `InventoryTransaction.created_at` |
| Physical count accuracy | `PhysicalCountSession.completed_at` |

## Inventory compliance formulas

**Accuracy** (`inventory-accuracy`): percent of count lines where `physical_quantity == system_quantity` (see response `meta`).

**Inventory control** (`inventory-control`): percent of sale transactions in period linked to work orders in approved-or-later statuses (see response `meta`).

## UI entry points

- **Accounting**: `/accounting/reports/*`, management pack, general ledger
- **Inventory**: `/inventory/reports/compliance`, `/inventory/physical-counts`
- **Reporting hub**: `/reports`, `/reports/operations`
