# Inventory Feature Guide

**Module:** Inventory  
**Last updated:** June 2026  
**Related:** [Inventory Fix Backlog](./INVENTORY-FIX-BACKLOG.md)

---

## Overview

The inventory module manages parts catalog, branch stock levels, procurement (purchase orders), inter-branch transfers, physical counts, stock alerts, and compliance reporting.

---

## Key permissions

| Permission | Use |
|------------|-----|
| `view_inventory` | Browse parts, POs, transfers, counts |
| `view_suppliers` | Supplier directory |
| `create_parts` / `edit_parts` / `delete_parts` | Part catalog CRUD |
| `adjust_inventory` | Stock adjustments, reserve/release |
| `import_inventory` | Excel part import |
| `manage_inventory` | Full inventory admin (receive PO, counts, alerts) |
| `manage_suppliers` | Supplier CRUD, activate/deactivate |
| `manage_categories` | Part category admin |
| `create_purchase_orders` / `edit_purchase_orders` | PO drafting |
| `approve_purchase_orders` | PO approval workflow |
| `receive_parts` | Receive stock from POs |
| `transfer_inventory` | Create/approve/ship/receive transfers |
| `view_low_stock_alerts` | Stock alerts dashboard |
| `view_inventory_reports` | Part-level analytics reports |

Managers with `manage_inventory` can run transfers even without explicit `transfer_inventory`.

---

## Main workflows

### Parts & stock
1. Create parts in catalog (`create_parts`).
2. Stock lives in `StockItem` per branch.
3. Adjust via part detail or physical count reconcile (`adjust_inventory` or `manage_inventory`).

### Purchase orders
1. Create PO (`create_purchase_orders`).
2. Submit → approve (`approve_purchase_orders`).
3. Confirm with supplier (`manage_inventory`).
4. Receive items (`receive_parts` or `manage_inventory`).

### Transfers
1. Create transfer between branches (`transfer_inventory` or `manage_inventory`).
2. Submit for approval → approve → ship → receive at destination.

### Physical counts
1. Create session (`manage_inventory`).
2. Add count lines, reconcile variances (posts adjustments).

### Stock alerts
- Auto-generated on low/out-of-stock conditions.
- Manage at `/inventory/alerts` (`view_low_stock_alerts`).
- API: `/api/inventory/stock-alerts/`

---

## Frontend routes

| Path | Purpose |
|------|---------|
| `/inventory` | Parts catalog |
| `/inventory/suppliers` | Vendor centre |
| `/inventory/purchase-orders` | PO list & receive |
| `/inventory/transfers` | Inter-branch transfers |
| `/inventory/physical-counts` | Stock counts |
| `/inventory/alerts` | Low-stock alerts |
| `/inventory/quotation-requests` | Stores workbench |
| `/inventory/parts-requests` | WO parts queue |
| `/inventory/reports/compliance` | Compliance hub |
| `/inventory/reports/accounting` | GL / valuation report |
| `/inventory/reorder-reports` | Reorder analysis |

---

## Scheduled jobs

| Command / task | Purpose |
|----------------|---------|
| `check_low_stock_items` (Celery) | Generate stock alerts |

---

## API notes

- All inventory endpoints require the `inventory` module enabled.
- Branch scoping applies to POs, transfers, transactions, PO items, stock items, and alerts.
- Custom part actions enforce granular permissions (adjust, import, reports).
