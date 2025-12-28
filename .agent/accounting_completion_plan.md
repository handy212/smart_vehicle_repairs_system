# Accounting Module Completion Plan

## Phase 1: Complete Partial Features (Priority: HIGH)

### 1.1 Job Costing Integration ⚡
**Status**: Code exists but not activated
**Location**: `apps/billing/accounting_service.py`
**Tasks**:
- [ ] Connect `post_parts_cost()` to WorkOrder save signal
- [ ] Connect `post_labor_cost()` to WorkOrder completion
- [ ] Add job cost reversal for cancelled work orders
- [ ] Create job costing dashboard UI
- [ ] Add cost tracking to WorkOrder detail page

### 1.2 Job Profitability Report 📊
**Status**: Data exists, no UI
**Tasks**:
- [ ] Create backend endpoint for job profitability
- [ ] Build frontend report page with filters (date range, technician, job type)
- [ ] Display: Revenue, Labor Cost, Parts Cost, Gross Profit, Margin %
- [ ] Add drill-down to individual work orders
- [ ] Export to CSV/PDF

### 1.3 Inventory Accounting 📦
**Status**: Partial - models exist
**Tasks**:
- [ ] Create inventory valuation report endpoint
- [ ] Build inventory accounting dashboard
- [ ] Add COGS analysis report
- [ ] Implement periodic inventory reconciliation
- [ ] Add stock movement GL integration

### 1.4 Branch P&L Comparison 🏢
**Status**: Individual branch P&L possible
**Tasks**:
- [ ] Create multi-branch comparison endpoint
- [ ] Build comparison report UI (side-by-side or stacked)
- [ ] Add period-over-period comparison
- [ ] Revenue/expense breakdown by branch
- [ ] Export functionality

### 1.5 Management Accounts Pack 📑
**Status**: Individual reports exist
**Tasks**:
- [ ] Create combined report endpoint
- [ ] Build executive dashboard page
- [ ] Include: P&L, Balance Sheet, Cash Flow, Key Metrics
- [ ] Add commentary/notes section
- [ ] PDF export for complete pack

---

## Phase 2: Add Missing Features (Priority: MEDIUM)

### 2.1 Fixed Assets Module 🏗️
**Status**: Not implemented
**Tasks**:
- [ ] Create FixedAsset model (asset register)
- [ ] Add asset categories (vehicles, tools, equipment, furniture)
- [ ] Implement depreciation calculation (straight-line, declining balance)
- [ ] Create asset CRUD endpoints
- [ ] Build asset management UI
- [ ] Add disposal/sale tracking
- [ ] Create depreciation schedule reports
- [ ] Integrate with GL (depreciation expense postings)

### 2.2 Accruals & Provisions System 💰
**Status**: Not implemented
**Tasks**:
- [ ] Create Accrual model
- [ ] Add provision types (warranty, bad debts, etc.)
- [ ] Build accrual entry workflow
- [ ] Create period-end accrual processing
- [ ] Add reversal mechanisms
- [ ] Build accrual management UI
- [ ] Create accrual reports

### 2.3 Budgeting Module 📈
**Status**: Not implemented
**Tasks**:
- [ ] Create Budget model (by account, department, period)
- [ ] Add budget templates (copy prior year, % increase)
- [ ] Build budget entry/approval workflow
- [ ] Create budget CRUD endpoints
- [ ] Build budget management UI
- [ ] Add multi-period budget entry
- [ ] Implement budget revision tracking

### 2.4 Budget vs Actual Reports 📉
**Status**: Not implemented
**Tasks**:
- [ ] Create variance analysis endpoint
- [ ] Build budget vs actual comparison UI
- [ ] Add variance % and absolute difference
- [ ] Period and YTD comparisons
- [ ] Drill-down by account/department
- [ ] Variance explanation notes
- [ ] Export and scheduling

---

## Implementation Priority Order

### Sprint 1: Job Costing & Profitability (Week 1)
1. Activate job costing GL integration
2. Create job profitability report
3. Add UI components

### Sprint 2: Inventory & Branch Reports (Week 2)
1. Inventory valuation reports
2. Branch P&L comparison
3. Management pack assembly

### Sprint 3: Fixed Assets (Week 3)
1. Models and migrations
2. CRUD and depreciation
3. Asset management UI

### Sprint 4: Budgeting (Week 4)
1. Budget models and workflow
2. Budget entry UI
3. Budget vs actual reports

### Sprint 5: Accruals (Week 5)
1. Accrual models
2. Period-end processing
3. Accrual management UI

---

## Success Metrics
- ✅ 100% feature coverage from requirements
- ✅ All GL integration automated
- ✅ Complete financial reporting suite
- ✅ Audit trail for all transactions
- ✅ Multi-branch consolidation
- ✅ Executive-ready management pack

---

## Notes
- Maintain backward compatibility
- Ensure all changes are tested
- Update API documentation
- Add user guides for new features
- Consider performance optimization for reports
