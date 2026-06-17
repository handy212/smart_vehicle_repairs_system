# Finance Suite — Prioritized Fix Backlog

**Modules:** Accounting · Billing · Fixed Assets  
**Audience:** Product, engineering, implementation  
**Last updated:** June 2026  
**Related:** [Finance Feature Guide](./FINANCE-FEATURE-GUIDE.md) · [Accounting User Guide](./ACCOUNTING-USER-GUIDE.md)

This backlog turns the finance readiness review into actionable work. Items are ordered by **customer impact**, not engineering effort. Each ticket includes acceptance criteria so implementers and QA can verify completion without reading internal architecture docs.

---

## How to use this backlog

| Priority | Meaning | Target |
|----------|---------|--------|
| **P0** | Trust breaker — broken links, blocked workflows, wrong permissions | Before any new customer go-live |
| **P1** | Professional polish — confusing labels, discoverability, inconsistent UX | Next release after P0 |
| **P2** | Completeness — thin workflows that limit role coverage | Following sprint(s) |
| **P3** | Competitive / nice-to-have | Roadmap |

**Status key:** `Open` · `In progress` · `Done`

---

## P0 — Must fix before go-live

### FIN-P0-01 · Fix broken till detail links from Accounting dashboard

| Field | Detail |
|-------|--------|
| **Module** | Accounting |
| **User impact** | Finance users click till alerts on the dashboard and land on a missing page |
| **Affected paths** | `/accounting` (dashboard links to `/accounting/tills/{id}`) |
| **Acceptance criteria** | Every till link from the accounting dashboard opens a working page showing session detail, variance, and actions (approve/review) OR links are removed/redirected to `/accounting/tills` with the correct session highlighted |
| **Status** | Open |

---

### FIN-P0-02 · Align Fixed Assets nav permissions with disposal and transfer pages

| Field | Detail |
|-------|--------|
| **Module** | Fixed Assets |
| **User impact** | Users see Disposals/Transfers in navigation but get blocked when opening the page |
| **Affected paths** | `/fixed-assets/disposals`, `/fixed-assets/transfers`, `sub-nav-groups.ts`, `dashboard-requirements-nav-config.ts` |
| **Acceptance criteria** | Users who can see Disposals/Transfers in nav can open and use those pages; OR nav items are hidden unless user has `edit_assets`; behavior is consistent across sidebar, sub-nav, and dashboard requirements |
| **Status** | Open |

---

### FIN-P0-03 · Correct Customer Statements shortcut on dashboard

| Field | Detail |
|-------|--------|
| **Module** | Dashboard / Billing / Customers |
| **User impact** | “Customer Statements” sends users to the customer list instead of the statements workspace |
| **Affected paths** | `dashboard-requirements-nav-config.ts` — currently `/customers` |
| **Acceptance criteria** | Dashboard Requirements → Customer Statements opens `/customers/statements`; optional secondary link from customer profile remains available |
| **Status** | Open |

---

### FIN-P0-04 · Unify or clearly separate the two refund paths in Billing

| Field | Detail |
|-------|--------|
| **Module** | Billing |
| **User impact** | Staff do not know whether to use Refunds module vs direct refund on payment detail; outcomes differ |
| **Affected paths** | `/billing/refunds/*`, `/billing/payments/[id]`, invoice detail refund dialog |
| **Acceptance criteria** | One documented primary path per scenario (e.g. approval required vs immediate); UI labels explain when to use each; OR direct refund is removed/hidden when formal workflow is enabled; help text added in Finance Feature Guide |
| **Status** | Open |

---

### FIN-P0-05 · Add permission guard to Fixed Assets valuation report

| Field | Detail |
|-------|--------|
| **Module** | Fixed Assets |
| **User impact** | Report may be reachable without `view_assets` page guard |
| **Affected paths** | `/fixed-assets/reports/valuation` |
| **Acceptance criteria** | Page uses same permission guard pattern as other fixed-asset pages; unauthorized users see standard access-denied UI |
| **Status** | Open |

---

## P1 — Should fix (professional polish)

### FIN-P1-01 · Rename “Fiscal Year” to reflect actual functionality

| Field | Detail |
|-------|--------|
| **Module** | Accounting |
| **User impact** | Users expect fiscal year creation/setup; page only shows budgets by year and lock date |
| **Affected paths** | `/accounting/fiscal-year`, `accounting-nav-config.ts`, dashboard requirements |
| **Acceptance criteria** | Nav label updated (e.g. “Budgets by Year & Period Lock”); page heading and description match; no promise of fiscal-year wizard unless built |
| **Status** | Open |

---

### FIN-P1-02 · Add Disposals and Transfers to Fixed Assets sub-navigation

| Field | Detail |
|-------|--------|
| **Module** | Fixed Assets |
| **User impact** | Lifecycle actions are hard to discover outside dashboard requirements |
| **Affected paths** | `sub-nav-groups.ts` → `fixedAssets` group |
| **Acceptance criteria** | Sub-nav lists Disposals and Transfers alongside Assets, Acquisitions, Depreciation, Valuation |
| **Status** | Open |

---

### FIN-P1-03 · Show NBV and accumulated depreciation on asset detail page

| Field | Detail |
|-------|--------|
| **Module** | Fixed Assets |
| **User impact** | Register list shows financials; detail page does not — users must go back to the list |
| **Affected paths** | `/fixed-assets/[id]` |
| **Acceptance criteria** | Detail page displays cost, accumulated depreciation, NBV, depreciation %, and last depreciation date (when available) in a Financial Summary section |
| **Status** | Open |

---

### FIN-P1-04 · Rename or rebuild Sales Reports hub

| Field | Detail |
|-------|--------|
| **Module** | Billing |
| **User impact** | `/billing/sales-reports` is only links elsewhere; users expect embedded AR analytics |
| **Affected paths** | `/billing/sales-reports` |
| **Acceptance criteria** | **Option A:** Rename to “Sales Report Shortcuts” with clear copy; **Option B:** Embed summary cards (outstanding AR, revenue MTD, overdue count) plus links to full reports |
| **Status** | Open |

---

### FIN-P1-05 · Add Customer Balances page in Billing (mirror Vendor Balances)

| Field | Detail |
|-------|--------|
| **Module** | Billing |
| **User impact** | AP has vendor balances; AR has no equivalent in billing |
| **Affected paths** | New page e.g. `/billing/customer-balances`; billing sub-nav |
| **Acceptance criteria** | Searchable/sortable list of customers with open balance; link to customer profile and statement; permission aligned with `view_billing` |
| **Status** | Open |

---

### FIN-P1-06 · Improve Collections page or rename honestly

| Field | Detail |
|-------|--------|
| **Module** | Billing |
| **User impact** | “Collections” implies a workspace; page is read-only overdue list |
| **Affected paths** | `/billing/collections` |
| **Acceptance criteria** | **Option A:** Rename to “Overdue Invoices” everywhere; **Option B:** Add quick actions (record payment, send reminder, open statement) and aging summary buckets |
| **Status** | Open |

---

### FIN-P1-07 · Add Customer Statements to Billing sub-navigation

| Field | Detail |
|-------|--------|
| **Module** | Billing / Customers |
| **User impact** | AR staff live in Billing but statements live under Customers |
| **Affected paths** | `sub-nav-groups.ts` billing receivables group |
| **Acceptance criteria** | Billing → Receivables includes “Customer Statements” → `/customers/statements` |
| **Status** | Open |

---

### FIN-P1-08 · Fix Sales Order creation UX (customer picker)

| Field | Detail |
|-------|--------|
| **Module** | Billing |
| **User impact** | New sales order asks for raw Customer ID instead of searchable customer selector |
| **Affected paths** | `/billing/sales-orders/new` |
| **Acceptance criteria** | Uses same `CustomerSelector` (or equivalent) as invoices and estimates |
| **Status** | Open |

---

### FIN-P1-09 · Replace technical integrity repair messaging

| Field | Detail |
|-------|--------|
| **Module** | Accounting |
| **User impact** | Subledger integrity page tells users to contact admin for “repair commands” |
| **Affected paths** | `/accounting/integrity` |
| **Acceptance criteria** | Business-friendly copy explaining what drift means, what to check (controls, missing postings), and who to contact; no CLI/command references |
| **Status** | Open |

---

### FIN-P1-10 · Align till quick actions with accounting permissions

| Field | Detail |
|-------|--------|
| **Module** | Accounting |
| **User impact** | Dashboard till shortcuts require `manage_billing` instead of accounting/till permissions |
| **Affected paths** | `/accounting` quick actions |
| **Acceptance criteria** | Till actions visible to users with appropriate accounting or till permissions; documented in role setup |
| **Status** | Open |

---

### FIN-P1-11 · Consistent currency formatting across finance pages

| Field | Detail |
|-------|--------|
| **Module** | Accounting |
| **User impact** | Some pages hardcode `en-GH` / GHS; others use organization currency |
| **Affected paths** | Fund transfers, budget report, till denominations (if multi-currency) |
| **Acceptance criteria** | All customer-facing amounts use `useCurrency()` or org settings; Ghana till denominations documented as regional default |
| **Status** | Open |

---

### FIN-P1-12 · Add page guard to Fixed Assets categories

| Field | Detail |
|-------|--------|
| **Module** | Fixed Assets |
| **User impact** | Categories page lacks consistent `view_assets` guard |
| **Affected paths** | `/fixed-assets/categories` |
| **Acceptance criteria** | Matches permission pattern of other FA pages |
| **Status** | Open |

---

## P2 — Completeness (role and workflow coverage)

### FIN-P2-01 · Acquisition workflow: edit and delete draft requests

| Field | Detail |
|-------|--------|
| **Module** | Fixed Assets |
| **Paths** | `/fixed-assets/acquisitions/[id]` |
| **Acceptance criteria** | Requester can edit/delete draft; UI reflects API capabilities |
| **Status** | Open |

---

### FIN-P2-02 · Acquisition workflow: rejection recovery and approval visibility

| Field | Detail |
|-------|--------|
| **Module** | Fixed Assets |
| **Paths** | `/fixed-assets/acquisitions/[id]` |
| **Acceptance criteria** | Rejected requests can be revised and resubmitted; approval status and history visible on detail page; multi-approver UX matches backend (single approver wins OR true multi-approval) |
| **Status** | Open |

---

### FIN-P2-03 · Depreciation schedule view (read-only)

| Field | Detail |
|-------|--------|
| **Module** | Fixed Assets |
| **Paths** | `/fixed-assets/depreciation`, `/fixed-assets/[id]` |
| **Acceptance criteria** | Users can preview scheduled depreciation by asset/month before running batch; link from run results to affected assets |
| **Status** | Open |

---

### FIN-P2-04 · Disposal history and structured disposal method

| Field | Detail |
|-------|--------|
| **Module** | Fixed Assets |
| **Paths** | `/fixed-assets/disposals`, register filters |
| **Acceptance criteria** | Disposal method uses structured choices (sold, scrapped, donated, traded in); register filter for disposed assets; optional gain/loss summary on disposal |
| **Status** | Open |

---

### FIN-P2-05 · Transfer audit trail

| Field | Detail |
|-------|--------|
| **Module** | Fixed Assets |
| **Paths** | `/fixed-assets/transfers`, `/fixed-assets/[id]` |
| **Acceptance criteria** | Transfers record date, reason, and before/after values; history visible on asset detail |
| **Status** | Open |

---

### FIN-P2-06 · Sales Orders: line items and invoice path

| Field | Detail |
|-------|--------|
| **Module** | Billing |
| **Paths** | `/billing/sales-orders/*` |
| **Acceptance criteria** | Orders support line items, totals, status; clear path to estimate, work order, or invoice |
| **Status** | Open |

---

### FIN-P2-07 · Chart of Accounts → Account Register shortcut

| Field | Detail |
|-------|--------|
| **Module** | Accounting |
| **Paths** | `/accounting/accounts`, `/accounting/reports/account-register` |
| **Acceptance criteria** | Each account row has “View register” opening account register pre-filtered |
| **Status** | Open |

---

### FIN-P2-08 · Void/cancel invoice from invoice detail

| Field | Detail |
|-------|--------|
| **Module** | Billing |
| **Paths** | `/billing/invoices/[id]` |
| **Acceptance criteria** | Void/cancel available in detail actions (not only bulk on list); permission-gated |
| **Status** | Open |

---

### FIN-P2-09 · Expand Fixed Asset reports

| Field | Detail |
|-------|--------|
| **Module** | Fixed Assets |
| **Paths** | `/fixed-assets/reports/*` |
| **Acceptance criteria** | At minimum: depreciation summary, disposals report, category breakdown; valuation report stats align with table scope |
| **Status** | Open |

---

### FIN-P2-10 · Update in-app help for full finance suite

| Field | Detail |
|-------|--------|
| **Module** | All |
| **Paths** | `frontend/lib/help-data.ts`, `role-guides.ts` |
| **Acceptance criteria** | Help covers billing AR/AP, fixed asset lifecycle, and links to Finance Feature Guide |
| **Status** | Open |

---

## P3 — Roadmap / competitive

| ID | Title | Module | Notes |
|----|-------|--------|-------|
| FIN-P3-01 | Email customer statement from billing | Billing | Today PDF only from customer profile |
| FIN-P3-02 | Batch vendor payments | Billing | Pay multiple bills in one run |
| FIN-P3-03 | Online payment link on invoice | Billing | Customer self-pay |
| FIN-P3-04 | Recurring invoices / subscriptions | Billing | Link to subscriptions module if applicable |
| FIN-P3-05 | Fixed asset maintenance UI | Fixed Assets | Permissions exist; no pages |
| FIN-P3-06 | Category GL mapping in UI | Fixed Assets | Backend supports; not editable |
| FIN-P3-07 | Report sub-nav mobile optimization | Accounting | 19 tabs — collapse or dropdown on small screens |
| FIN-P3-08 | Credit note → refund to customer cash path | Billing | Status `refunded` exists; UI unclear |
| FIN-P3-09 | True fiscal year setup wizard | Accounting | Periods, year rollover |
| FIN-P3-10 | Collections dunning log | Billing | Log calls, promises to pay |

---

## Suggested implementation order

```text
Sprint 1 (P0):     FIN-P0-01 → P0-05
Sprint 2 (P1 nav): P0-03, P1-02, P1-07, P1-01, P1-04, P1-06
Sprint 3 (P1 UX):  P0-04, P1-03, P1-05, P1-08, P1-09, P1-10, P1-11
Sprint 4 (P2 FA):  P2-01 → P2-05, P2-09
Sprint 5 (P2 Bill): P2-06, P2-08, P2-07, P2-10
```

---

## Definition of “finance suite customer-ready”

The suite is **customer-ready for go-live** when:

- [ ] All **P0** items are `Done`
- [ ] At least **80% of P1** items are `Done`
- [ ] [Finance Feature Guide](./FINANCE-FEATURE-GUIDE.md) is published to customers
- [ ] Role permission matrix is documented for: Cashier, AR Clerk, AP Clerk, Accountant, Finance Manager, Asset Manager
- [ ] One successful end-to-end UAT script passes: Estimate → Invoice → Payment → Bank Reconcile → Month-end Reports → VAT filing (if Ghana)

---

## Tracking

Copy ticket IDs into your issue tracker. Suggested labels: `finance`, `accounting`, `billing`, `fixed-assets`, `P0`–`P3`.

When a ticket ships, update **Status** here and note the PR number in your tracker.
