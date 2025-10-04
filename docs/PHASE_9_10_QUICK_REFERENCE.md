# Phase 9 & 10 Quick Reference Guide

**Quick access guide for developers implementing Phase 9 (Inspections) and Phase 10 (Reporting)**

---

## 🔍 Phase 9: Vehicle Inspections

### URL Patterns Needed
```python
# apps/inspections/urls.py
from django.urls import path
from . import views

app_name = 'inspections'

urlpatterns = [
    # Inspections
    path('', views.inspection_list, name='inspection-list'),
    path('create/', views.inspection_create, name='inspection-create'),
    path('<int:pk>/', views.inspection_detail, name='inspection-detail'),
    path('<int:pk>/edit/', views.inspection_edit, name='inspection-edit'),
    path('<int:pk>/print/', views.inspection_print, name='inspection-print'),
    path('<int:pk>/pdf/', views.inspection_pdf, name='inspection-pdf'),
    path('<int:pk>/delete/', views.inspection_delete, name='inspection-delete'),
    
    # Templates
    path('templates/', views.template_list, name='template-list'),
    path('templates/<int:pk>/', views.template_detail, name='template-detail'),
    path('templates/<int:pk>/edit/', views.template_edit, name='template-edit'),
    path('templates/create/', views.template_create, name='template-create'),
]
```

### View Context Examples
```python
# inspection_list view
context = {
    'inspections': inspections,
    'templates': InspectionTemplate.objects.filter(is_active=True),
    'technicians': User.objects.filter(role='technician'),
}

# inspection_detail view
context = {
    'inspection': inspection,
    'categories': inspection.template.categories.all(),
}

# inspection_form view
context = {
    'form': form,
    'categories': template.categories.prefetch_related('items'),
}
```

### Key Model Methods Needed
```python
# VehicleInspection model
@property
def pass_count(self):
    return self.results.filter(status='pass').count()

@property
def fail_count(self):
    return self.results.filter(status='fail').count()

@property
def warning_count(self):
    return self.results.filter(status='warning').count()

def get_result_for_item(self, item_id):
    return self.results.filter(item_id=item_id).first()
```

---

## 📊 Phase 10: Reporting & Analytics

### URL Patterns Needed
```python
# apps/reporting/urls.py
from django.urls import path
from . import views

app_name = 'reporting'

urlpatterns = [
    # Dashboard
    path('', views.report_dashboard, name='report-dashboard'),
    
    # Reports
    path('financial/', views.financial_report, name='financial-report'),
    path('operational/', views.operational_report, name='operational-report'),
    path('inventory/', views.inventory_report, name='inventory-report'),
    path('customer/', views.customer_report, name='customer-report'),
    path('vehicle/', views.vehicle_report, name='vehicle-report'),
    path('custom/', views.custom_report, name='custom-report'),
    
    # Report Actions
    path('viewer/<int:pk>/', views.report_viewer, name='report-viewer'),
    path('generate-custom-report/', views.generate_custom_report, name='generate-custom-report'),
    path('email-report/', views.email_report, name='email-report'),
    path('save-report/', views.save_report, name='save-report'),
    
    # Schedules
    path('schedules/<int:pk>/edit/', views.schedule_edit, name='schedule-edit'),
    path('schedules/<int:pk>/delete/', views.schedule_delete, name='schedule-delete'),
]
```

### View Context Examples

#### Financial Report
```python
context = {
    'total_revenue': Decimal('15000.00'),
    'profit_margin': Decimal('35.5'),
    'pending_invoices': Decimal('3500.00'),
    'overdue_amount': Decimal('1200.00'),
    'pending_count': 12,
    'overdue_count': 5,
    'revenue_change': 12.5,
    'avg_margin': 32.8,
    
    # Chart data (JSON serialized)
    'revenue_labels': json.dumps(['Jan', 'Feb', 'Mar', 'Apr', 'May']),
    'revenue_data': json.dumps([12000, 13500, 14200, 15000, 15800]),
    'profit_data': json.dumps([4200, 4700, 4900, 5250, 5500]),
    
    'service_type_labels': json.dumps(['Oil Change', 'Brake Service', 'Tire Rotation', 'Inspection', 'Other']),
    'service_type_data': json.dumps([4500, 3200, 2100, 2800, 2400]),
    
    'payment_method_labels': json.dumps(['Cash', 'Card', 'Mobile Money', 'Bank Transfer']),
    'payment_method_data': json.dumps([5000, 7000, 2500, 500]),
    
    # Tables
    'top_customers': customers.annotate(
        total_revenue=Sum('invoices__total'),
        work_order_count=Count('vehicles__workorders'),
        avg_order_value=Avg('invoices__total'),
        last_visit_date=Max('vehicles__workorders__created_at')
    ).order_by('-total_revenue')[:10],
    
    'monthly_data': [
        {
            'month': 'January 2025',
            'revenue': 12000,
            'expenses': 7800,
            'profit': 4200,
            'margin': 35.0,
            'change': 5.2
        },
        # ... more months
    ],
    
    # Filters
    'start_date': '2025-01-01',
    'end_date': '2025-10-04',
}
```

#### Operational Report
```python
context = {
    'total_workorders': 145,
    'total_revenue': 45000,
    'avg_turnaround': 24.5,
    'customer_satisfaction': 92,
    'revenue_change': 8.3,
    
    # Charts
    'workorder_labels': json.dumps(['Pending', 'In Progress', 'Completed', 'Cancelled']),
    'workorder_data': json.dumps([8, 15, 118, 4]),
    
    'bay_labels': json.dumps(['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4']),
    'bay_utilization': json.dumps([85, 92, 78, 88]),
    
    'appointment_status_data': json.dumps([120, 15, 8, 35]),
    
    'hour_labels': json.dumps(['8AM', '9AM', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM', '4PM', '5PM']),
    'hourly_appointments': json.dumps([5, 8, 12, 15, 18, 14, 16, 12, 8, 4]),
    
    # Tables
    'technician_performance': technicians.annotate(
        completed_orders=Count('workorders', filter=Q(workorders__status='completed')),
        total_hours=Sum('workorders__labor_hours'),
        revenue=Sum('workorders__total_amount')
    ).annotate(
        avg_completion_time=Avg('workorders__completion_hours'),
        rating=Avg('workorders__customer_rating')
    ),
    
    'avg_wait_time': 15.3,
    'avg_inspection': 8.5,
}
```

#### Dashboard
```python
context = {
    'scheduled_reports': ReportSchedule.objects.filter(is_active=True),
    'saved_reports': SavedReport.objects.filter(
        Q(created_by=request.user) | Q(is_public=True)
    ).order_by('-created_at')[:10],
}
```

---

## 🎨 CSS Classes Used

### Status Badges
```css
.badge.bg-success     /* Completed, Active, Pass */
.badge.bg-warning     /* In Progress, Pending, Warning */
.badge.bg-danger      /* Failed, Overdue, Critical */
.badge.bg-info        /* Approved, Info */
.badge.bg-secondary   /* Draft, Inactive */
.badge.bg-primary     /* Default, Featured */
```

### Border Highlights
```css
.border-start.border-success.border-4  /* KPI cards - positive metrics */
.border-start.border-primary.border-4  /* KPI cards - primary metrics */
.border-start.border-warning.border-4  /* KPI cards - warning metrics */
.border-start.border-danger.border-4   /* KPI cards - critical metrics */
.border-start.border-info.border-4     /* KPI cards - info metrics */
```

### Result Colors (Inspections)
```css
.result-pass    { background-color: #d1fae5; border-left: 4px solid #10b981; }
.result-fail    { background-color: #fee2e2; border-left: 4px solid #ef4444; }
.result-warning { background-color: #fef3c7; border-left: 4px solid #f59e0b; }
```

---

## 📦 Required Dependencies

### Python Packages
```python
# PDF Generation
weasyprint>=60.0

# Excel Export
openpyxl>=3.1.2

# Already installed:
# django-crispy-forms
# crispy-bootstrap5
```

### JavaScript Libraries (CDN)
```html
<!-- Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>

<!-- Signature Pad -->
<script src="https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js"></script>

<!-- Flatpickr (Date Picker) -->
<link href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>

<!-- Select2 (Dropdowns) -->
<link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
```

---

## 🔧 Helper Functions

### PDF Generation (WeasyPrint)
```python
from django.http import HttpResponse
from django.template.loader import render_to_string
from weasyprint import HTML

def inspection_pdf(request, pk):
    inspection = get_object_or_404(VehicleInspection, pk=pk)
    html_string = render_to_string('inspections/inspection_print.html', {
        'inspection': inspection,
        'now': timezone.now()
    })
    
    html = HTML(string=html_string, base_url=request.build_absolute_uri())
    pdf = html.write_pdf()
    
    response = HttpResponse(pdf, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="inspection_{pk}.pdf"'
    return response
```

### Excel Export
```python
from openpyxl import Workbook
from django.http import HttpResponse

def export_to_excel(request):
    wb = Workbook()
    ws = wb.active
    ws.title = "Financial Report"
    
    # Headers
    ws.append(['Month', 'Revenue', 'Expenses', 'Profit', 'Margin'])
    
    # Data
    for item in monthly_data:
        ws.append([item['month'], item['revenue'], item['expenses'], 
                   item['profit'], item['margin']])
    
    response = HttpResponse(
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response['Content-Disposition'] = 'attachment; filename=financial_report.xlsx'
    wb.save(response)
    return response
```

### CSV Export
```python
import csv
from django.http import HttpResponse

def export_to_csv(request):
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="report.csv"'
    
    writer = csv.writer(response)
    writer.writerow(['Month', 'Revenue', 'Expenses', 'Profit', 'Margin'])
    
    for item in monthly_data:
        writer.writerow([item['month'], item['revenue'], item['expenses'], 
                        item['profit'], item['margin']])
    
    return response
```

### Email Report
```python
from django.core.mail import EmailMessage
from django.template.loader import render_to_string

def email_report(request):
    recipients = request.POST.get('email_recipients').split(',')
    subject = request.POST.get('subject')
    message = request.POST.get('message')
    
    # Generate PDF
    html_string = render_to_string('reporting/financial_report.html', context)
    pdf = HTML(string=html_string).write_pdf()
    
    email = EmailMessage(
        subject=subject,
        body=message,
        from_email='reports@smartvehiclerepairs.com',
        to=[email.strip() for email in recipients]
    )
    email.attach('report.pdf', pdf, 'application/pdf')
    email.send()
    
    return JsonResponse({'success': True})
```

---

## 🎯 Testing Commands

### Create Test Data
```python
# Management command: python manage.py create_test_inspections
from django.core.management.base import BaseCommand
from apps.inspections.models import *
from apps.accounts.models import User
from apps.vehicles.models import Vehicle

class Command(BaseCommand):
    def handle(self, *args, **options):
        # Create inspection template
        template = InspectionTemplate.objects.create(
            name="Multi-Point Inspection",
            description="Standard 50-point inspection",
            created_by=User.objects.filter(role='admin').first()
        )
        
        # Create categories
        category = InspectionCategory.objects.create(
            template=template,
            name="Engine",
            order=1
        )
        
        # Create items
        InspectionItem.objects.create(
            category=category,
            name="Oil Level",
            item_type="pass_fail",
            order=1
        )
        
        # Create inspection
        vehicle = Vehicle.objects.first()
        technician = User.objects.filter(role='technician').first()
        
        inspection = VehicleInspection.objects.create(
            template=template,
            vehicle=vehicle,
            technician=technician,
            inspection_date=timezone.now(),
            odometer_reading=50000,
            status='completed'
        )
        
        self.stdout.write(self.style.SUCCESS('Test data created!'))
```

### Test URLs
```bash
# Inspections
http://localhost:8000/inspections/
http://localhost:8000/inspections/create/
http://localhost:8000/inspections/1/
http://localhost:8000/inspections/1/print/
http://localhost:8000/inspections/templates/

# Reporting
http://localhost:8000/reporting/
http://localhost:8000/reporting/financial/
http://localhost:8000/reporting/operational/
http://localhost:8000/reporting/custom/
```

---

## 📱 Mobile Testing Checklist

### Inspections
- [ ] Touch signature on iPad/tablet
- [ ] Camera capture from phone
- [ ] Photo upload from gallery
- [ ] Swipe through results
- [ ] Responsive forms
- [ ] Large touch targets

### Reporting
- [ ] Charts render correctly
- [ ] Tables scroll horizontally
- [ ] Date picker works on mobile
- [ ] Export buttons accessible
- [ ] Cards stack properly

---

## 🐛 Common Issues & Solutions

### Issue: Signature pad not working
**Solution:** Ensure canvas is sized correctly before initialization
```javascript
function resizeCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
}
```

### Issue: Charts not displaying
**Solution:** Ensure Chart.js is loaded and canvas has correct ID
```html
<canvas id="revenueChart"></canvas>
<script>
    const ctx = document.getElementById('revenueChart').getContext('2d');
    new Chart(ctx, { /* config */ });
</script>
```

### Issue: Image upload too slow
**Solution:** Image compression is already implemented, but verify max size
```javascript
const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1200;
canvas.toDataURL('image/jpeg', 0.8);  // 80% quality
```

### Issue: Date range not working
**Solution:** Check date format (YYYY-MM-DD)
```python
from datetime import datetime
start_date = datetime.strptime(request.GET.get('start_date'), '%Y-%m-%d')
```

---

## 🔐 Permissions Example

```python
from django.contrib.auth.decorators import login_required, permission_required
from config.roles import role_required

@login_required
@role_required(['admin', 'manager', 'technician'])
def inspection_create(request):
    # Only admins, managers, and technicians can create inspections
    pass

@login_required
@role_required(['admin', 'manager'])
def financial_report(request):
    # Only admins and managers can view financial reports
    pass
```

---

## 📋 Checklist for Going Live

### Phase 9 (Inspections)
- [ ] URL patterns configured
- [ ] View functions created
- [ ] Model methods implemented
- [ ] PDF generation working
- [ ] Email functionality tested
- [ ] Signature capture tested on tablets
- [ ] Photo upload tested
- [ ] Mobile camera tested
- [ ] Permissions configured
- [ ] Test data created

### Phase 10 (Reporting)
- [ ] URL patterns configured
- [ ] View functions created
- [ ] Chart data aggregation working
- [ ] Export to PDF tested
- [ ] Export to Excel tested
- [ ] Export to CSV tested
- [ ] Email report tested
- [ ] Scheduled reports configured
- [ ] Custom report builder tested
- [ ] Permissions configured

---

**Quick Start:** Copy URL patterns → Create views → Test with sample data → Deploy! 🚀
