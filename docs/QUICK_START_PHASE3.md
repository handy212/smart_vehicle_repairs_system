# Phase 3: Work Orders Quick Start & Testing Guide 🚀

**Last Updated:** October 2, 2025  
**Server:** http://localhost:8080/  
**Authentication:** JWT (Bearer token)

---

## 📋 Table of Contents

1. [Authentication](#authentication)
2. [Create Work Order Workflow](#create-work-order-workflow)
3. [Work Order Lifecycle](#work-order-lifecycle)
4. [Service Tasks Management](#service-tasks-management)
5. [Parts Management](#parts-management)
6. [Time Tracking](#time-tracking)
7. [Notes & Documentation](#notes--documentation)
8. [Photo Management](#photo-management)
9. [Dashboard & Analytics](#dashboard--analytics)
10. [Filtering & Search](#filtering--search)

---

## 🔐 Authentication

### Get JWT Token
```bash
curl -X POST http://localhost:8080/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@admin.com",
    "password": "danewcash54899"
  }'
```

**Response:**
```json
{
  "refresh": "eyJ...",
  "access": "eyJ..."
}
```

### Set Token Variable (for all subsequent requests)
```bash
TOKEN="your_access_token_here"
```

### Using Token in Requests
All subsequent requests require the Authorization header:
```bash
-H "Authorization: Bearer $TOKEN"
```

---

## 🆕 Create Work Order Workflow

### Step 1: Get Customer and Vehicle IDs

#### List Customers
```bash
curl http://localhost:8080/api/customers/customers/ \
  -H "Authorization: Bearer $TOKEN"
```

#### List Vehicles
```bash
curl http://localhost:8080/api/vehicles/vehicles/ \
  -H "Authorization: Bearer $TOKEN"
```

#### List Appointments (optional - can create work order from appointment)
```bash
curl http://localhost:8080/api/appointments/appointments/ \
  -H "Authorization: Bearer $TOKEN"
```

### Step 2: Create Work Order

#### Method A: From Scratch
```bash
curl -X POST http://localhost:8080/api/workorders/work-orders/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": 1,
    "vehicle": 1,
    "customer_concerns": "Engine making strange noise, check engine light on",
    "special_instructions": "Customer waiting - priority service",
    "priority": "high",
    "odometer_in": 45230,
    "estimated_completion": "2025-10-03T16:00:00Z",
    "is_customer_waiting": true,
    "requires_approval": true
  }'
```

#### Method B: From Appointment
```bash
curl -X POST http://localhost:8080/api/workorders/work-orders/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "appointment": 1,
    "customer": 1,
    "vehicle": 1,
    "customer_concerns": "Scheduled oil change and brake inspection",
    "priority": "normal",
    "odometer_in": 45230,
    "estimated_completion": "2025-10-03T14:00:00Z"
  }'
```

**Response:**
```json
{
  "id": 1,
  "work_order_number": "WO000001",
  "status": "draft",
  "priority": "high",
  "customer": {
    "id": 1,
    "customer_number": "CUST000001",
    "full_name": "John Doe",
    "email": "john@example.com",
    "phone": "(555) 123-4567"
  },
  "vehicle": {
    "id": 1,
    "vin": "1HGBH41JXMN109186",
    "year": 2020,
    "make": "Honda",
    "model": "Accord",
    "license_plate": "ABC123"
  },
  "customer_concerns": "Engine making strange noise, check engine light on",
  "is_customer_waiting": true,
  "created_at": "2025-10-02T14:00:00Z"
}
```

---

## 🔄 Work Order Lifecycle

### Complete Workflow: Draft → Closed

#### 1. Start Intake (draft → intake)
```bash
curl -X POST http://localhost:8080/api/workorders/work-orders/1/start_intake/ \
  -H "Authorization: Bearer $TOKEN"
```

#### 2. Start Diagnosis (intake → diagnosis)
```bash
curl -X POST http://localhost:8080/api/workorders/work-orders/1/start_diagnosis/ \
  -H "Authorization: Bearer $TOKEN"
```

#### 3. Complete Diagnosis (diagnosis → awaiting_approval or approved)
```bash
curl -X POST http://localhost:8080/api/workorders/work-orders/1/complete_diagnosis/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "diagnosis_notes": "Check engine light caused by faulty O2 sensor. Also found worn brake pads (30% remaining). Recommend replacing O2 sensor and brake pads.",
    "estimated_labor_hours": 3.5,
    "estimated_labor_cost": 350.00,
    "estimated_parts_cost": 280.00
  }'
```

**Response:**
```json
{
  "id": 1,
  "status": "awaiting_approval",
  "diagnosis_notes": "Check engine light caused by faulty O2 sensor...",
  "estimated_total": 630.00,
  "diagnosis_completed_at": "2025-10-02T14:30:00Z"
}
```

#### 4. Request Approval (any status → awaiting_approval)
```bash
curl -X POST http://localhost:8080/api/workorders/work-orders/1/request_approval/ \
  -H "Authorization: Bearer $TOKEN"
```

#### 5. Approve Work (awaiting_approval → approved)
```bash
curl -X POST http://localhost:8080/api/workorders/work-orders/1/approve/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approval_method": "phone",
    "approval_notes": "Customer approved all work. Wants both items completed today."
  }'
```

#### 6. Start Work (approved → in_progress)
```bash
curl -X POST http://localhost:8080/api/workorders/work-orders/1/start_work/ \
  -H "Authorization: Bearer $TOKEN"
```

#### 7. Pause Work (optional: in_progress → paused)
```bash
curl -X POST http://localhost:8080/api/workorders/work-orders/1/pause/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Waiting for parts delivery"
  }'
```

#### 8. Resume Work (paused → in_progress)
```bash
curl -X POST http://localhost:8080/api/workorders/work-orders/1/resume/ \
  -H "Authorization: Bearer $TOKEN"
```

#### 9. Request Quality Check (in_progress → quality_check)
```bash
curl -X POST http://localhost:8080/api/workorders/work-orders/1/request_quality_check/ \
  -H "Authorization: Bearer $TOKEN"
```

#### 10. Perform Quality Check (quality_check → completed or back to in_progress)
```bash
# If passed
curl -X POST http://localhost:8080/api/workorders/work-orders/1/quality_check/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quality_check_passed": true,
    "quality_check_notes": "All work completed satisfactorily. Test drive successful. No check engine light."
  }'

# If failed
curl -X POST http://localhost:8080/api/workorders/work-orders/1/quality_check/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quality_check_passed": false,
    "quality_check_notes": "Brake pads not properly seated. Requires adjustment."
  }'
```

#### 11. Complete Work Order (in_progress or quality_check → completed)
```bash
curl -X POST http://localhost:8080/api/workorders/work-orders/1/complete/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "odometer_out": 45235,
    "completion_notes": "All work completed successfully. Vehicle road tested."
  }'
```

#### 12. Mark Invoiced (completed → invoiced)
```bash
curl -X POST http://localhost:8080/api/workorders/work-orders/1/mark_invoiced/ \
  -H "Authorization: Bearer $TOKEN"
```

#### 13. Close Work Order (completed or invoiced → closed)
```bash
curl -X POST http://localhost:8080/api/workorders/work-orders/1/close/ \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🔧 Service Tasks Management

### Create Service Task
```bash
curl -X POST http://localhost:8080/api/workorders/tasks/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_order": 1,
    "sequence_order": 1,
    "task_type": "repair",
    "description": "Replace O2 sensor",
    "estimated_hours": 1.5,
    "labor_rate": 100.00,
    "assigned_to": 3
  }'
```

### Start Task (pending → in_progress)
```bash
curl -X POST http://localhost:8080/api/workorders/tasks/1/start/ \
  -H "Authorization: Bearer $TOKEN"
```

### Complete Task
```bash
curl -X POST http://localhost:8080/api/workorders/tasks/1/complete/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actual_hours": 1.25,
    "notes": "O2 sensor replaced. Cleared check engine light. Test successful."
  }'
```

### List Tasks for Work Order
```bash
curl "http://localhost:8080/api/workorders/tasks/?work_order=1" \
  -H "Authorization: Bearer $TOKEN"
```

### Create Multiple Tasks at Once
```bash
# Task 1: Diagnostic
curl -X POST http://localhost:8080/api/workorders/tasks/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_order": 1,
    "sequence_order": 1,
    "task_type": "diagnostic",
    "description": "Scan for error codes",
    "estimated_hours": 0.5,
    "labor_rate": 100.00
  }'

# Task 2: Repair
curl -X POST http://localhost:8080/api/workorders/tasks/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_order": 1,
    "sequence_order": 2,
    "task_type": "replacement",
    "description": "Replace O2 sensor",
    "estimated_hours": 1.5,
    "labor_rate": 100.00
  }'

# Task 3: Brake Service
curl -X POST http://localhost:8080/api/workorders/tasks/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_order": 1,
    "sequence_order": 3,
    "task_type": "replacement",
    "description": "Replace front brake pads",
    "estimated_hours": 1.5,
    "labor_rate": 100.00
  }'
```

---

## 🔩 Parts Management

### Add Part to Work Order
```bash
curl -X POST http://localhost:8080/api/workorders/parts/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_order": 1,
    "task": 2,
    "part_number": "OXS-12345",
    "part_name": "O2 Sensor - Upstream",
    "description": "Bosch oxygen sensor for Honda Accord 2020",
    "quantity": 1,
    "unit_cost": 85.00,
    "markup_percentage": 35,
    "warranty_months": 24,
    "warranty_notes": "2-year parts warranty"
  }'
```

**Response:**
```json
{
  "id": 1,
  "part_number": "OXS-12345",
  "part_name": "O2 Sensor - Upstream",
  "quantity": 1,
  "unit_cost": "85.00",
  "total_cost": "85.00",
  "markup_percentage": "35.00",
  "selling_price": "114.75",
  "status": "pending",
  "warranty_months": 24
}
```

### Update Part Status (ordered, received, installed)
```bash
curl -X PATCH http://localhost:8080/api/workorders/parts/1/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "ordered"
  }'
```

### Mark Part as Installed
```bash
curl -X POST http://localhost:8080/api/workorders/parts/1/mark_installed/ \
  -H "Authorization: Bearer $TOKEN"
```

### Add Multiple Parts
```bash
# Front brake pads
curl -X POST http://localhost:8080/api/workorders/parts/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_order": 1,
    "task": 3,
    "part_number": "BP-FR-98765",
    "part_name": "Front Brake Pads",
    "description": "Ceramic brake pads - front axle",
    "quantity": 1,
    "unit_cost": 65.00,
    "markup_percentage": 40,
    "warranty_months": 12
  }'

# Brake fluid
curl -X POST http://localhost:8080/api/workorders/parts/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_order": 1,
    "part_number": "BF-DOT4",
    "part_name": "DOT 4 Brake Fluid",
    "quantity": 1,
    "unit_cost": 12.00,
    "markup_percentage": 50
  }'
```

### List Parts for Work Order
```bash
curl "http://localhost:8080/api/workorders/parts/?work_order=1" \
  -H "Authorization: Bearer $TOKEN"
```

---

## ⏱️ Time Tracking

### Clock In (Create Time Log)
```bash
curl -X POST http://localhost:8080/api/workorders/time-logs/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_order": 1,
    "task": 2,
    "hourly_rate": 100.00,
    "description": "Working on O2 sensor replacement"
  }'
```

**Response:**
```json
{
  "id": 1,
  "work_order": 1,
  "task": 2,
  "technician": 3,
  "technician_name": "Mike Wilson",
  "clock_in": "2025-10-02T15:00:00Z",
  "clock_out": null,
  "duration_hours": null,
  "hourly_rate": "100.00",
  "labor_cost": null,
  "is_billable": true,
  "is_approved": false
}
```

### Clock Out
```bash
curl -X POST http://localhost:8080/api/workorders/time-logs/1/clock_out/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Completed O2 sensor replacement and testing"
  }'
```

**Response:**
```json
{
  "id": 1,
  "clock_in": "2025-10-02T15:00:00Z",
  "clock_out": "2025-10-02T16:15:00Z",
  "duration_hours": "1.25",
  "labor_cost": "125.00",
  "notes": "Completed O2 sensor replacement and testing"
}
```

### Update Time Log (e.g., mark as non-billable or approved)
```bash
curl -X PATCH http://localhost:8080/api/workorders/time-logs/1/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "is_approved": true
  }'
```

### List Time Logs for Work Order
```bash
curl "http://localhost:8080/api/workorders/time-logs/?work_order=1" \
  -H "Authorization: Bearer $TOKEN"
```

### List Time Logs by Technician
```bash
curl "http://localhost:8080/api/workorders/time-logs/?technician=3" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📝 Notes & Documentation

### Create Note

#### Internal Note (staff only)
```bash
curl -X POST http://localhost:8080/api/workorders/notes/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_order": 1,
    "note_type": "internal",
    "note": "Customer mentioned hearing noise for about 2 weeks. Started small and got louder.",
    "is_important": false,
    "is_customer_visible": false
  }'
```

#### Technician Note
```bash
curl -X POST http://localhost:8080/api/workorders/notes/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_order": 1,
    "note_type": "technician",
    "note": "Old O2 sensor was heavily corroded. Recommended customer consider fuel system cleaning service.",
    "is_important": false,
    "is_customer_visible": true
  }'
```

#### Parts Note
```bash
curl -X POST http://localhost:8080/api/workorders/notes/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_order": 1,
    "note_type": "parts",
    "note": "Used OEM Bosch sensor as aftermarket not available. Customer approved price difference.",
    "is_important": false,
    "is_customer_visible": false
  }'
```

#### Important Customer Note
```bash
curl -X POST http://localhost:8080/api/workorders/notes/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_order": 1,
    "note_type": "customer",
    "note": "IMPORTANT: Customer needs vehicle by 5pm today - has flight to catch.",
    "is_important": true,
    "is_customer_visible": false
  }'
```

### List Notes for Work Order
```bash
curl "http://localhost:8080/api/workorders/notes/?work_order=1" \
  -H "Authorization: Bearer $TOKEN"
```

### List Important Notes Only
```bash
curl "http://localhost:8080/api/workorders/notes/?is_important=true" \
  -H "Authorization: Bearer $TOKEN"
```

### Update Note
```bash
curl -X PATCH http://localhost:8080/api/workorders/notes/1/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "is_customer_visible": true
  }'
```

---

## 📸 Photo Management

### Upload Photo (Before Work)
```bash
curl -X POST http://localhost:8080/api/workorders/photos/ \
  -H "Authorization: Bearer $TOKEN" \
  -F "work_order=1" \
  -F "photo_type=before" \
  -F "caption=Engine bay before service" \
  -F "description=View of O2 sensor location before replacement" \
  -F "photo=@/path/to/photo.jpg"
```

### Upload Multiple Photos
```bash
# Before photo
curl -X POST http://localhost:8080/api/workorders/photos/ \
  -H "Authorization: Bearer $TOKEN" \
  -F "work_order=1" \
  -F "photo_type=before" \
  -F "caption=Vehicle condition before service" \
  -F "photo=@before.jpg"

# Damage photo
curl -X POST http://localhost:8080/api/workorders/photos/ \
  -H "Authorization: Bearer $TOKEN" \
  -F "work_order=1" \
  -F "photo_type=damage" \
  -F "caption=Corroded O2 sensor" \
  -F "description=Severe corrosion on old sensor threads" \
  -F "photo=@damaged_sensor.jpg"

# Part photo
curl -X POST http://localhost:8080/api/workorders/photos/ \
  -H "Authorization: Bearer $TOKEN" \
  -F "work_order=1" \
  -F "photo_type=part" \
  -F "caption=New Bosch O2 sensor" \
  -F "photo=@new_sensor.jpg"

# After photo
curl -X POST http://localhost:8080/api/workorders/photos/ \
  -H "Authorization: Bearer $TOKEN" \
  -F "work_order=1" \
  -F "photo_type=after" \
  -F "caption=Completed installation" \
  -F "photo=@after.jpg"
```

### List Photos for Work Order
```bash
curl "http://localhost:8080/api/workorders/photos/?work_order=1" \
  -H "Authorization: Bearer $TOKEN"
```

### List Photos by Type
```bash
curl "http://localhost:8080/api/workorders/photos/?photo_type=damage" \
  -H "Authorization: Bearer $TOKEN"
```

### Update Photo Metadata
```bash
curl -X PATCH http://localhost:8080/api/workorders/photos/1/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "caption": "Updated caption",
    "description": "Updated description"
  }'
```

---

## 📊 Dashboard & Analytics

### Get All Active Work Orders
```bash
curl http://localhost:8080/api/workorders/work-orders/active/ \
  -H "Authorization: Bearer $TOKEN"
```

**Returns:** All work orders with status in: draft, intake, diagnosis, awaiting_approval, approved, in_progress, paused, quality_check

### Get Overdue Work Orders
```bash
curl http://localhost:8080/api/workorders/work-orders/overdue/ \
  -H "Authorization: Bearer $TOKEN"
```

**Returns:** Work orders past estimated_completion date and still in progress/paused/quality_check

### Get Work Orders Awaiting Approval
```bash
curl http://localhost:8080/api/workorders/work-orders/awaiting_approval/ \
  -H "Authorization: Bearer $TOKEN"
```

### Get Work Orders with Customer Waiting
```bash
curl http://localhost:8080/api/workorders/work-orders/customer_waiting/ \
  -H "Authorization: Bearer $TOKEN"
```

### Get Work Orders by Technician
```bash
curl "http://localhost:8080/api/workorders/work-orders/by_technician/?technician_id=3" \
  -H "Authorization: Bearer $TOKEN"
```

**Returns:** Work orders where technician is primary_technician OR in assigned_technicians

### Get Status Summary
```bash
curl http://localhost:8080/api/workorders/work-orders/status_summary/ \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
[
  {
    "status": "in_progress",
    "count": 5,
    "total_estimated": "3450.00",
    "total_actual": "2890.00"
  },
  {
    "status": "awaiting_approval",
    "count": 3,
    "total_estimated": "1850.00",
    "total_actual": "0.00"
  }
]
```

### Get Technician Workload
```bash
curl http://localhost:8080/api/workorders/work-orders/technician_workload/ \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
[
  {
    "technician_id": 3,
    "name": "Mike Wilson",
    "active_work_orders": 4,
    "total_hours_this_week": "28.5",
    "work_orders": [
      {"id": 1, "work_order_number": "WO000001", "status": "in_progress"},
      {"id": 3, "work_order_number": "WO000003", "status": "quality_check"},
      {"id": 5, "work_order_number": "WO000005", "status": "in_progress"},
      {"id": 7, "work_order_number": "WO000007", "status": "paused"}
    ]
  },
  {
    "technician_id": 4,
    "name": "Sarah Johnson",
    "active_work_orders": 3,
    "total_hours_this_week": "24.0",
    "work_orders": [...]
  }
]
```

---

## 🔍 Filtering & Search

### Filter by Status
```bash
curl "http://localhost:8080/api/workorders/work-orders/?status=in_progress" \
  -H "Authorization: Bearer $TOKEN"
```

### Filter by Priority
```bash
curl "http://localhost:8080/api/workorders/work-orders/?priority=urgent" \
  -H "Authorization: Bearer $TOKEN"
```

### Filter by Multiple Criteria
```bash
curl "http://localhost:8080/api/workorders/work-orders/?status=in_progress&priority=high&is_customer_waiting=true" \
  -H "Authorization: Bearer $TOKEN"
```

### Search by Work Order Number
```bash
curl "http://localhost:8080/api/workorders/work-orders/?search=WO000001" \
  -H "Authorization: Bearer $TOKEN"
```

### Search by Customer Name
```bash
curl "http://localhost:8080/api/workorders/work-orders/?search=John" \
  -H "Authorization: Bearer $TOKEN"
```

### Search by VIN or License Plate
```bash
curl "http://localhost:8080/api/workorders/work-orders/?search=1HGBH41JXMN109186" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:8080/api/workorders/work-orders/?search=ABC123" \
  -H "Authorization: Bearer $TOKEN"
```

### Search in Customer Concerns or Diagnosis
```bash
curl "http://localhost:8080/api/workorders/work-orders/?search=engine+noise" \
  -H "Authorization: Bearer $TOKEN"
```

### Order Results
```bash
# By creation date (newest first)
curl "http://localhost:8080/api/workorders/work-orders/?ordering=-created_at" \
  -H "Authorization: Bearer $TOKEN"

# By estimated completion (soonest first)
curl "http://localhost:8080/api/workorders/work-orders/?ordering=estimated_completion" \
  -H "Authorization: Bearer $TOKEN"

# By priority (urgent first)
curl "http://localhost:8080/api/workorders/work-orders/?ordering=priority" \
  -H "Authorization: Bearer $TOKEN"

# By actual total (highest first)
curl "http://localhost:8080/api/workorders/work-orders/?ordering=-actual_total" \
  -H "Authorization: Bearer $TOKEN"
```

### Complex Query Example
```bash
# Get high priority work orders in progress for a specific customer,
# ordered by estimated completion (soonest first)
curl "http://localhost:8080/api/workorders/work-orders/?status=in_progress&priority=high&customer=1&ordering=estimated_completion" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🎯 Complete Example Workflow

Here's a complete example workflow from creation to completion:

```bash
# 1. Get authentication token
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@admin.com", "password": "danewcash54899"}' \
  | grep -o '"access":"[^"]*"' | cut -d'"' -f4)

# 2. Create work order
WO_ID=$(curl -s -X POST http://localhost:8080/api/workorders/work-orders/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": 1,
    "vehicle": 1,
    "customer_concerns": "Check engine light and brake squealing",
    "priority": "high",
    "odometer_in": 45230,
    "estimated_completion": "2025-10-03T16:00:00Z"
  }' | grep -o '"id":[0-9]*' | cut -d':' -f2)

echo "Created Work Order ID: $WO_ID"

# 3. Start intake
curl -s -X POST http://localhost:8080/api/workorders/work-orders/$WO_ID/start_intake/ \
  -H "Authorization: Bearer $TOKEN"

# 4. Start diagnosis
curl -s -X POST http://localhost:8080/api/workorders/work-orders/$WO_ID/start_diagnosis/ \
  -H "Authorization: Bearer $TOKEN"

# 5. Complete diagnosis
curl -s -X POST http://localhost:8080/api/workorders/work-orders/$WO_ID/complete_diagnosis/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "diagnosis_notes": "P0138 code - faulty O2 sensor. Brake pads at 30%.",
    "estimated_labor_hours": 3.5,
    "estimated_labor_cost": 350.00,
    "estimated_parts_cost": 280.00
  }'

# 6. Approve work
curl -s -X POST http://localhost:8080/api/workorders/work-orders/$WO_ID/approve/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approval_method": "phone",
    "approval_notes": "Customer approved"
  }'

# 7. Add service tasks
curl -s -X POST http://localhost:8080/api/workorders/tasks/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"work_order\": $WO_ID,
    \"sequence_order\": 1,
    \"task_type\": \"replacement\",
    \"description\": \"Replace O2 sensor\",
    \"estimated_hours\": 1.5,
    \"labor_rate\": 100.00
  }"

curl -s -X POST http://localhost:8080/api/workorders/tasks/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"work_order\": $WO_ID,
    \"sequence_order\": 2,
    \"task_type\": \"replacement\",
    \"description\": \"Replace brake pads\",
    \"estimated_hours\": 2.0,
    \"labor_rate\": 100.00
  }"

# 8. Add parts
curl -s -X POST http://localhost:8080/api/workorders/parts/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"work_order\": $WO_ID,
    \"part_number\": \"OXS-12345\",
    \"part_name\": \"O2 Sensor\",
    \"quantity\": 1,
    \"unit_cost\": 85.00,
    \"markup_percentage\": 35
  }"

curl -s -X POST http://localhost:8080/api/workorders/parts/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"work_order\": $WO_ID,
    \"part_number\": \"BP-FR-98765\",
    \"part_name\": \"Front Brake Pads\",
    \"quantity\": 1,
    \"unit_cost\": 65.00,
    \"markup_percentage\": 40
  }"

# 9. Start work
curl -s -X POST http://localhost:8080/api/workorders/work-orders/$WO_ID/start_work/ \
  -H "Authorization: Bearer $TOKEN"

# 10. Complete work
curl -s -X POST http://localhost:8080/api/workorders/work-orders/$WO_ID/complete/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "odometer_out": 45235,
    "completion_notes": "All work completed successfully"
  }'

# 11. Mark invoiced
curl -s -X POST http://localhost:8080/api/workorders/work-orders/$WO_ID/mark_invoiced/ \
  -H "Authorization: Bearer $TOKEN"

# 12. Get final details
curl -s http://localhost:8080/api/workorders/work-orders/$WO_ID/ \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

---

## 🎨 Available Filters Reference

### Work Orders
- `status` - draft, intake, diagnosis, awaiting_approval, approved, in_progress, paused, quality_check, completed, invoiced, closed
- `priority` - low, normal, high, urgent
- `customer` - Customer ID
- `vehicle` - Vehicle ID
- `primary_technician` - Technician User ID
- `is_customer_waiting` - true/false
- `requires_approval` - true/false
- `approved_by_customer` - true/false
- `quality_check_required` - true/false
- `quality_check_completed` - true/false
- `is_warranty` - true/false
- `is_recall` - true/false

### Service Tasks
- `work_order` - Work Order ID
- `status` - pending, in_progress, completed, skipped
- `task_type` - inspection, maintenance, repair, diagnostic, replacement, adjustment, cleaning, other
- `assigned_to` - Technician User ID

### Work Order Parts
- `work_order` - Work Order ID
- `status` - pending, ordered, received, installed, returned

### Technician Time Logs
- `work_order` - Work Order ID
- `technician` - Technician User ID
- `is_billable` - true/false
- `is_approved` - true/false

### Work Order Notes
- `work_order` - Work Order ID
- `note_type` - internal, customer, technician, parts, approval, quality, general
- `is_important` - true/false
- `is_customer_visible` - true/false

### Work Order Photos
- `work_order` - Work Order ID
- `photo_type` - before, during, after, damage, part, diagnostic, other

---

## 🚀 Quick Commands Cheat Sheet

```bash
# Set token once
export TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@admin.com", "password": "danewcash54899"}' \
  | grep -o '"access":"[^"]*"' | cut -d'"' -f4)

# List work orders
curl "http://localhost:8080/api/workorders/work-orders/" -H "Authorization: Bearer $TOKEN"

# Get active work orders
curl "http://localhost:8080/api/workorders/work-orders/active/" -H "Authorization: Bearer $TOKEN"

# Get overdue
curl "http://localhost:8080/api/workorders/work-orders/overdue/" -H "Authorization: Bearer $TOKEN"

# Get status summary
curl "http://localhost:8080/api/workorders/work-orders/status_summary/" -H "Authorization: Bearer $TOKEN"

# Get technician workload
curl "http://localhost:8080/api/workorders/work-orders/technician_workload/" -H "Authorization: Bearer $TOKEN"
```

---

**Last Updated:** October 2, 2025  
**Phase:** 3 - Work Orders & Service Management  
**Status:** ✅ COMPLETE AND OPERATIONAL  
**Server:** http://localhost:8080/  
**Next:** Phase 4 - Inventory Management
