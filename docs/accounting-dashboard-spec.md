# Accounting Dashboard Specification

## Current Implementation Review

### What already existed and was preserved
- Executive KPI cards for financial position, revenue/expenses, cash, and working capital.
- Revenue analytics for trend, branch comparison, service mix, and top customers.
- Expense analytics for trend, category mix, and ranked categories.
- Accounts receivable summary with aging, top debtors, and overdue invoice action.
- Financial statements snapshot, alerts/exceptions, recent finance activity, filters, refresh, PDF, Excel, and board-pack export actions.

### Production gaps closed in this pass
- Added a consolidated `GET /accounting/dashboard/command-center/` backend API rather than adding more client-side report stitching.
- Added Accounts Payable command data: due this week, due this month, overdue bills, aging, top creditors, upcoming payment windows, and bill approval pressure.
- Added richer Cash & Bank data: till-enabled accounts, GL balance, open till status, last closure/reconciliation, variance status, bank ledger/reconciled balances, differences, reconciliation date, and unreconciled counts.
- Added Till Management command data: open tills, till account, duration, daily cash receipts/refunds/pay-ins/pay-outs/net movement, variance totals, and pending supervisor action rows.
- Added Tax Dashboard depth: VAT summary, tax due, tax credit, net tax position, deadline dates, days remaining, and warning indicators.
- Added Financial Health indicators for cash, receivables, payables, tills, and accounting controls.
- Converted alerts into a grouped monitoring center with critical, warning, and information sections.
- Added previous-period trend indicators to the financial statement snapshot.
- Added permission-aware quick actions using existing permission codes.
- Added drill-down links from dashboard rows/cards to reports, bills, tills, ledgers, and bank reconciliation.

### Remaining production gaps
- A true reject action for till variance approvals does not currently exist in the backend; the dashboard links users to the till session for review.
- Full backend test execution requires the Django environment to be installed/activated in the shell.
- Full TypeScript build still reports unrelated existing errors in invoice/refund/test files outside the accounting command center.
- Heavy balance calculations still depend on existing report services. For very high transaction volume, daily financial snapshots or materialized rollups should be added.

### Production readiness rating
Current rating: **8/10**.

The dashboard is now structurally production-ready for ERP daily use: it has a single aggregate API, role-aware UI composition, actionable sections, drill-downs, and focused checks. It should move to **9/10** after backend integration tests run in a configured Django environment and the remaining unrelated frontend type errors are cleaned up. It reaches **10/10** after adding cached/materialized finance snapshots and a dedicated till variance reject endpoint.

---

## 1. Complete Dashboard Architecture

### Purpose
Create a single accounting command center for daily finance operations and executive oversight in the Smart Vehicle Repairs ERP.

### Primary goals
- Show current financial position immediately
- Surface cash, bank, receivables, payables, profitability, tax, till, and control risks
- Support action, not just reporting
- Adapt the experience by role without fragmenting the accounting data model

### Architecture layers
1. Presentation layer
   - Next.js page at `/accounting`
   - Role-aware dashboard composition
   - Responsive cards, tables, charts, and action panels
2. Dashboard aggregation layer
   - Finance-specific aggregation service
   - Combines accounting, billing, branch, till, and reporting data
3. Domain services
   - GL / financial statements
   - AR / AP ageing
   - tax reporting
   - till reconciliation
   - bank reconciliation
   - management metrics
4. Data layer
   - posted journal transactions
   - accounts
   - invoices
   - bills
   - payments
   - bank statements and statement lines
   - cashier till sessions and cash movements
   - branches and staff assignments

### Recommended widget groups
- Top strip: global filters + export + refresh
- Row 1: Executive KPI cards
- Row 2: Revenue + expense analytics
- Row 3: AR + AP command panels
- Row 4: Cash/bank + till operations
- Row 5: Tax + statements snapshot
- Row 6: Alerts/exceptions + quick actions

---

## 2. UI Layout Wireframe

```text
+----------------------------------------------------------------------------------+
| Accounting Dashboard                                      Refresh Export Board   |
| [Date Range] [Branch] [Fiscal Year] [Account] [Currency] [User]                 |
| Role Callout / Scope Context                                                     |
+----------------------------------------------------------------------------------+
| KPI: Financial Position | KPI: Revenue & Expenses | KPI: Cash | KPI: Working Cap |
+----------------------------------------------------------------------------------+
| Revenue Trend (daily/weekly/monthly/yearly) | Revenue by Branch / Role Summary  |
+----------------------------------------------------------------------------------+
| Revenue by Service Type                  | Top Customers by Revenue               |
+----------------------------------------------------------------------------------+
| Expense Trend / Mix                       | Accounts Receivable                   |
|                                           | - total outstanding                   |
|                                           | - ageing                             |
|                                           | - top debtors                        |
+----------------------------------------------------------------------------------+
| Accounts Payable                          | Cash & Bank Dashboard                 |
| - total outstanding                       | - till-enabled cash accounts          |
| - ageing                                  | - bank balances                       |
| - top creditors                           | - unreconciled transactions           |
+----------------------------------------------------------------------------------+
| Till Management Summary                   | Tax Dashboard                         |
| - open tills                              | - VAT collected/payable               |
| - shortages / excesses                    | - filing deadlines                    |
| - cash movements                          |                                       |
+----------------------------------------------------------------------------------+
| Financial Statements Snapshot             | Alerts & Exceptions                   |
| - P&L                                     | - critical / warning / info           |
| - Balance Sheet                           | - pending approvals                   |
| - Cash Flow                               |                                       |
+----------------------------------------------------------------------------------+
| Quick Actions                             | Recent Finance Activity               |
+----------------------------------------------------------------------------------+
```

### Mobile wireframe
- sticky header with refresh/export
- filter drawer instead of full-width filter rail
- KPI cards in 1-column or 2-column stack
- charts become full-width vertical panels
- tables collapse into stacked list rows
- alerts move above deeper analytics

---

## 3. Component Hierarchy

### Page
- `AccountingDashboardPage`

### Header / filter layer
- `PageHeader`
- `DateRangePicker`
- `FilterSelect`
- `RoleCallout`

### KPI layer
- `MetricListCard`

### Analytics layer
- `SectionTitle`
- `DashboardTooltip`
- `AgingBars`
- chart wrappers using `recharts`

### Operational layer
- `CompactStat`
- till / bank / AR / AP table cards

### Reporting / exception layer
- `SnapshotCard`
- `SnapshotRow`
- `SeverityBadge`
- `DeadlineItem`

### Shared support
- `frontend/lib/accounting/dashboard.ts`
  - role mapping
  - revenue aggregation
  - ageing formatting
  - alert assembly

---

## 4. API Requirements

### Previous current-state approach
The earlier UI composed multiple existing endpoints:
- `GET /accounting/reports/balance-sheet/`
- `GET /accounting/reports/profit-loss/`
- `GET /accounting/reports/tax/`
- `GET /accounting/reports/aging/`
- `GET /accounting/reports/supplier-ap-aging/`
- `GET /accounting/reports/expense-breakdown/`
- `GET /accounting/reports/cash-flow/`
- `GET /accounting/reports/till-reconciliation/`
- `GET /accounting/reports/management-dashboard/`
- `GET /accounting/analytics/dashboard/`
- `GET /accounting/accounts/`
- `GET /accounting/tills/`
- `GET /accounting/bank-statements/`
- `GET /billing/invoices/`
- `GET /billing/invoices/overdue/`
- `GET /billing/bills/`
- `GET /reporting/revenue-report/`

### Implemented target API
The dashboard now uses one dashboard aggregator endpoint:

`GET /accounting/dashboard/command-center/`

#### Query params
- `branch_id`
- `start_date`
- `end_date`
- `fiscal_year`
- `account_id`
- `currency`
- `user_id`
- `role_view`

#### Response shape
- `financial_position`
- `revenue_expenses`
- `cash_position`
- `working_capital`
- `revenue_analytics`
- `expense_analytics`
- `receivables`
- `payables`
- `cash_bank`
- `till_management`
- `tax`
- `statements`
- `financial_health`
- `alerts`
- `recent_activity`
- `metadata`

This removes excessive client orchestration and guarantees consistent numbers across widgets.

---

## 5. Backend Aggregation Requirements

### Aggregation responsibilities
- Normalize date scope once
- Resolve branch scope once
- Compute KPI totals from the same financial cut
- Return role-specific visibility metadata
- Return alert thresholds and exception counts
- Return drill-down links or entity ids for details

### Required aggregations
- assets / liabilities / equity as-of selected date
- revenue and expenses for current period
- today / MTD / YTD revenue
- gross profit and net profit
- available cash = cash on hand + bank + till balances
- AR ageing + top debtors + overdue invoice list
- AP ageing + top creditors + upcoming bills
- till session summary + variance approvals
- bank reconciliation summary
- tax summary and due exposure
- statement mini-summaries
- pending approvals and control exceptions

### Implemented service
- `DashboardService.get_command_center_snapshot(start_date, end_date, branch_id, user)`
- Reuses:
  - `ReportingService`
  - `ManagementReportingService`
  - `AnalyticsService`
  - existing `Invoice`, `Bill`, `Payment`, `CashierTill`, `Account`, `JournalEntry`, `AccountingControl`, and bank statement models

---

## 6. Database Query Strategy

### Principles
- aggregate at the database, not in Python loops where avoidable
- reuse branch/date filters centrally
- prefer one summary query per widget group
- prefetch detail rows only for visible cards/lists

### Query patterns
- balance-sheet / trial-balance:
  - aggregate posted transactions by account up to `end_date`
- profit-loss:
  - aggregate income and expense accounts between `start_date` and `end_date`
- AR / AP:
  - query only open / overdue invoices and bills
  - bucket in SQL when practical, otherwise bucket in service once
- cash / bank:
  - aggregate cash/bank leaf accounts only
- tills:
  - query open or recent till sessions with `select_related(branch, cashier, till_account)`
- bank statements:
  - query latest statement per bank account
- top customers / top creditors:
  - aggregate totals and order by descending amount

### Recommended indexes
- `journal_entry(date, branch_id, posted)`
- `transaction(account_id, journal_entry_id, transaction_type)`
- `invoice(branch_id, status, due_date, invoice_date)`
- `bill(branch_id, status, due_date, bill_date)`
- `payment(invoice_id, payment_date, status)`
- `cashiertill(branch_id, till_account_id, status, opened_at)`
- `bankstatement(bank_account_id, statement_date, reconciled)`

### Caching strategy
- cache dashboard aggregate payload by `(branch_id, start_date, end_date, role_view)`
- TTL 1 to 5 minutes for heavy executive panels
- bypass cache on explicit refresh

---

## 7. Permission Matrix

| Area | Accountant | Finance Manager | Branch Manager | Executive/CFO |
|---|---|---:|---:|---:|
| View dashboard | Yes | Yes | Yes | Yes |
| View all branches | Optional by role | Yes | No | Yes |
| View financial statements | Yes | Yes | Summary + branch scope | Yes |
| View AR/AP detail | Yes | Yes | Branch only | Summary |
| View till detail | Yes | Yes | Branch only | Summary |
| Approve variances / bills | No | Yes | Limited | No |
| Create journal entry | Yes | Yes | No | No |
| Reconcile bank | Yes | Yes | No | No |
| Export board pack | Optional | Yes | Limited | Yes |

### Existing permission codes already aligned
- `view_accounting`
- `view_financial_reports`
- `manage_accounting_periods`
- `view_bank_statements`
- `reconcile_bank_statements`
- `create_journal_entries`
- `manage_billing`
- `export_reports`

### Possible future additions
- `view_accounting_dashboard`
- `view_branch_finance_dashboard`
- `approve_till_variances`
- `view_executive_finance_summary`

---

## 8. Mobile Responsiveness Plan

### Breakpoint behavior
- `xl`: full desktop finance command center
- `lg`: two-column analytics and operations
- `md`: single-column stacked cards with condensed filter row
- `sm`: drawer-based filters, stacked KPIs, list-style tables

### Mobile rules
- keep KPI cards at fixed heights
- collapse branch comparison chart behind tabs when narrow
- convert AR/AP/top lists into touch-friendly rows
- prioritize:
  1. alerts
  2. KPIs
  3. quick actions
  4. cash / receivables / payables
  5. charts

### Interaction
- filter drawer
- sticky top action bar
- no horizontally overflowing KPI text
- tap targets minimum 40px

---

## 9. Performance Optimization Strategy

### Frontend
- use React Query with group-level stale times
- avoid refetch-on-focus for heavy finance reports
- memoize transformed chart and list data
- limit detail rows shown in dashboard cards
- lazy-load rarely used drill-down surfaces

### Backend
- add a dedicated aggregation endpoint
- precompute daily finance summaries where possible
- use materialized daily revenue / expense / cash snapshots if volumes grow
- avoid N+1 account balance calculations

### UX performance
- skeletons for chart and table panels
- refresh only on filter changes or explicit refresh
- export actions should use background generation for large files

---

## 10. Test Plan

### Automated checks
- Frontend lint for `frontend/app/(dashboard)/accounting/page.tsx`, `frontend/lib/api/accounting.ts`, and related API contracts.
- Unit tests for accounting dashboard helpers in `frontend/__tests__/lib/accounting-dashboard.test.ts`.
- Backend API contract test for `GET /api/accounting/dashboard/command-center/`.
- TypeScript build verification after unrelated invoice/refund/test typing issues are cleaned up.

### Manual QA
- Verify Accountant sees full accounting operations and quick actions permitted by role.
- Verify Finance Manager sees approval pressure and supervisor variance actions.
- Verify Branch Manager sees branch-scoped figures only.
- Verify Executive/CFO sees summary-oriented command center without operational quick actions.
- Change branch/date/fiscal year/account/currency/user filters and confirm widgets refresh from the aggregate endpoint.
- Drill down from revenue, AR, AP, cash account, bank account, till variance, tax, and statements widgets.
- Export PDF, Excel, and board pack.
- Test empty states for no open tills, no alerts, no top debtors/creditors, and no bank statements.

---

## 11. Acceptance Criteria

- Dashboard loads from the aggregate command-center endpoint.
- Initial dashboard data resolves in under 3 seconds on production-sized indexed data.
- All financial sections listed in the target request are visible where role permissions allow.
- Branch-scoped users cannot retrieve or display global financial data.
- Unauthorized quick actions are hidden.
- Every major widget has a drill-down destination.
- AP, Cash & Bank, Till Management, Tax, Financial Health, Monitoring Center, and Statements trend widgets render without client-side type errors.
- Alerts are grouped by severity and link to action surfaces.
- Backend endpoint enforces `view_financial_reports` and accounting module access.
- Existing working dashboard sections remain intact.

---

## 12. Production-Ready Frontend Implementation Plan

### Phase 1: foundation
- create dashboard route shell
- add filters, KPI cards, and alerts
- wire existing endpoints

### Phase 2: operational depth
- complete AR/AP/till/bank/tax sections
- add role composition rules
- add export actions and drill-downs

### Phase 3: backend consolidation
- add `command-center` API
- centralize aggregation logic
- reduce multi-request client orchestration

### Phase 4: hardening
- add visual regression coverage
- add integration tests for role-based views
- add performance instrumentation
- add empty/error/no-permission states for each section

### Recommended test coverage
- helper unit tests for aggregation shaping
- component tests for role visibility
- API contract tests for dashboard response shape
- end-to-end test for filter refresh behavior

---

## Files Requiring Modification

### Modified
- `apps/accounting/services.py`
- `apps/accounting/views.py`
- `apps/accounting/urls.py`
- `apps/accounting/tests/test_management_reports.py`
- `frontend/app/(dashboard)/accounting/page.tsx`
- `frontend/lib/api/accounting.ts`
- `frontend/lib/api/billing.ts`
- `frontend/lib/accounting/dashboard.ts`
- `frontend/__tests__/lib/accounting-dashboard.test.ts`
- `docs/accounting-dashboard-spec.md`

### Optional future files
- `apps/billing/views.py` for a till variance reject endpoint.
- `apps/accounts/management/commands/init_permissions.py` if separate dashboard-specific permissions are introduced.
- dedicated frontend component files if the dashboard page is later split into smaller widgets.

---

## Notes on the Current Implementation

### Delivered now
- richer `/accounting` command-center dashboard page
- role-aware composition
- reusable helper module
- dedicated command-center backend endpoint
- expanded backend aggregation payload
- focused tests for dashboard helpers and API response shape

### Still recommended
- activate the Django test environment and run backend tests
- add cached/materialized financial summary tables if production volume requires them
- add dedicated till variance rejection endpoint
- clean unrelated billing invoice/refund TypeScript issues elsewhere in the app
