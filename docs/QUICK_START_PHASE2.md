# 🚀 Quick Start Guide: Testing Phase 2 (Appointments)

## Prerequisites
1. Server running: `python manage.py runserver 8080`
2. JWT Token obtained (see below)
3. Customer and Vehicle created (from Phase 1)

---

## 🔑 Step 1: Get Authentication Token

```bash
# Login as admin
curl -X POST http://localhost:8080/api/accounts/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@admin.com",
    "password": "danewcash54899"
  }'
```

**Save the access token from response!**

```bash
# Set token as environment variable (easier for testing)
export TOKEN="your_access_token_here"
```

---

## 📅 Step 2: Create Service Bays

```bash
# Create General Bay
curl -X POST http://localhost:8080/api/appointments/service-bays/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "General Bay 1",
    "bay_type": "general",
    "status": "available",
    "capacity": 1,
    "equipment_available": "Hydraulic lift, Air compressor, Diagnostic scanner",
    "is_active": true
  }'

# Create Quick Service Bay
curl -X POST http://localhost:8080/api/appointments/service-bays/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Quick Lube Bay",
    "bay_type": "quick_service",
    "status": "available",
    "capacity": 2,
    "equipment_available": "Oil drain system, Tire changer",
    "is_active": true
  }'

# Create Diagnostic Bay
curl -X POST http://localhost:8080/api/appointments/service-bays/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Diagnostic Bay 1",
    "bay_type": "diagnostic",
    "status": "available",
    "capacity": 1,
    "equipment_available": "Advanced diagnostic scanner, Oscilloscope, Multimeter",
    "is_active": true
  }'
```

**List all bays:**
```bash
curl -X GET http://localhost:8080/api/appointments/service-bays/ \
  -H "Authorization: Bearer $TOKEN"
```

**Get only available bays:**
```bash
curl -X GET http://localhost:8080/api/appointments/service-bays/available/ \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🗓️ Step 3: Check Available Time Slots

```bash
# Check slots for October 15, 2025
curl -X GET "http://localhost:8080/api/appointments/appointments/available_slots/?date=2025-10-15" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "date": "2025-10-15",
  "slots": [
    {"time": "08:00", "available": true},
    {"time": "09:00", "available": true},
    {"time": "10:00", "available": true},
    ...
  ],
  "total_slots": 9,
  "available_slots": 9
}
```

---

## 📝 Step 4: Create Appointments

### Appointment 1: Oil Change (Quick Service)
```bash
curl -X POST http://localhost:8080/api/appointments/appointments/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": 1,
    "vehicle": 1,
    "appointment_date": "2025-10-15",
    "appointment_time": "09:00:00",
    "estimated_duration": 45,
    "service_type": "oil_change",
    "priority": "normal",
    "customer_concerns": "Regular oil change due",
    "special_instructions": "Customer prefers synthetic oil",
    "estimated_cost": "59.99",
    "service_bay": 2
  }'
```

### Appointment 2: Diagnostic (Higher Priority)
```bash
curl -X POST http://localhost:8080/api/appointments/appointments/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": 1,
    "vehicle": 1,
    "appointment_date": "2025-10-15",
    "appointment_time": "14:00:00",
    "estimated_duration": 120,
    "service_type": "diagnostics",
    "priority": "high",
    "customer_concerns": "Check engine light on, rough idle",
    "special_instructions": "Customer reports issue started 3 days ago",
    "estimated_cost": "125.00",
    "service_bay": 3,
    "assigned_technicians": [3]
  }'
```

### Appointment 3: Brake Repair (Urgent)
```bash
curl -X POST http://localhost:8080/api/appointments/appointments/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": 1,
    "vehicle": 1,
    "appointment_date": "2025-10-16",
    "appointment_time": "08:00:00",
    "estimated_duration": 180,
    "service_type": "brakes",
    "priority": "urgent",
    "customer_concerns": "Grinding noise from front brakes, vibration when stopping",
    "special_instructions": "URGENT: Customer concerned about safety",
    "estimated_cost": "350.00",
    "service_bay": 1,
    "assigned_technicians": [3]
  }'
```

---

## 📋 Step 5: View Appointments

### List All Appointments
```bash
curl -X GET http://localhost:8080/api/appointments/appointments/ \
  -H "Authorization: Bearer $TOKEN"
```

### Today's Appointments
```bash
curl -X GET http://localhost:8080/api/appointments/appointments/today/ \
  -H "Authorization: Bearer $TOKEN"
```

### Upcoming Appointments (Next 7 Days)
```bash
curl -X GET "http://localhost:8080/api/appointments/appointments/upcoming/?days=7" \
  -H "Authorization: Bearer $TOKEN"
```

### Calendar View (Week)
```bash
curl -X GET "http://localhost:8080/api/appointments/appointments/calendar/?start_date=2025-10-15&end_date=2025-10-21" \
  -H "Authorization: Bearer $TOKEN"
```

### Filter by Priority
```bash
# Get only urgent appointments
curl -X GET "http://localhost:8080/api/appointments/appointments/?priority=urgent" \
  -H "Authorization: Bearer $TOKEN"
```

### Filter by Status
```bash
# Get pending appointments
curl -X GET "http://localhost:8080/api/appointments/appointments/?status=pending" \
  -H "Authorization: Bearer $TOKEN"
```

### Search by Appointment Number
```bash
curl -X GET "http://localhost:8080/api/appointments/appointments/?search=APT000001" \
  -H "Authorization: Bearer $TOKEN"
```

---

## ✅ Step 6: Appointment Workflow

### 6.1: Confirm Appointment
```bash
curl -X POST http://localhost:8080/api/appointments/appointments/1/confirm/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "confirmation_method": "phone",
    "confirmation_notes": "Confirmed with customer via phone call"
  }'
```

**What happens:**
- Status changes from `pending` → `confirmed`
- `confirmed_at` timestamp set
- `confirmed_by` set to current user

### 6.2: Check In Customer
```bash
curl -X POST http://localhost:8080/api/appointments/appointments/1/check_in/ \
  -H "Authorization: Bearer $TOKEN"
```

**What happens:**
- Status changes to `in_progress`
- `checked_in` set to `true`
- `checked_in_at` timestamp set

### 6.3: Complete Appointment
```bash
curl -X POST http://localhost:8080/api/appointments/appointments/1/complete/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "completion_notes": "Oil change completed, synthetic oil used"
  }'
```

**What happens:**
- Status changes to `completed`
- `actual_end_time` set to now
- Vehicle's `last_service_date` updated

---

## 🔄 Step 7: Reschedule Appointment

```bash
curl -X POST http://localhost:8080/api/appointments/appointments/2/reschedule/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "appointment_date": "2025-10-16",
    "appointment_time": "15:00:00",
    "reason": "Customer requested different time"
  }'
```

**What happens:**
- Date and time updated
- Status changes to `rescheduled`
- Original data preserved

---

## ❌ Step 8: Cancel Appointment

```bash
curl -X POST http://localhost:8080/api/appointments/appointments/3/cancel/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Customer cancelled due to schedule conflict"
  }'
```

**What happens:**
- Status changes to `cancelled`
- `cancellation_reason` saved
- `cancelled_at` timestamp set

---

## 👨‍🔧 Step 9: Technician Schedule

```bash
# Get technician's schedule for specific date
curl -X GET "http://localhost:8080/api/appointments/appointments/technician_schedule/?technician_id=3&date=2025-10-15" \
  -H "Authorization: Bearer $TOKEN"
```

**Response includes:**
```json
{
  "technician_id": 3,
  "date": "2025-10-15",
  "appointments": [...],
  "total_appointments": 2,
  "total_hours": 5.0
}
```

---

## 🔔 Step 10: Send Reminder

```bash
curl -X POST http://localhost:8080/api/appointments/appointments/1/send_reminder/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reminder_type": "email",
    "custom_message": "Reminder: Your appointment is tomorrow at 9:00 AM"
  }'
```

---

## 📊 Step 11: Advanced Queries

### Get Overdue Appointments (No-Shows)
```bash
curl -X GET http://localhost:8080/api/appointments/appointments/overdue/ \
  -H "Authorization: Bearer $TOKEN"
```

### Filter by Service Type
```bash
# Get all oil change appointments
curl -X GET "http://localhost:8080/api/appointments/appointments/?service_type=oil_change" \
  -H "Authorization: Bearer $TOKEN"
```

### Filter by Date Range
```bash
curl -X GET "http://localhost:8080/api/appointments/appointments/?appointment_date_after=2025-10-15&appointment_date_before=2025-10-20" \
  -H "Authorization: Bearer $TOKEN"
```

### Search Multiple Fields
```bash
# Search by customer name, VIN, or concerns
curl -X GET "http://localhost:8080/api/appointments/appointments/?search=brake" \
  -H "Authorization: Bearer $TOKEN"
```

### Ordering
```bash
# Order by date (ascending)
curl -X GET "http://localhost:8080/api/appointments/appointments/?ordering=appointment_date,appointment_time" \
  -H "Authorization: Bearer $TOKEN"

# Order by priority (urgent first)
curl -X GET "http://localhost:8080/api/appointments/appointments/?ordering=-priority" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🎨 Step 12: Admin Interface

Visit: **http://localhost:8080/admin/**

**Login:** admin@admin.com / danewcash54899

### What You'll See:
✅ **Color-coded status badges** (green=confirmed, blue=in_progress, etc.)  
✅ **Priority indicators** (red=urgent, orange=high, etc.)  
✅ **Check-in status** (green checkmark when checked in)  
✅ **Inline reminders** (add reminders directly in appointment)  
✅ **Date hierarchy** (quick navigation by date)  
✅ **Rich filtering** (by status, priority, date, service type)  
✅ **Search** (appointment number, customer, vehicle)

---

## 🧪 Testing Scenarios

### Scenario 1: Full Booking Flow
1. Check available slots
2. Create appointment (pending)
3. Confirm appointment (phone)
4. Customer arrives → check in
5. Service complete → mark complete
6. Verify vehicle last_service_date updated

### Scenario 2: Double-Booking Prevention
1. Create appointment for Bay 1 at 9:00 AM
2. Try to create another appointment for Bay 1 at 9:00 AM
3. Should fail with validation error ✅

### Scenario 3: Past Date Prevention
1. Try to create appointment with yesterday's date
2. Should fail with "Cannot schedule appointments in the past" ✅

### Scenario 4: Calendar Management
1. Create 5 appointments across 3 days
2. View calendar (date range)
3. See appointments grouped by date with counts

### Scenario 5: Technician Workload
1. Assign technician to 3 appointments
2. View technician schedule
3. See total hours calculated

---

## ⚡ Quick Test Script

Save this as `test_appointments.sh`:

```bash
#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Phase 2 Appointment Testing ===${NC}\n"

# Get token
echo -e "${GREEN}1. Getting auth token...${NC}"
TOKEN=$(curl -s -X POST http://localhost:8080/api/accounts/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@admin.com","password":"danewcash54899"}' \
  | jq -r '.access')
echo "Token: ${TOKEN:0:20}..."

# Create bay
echo -e "\n${GREEN}2. Creating service bay...${NC}"
BAY_ID=$(curl -s -X POST http://localhost:8080/api/appointments/service-bays/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Bay",
    "bay_type": "general",
    "status": "available",
    "capacity": 1
  }' | jq -r '.id')
echo "Bay ID: $BAY_ID"

# Check available slots
echo -e "\n${GREEN}3. Checking available slots...${NC}"
curl -s -X GET "http://localhost:8080/api/appointments/appointments/available_slots/?date=2025-10-15" \
  -H "Authorization: Bearer $TOKEN" | jq '.total_slots, .available_slots'

# Create appointment
echo -e "\n${GREEN}4. Creating appointment...${NC}"
APT_ID=$(curl -s -X POST http://localhost:8080/api/appointments/appointments/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"customer\": 1,
    \"vehicle\": 1,
    \"appointment_date\": \"2025-10-15\",
    \"appointment_time\": \"10:00:00\",
    \"estimated_duration\": 60,
    \"service_type\": \"maintenance\",
    \"priority\": \"normal\",
    \"customer_concerns\": \"Test appointment\",
    \"service_bay\": $BAY_ID
  }" | jq -r '.appointment_number')
echo "Appointment: $APT_ID"

# Get today's appointments
echo -e "\n${GREEN}5. Getting today's appointments...${NC}"
curl -s -X GET http://localhost:8080/api/appointments/appointments/today/ \
  -H "Authorization: Bearer $TOKEN" | jq 'length'

echo -e "\n${BLUE}=== Test Complete! ===${NC}"
```

**Run:** `bash test_appointments.sh`

---

## 📚 Next Steps

After testing Phase 2:
1. ✅ Verify all endpoints work
2. ✅ Check admin interface
3. ✅ Test validations (double-booking, past dates)
4. 🚀 **Ready for Phase 3: Work Orders!**

---

## 🐛 Troubleshooting

### Issue: "Authentication credentials not provided"
**Solution:** Check token is set: `echo $TOKEN`

### Issue: "Vehicle does not belong to customer"
**Solution:** Use correct customer-vehicle pair from Phase 1

### Issue: "Service bay is not available"
**Solution:** Check bay status: `GET /api/appointments/service-bays/{id}/`

### Issue: "Cannot schedule appointments in the past"
**Solution:** Use future dates (2025-10-15 or later)

---

**Ready to test? Start with Step 1!** 🚀
