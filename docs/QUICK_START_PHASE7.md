# Phase 7: Reporting & Analytics - Quick Start Guide

## 🚀 Getting Started

This guide will help you test all the reporting and analytics features in Phase 7.

---

## 📋 Prerequisites

1. **Server Running:**
   ```bash
   cd /home/handy/smart_vehicle_repairs_system
   python3 manage.py runserver 0.0.0.0:8080
   ```

2. **Get Authentication Token:**
   ```bash
   # Login as admin
   curl -X POST http://localhost:8080/api/accounts/login/ \
     -H "Content-Type: application/json" \
     -d '{
       "email": "admin@example.com",
       "password": "admin123"
     }'
   
   # Save the access token
   export TOKEN="your_access_token_here"
   ```

---

## 1️⃣ Dashboard Overview

Get comprehensive dashboard with today's metrics, alerts, and recent activity.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/dashboard/
```

**Expected Response:**
```json
{
  "today": {
    "appointments": 5,
    "revenue": 1250.00,
    "date": "2024-12-19"
  },
  "week": {
    "revenue": 8500.00,
    "start_date": "2024-12-16"
  },
  "month": {
    "revenue": 45000.00,
    "start_date": "2024-12-01"
  },
  "alerts": {
    "active_work_orders": 12,
    "overdue_invoices": {
      "count": 3,
      "total": 2500.00
    },
    "low_stock_items": 7,
    "pending_estimates": 4
  },
  "recent_activity": {
    "work_orders": [...],
    "appointments": [...]
  }
}
```

---

## 2️⃣ Financial Reports

### Revenue Report (Current Month)

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/reporting/reports/revenue/?start_date=2024-12-01&end_date=2024-12-19&period=daily"
```

**Query Parameters:**
- `start_date` - Start date (YYYY-MM-DD)
- `end_date` - End date (YYYY-MM-DD)
- `period` - Grouping: `daily`, `weekly`, `monthly`

**Example: Last 7 Days Revenue**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/reporting/reports/revenue/?start_date=2024-12-12&end_date=2024-12-19&period=daily"
```

### Profit Margin Report

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/reporting/reports/profit-margin/?start_date=2024-12-01&end_date=2024-12-19"
```

**Shows:**
- Labor revenue
- Parts revenue
- Parts costs
- Gross profit
- Profit margin %

---

## 3️⃣ Operational Reports

### Work Order Statistics

```bash
# Last 30 days (default)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/reports/work-orders/

# Custom date range
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/reporting/reports/work-orders/?start_date=2024-11-01&end_date=2024-12-19"
```

**Shows:**
- Total work orders
- Status breakdown
- Priority distribution
- Average completion time
- Top services

### Technician Performance

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/reporting/reports/technicians/?start_date=2024-11-19&end_date=2024-12-19"
```

**Shows per technician:**
- Total work orders
- Completed count
- In-progress count
- Revenue generated
- Average completion time

### Appointment Statistics

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/reporting/reports/appointments/?start_date=2024-11-19&end_date=2024-12-19"
```

**Shows:**
- Total appointments
- No-show rate
- Completion rate
- Cancellation rate
- Service bay utilization

---

## 4️⃣ Inventory Reports

### Inventory Valuation

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/reports/inventory/valuation/
```

**Shows:**
- Total inventory value
- Value by category
- Total items count
- Total quantity

### Inventory Turnover

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/reports/inventory/turnover/
```

**Shows (Last 90 Days):**
- Fast-moving parts (turnover > 1.0)
- Slow-moving parts (turnover < 0.3)
- Turnover rate per part
- Days of stock remaining

### Low Stock Report

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/reports/inventory/low-stock/
```

**Shows:**
- Parts below reorder point
- Critical stock items
- Reorder recommendations
- Supplier information

---

## 5️⃣ Customer Reports

### Customer Statistics

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/reports/customers/
```

**Shows:**
- Total customers
- Active customers
- New customers (30 days)
- Top 10 customers by lifetime value
- Vehicles per customer
- Work orders per customer

---

## 6️⃣ Vehicle Reports

### Vehicle Statistics

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/reports/vehicles/
```

**Shows:**
- Total vehicles
- Top 10 makes
- Distribution by year
- Most serviced vehicles

### Service Due Report

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/reports/vehicles/service-due/
```

**Shows:**
- Vehicles not serviced in 6+ months
- Customer contact information
- Days since last service
- Proactive service opportunities

---

## 🎯 Common Testing Scenarios

### Scenario 1: Daily Management Dashboard
```bash
# Morning check - today's metrics
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/dashboard/

# Check technician workload
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/reports/technicians/

# Check low stock alerts
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/reports/inventory/low-stock/
```

### Scenario 2: Weekly Revenue Review
```bash
# This week's revenue
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/reporting/reports/revenue/?start_date=2024-12-16&end_date=2024-12-19&period=daily"

# Week-over-week comparison
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/reporting/reports/revenue/?start_date=2024-12-09&end_date=2024-12-15&period=daily"

# Check profit margins
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/reporting/reports/profit-margin/?start_date=2024-12-16&end_date=2024-12-19"
```

### Scenario 3: Monthly Business Review
```bash
# Monthly revenue
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/reporting/reports/revenue/?start_date=2024-12-01&end_date=2024-12-19&period=weekly"

# Work order statistics
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/reporting/reports/work-orders/?start_date=2024-12-01&end_date=2024-12-19"

# Customer acquisition
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/reports/customers/

# Top performing technicians
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/reporting/reports/technicians/?start_date=2024-12-01&end_date=2024-12-19"
```

### Scenario 4: Inventory Management
```bash
# Current inventory value
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/reports/inventory/valuation/

# Identify fast-moving parts
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/reports/inventory/turnover/

# Reorder needed
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/reports/inventory/low-stock/
```

### Scenario 5: Customer Retention
```bash
# Identify top customers
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/reports/customers/

# Find vehicles due for service
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/reporting/reports/vehicles/service-due/

# Review appointment no-shows
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/reporting/reports/appointments/?start_date=2024-11-19&end_date=2024-12-19"
```

---

## 🔧 Admin Interface Testing

### Access Admin Panel
```
http://localhost:8080/admin/
```

### Test Report Schedules
1. Navigate to **Reporting → Report schedules**
2. Click **Add Report Schedule**
3. Fill in details:
   - Name: "Daily Revenue Report"
   - Report type: Revenue
   - Frequency: Daily
   - Email recipients: your@email.com
   - Is active: ✓
   - Next run date: Tomorrow
4. Click **Save**

### Test Saved Reports
1. Navigate to **Reporting → Saved reports**
2. Click **Add Saved Report**
3. Fill in details:
   - Name: "Top Customers This Month"
   - Report type: Customers
   - Is public: ✓
   - Parameters: `{"date_range": "30_days"}`
4. Click **Save**

### Test Dashboard Widgets
1. Navigate to **Reporting → Dashboard widgets**
2. Click **Add Dashboard Widget**
3. Fill in details:
   - User: Select user
   - Widget type: Revenue Today
   - Position: 1
   - Width: 4
   - Height: 200
   - Is visible: ✓
   - Settings: `{"refresh_interval": 300}`
4. Click **Save**

---

## 📊 Expected Outcomes

### Dashboard
- ✅ Shows today's appointments and revenue
- ✅ Displays week and month totals
- ✅ Lists active alerts (work orders, overdue invoices, low stock)
- ✅ Shows recent activity (work orders, appointments)

### Financial Reports
- ✅ Revenue breakdown by period
- ✅ Revenue by payment method
- ✅ Revenue by technician
- ✅ Profit margin calculations

### Operational Reports
- ✅ Work order statistics by status/priority
- ✅ Average completion times
- ✅ Technician performance metrics
- ✅ Appointment no-show rates

### Inventory Reports
- ✅ Total inventory valuation
- ✅ Turnover rate analysis
- ✅ Low stock alerts
- ✅ Fast vs slow-moving parts

### Customer Reports
- ✅ Customer lifetime value
- ✅ Top customers ranking
- ✅ New customer tracking

### Vehicle Reports
- ✅ Fleet composition
- ✅ Service frequency
- ✅ Maintenance due alerts

---

## 🐛 Troubleshooting

### Empty Reports
**Problem:** Reports return empty data

**Solutions:**
1. Check if you have data in the database:
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:8080/api/workorders/work-orders/
   ```

2. Verify date ranges include existing data

3. Check authentication token is valid

### Date Format Errors
**Problem:** "time data does not match format"

**Solution:** Use YYYY-MM-DD format:
```bash
# Correct ✓
start_date=2024-12-19

# Incorrect ✗
start_date=12/19/2024
```

### Permission Denied
**Problem:** 403 Forbidden error

**Solution:**
1. Verify token is not expired
2. Refresh token if needed:
   ```bash
   curl -X POST http://localhost:8080/api/accounts/token/refresh/ \
     -H "Content-Type: application/json" \
     -d '{"refresh": "your_refresh_token"}'
   ```

---

## 💡 Tips

### Date Range Selection
- **Today:** Use current date for both start and end
- **This Week:** Monday to today
- **This Month:** First of month to today
- **Last 30 Days:** 30 days ago to today
- **Quarter:** 90 days ago to today

### Performance Tips
- Shorter date ranges = faster queries
- Use appropriate period grouping (daily for short ranges, monthly for long)
- Dashboard endpoint is optimized for real-time display

### Best Practices
- Cache reports that don't change frequently
- Schedule automated reports during off-peak hours
- Use saved reports for frequent queries
- Customize dashboard widgets per user role

---

## 🎉 Success Checklist

- [ ] Dashboard loads with today's metrics
- [ ] Revenue report shows data by period
- [ ] Profit margin calculated correctly
- [ ] Work order statistics display
- [ ] Technician performance metrics shown
- [ ] Appointment statistics with no-show rate
- [ ] Inventory valuation calculated
- [ ] Inventory turnover rates shown
- [ ] Low stock alerts displayed
- [ ] Customer lifetime values calculated
- [ ] Vehicle statistics by make/model
- [ ] Service due alerts generated
- [ ] Admin interfaces accessible
- [ ] Report schedules created
- [ ] Saved reports working
- [ ] Dashboard widgets configured

---

## 📚 Additional Resources

- **Full Documentation:** PHASE7_COMPLETE.md
- **API Endpoints:** All endpoints documented in PHASE7_COMPLETE.md
- **Data Models:** See models.py for schema details
- **Admin Guide:** Django admin at /admin/

---

**Need Help?** Check PHASE7_COMPLETE.md for detailed API documentation and examples.

**Ready for Phase 8?** See ROADMAP.md for the Notifications System plan.
