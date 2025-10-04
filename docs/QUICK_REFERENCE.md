# 🚀 Quick Reference Card - Smart Vehicle Repairs System

## 📊 Current Status
- **Progress:** 23% (Phase 2 Complete ✅)
- **Server:** http://localhost:8080/
- **Admin:** http://localhost:8080/admin/
- **Credentials:** admin@admin.com / danewcash54899

---

## 🔑 Quick Commands

### Get JWT Token
```bash
curl -X POST http://localhost:8080/api/accounts/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@admin.com","password":"danewcash54899"}'
```

### Set Token as Environment Variable
```bash
export TOKEN="your_access_token_here"
```

---

## 📱 Phase 1 Endpoints (Customers & Vehicles)

### Customers
```bash
# List customers
GET /api/customers/customers/

# Create customer (auto CUST000001)
POST /api/customers/customers/

# Suspend customer
POST /api/customers/customers/{id}/suspend/

# Fleet customers
GET /api/customers/customers/fleet_customers/
```

### Vehicles
```bash
# List vehicles
GET /api/vehicles/vehicles/

# Register vehicle (VIN validation)
POST /api/vehicles/vehicles/

# Record mileage
POST /api/vehicles/vehicles/{id}/record_mileage/

# Upload document
POST /api/vehicles/vehicles/{id}/upload_document/

# Service due
GET /api/vehicles/vehicles/due_service/

# Search by VIN
GET /api/vehicles/vehicles/search_vin/?vin=ABC123
```

---

## 📅 Phase 2 Endpoints (Appointments)

### Service Bays
```bash
# List bays
GET /api/appointments/service-bays/

# Create bay
POST /api/appointments/service-bays/

# Available bays
GET /api/appointments/service-bays/available/
```

### Appointments
```bash
# Create appointment (auto APT000001)
POST /api/appointments/appointments/

# Available time slots
GET /api/appointments/appointments/available_slots/?date=2025-10-15

# Today's appointments
GET /api/appointments/appointments/today/

# Calendar view
GET /api/appointments/appointments/calendar/?start_date=2025-10-15&end_date=2025-10-21

# Technician schedule
GET /api/appointments/appointments/technician_schedule/?technician_id=3&date=2025-10-15

# Confirm appointment
POST /api/appointments/appointments/{id}/confirm/

# Check in customer
POST /api/appointments/appointments/{id}/check_in/

# Complete appointment
POST /api/appointments/appointments/{id}/complete/

# Cancel appointment
POST /api/appointments/appointments/{id}/cancel/

# Reschedule
POST /api/appointments/appointments/{id}/reschedule/

# Overdue/no-shows
GET /api/appointments/appointments/overdue/
```

---

## 📚 Documentation Quick Links

| File | Purpose | Size |
|------|---------|------|
| `ROADMAP.md` | Full 13-phase plan | 39KB |
| `PROJECT_STATUS.md` | Overall status | 14KB |
| `PHASE1_COMPLETE.md` | Phase 1 report | 11KB |
| `PHASE2_COMPLETE.md` | Phase 2 report | 14KB |
| `QUICK_START_PHASE1.md` | Phase 1 testing | 5.6KB |
| `QUICK_START_PHASE2.md` | Phase 2 testing | 14KB |

---

## 🎯 Common Workflows

### 1. Create Complete Customer Record
```bash
# 1. Create customer
POST /api/customers/customers/
{"email":"customer@example.com","first_name":"John","last_name":"Doe",...}

# 2. Add note
POST /api/customers/customer-notes/
{"customer":1,"note":"Preferred customer"}

# 3. Register vehicle
POST /api/vehicles/vehicles/
{"owner":1,"vin":"1HGBH41JXMN109186","make":"Honda",...}

# 4. Upload documents
POST /api/vehicles/vehicles/{id}/upload_document/
```

### 2. Schedule and Complete Appointment
```bash
# 1. Check available slots
GET /api/appointments/appointments/available_slots/?date=2025-10-15

# 2. Create appointment
POST /api/appointments/appointments/
{"customer":1,"vehicle":1,"appointment_date":"2025-10-15",...}

# 3. Confirm (receptionist)
POST /api/appointments/appointments/1/confirm/

# 4. Check in (customer arrives)
POST /api/appointments/appointments/1/check_in/

# 5. Complete (service done)
POST /api/appointments/appointments/1/complete/
```

### 3. Search and Filter
```bash
# Search customers by name
GET /api/customers/customers/?search=John

# Filter by status
GET /api/customers/customers/?is_active=true

# Search vehicles by VIN/plate
GET /api/vehicles/vehicles/?search=ABC123

# Filter appointments by status
GET /api/appointments/appointments/?status=confirmed

# Filter by date range
GET /api/appointments/appointments/?appointment_date_after=2025-10-15
```

---

## 🔍 Troubleshooting

### Issue: "Authentication credentials not provided"
```bash
# Solution: Set token
export TOKEN="your_access_token_here"
# Or use -H "Authorization: Bearer your_token" in curl
```

### Issue: "Vehicle does not belong to customer"
```bash
# Solution: Use correct customer-vehicle pair
GET /api/customers/customers/{id}/vehicles/  # Get customer's vehicles
```

### Issue: "Cannot schedule appointments in the past"
```bash
# Solution: Use future dates
# Current: 2025-10-02, use dates >= 2025-10-03
```

### Issue: "Service bay not available"
```bash
# Solution: Check bay availability
GET /api/appointments/service-bays/available/
# Or use different time slot
GET /api/appointments/appointments/available_slots/?date=2025-10-15
```

---

## 🎨 Admin Interface

### Access: http://localhost:8080/admin/

### Features:
- ✅ **Color-coded badges** (status, priority, check-in)
- ✅ **Rich filtering** (by date, status, type)
- ✅ **Search** (customers, vehicles, appointments)
- ✅ **Inline editing** (notes, reminders)
- ✅ **Date hierarchy** (quick date navigation)
- ✅ **Computed fields** (end_time, is_overdue)

### Quick Actions:
1. View all customers: `/admin/customers/customer/`
2. View all vehicles: `/admin/vehicles/vehicle/`
3. View all appointments: `/admin/appointments/appointment/`
4. Add service bay: `/admin/appointments/servicebay/add/`
5. View reminders: `/admin/appointments/appointmentreminder/`

---

## 📈 Auto-Generated Numbers

| Type | Format | Example |
|------|--------|---------|
| Customer | CUST000001 | CUST000001, CUST000002... |
| Appointment | APT000001 | APT000001, APT000002... |
| Work Order (Phase 3) | WO000001 | WO000001, WO000002... |

---

## 🔄 Status Workflows

### Appointment Status Flow:
```
pending → confirmed → in_progress → completed
    ↓          ↓            ↓
cancelled  cancelled    cancelled
    ↓          ↓            ↓
no_show    no_show      no_show
    ↓
rescheduled
```

### Customer Status:
- `active` - Normal customer
- `suspended` - Cannot create appointments

### Vehicle Status:
- `active` - In service
- `sold` - Transferred
- `totaled` - Not serviceable
- `in_service` - Currently being worked on

---

## 🚀 Next Actions

### Option 1: Test Phase 2
See `QUICK_START_PHASE2.md` for detailed testing guide

### Option 2: Start Phase 3
Say: **"Phase 3"** or **"Build work orders"**

### Option 3: Review Admin
Visit: http://localhost:8080/admin/

---

## 💾 Backup & Safety

### Database Location
```bash
/home/handy/smart_vehicle_repairs_system/db.sqlite3
```

### Backup Database
```bash
cp db.sqlite3 db.sqlite3.backup-$(date +%Y%m%d-%H%M%S)
```

### Reset Database (if needed)
```bash
rm db.sqlite3
python manage.py migrate
python manage.py createsuperuser
```

---

## 📞 Support

**Documentation Issues?** Check:
1. `ROADMAP.md` - Overall plan
2. `PROJECT_STATUS.md` - Current status
3. `PHASE2_COMPLETE.md` - Latest features
4. `QUICK_START_PHASE2.md` - Testing examples

**Development Questions?**
- Review model definitions in `apps/*/models.py`
- Check serializers in `apps/*/serializers.py`
- View endpoints in `apps/*/views.py`

---

**Last Updated:** October 2, 2025  
**Version:** Phase 2 Complete (23% of project)  
**Status:** ✅ Operational - Ready for Phase 3
