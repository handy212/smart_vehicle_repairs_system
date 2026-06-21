# Smart Vehicle Repairs (SVR) ↔ QuickBooks Online Integration

This guide describes how SVR connects to QuickBooks Online (QBO), what is synchronized, what is intentionally excluded, and how to configure and operate the integration.

## Architecture principle

SVR runs its own general ledger (GL) internally via the `accounting` app. The QBO integration is a **document bridge** — it pushes business documents to QuickBooks and pulls selective status/payment updates back. **Journal entries are not synced to QBO.** Pushing GL postings alongside documents would double-count revenue, expenses, and balances in QuickBooks.

| Layer | SVR | QBO |
|-------|-----|-----|
| General ledger | Source of truth | Not synced |
| Business documents | Source of truth for operational data | Receives outbound pushes |
| Payment/status facts | Updated from QBO when QBO is ahead | Pulled for matched records only |

## Connection and configuration

### OAuth connection

1. Create a QBO app in the [Intuit Developer Portal](https://developer.intuit.com/).
2. Set redirect URI to your SVR backend callback (e.g. `https://your-domain/api/quickbooks/callback/`).
3. In SVR: **Admin → Integrations → QuickBooks** — enter Client ID and Client Secret, then **Connect**.
4. After OAuth, `realm_id` and tokens are stored in `QBOConfig` / `QBOToken`.

### Webhooks (optional, recommended)

1. In the Intuit app, configure the webhook URL: `https://your-domain/api/quickbooks/webhook/`.
2. Copy the verifier token into SVR system setting `quickbooks_webhook_token` (Admin → Integrations).
3. Webhooks queue targeted inbound pulls when QBO entities change.

### Mappings (required for accurate sync)

Configure under **Admin → Integrations** and **Accounting → Controls**:

| Mapping kind | Purpose |
|--------------|---------|
| Control accounts | AR, AP, revenue, expense, bank, tax payable, etc. |
| Invoice line types | QBO Items for labor, parts, fees, discounts |
| Payment methods | QBO deposit accounts for customer payments |
| Vendor payment methods | QBO accounts for bill payments |
| Bill line kinds | Inventory vs expense accounts for PO/AP bill lines |
| Tax codes | Composite or per-levy Ghana tax codes (VAT, NHIL, GETFund, HRL) |
| Branch → Department | SVR branches map to QBO Departments (Locations) |

## Outbound sync (SVR → QBO)

Automatic sync runs on `post_save` when `QUICKBOOKS_AUTO_SYNC_ENABLED` is true (default in production). Manual push is available on entity detail pages and via `POST /api/quickbooks/sync-outbound/`.

### Accounts receivable (customer documents)

| SVR entity | QBO object | Sync when status is |
|------------|------------|------------------------|
| Customer | Customer | Has `customer_number` |
| Estimate | Estimate | `sent`, `viewed`, `approved` |
| Invoice | Invoice | `sent`, `viewed`, `partial`, `paid`, `overdue`, `open` |
| Payment | Payment | `completed` |
| Credit note | Credit Memo | `issued`, `applied` (and `refunded` in policy) |

### Accounts payable (vendor documents)

| SVR entity | QBO object | Sync when status is |
|------------|------------|------------------------|
| Supplier | Vendor | Always (on save) |
| Purchase order | Bill | Not `draft`, `pending_approval`, `rejected`, `cancelled` |
| Vendor bill (`billing.Bill`) | Bill | Not `draft`, `pending_approval`, `rejected`, `void` |
| Vendor credit | Vendor Credit | `issued`, `applied` |

### Other

| SVR entity | QBO object | Notes |
|------------|------------|-------|
| Branch | Department | Location / class tracking |

### Outbound logging

Each outbound Celery task writes a `QBOSyncLog` row with `direction=outbound`. Per-entity sync status is stored in `QBOMapping` (`synced`, `failed`, `pending`) and exposed on API serializers as `qbo_sync_status` / `qbo_sync_error` when QBO is connected.

## Inbound sync (QBO → SVR)

Inbound sync **never creates** new operational records from QBO (except new suppliers from vendor pull). It updates status, payment amounts, or sync metadata on **existing** mapped records.

| Pull task | QBO source | SVR target | Fields updated |
|-----------|------------|------------|----------------|
| `pull_vendors` | Vendor | Supplier | Creates new suppliers only; existing data preserved |
| `pull_invoices` | Invoice | Invoice | `amount_paid`, `amount_due`, `status` (when QBO is ahead) |
| `pull_bills` | Bill | Purchase order **or** vendor bill | PO → `received`; vendor bill → payment amounts/status |
| `pull_estimates` | Estimate | Estimate | `status` from QBO `TxnStatus` |
| `pull_credit_memos` | Credit Memo | Credit note | `applied` when `RemainingCredit` is zero |
| `pull_vendor_credits` | Vendor Credit | Vendor credit | `applied` when remaining credit is zero |

Triggered by:

- Celery Beat / manual **Pull from QBO** (Admin → Integrations)
- `task_full_inbound_sync` (all pulls sequentially)
- QBO webhooks (entity-specific pulls)

## API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/quickbooks/status/` | GET | Connection status |
| `/api/quickbooks/connect/` | GET | Start OAuth (browser redirect) |
| `/api/quickbooks/disconnect/` | POST | Disconnect |
| `/api/quickbooks/sync-inbound/` | POST | Queue full inbound pull |
| `/api/quickbooks/sync-outbound/` | POST | Push one entity (`entity_type`, `object_id`, optional `inline`) |
| `/api/quickbooks/sync-logs/` | GET | Sync history |
| `/api/quickbooks/accounts/` | GET | QBO chart of accounts (for mapping UI) |
| `/api/quickbooks/items/` | GET | QBO items |
| `/api/quickbooks/tax-codes/` | GET | QBO tax codes |
| `/api/quickbooks/webhook/` | POST | Intuit webhook receiver |

### Outbound `entity_type` values

`customer`, `invoice`, `payment`, `supplier`, `purchase_order`, `vendor_bill`, `vendor_credit`, `branch`, `estimate`, `credit_note`

## Frontend UI

- **Admin → Integrations**: connect/disconnect, inbound pull, sync history, account mappings
- **Entity detail pages**: QBO sync badge, manual push button, error display on:
  - Customers, invoices, payments, estimates, credit notes
  - Suppliers, purchase orders, vendor bills, vendor credits

## Tax handling (Ghana)

Outbound invoices, estimates, and credit memos apply QBO tax via `TxnTaxDetail`:

1. **Composite** tax code mapping is preferred when configured.
2. If composite is not mapped, the first levy with a non-zero amount and a mapped code is used (VAT, NHIL, GETFund, HRL).
3. `TotalTax` is set from SVR `tax_amount`.

Per-line multi-levy `TaxLine` arrays are not implemented; use a composite QBO tax code that matches your Ghana setup when all levies apply together.

## What is not synced

| SVR feature | Reason |
|-------------|--------|
| `JournalEntry` / GL postings | Would duplicate document sync in QBO |
| Work orders, vehicles, appointments | Operational data outside QBO scope |
| Hubtel / Paystack payment webhooks | Separate payment gateways; only completed `Payment` records push to QBO |
| Creating invoices/POs from QBO | SVR is document source of truth |

## Operations checklist

After deploy or migration:

```bash
python manage.py migrate quickbooks_online
```

1. Connect QBO under Admin → Integrations.
2. Set webhook verifier token (production).
3. Map control accounts, invoice line items, tax codes, and branches.
4. Run a sandbox test: create customer → estimate → invoice → payment; create supplier → PO or vendor bill.
5. Confirm sync history shows inbound/outbound runs and `QBOMapping` rows reach `synced`.

## Code map

| Path | Role |
|------|------|
| `apps/quickbooks_online/services.py` | OAuth, all `sync_*` and `pull_*` methods |
| `apps/quickbooks_online/sync_policy.py` | Status-gated outbound eligibility |
| `apps/quickbooks_online/outbound_log.py` | Outbound `QBOSyncLog` helper |
| `apps/quickbooks_online/signals.py` | Auto-sync on save |
| `apps/quickbooks_online/tasks.py` | Celery tasks |
| `apps/quickbooks_online/api_views.py` | Mapping APIs, outbound sync, sync logs |
| `apps/quickbooks_online/views.py` | OAuth, webhook, inbound trigger |
| `apps/quickbooks_online/mapping_services.py` | Account/item/tax resolution |
| `frontend/lib/api/quickbooks.ts` | Frontend API client |

## Testing

```bash
SECRET_KEY=test DATABASE_URL=sqlite:///test.db pytest apps/quickbooks_online/ --no-cov
```

## Version history

| Phase | Scope |
|-------|--------|
| Phase 1 | Branch mapping, account mappings, outbound retry API, OAuth hardening |
| Phase 2 | Estimates, credit memos, tax codes, sync log API/UI |
| Document hardening | Status policy, outbound logs, payment/customer/PO UI |
| Phase 3 (AP) | Vendor bills, vendor credits, extended inbound pulls |
