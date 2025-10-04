# 📊 Phase 2 Dashboard Quick Reference

## 🚀 Quick Start

### Test the Dashboards:
1. **Start Server:** Already running on http://127.0.0.1:8002/
2. **Login:** http://127.0.0.1:8002/accounts/login/
3. **View Dashboard:** Automatic redirect based on role

### Test Users:
```python
# Admin user
Username: admin
Role: admin

# Create test users in Django shell if needed:
python manage.py createsuperuser
```

---

## 📂 File Structure

```
templates/
├── dashboard/
│   ├── admin_dashboard.html           # Admin overview
│   ├── manager_dashboard.html         # Manager metrics
│   ├── technician_dashboard.html      # Technician work list
│   ├── receptionist_dashboard.html    # Reception operations
│   └── partials/
│       ├── stats_card.html            # Metric cards
│       ├── chart_revenue.html         # Revenue chart
│       ├── chart_workorders.html      # Work order chart
│       ├── recent_appointments.html   # Appointments widget
│       ├── recent_workorders.html     # Work orders widget
│       ├── low_stock_alerts.html      # Inventory alerts
│       └── notifications_feed.html    # Notifications
```

---

## 🎨 Component Usage

### Stats Card:
```django
{% include 'dashboard/partials/stats_card.html' with 
    title="Total Customers" 
    value=total_customers 
    icon="fas fa-users" 
    color="primary" 
    link="customers:customer-list" 
    trend="+5%" 
    subtitle="Active accounts"
%}
```

**Parameters:**
- `title` (required): Card title
- `value` (required): Metric value to display
- `icon` (optional): Font Awesome icon class
- `color` (optional): primary/success/warning/danger/info
- `link` (optional): URL name for clickable card
- `trend` (optional): Percentage change (e.g., "+5%")
- `subtitle` (optional): Additional info text
- `col_size` (optional): Bootstrap column size (default: 3)

---

### Revenue Chart:
```django
{% include 'dashboard/partials/chart_revenue.html' %}
```

**Required Context:**
```python
context['revenue_chart_data'] = [
    {'date': 'Oct 01', 'revenue': 1250.50},
    {'date': 'Oct 02', 'revenue': 980.25},
    # ... 7 days total
]
```

---

### Work Orders Chart:
```django
{% include 'dashboard/partials/chart_workorders.html' %}
```

**Required Context:**
```python
context['workorder_stats'] = [
    {'status': 'pending', 'count': 5},
    {'status': 'in_progress', 'count': 12},
    {'status': 'completed', 'count': 8},
]
```

---

### Recent Appointments:
```django
{% include 'dashboard/partials/recent_appointments.html' %}
```

**Required Context:**
```python
context['recent_appointments'] = Appointment.objects.filter(
    appointment_date__gte=today
).select_related('customer__user', 'vehicle').order_by('appointment_date')[:5]
```

---

### Recent Work Orders:
```django
{% include 'dashboard/partials/recent_workorders.html' %}
```

**Required Context:**
```python
context['recent_workorders'] = WorkOrder.objects.filter(
    status__in=['pending', 'in_progress', 'awaiting_parts']
).select_related('customer__user', 'vehicle').order_by('-created_at')[:5]
```

---

### Low Stock Alerts:
```django
{% include 'dashboard/partials/low_stock_alerts.html' %}
```

**Required Context:**
```python
from django.db.models import Q, F

context['low_stock_items'] = Part.objects.filter(
    Q(quantity_in_stock__lte=F('minimum_stock')) | Q(quantity_in_stock=0)
).order_by('quantity_in_stock')[:10]
```

---

### Notifications Feed:
```django
{% include 'dashboard/partials/notifications_feed.html' %}
```

**Required Context:**
```python
context['recent_notifications'] = Notification.objects.filter(
    user=request.user
).order_by('-created_at')[:10]
```

---

## 🎯 Role-Specific Dashboards

### Admin Dashboard
**Template:** `dashboard/admin_dashboard.html`  
**URL:** `/dashboard/` (when logged in as admin)

**Sections:**
1. 8 Key Metrics (2 rows)
2. Revenue Chart + Work Order Chart
3. Recent Appointments + Recent Work Orders
4. Low Stock Alerts + Notifications
5. Quick Actions (4 buttons)

**Context Required:**
- total_customers, total_vehicles
- active_workorders, monthly_revenue
- pending_invoices_count, pending_invoices_amount
- today_appointments, low_stock_count
- active_technicians
- All component contexts (see above)

---

### Technician Dashboard
**Template:** `dashboard/technician_dashboard.html`  
**URL:** `/dashboard/` (when logged in as technician)

**Sections:**
1. Personal Metrics (4 cards)
2. Today's Schedule (table)
3. My Active Work Orders (list)
4. Parts Needed (if any)

**Context Required:**
- my_active_workorders (count)
- completed_today
- pending_approvals
- hours_logged
- today_appointments (assigned to me)
- my_workorders (queryset)
- parts_needed (optional)

---

### Manager Dashboard
**Template:** `dashboard/manager_dashboard.html`  
**URL:** `/dashboard/` (when logged in as manager)

**Sections:**
1. Financial Metrics (4 cards)
2. Operational Metrics (4 cards)
3. Revenue Chart + Work Order Chart
4. Technician Performance + Top Services
5. Recent Activity + Inventory Alerts

**Context Required:**
- monthly_revenue, revenue_trend
- pending_payments, pending_amount
- week_revenue, avg_job_value
- active_workorders, completed_week
- satisfaction_score, tech_utilization
- tech_performance (list)
- top_services (list)

---

### Receptionist Dashboard
**Template:** `dashboard/receptionist_dashboard.html`  
**URL:** `/dashboard/` (when logged in as receptionist)

**Sections:**
1. Reception Metrics (4 cards)
2. Today's Full Schedule (table with check-in)
3. Quick Actions + Notifications
4. Recent Customers (table)

**Context Required:**
- today_appointments
- checked_in_count
- waiting_count
- new_customers_week
- today_schedule (full queryset)
- recent_customers (queryset)

---

## 🔧 View Implementation

### Basic Structure:
```python
@login_required
def dashboard_view(request):
    user = request.user
    role = user.role
    
    # Common context
    context = {
        'user': user,
        'role': role,
        # ... common metrics
    }
    
    # Role-specific logic
    if role == 'admin':
        # Add admin-specific context
        template = 'dashboard/admin_dashboard.html'
    elif role == 'technician':
        # Add technician-specific context
        template = 'dashboard/technician_dashboard.html'
    elif role == 'manager':
        # Add manager-specific context
        template = 'dashboard/manager_dashboard.html'
    elif role == 'receptionist':
        # Add receptionist-specific context
        template = 'dashboard/receptionist_dashboard.html'
    else:
        template = 'dashboard/dashboard.html'
    
    return render(request, template, context)
```

---

## 🎨 Styling & Colors

### Status Colors:
```css
/* Work Order Status */
.badge.bg-pending-status { background-color: #f59e0b; }        /* orange */
.badge.bg-in-progress-status { background-color: #3b82f6; }    /* blue */
.badge.bg-awaiting-parts-status { background-color: #6366f1; } /* indigo */
.badge.bg-completed-status { background-color: #10b981; }      /* green */
.badge.bg-cancelled-status { background-color: #ef4444; }      /* red */

/* Card Colors */
.bg-primary-subtle { background-color: rgba(79, 70, 229, 0.1); }
.bg-success-subtle { background-color: rgba(16, 185, 129, 0.1); }
.bg-warning-subtle { background-color: rgba(245, 158, 11, 0.1); }
.bg-danger-subtle { background-color: rgba(239, 68, 68, 0.1); }
.bg-info-subtle { background-color: rgba(59, 130, 246, 0.1); }
```

### Icons:
```html
<!-- Common Icons -->
<i class="fas fa-users"></i>          <!-- Customers -->
<i class="fas fa-car"></i>             <!-- Vehicles -->
<i class="fas fa-wrench"></i>          <!-- Work Orders -->
<i class="fas fa-calendar-check"></i>  <!-- Appointments -->
<i class="fas fa-dollar-sign"></i>     <!-- Revenue -->
<i class="fas fa-box-open"></i>        <!-- Inventory -->
<i class="fas fa-bell"></i>            <!-- Notifications -->
<i class="fas fa-chart-line"></i>      <!-- Analytics -->
```

---

## ⚡ Auto-Refresh Settings

### Intervals:
- **Admin:** 5 minutes (300000ms)
- **Manager:** 5 minutes (300000ms)
- **Technician:** 2 minutes (120000ms)
- **Receptionist:** 3 minutes (180000ms)

### Implementation:
```javascript
// In template {% block extra_js %}
<script>
setInterval(function() {
    location.reload();
}, 120000); // 2 minutes
</script>
```

---

## 🔄 AJAX Functionality

### Check-In Customer (Receptionist):
```javascript
function checkIn(appointmentId) {
    fetch(`/api/appointments/appointments/${appointmentId}/check_in/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCookie('csrftoken'),
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        alert('Customer checked in!');
        location.reload();
    });
}
```

### Mark Notification as Read:
```javascript
fetch(`/api/notifications/notifications/${notificationId}/mark_read/`, {
    method: 'POST',
    headers: {
        'X-CSRFToken': getCookie('csrftoken'),
        'Content-Type': 'application/json'
    }
});
```

---

## 📊 Chart.js Configuration

### Revenue Chart (Line):
```javascript
new Chart(ctx, {
    type: 'line',
    data: {
        labels: ['Oct 01', 'Oct 02', ...],
        datasets: [{
            label: 'Revenue ($)',
            data: [1250, 980, ...],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.4
        }]
    }
});
```

### Work Orders Chart (Doughnut):
```javascript
new Chart(ctx, {
    type: 'doughnut',
    data: {
        labels: ['PENDING', 'IN PROGRESS', ...],
        datasets: [{
            data: [5, 12, 8],
            backgroundColor: ['#f59e0b', '#3b82f6', '#10b981']
        }]
    }
});
```

---

## 🐛 Troubleshooting

### Charts Not Showing:
1. Check Chart.js CDN is loaded
2. Verify context data format
3. Check browser console for errors
4. Ensure canvas element has ID

### Dashboard Not Loading:
1. Check user role assignment
2. Verify template path
3. Check context data is provided
4. Review server logs

### Auto-Refresh Issues:
1. Check JavaScript console
2. Verify interval timing
3. Test manual refresh first

---

## 📚 Related Files

- **Views:** `config/views.py::dashboard_view()`
- **URLs:** `config/urls.py` (path: `/dashboard/`)
- **Base Template:** `templates/base.html`
- **Documentation:** `docs/PHASE2_DASHBOARD_COMPLETE.md`

---

## ✅ Testing Commands

```bash
# Start server
./venv/bin/python manage.py runserver 8002

# Create test data (Django shell)
python manage.py shell
>>> from apps.customers.models import Customer
>>> Customer.objects.count()

# Check for errors
python manage.py check

# Run tests
python manage.py test
```

---

**Last Updated:** October 4, 2025  
**Status:** ✅ Complete and Production Ready  
**Server:** http://127.0.0.1:8002/
