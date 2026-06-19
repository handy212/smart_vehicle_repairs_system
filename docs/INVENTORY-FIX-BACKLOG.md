# Inventory Suite — Prioritized Fix Backlog

**Module:** Inventory  
**Last updated:** June 2026  
**Related:** [Inventory Feature Guide](./INVENTORY-FEATURE-GUIDE.md)

---

## P0 — Must fix before go-live

| ID | Item | Status |
|----|------|--------|
| INV-P0-01 | Map stock mutations to `adjust_inventory` / `manage_inventory` on `PartViewSet` | Done |
| INV-P0-02 | Transfer mutations accept `transfer_inventory` OR `manage_inventory` | Done |
| INV-P0-03 | Fix phantom frontend permissions (`create_inventory`, `manage_bundles`, etc.) | Done |
| INV-P0-04 | Add inventory `layout.tsx` with area permission guard | Done |
| INV-P0-05 | Branch-filter `InventoryTransactionViewSet` and `PurchaseOrderItemViewSet` | Done |
| INV-P0-06 | Register `StockAlertViewSet` at `/api/inventory/stock-alerts/` | Done |
| INV-P0-07 | Import `logger` for transfer notification failures | Done |
| INV-P0-08 | Include `IsModuleEnabled('inventory')` on all ViewSet permission paths | Done |

---

## P1 — Professional polish

| ID | Item | Status |
|----|------|--------|
| INV-P1-01 | Dashboard requirements nav: PO create/receive use correct permissions | Done |
| INV-P1-02 | PO create/receive frontend guards | Done |
| INV-P1-03 | Fix categories `StatsGrid` render bug | Done |
| INV-P1-04 | Category CRUD guarded with `manage_categories` | Done |
| INV-P1-05 | Stock alerts UI at `/inventory/alerts` | Done |
| INV-P1-06 | Parts Requests added to sub-nav | Done |
| INV-P1-07 | Supplier activate/deactivate require `manage_suppliers` | Done |
| INV-P1-08 | Part detail: adjust uses `adjust_inventory`, edit uses `edit_parts` | Done |
| INV-P1-09 | `receive_parts` OR `manage_inventory` on PO item receive | Done |
| INV-P1-10 | Manager role granted `transfer_inventory` | Done |

---

## P2 — Completeness

| ID | Item | Status |
|----|------|--------|
| INV-P2-01 | Permission tests (`test_inventory_permissions.py`) | Done |
| INV-P2-02 | Inventory feature guide + fix backlog docs | Done |
| INV-P2-03 | Service Packages admin UI | Open |
| INV-P2-04 | Standalone transaction browser | Open |
| INV-P2-05 | Consolidate export stubs on PO/transfers/suppliers | Open |
