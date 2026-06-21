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

Automatic sync runs on save when `QUICKBOOKS_AUTO_SYNC_ENABLED` is true (default). In development, `QUICKBOOKS_SYNC_INLINE=true` (default when `DEBUG`) runs sync in a **background thread** after the DB commit so API requests are not blocked waiting on QuickBooks. Use a Celery worker in production (`QUICKBOOKS_SYNC_INLINE=false`). Manual **Retry QBO sync** uses `inline: true` on the sync API and waits for completion.

### Duplicate prevention (QBO API alignment)

Intuit expects **update-in-place** using the stored QBO `Id` and latest `SyncToken`. SVR enforces this as follows:

| Mechanism | Purpose |
|-----------|---------|
| **`QBOMapping`** | One QBO `Id` per SVR row (`unique_together` on content type + object id) |
| **Entity resolver** | Outbound sync: GET by mapped id → query by `DocNumber` / SKU / `DisplayName` → create only when no match exists |
| **No blind re-create** | If a mapped QBO id is missing and no natural-key match is found, sync **fails** instead of creating a duplicate document |
| **Outbound sync lock** | Cache lock per entity prevents concurrent Celery/manual sync from double-creating |
| **`transaction.on_commit`** | All auto-sync signals schedule work after DB commit (same pattern as parts) |
| **Inbound vendor import** | New suppliers from QBO pull suppress outbound signals so SVR does not push a duplicate Vendor back |
| **PDF attachments** | Uploaded only on **first** QBO create for invoices/estimates, not every update |
| **Part debounce** | Rapid part + stock saves coalesce into one Item sync within 5 seconds |

If duplicates already exist in QBO, delete or merge them in QuickBooks, then clear the failed `QBOMapping` in SVR and retry sync so the resolver can re-link by document number.

### Accounts receivable (customer documents)

| SVR entity | QBO object | Sync when status is |
|------------|------------|------------------------|
| Customer | Customer | Has `customer_number` |
| Estimate | Estimate | `sent`, `viewed`, `approved` |
| Invoice | Invoice | `sent`, `viewed`, `partial`, `paid`, `overdue`, `open` |
| Payment | Payment | `completed` |
| Credit note | Credit Memo | `issued`, `applied` (and `refunded` in policy) |

### Accounts payable (vendor documents)

| SVR entity | QBO object | Sync when / notes |
|------------|------------|-------------------|
| Supplier | Vendor | On save |
| **Purchase order** | — | **Not pushed to QBO.** Receive in SVR, then create the **vendor bill** from the PO. |
| **Vendor bill** (`billing.Bill`) | Bill | Open or paid; **one QBO Bill per PO flow** — updates the existing PO bill if one was created earlier |
| Vendor credit | Vendor Credit | `issued`, `applied` |

**PO → Bill workflow:** SVR inventory receive updates stock. AP is recorded on the **vendor bill** (Billing → Bills). That bill syncs to QBO. If a QBO Bill already exists from an older PO push (`DocNumber` = PO number), the vendor bill sync **updates that same QBO Bill** instead of creating `BILL-…-000001` as a duplicate.

### Other

| SVR entity | QBO object | Notes |
|------------|------------|-------|
| Branch | Department | Location / class tracking |
| Part (catalog) | Item (`Inventory`, `NonInventory`, or `Service`) | Type set per part; Inventory items sync qty on hand to QBO |

### Phase 4: items, deposits, payment allocation, attachments

| Feature | Behavior |
|---------|----------|
| **Part → QBO Item** | Outbound push creates/updates a QBO Item matching the part's **item type** (`Inventory`, `NonInventory`, or `Service`). Deactivating a part sets `Active=False` in QBO. Inventory parts include `QtyOnHand` (sum of branch stock), `AssetAccountRef`, COGS, and sales accounts. SKU = `part_number`. |
| **Inbound item metadata** | `pull_items` / webhook `item` events update mapped Part name, SKU, active flag, item type, cost, and price — **not** branch-level stock (SVR remains source of truth for multi-branch qty). |
| **Customer deposits** | Payments against **proforma** or **PRO-numbered partial** invoices push as **unapplied** QBO Payments (no `LinkedTxn`). `PrivateNote` is tagged as an SVR customer deposit. |
| **Deposit-stage invoices** | **Proforma** and **PRO-numbered partial** invoices are **not** pushed to QBO until converted to an issued invoice (sent, viewed, paid, etc.). |
| **Payment allocation** | When `PaymentAllocation` rows exist, they take precedence over the deposit check — QBO receives one `PaymentLine` per allocated invoice. Changing allocations re-triggers payment sync. Sync **fails** if any target invoice is not in QBO (no silent unapplied payments). |
| **Invoice finalization** | When a proforma/deposit invoice moves to a finalized status, SVR runs a **chained** task: sync the issued invoice to QBO first, then re-push completed payments so `LinkedTxn` lines apply correctly. |
| **PDF attachments** | After a successful invoice or estimate push, SVR renders the document PDF and uploads it as a QBO `Attachable` linked to the synced transaction. |

**Intentionally not synced:** multi-branch stock breakdown, transfers between branches, and inventory adjustment audit detail remain SVR-only. QBO receives **total** qty on hand for Inventory-type parts only.

### Catalog item types (Inventory / Non-inventory / Service)

Each **Part** has a catalog `item_type` (distinct from billing line types like labor/part/fee):

| Catalog type | Stock in SVR | PO receive | WO allocate | QBO Item.Type |
|--------------|--------------|------------|-------------|---------------|
| **Inventory** | Yes | Updates qty on hand | Issues stock | `Inventory` |
| **Non-inventory** | No | Receipt only (no stock txn) | Marks ready without stock move | `NonInventory` |
| **Service** | No | Cannot add to PO | Marks ready without stock move | `Service` |

**Billing documents** (invoices, estimates, proformas): picking a catalog part sets the billing line type automatically — physical/non-inventory parts → `part`, service parts → `other`. When a line has a `part` FK, QBO sync uses the linked Part's QBO Item regardless of billing line type.

**Vendor bills / credits:** AP account routing uses the linked part's catalog type (`tracks_inventory()`), not merely whether `inventory_item` is set.

Configure part types under **Inventory → Products & services** (typed create flow). Map QBO accounts under **Accounting → Controls → QuickBooks mapping**.

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
| `pull_items` | Item | Part (mapped only) | `name`, `part_number` (SKU), `is_active` — no quantities |

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

`customer`, `invoice`, `payment`, `supplier`, `purchase_order`, `vendor_bill`, `vendor_credit`, `branch`, `estimate`, `credit_note`, `part`

## Frontend UI

- **Admin → Integrations**: connect/disconnect, inbound pull, sync history, account mappings
- **Entity detail pages**: QBO sync badge, manual push button, error display on:
  - Customers, invoices, payments, estimates, credit notes
  - Suppliers, purchase orders, vendor bills, vendor credits, **parts (catalog)**

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
| Multi-branch stock quantities / transfers | SVR `StockItem` and transfers are source of truth; QBO Items are catalog metadata only |
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
| `apps/quickbooks_online/item_sync.py` | Part catalog ↔ QBO Item sync |
| `apps/quickbooks_online/payment_helpers.py` | Payment line building, deposit detection, invoice-link validation |
| `apps/quickbooks_online/attachment_sync.py` | PDF attachables for invoices and estimates |
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

## Phase 4 UI testing checklist (SVR + QBO sandbox)

Use a **QuickBooks sandbox company** connected under **Admin → Integrations → QuickBooks**. Ensure Celery is running if you rely on background auto-sync; otherwise use each entity’s **Sync QBO** button for immediate pushes.

### Prerequisites

1. **Admin → Integrations** — QBO connected (status shows connected + realm).
2. **Accounting → Controls → QuickBooks mapping** tab — map at minimum:
   - Sales revenue + default expense accounts (for Part Items)
   - Invoice line types (labor, part, fee, …)
   - Payment method → deposit account (for non-cash payments use a bank account on the payment)
   - Branch → QBO Department (if you use branch tracking)
3. **Admin → Integrations → Sync history** — keep open to confirm outbound/inbound runs.

---

### 1. Part catalog → QBO Item

| Step | SVR UI | What to expect |
|------|--------|----------------|
| 1 | **Inventory → New part** (or open existing **Inventory → [part]**) | Set **QuickBooks item type** (Inventory / Non-inventory / Service). Inventory parts can set opening qty. |
| 2 | Confirm **Accounting → Controls → QuickBooks mapping** includes **Sales Revenue** (Income → Sales of Product Income), **Cost of Goods Sold** (COGS → Supplies and Materials), and **Inventory Asset** (Other Current Asset → Inventory) for Inventory parts | Required for Part → QBO Item sync; wrong account types are rejected before push |
| 3 | Part detail header | **QBO: synced** badge (or **failed** with error text) |
| 3 | Click **Sync QBO** | Toast success; badge updates after refresh |
| 4 | Adjust stock or receive a PO | Inventory-type parts re-sync **total qty on hand** to QBO when auto-sync is enabled |
| 5 | Create/send an **invoice** with a line linked to that part | Line should use the synced QBO Item (not only generic line-type mapping) |

**Verify in QBO:** **Sales → Products and services**. Find Item named like `PARTNO — Part Name`. **Inventory** parts show qty on hand matching SVR total stock across branches; **Non-inventory** and **Service** parts do not track qty in QBO.

---

### 2. Customer deposit (proforma prepayment)

| Step | SVR UI | What to expect |
|------|--------|----------------|
| 1 | **Billing → Proformas → New** (or invoice with status **Proforma**) | Invoice number like `BRANCH-PRO000001` |
| 2 | Record a **completed payment** on that proforma (use **check/ACH** with a mapped bank account, not raw cash without a till) | Invoice may move to **Partial**; payment detail shows QBO badge |
| 3 | Open **Billing → Payments → [payment]** → **Sync QBO** | Status **synced** (or **failed** with message) |

**Verify in QBO:** **Sales → All sales → Receive payment** (or **Customers → [customer] → Receive payment**). Payment exists as **unapplied** (customer credit / not linked to an invoice). Open the payment → **Private note** should include `SVR customer deposit (proforma / prepayment)`.

**Finalize deposit (apply to real invoice):**

| Step | SVR UI | What to expect |
|------|--------|----------------|
| 4 | On proforma invoice → **Convert to Invoice** (or issue/finalize to **Sent**) | Invoice gets real invoice number |
| 5 | Wait for auto-sync or **Sync QBO** on invoice, then on payment | Payment re-sync applies to QBO invoice |

**Verify in QBO:** Same payment now shows **Applied** amount linked to the QBO **Invoice** (not unapplied).

---

### 3. Payment allocation (multi-invoice)

| Step | SVR UI | What to expect |
|------|--------|----------------|
| 1 | Ensure **two sent invoices** for same customer are **synced** to QBO first | Both show **QBO: synced** on invoice detail |
| 2 | Record one payment and **allocate** across both invoices (payment allocations UI/API) | Allocations sum to payment amount |
| 3 | **Billing → Payments → [payment]** → **Sync QBO** | **synced** |

**Verify in QBO:** Open the **Payment** → multiple **Invoice** links, each with the allocated amount.

**Negative test:** Sync a payment against an invoice **not** in QBO → SVR shows **QBO: failed** with message like *invoice is not synced to QuickBooks*.

---

### 4. PDF attachments (invoice & estimate)

| Step | SVR UI | What to expect |
|------|--------|----------------|
| 1 | **Billing → Estimates** — send/approve estimate → **Sync QBO** | Estimate **synced** |
| 2 | **Billing → Invoices** — finalize invoice → **Sync QBO** | Invoice **synced** |

**Verify in QBO:**

- **Sales → Estimates** → open synced estimate → **Attachments** (paperclip) → PDF named `estimate_EST-….pdf`
- **Sales → Invoices** → open synced invoice → **Attachments** → PDF named `invoice_INV-….pdf`

If PDF generation fails server-side, the QBO transaction still syncs; attachment is skipped (check backend logs).

---

### 5. Sync history & troubleshooting

| SVR location | Purpose |
|--------------|---------|
| **Admin → Integrations** | Connection, manual **Pull from QBO**, sync log panel |
| Entity detail **QBO** badge | `synced` / `failed` / `un-synced` |
| Failed entity | Red error text on payment, part, invoice, etc. |

| Common failure | Fix |
|----------------|-----|
| Part sync failed | Map **Sales Revenue** and/or **Purchases / Operating Expense** control accounts in Integrations (or map invoice line type **Part** to a QBO Item with accounts) |
| Payment blocked | Sync target invoice(s) to QBO first |
| No QBO badge | QBO not connected, or refresh page |
| Auto-sync delayed | Start Celery worker, or use **Sync QBO** manually |

---

### Quick QBO navigation map

| SVR entity | QBO menu path |
|------------|----------------|
| Part | **Sales → Products and services** |
| Customer | **Sales → Customers** |
| Estimate | **Sales → Estimates** |
| Invoice | **Sales → Invoices** |
| Payment / deposit | **Sales → All sales** or **Customers → Receive payment** |
| Supplier | **Expenses → Vendors** |
| PO / vendor bill | **Expenses → Bills** |
| Credit note | **Sales → Credit memos** |
| Branch | **Settings → Account and settings → Advanced → Categories → Locations** (Departments) |

## Version history

| Phase | Scope |
|-------|--------|
| Phase 1 | Branch mapping, account mappings, outbound retry API, OAuth hardening |
| Phase 2 | Estimates, credit memos, tax codes, sync log API/UI |
| Document hardening | Status policy, outbound logs, payment/customer/PO UI |
| Phase 3 (AP) | Vendor bills, vendor credits, extended inbound pulls |
| Phase 4 | Part Items, customer deposits, payment allocation validation, PDF attachments |
