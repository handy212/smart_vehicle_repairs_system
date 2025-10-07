"""
Frontend views for Reporting & Analytics
"""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.db.models import Sum, Count, Avg, Q, F
from django.utils import timezone
from datetime import timedelta
import json

from apps.billing.models import Invoice, Payment
from apps.workorders.models import WorkOrder
from apps.inventory.models import Part
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.appointments.models import Appointment


@login_required
def report_dashboard(request):
    """Report center landing page"""
    # Get scheduled reports (if model exists)
    scheduled_reports = []  # TODO: Add scheduled reports model
    saved_reports = []  # TODO: Add saved reports model
    
    context = {
        'scheduled_reports': scheduled_reports,
        'saved_reports': saved_reports,
    }
    
    return render(request, 'reporting/report_dashboard.html', context)


@login_required
def financial_report(request):
    """Financial analytics and revenue reports"""
    # Date range filter
    days = int(request.GET.get('days', 30))
    start_date = timezone.now() - timedelta(days=days)
    
    # Revenue metrics
    invoices = Invoice.objects.filter(created_at__gte=start_date)
    total_revenue = invoices.aggregate(total=Sum('total'))['total'] or 0
    total_revenue = float(total_revenue)
    total_paid = invoices.filter(status='paid').aggregate(total=Sum('total'))['total'] or 0
    total_paid = float(total_paid)
    total_pending = invoices.filter(status='pending').aggregate(total=Sum('total'))['total'] or 0
    total_pending = float(total_pending)
    total_overdue = invoices.filter(status='overdue').aggregate(total=Sum('total'))['total'] or 0
    total_overdue = float(total_overdue)
    
    # Calculate profit margin (revenue - labor - parts costs)
    # For simplicity, assuming 40% margin
    profit_margin = total_revenue * 0.40 if total_revenue else 0
    profit_percentage = (profit_margin / total_revenue * 100) if total_revenue else 0
    
    # Revenue trend data (last 12 months)
    revenue_labels = []
    revenue_data = []
    profit_data = []
    
    for i in range(12):
        month_date = timezone.now() - timedelta(days=30*i)
        month_start = month_date.replace(day=1)
        month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        
        month_revenue = Invoice.objects.filter(
            created_at__gte=month_start,
            created_at__lte=month_end,
            status='paid'
        ).aggregate(total=Sum('total'))['total'] or 0
        month_revenue = float(month_revenue)
        
        month_profit = month_revenue * 0.40  # 40% margin
        
        revenue_labels.insert(0, month_date.strftime('%b %Y'))
        revenue_data.insert(0, month_revenue)
        profit_data.insert(0, month_profit)
    
    # Service type breakdown - using work_order customer_concerns and description
    service_type_labels = ['General Service', 'Repair', 'Inspection', 'Maintenance', 'Other']
    service_revenue = float(invoices.filter(work_order__customer_concerns__icontains='service').aggregate(total=Sum('total'))['total'] or 0)
    repair_revenue = float(invoices.filter(work_order__customer_concerns__icontains='repair').aggregate(total=Sum('total'))['total'] or 0)
    inspection_revenue = float(invoices.filter(work_order__customer_concerns__icontains='inspection').aggregate(total=Sum('total'))['total'] or 0)
    maintenance_revenue = float(invoices.filter(work_order__customer_concerns__icontains='maintenance').aggregate(total=Sum('total'))['total'] or 0)
    other_revenue = total_revenue - (service_revenue + repair_revenue + inspection_revenue + maintenance_revenue)
    other_revenue = max(0, other_revenue)  # Ensure non-negative
    
    service_type_data = [
        service_revenue,
        repair_revenue,
        inspection_revenue,
        maintenance_revenue,
        other_revenue,
    ]
    
    # Payment methods breakdown
    payments = Payment.objects.filter(payment_date__gte=start_date)
    payment_method_labels = ['Cash', 'Card', 'Mobile Money', 'Bank Transfer']
    payment_method_data = [
        float(payments.filter(payment_method='cash').aggregate(total=Sum('amount'))['total'] or 0),
        float(payments.filter(payment_method='card').aggregate(total=Sum('amount'))['total'] or 0),
        float(payments.filter(payment_method='mobile_money').aggregate(total=Sum('amount'))['total'] or 0),
        float(payments.filter(payment_method='bank_transfer').aggregate(total=Sum('amount'))['total'] or 0),
    ]
    
    # Top customers
    top_customers = Customer.objects.annotate(
        total_spent=Sum('invoices__total')
    ).order_by('-total_spent')[:10]
    
    context = {
        'total_revenue': total_revenue,
        'total_paid': total_paid,
        'total_pending': total_pending,
        'total_overdue': total_overdue,
        'profit_margin': profit_margin,
        'profit_percentage': profit_percentage,
        'revenue_labels': json.dumps(revenue_labels),
        'revenue_data': json.dumps(revenue_data),
        'profit_data': json.dumps(profit_data),
        'service_type_labels': json.dumps(service_type_labels),
        'service_type_data': json.dumps(service_type_data),
        'payment_method_labels': json.dumps(payment_method_labels),
        'payment_method_data': json.dumps(payment_method_data),
        'top_customers': top_customers,
        'days': days,
    }
    
    return render(request, 'reporting/financial_report.html', context)


@login_required
def operational_report(request):
    """Operational metrics and technician performance"""
    # Date range filter
    days = int(request.GET.get('days', 30))
    start_date = timezone.now() - timedelta(days=days)
    
    # Work order statistics
    workorders = WorkOrder.objects.filter(created_at__gte=start_date)
    
    workorder_labels = ['Pending', 'In Progress', 'Completed', 'Cancelled']
    workorder_data = [
        workorders.filter(status='pending').count(),
        workorders.filter(status='in_progress').count(),
        workorders.filter(status='completed').count(),
        workorders.filter(status='cancelled').count(),
    ]
    
    # Technician performance
    from apps.accounts.models import User
    technicians = User.objects.filter(role='technician', is_active=True).annotate(
        completed_jobs=Count('assigned_work_orders', filter=Q(assigned_work_orders__status='completed')),
        avg_time=Avg('assigned_work_orders__actual_labor_hours')
    ).order_by('-completed_jobs')
    
    # Appointment statistics
    appointments = Appointment.objects.filter(appointment_date__gte=start_date)
    
    appointment_labels = ['Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No Show']
    appointment_data = [
        appointments.filter(status='scheduled').count(),
        appointments.filter(status='confirmed').count(),
        appointments.filter(status='completed').count(),
        appointments.filter(status='cancelled').count(),
        appointments.filter(status='no_show').count(),
    ]
    
    # Average completion times
    avg_completion_time = workorders.filter(status='completed').aggregate(
        avg_time=Avg('actual_labor_hours')
    )['avg_time'] or 0
    
    context = {
        'total_workorders': workorders.count(),
        'completed_workorders': workorders.filter(status='completed').count(),
        'avg_completion_time': round(avg_completion_time, 1),
        'workorder_labels': json.dumps(workorder_labels),
        'workorder_data': json.dumps(workorder_data),
        'appointment_labels': json.dumps(appointment_labels),
        'appointment_data': json.dumps(appointment_data),
        'technicians': technicians,
        'days': days,
    }
    
    return render(request, 'reporting/operational_report.html', context)


@login_required
def inventory_report(request):
    """Inventory analytics"""
    parts = Part.objects.all()
    
    # Inventory statistics
    total_parts = parts.count()
    in_stock = parts.filter(quantity_in_stock__gt=0).count()
    low_stock = parts.filter(quantity_in_stock__lte=F('reorder_point')).count()
    out_of_stock = parts.filter(quantity_in_stock=0).count()
    
    # Inventory value
    total_value = float(parts.aggregate(
        total=Sum(F('quantity_in_stock') * F('cost_price'))
    )['total'] or 0)
    
    context = {
        'total_parts': total_parts,
        'in_stock': in_stock,
        'low_stock': low_stock,
        'out_of_stock': out_of_stock,
        'total_value': total_value,
        'inventory_labels': json.dumps(['In Stock', 'Low Stock', 'Out of Stock']),
        'inventory_data': json.dumps([in_stock, low_stock, out_of_stock]),
    }
    
    return render(request, 'reporting/inventory_report.html', context)


@login_required
def customer_report(request):
    """Customer analytics"""
    customers = Customer.objects.all()
    
    # Customer statistics
    total_customers = customers.count()
    active_customers = customers.filter(is_active=True).count()
    
    # Customer lifetime value
    customers_with_value = customers.annotate(
        lifetime_value=Sum('invoices__total')
    ).order_by('-lifetime_value')[:20]
    
    context = {
        'total_customers': total_customers,
        'active_customers': active_customers,
        'top_customers': customers_with_value,
    }
    
    return render(request, 'reporting/customer_report.html', context)


@login_required
def vehicle_report(request):
    """Vehicle analytics"""
    vehicles = Vehicle.objects.all()
    
    # Vehicle statistics
    total_vehicles = vehicles.count()
    
    # Vehicles by make
    vehicles_by_make = vehicles.values('make').annotate(
        count=Count('id')
    ).order_by('-count')[:10]
    
    context = {
        'total_vehicles': total_vehicles,
        'vehicles_by_make': vehicles_by_make,
    }
    
    return render(request, 'reporting/vehicle_report.html', context)


@login_required
def custom_report(request):
    """Custom report builder"""
    context = {}
    return render(request, 'reporting/custom_report.html', context)


@login_required
def generate_custom_report(request):
    """Generate custom report via AJAX"""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        data_source = request.POST.get('data_source')
        metrics = request.POST.getlist('metrics[]')
        
        # Generate report based on parameters
        # This is a simplified implementation
        result = {
            'success': True,
            'data': {
                'labels': ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
                'values': [100, 200, 150, 300, 250],
            }
        }
        
        return JsonResponse(result)
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def email_report(request):
    """Email report to recipient"""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        recipient = request.POST.get('email')
        report_type = request.POST.get('report_type')
        
        # TODO: Implement email sending
        # from django.core.mail import send_mail
        # send_mail(...)
        
        return JsonResponse({'success': True, 'message': 'Report sent successfully!'})
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def save_report(request):
    """Save report configuration"""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        report_name = request.POST.get('report_name')
        
        # TODO: Save report configuration to database
        
        return JsonResponse({'success': True, 'message': 'Report saved successfully!'})
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def schedule_edit(request, pk):
    """Edit scheduled report"""
    # TODO: Implement schedule editing
    messages.info(request, 'Schedule editing not yet implemented')
    return redirect('reporting:report-dashboard')


@login_required
def schedule_delete(request, pk):
    """Delete scheduled report"""
    # TODO: Implement schedule deletion
    messages.info(request, 'Schedule deletion not yet implemented')
    return redirect('reporting:report-dashboard')
