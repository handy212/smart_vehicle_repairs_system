# Frontend Development Roadmap

## 📊 Current Status

### ✅ Completed (Basic CRUD)
- **Authentication:** Login, JWT token management, protected routes
- **Dashboard:** KPI cards, charts (work orders, appointments), today's appointments, active work orders
- **Customers:** List, detail, create, edit pages
- **Vehicles:** List, detail, create, edit pages  
- **Appointments:** List, detail, create, edit pages
- **Work Orders:** List, detail, create, edit pages (basic)
- **Inventory:** List page (basic)
- **Billing:** List page, invoice detail (basic)

### 🔧 In Progress / Needs Fixing
- **Edit Forms:** Field name mappings (mileage → current_mileage, color → exterior_color, fuel_type → engine_type)
- **Error Handling:** Improved backend error display (partially done)

### 📋 Next Priorities

---

## 🎯 Phase 1: Fix & Complete Core CRUD (IMMEDIATE)

### 1.1 Fix Edit Forms
**Priority:** HIGH | **Estimated:** 1-2 hours

- [x] Fix vehicle edit form field mappings
- [ ] Fix vehicle detail page field display
- [ ] Add error handling to all edit forms
- [ ] Test all create/edit operations

**Files to Update:**
- `app/(dashboard)/vehicles/[id]/edit/page.tsx` - Fix field names
- `app/(dashboard)/vehicles/[id]/page.tsx` - Fix field display
- `app/(dashboard)/appointments/[id]/edit/page.tsx` - Add error handling
- `app/(dashboard)/workorders/[id]/edit/page.tsx` - Add error handling
- `app/(dashboard)/customers/[id]/edit/page.tsx` - Verify error handling

---

## 🎯 Phase 2: Work Orders Enhancement (HIGH PRIORITY)

### 2.1 Work Order Detail Page Enhancement
**Priority:** HIGH | **Estimated:** 4-6 hours

**Backend Available:**
- ✅ WorkOrder model with full workflow
- ✅ ServiceTask model (tasks within work order)
- ✅ WorkOrderPart model (parts used)
- ✅ WorkOrderNote model (notes)
- ✅ WorkOrderPhoto model (photos)
- ✅ TechnicianTimeLog model (time tracking)
- ✅ Multiple workflow actions (start, pause, complete, etc.)

**Frontend to Build:**
- [ ] Enhanced work order detail page with tabs:
  - [ ] Overview tab (current info)
  - [ ] Tasks tab (list, add, edit, delete tasks)
  - [ ] Parts tab (list, add, edit, delete parts)
  - [ ] Notes tab (list, add notes)
  - [ ] Photos tab (upload, view photos)
  - [ ] Timeline tab (activity log)
- [ ] Work order status workflow buttons
- [ ] Add task modal/form
- [ ] Add part modal/form (with inventory search)
- [ ] Add note form
- [ ] Photo upload component
- [ ] Time tracking interface for technicians

**API Endpoints Available:**
```
GET    /api/workorders/work-orders/{id}/           ✅
POST   /api/workorders/tasks/                      ✅
GET    /api/workorders/tasks/?work_order={id}      ✅
POST   /api/workorders/parts/                      ✅
GET    /api/workorders/parts/?work_order={id}      ✅
POST   /api/workorders/notes/                      ✅
GET    /api/workorders/notes/?work_order={id}      ✅
POST   /api/workorders/photos/                     ✅
POST   /api/workorders/work-orders/{id}/start_intake/     ✅
POST   /api/workorders/work-orders/{id}/start_diagnosis/  ✅
POST   /api/workorders/work-orders/{id}/complete_diagnosis/ ✅
POST   /api/workorders/work-orders/{id}/request_approval/ ✅
POST   /api/workorders/work-orders/{id}/approve/   ✅
POST   /api/workorders/work-orders/{id}/start_work/ ✅
POST   /api/workorders/work-orders/{id}/pause/     ✅
POST   /api/workorders/work-orders/{id}/resume/    ✅
POST   /api/workorders/work-orders/{id}/complete/  ✅
```

---

## 🎯 Phase 3: Inventory Management (HIGH PRIORITY)

### 3.1 Parts Management
**Priority:** HIGH | **Estimated:** 6-8 hours

**Backend Available:**
- ✅ Part model (full inventory management)
- ✅ PartCategory model (hierarchical categories)
- ✅ Supplier model
- ✅ PurchaseOrder model
- ✅ InventoryTransaction model (audit trail)
- ✅ Low stock alerts
- ✅ Stock adjustments

**Frontend to Build:**
- [ ] Parts list page (enhanced with filters, search, low stock indicators)
- [ ] Part detail page
- [ ] Create part form (with category, supplier selection)
- [ ] Edit part form
- [ ] Stock adjustment modal
- [ ] Low stock alerts page
- [ ] Parts search/autocomplete component (for work orders)

**API Endpoints Available:**
```
GET    /api/inventory/parts/                       ✅
POST   /api/inventory/parts/                       ✅
GET    /api/inventory/parts/{id}/                  ✅
PUT    /api/inventory/parts/{id}/                  ✅
GET    /api/inventory/parts/low_stock/             ✅
POST   /api/inventory/parts/{id}/adjust/           ✅
GET    /api/inventory/categories/                  ✅
GET    /api/inventory/suppliers/                   ✅
```

### 3.2 Suppliers Management
**Priority:** MEDIUM | **Estimated:** 3-4 hours

- [ ] Suppliers list page
- [ ] Supplier detail page
- [ ] Create supplier form
- [ ] Edit supplier form

### 3.3 Purchase Orders
**Priority:** MEDIUM | **Estimated:** 4-5 hours

- [ ] Purchase orders list page
- [ ] Create purchase order form
- [ ] Purchase order detail page
- [ ] Receive items workflow

---

## 🎯 Phase 4: Billing & Payments (HIGH PRIORITY)

### 4.1 Invoices
**Priority:** HIGH | **Estimated:** 6-8 hours

**Backend Available:**
- ✅ Invoice model (full billing system)
- ✅ InvoiceLineItem model
- ✅ Payment model
- ✅ Estimate model
- ✅ TaxRate model
- ✅ Payment gateway integration (Hubtel)

**Frontend to Build:**
- [ ] Enhanced invoices list (filters: status, date range, customer)
- [ ] Create invoice form (from work order or manual)
- [ ] Invoice detail page with line items
- [ ] Edit invoice form
- [ ] Send invoice email
- [ ] Print invoice (PDF)
- [ ] Payment recording form
- [ ] Payment history

**API Endpoints Available:**
```
GET    /api/billing/invoices/                      ✅
POST   /api/billing/invoices/                      ✅
GET    /api/billing/invoices/{id}/                 ✅
PUT    /api/billing/invoices/{id}/                 ✅
POST   /api/billing/invoices/{id}/send/            ✅
GET    /api/billing/invoices/{id}/pdf/             ✅
GET    /api/billing/invoices/overdue/              ✅
POST   /api/billing/payments/                      ✅
GET    /api/billing/payments/                      ✅
```

### 4.2 Estimates
**Priority:** MEDIUM | **Estimated:** 4-5 hours

- [ ] Estimates list page
- [ ] Create estimate form
- [ ] Estimate detail page
- [ ] Convert estimate to invoice
- [ ] Send estimate to customer

### 4.3 Payments
**Priority:** MEDIUM | **Estimated:** 3-4 hours

- [ ] Payments list page
- [ ] Record payment form
- [ ] Payment detail page
- [ ] Refund processing

---

## 🎯 Phase 5: Reports & Analytics (MEDIUM PRIORITY)

### 5.1 Reports Dashboard
**Priority:** MEDIUM | **Estimated:** 6-8 hours

**Backend Available:**
- ✅ Reporting app exists
- ✅ Various report endpoints

**Frontend to Build:**
- [ ] Reports dashboard page
- [ ] Revenue reports (charts, date filters)
- [ ] Work order reports
- [ ] Technician productivity reports
- [ ] Inventory reports
- [ ] Customer reports
- [ ] Export functionality (PDF, CSV)

---

## 🎯 Phase 6: Notifications Center (MEDIUM PRIORITY)

### 6.1 Notifications
**Priority:** MEDIUM | **Estimated:** 3-4 hours

**Backend Available:**
- ✅ Notifications app exists
- ✅ Notification model

**Frontend to Build:**
- [ ] Notifications center page
- [ ] Notification bell with counter
- [ ] Mark as read/unread
- [ ] Filter by type
- [ ] Real-time updates (polling or WebSocket)

---

## 🎯 Phase 7: Advanced Features (LOW PRIORITY)

### 7.1 Calendar Views
**Priority:** LOW | **Estimated:** 4-5 hours

- [ ] Appointments calendar (monthly, weekly, daily views)
- [ ] Drag-and-drop rescheduling
- [ ] Service bay visualization

### 7.2 Kanban Board
**Priority:** LOW | **Estimated:** 3-4 hours

- [ ] Work orders kanban board (by status)
- [ ] Drag-and-drop status changes

### 7.3 Search & Filters
**Priority:** LOW | **Estimated:** 2-3 hours

- [ ] Global search component
- [ ] Advanced filters for all list pages
- [ ] Saved filter presets

---

## 📊 Implementation Priority Order

### Week 1: Core Fixes & Work Orders
1. ✅ Fix edit forms field mappings
2. ✅ Add error handling to all forms
3. Build work order detail page with tabs
4. Build work order tasks management
5. Build work order parts management

### Week 2: Inventory & Billing
1. Build parts management (CRUD)
2. Build suppliers management
3. Build invoices management (CRUD)
4. Build estimates management
5. Build payments recording

### Week 3: Reports & Polish
1. Build reports dashboard
2. Build notifications center
3. Add calendar views
4. Add kanban board
5. Polish UI/UX

---

## 🛠️ Technical Considerations

### Components to Create
- [ ] `FileUpload` component (for photos, documents)
- [ ] `ImageGallery` component (for viewing photos)
- [ ] `TabPanel` component (for detail pages)
- [ ] `Modal` component (enhanced)
- [ ] `DateRangePicker` component
- [ ] `SearchAutocomplete` component
- [ ] `StatusBadge` component (reusable)
- [ ] `WorkflowButtons` component (for status changes)

### API Client Updates
- [ ] Add work order tasks API client
- [ ] Add work order parts API client
- [ ] Add work order notes API client
- [ ] Add work order photos API client
- [ ] Add inventory parts API client
- [ ] Add suppliers API client
- [ ] Add purchase orders API client
- [ ] Add invoices API client
- [ ] Add estimates API client
- [ ] Add payments API client

### State Management
- [ ] Consider adding more Zustand stores for:
  - Work order state (current work order being viewed)
  - Notification state
  - Filter state (saved filters)

---

## 📝 Notes

- **Backend is more complete than roadmap suggests** - Work orders, inventory, and billing are fully implemented
- **Focus on building what's available** - Don't build features that don't have backend support yet
- **Prioritize user workflows** - Work orders → Inventory → Billing is the main workflow
- **Reuse components** - Build reusable components for common patterns (forms, lists, detail pages)

---

**Last Updated:** Based on backend review - Work orders, inventory, and billing are fully implemented!
**Next Step:** Fix edit forms, then build work order detail page with full functionality

