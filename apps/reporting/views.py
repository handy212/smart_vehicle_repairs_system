from rest_framework import viewsets, status, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Sum, Avg, Q, F, DecimalField, ExpressionWrapper
from django.db.models.functions import TruncDate, TruncWeek, TruncMonth
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from datetime import timedelta, datetime
from decimal import Decimal

from apps.appointments.models import Appointment
from apps.workorders.models import WorkOrder, ServiceTask
from apps.billing.models import Invoice, Payment
from apps.inventory.models import Part, PurchaseOrder, InventoryTransaction
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.inspections.models import VehicleInspection
from apps.accounts.models import User


# ============================================================================
# Dashboard Views
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_overview(request):
    """
    Get comprehensive dashboard overview with key metrics
    """
    today = timezone.now().date()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    
    # Today's metrics
    appointments_today = Appointment.objects.filter(
        appointment_date=today
    ).count()
    
    revenue_today = Invoice.objects.filter(
        invoice_date=today,
        status__in=['paid', 'partial']
    ).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0')
    
    # Active work orders
    active_work_orders = WorkOrder.objects.filter(
        status__in=['pending', 'in_progress', 'on_hold']
    ).count()
    
    # This week's metrics
    revenue_week = Invoice.objects.filter(
        invoice_date__gte=week_start,
        status__in=['paid', 'partial']
    ).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0')
    
    # This month's metrics
    revenue_month = Invoice.objects.filter(
        invoice_date__gte=month_start,
        status__in=['paid', 'partial']
    ).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0')
    
    # Overdue invoices
    overdue_invoices = Invoice.objects.filter(
        status__in=['sent', 'viewed', 'partial'],
        due_date__lt=today
    ).aggregate(
        count=Count('id'),
        total=Sum('amount_due')
    )
    
    # Low stock items
    low_stock_count = Part.objects.filter(
        quantity_on_hand__lte=F('reorder_point'),
        status='active'
    ).count()
    
    # Pending estimates
    pending_estimates = Invoice.objects.filter(status='draft').count()
    
    # Recent activity
    recent_work_orders = WorkOrder.objects.select_related(
        'customer', 'vehicle'
    ).order_by('-created_at')[:5]
    
    recent_appointments = Appointment.objects.select_related(
        'customer', 'vehicle'
    ).order_by('-created_at')[:5]
    
    return Response({
        'today': {
            'appointments': appointments_today,
            'revenue': float(revenue_today),
            'date': today.isoformat()
        },
        'week': {
            'revenue': float(revenue_week),
            'start_date': week_start.isoformat()
        },
        'month': {
            'revenue': float(revenue_month),
            'start_date': month_start.isoformat()
        },
        'alerts': {
            'active_work_orders': active_work_orders,
            'overdue_invoices': {
                'count': overdue_invoices['count'] or 0,
                'total': float(overdue_invoices['total'] or 0)
            },
            'low_stock_items': low_stock_count,
            'pending_estimates': pending_estimates
        },
        'recent_activity': {
            'work_orders': [
                {
                    'id': wo.id,
                    'wo_number': wo.wo_number,
                    'customer': wo.customer.name,
                    'vehicle': f"{wo.vehicle.year} {wo.vehicle.make} {wo.vehicle.model}",
                    'status': wo.status,
                    'created_at': wo.created_at.isoformat()
                }
                for wo in recent_work_orders
            ],
            'appointments': [
                {
                    'id': apt.id,
                    'customer': f"{apt.customer.first_name} {apt.customer.last_name}",
                    'vehicle': f"{apt.vehicle.year} {apt.vehicle.make} {apt.vehicle.model}",
                    'appointment_date': apt.appointment_date.isoformat(),
                    'status': apt.status
                }
                for apt in recent_appointments
            ]
        }
    })


# ============================================================================
# Financial Reports
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def revenue_report(request):
    """
    Detailed revenue report with breakdown by period, service type, and technician
    """
    # Get date range from query params
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    period = request.query_params.get('period', 'daily')  # daily, weekly, monthly
    
    if not start_date or not end_date:
        # Default to current month
        today = timezone.now().date()
        start_date = today.replace(day=1)
        end_date = today
    else:
        start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
    
    # Base queryset
    invoices = Invoice.objects.filter(
        invoice_date__gte=start_date,
        invoice_date__lte=end_date
    )
    
    # Total revenue
    total_invoiced = invoices.aggregate(total=Sum('total'))['total'] or Decimal('0')
    total_paid = invoices.filter(
        status__in=['paid', 'partial']
    ).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0')
    total_outstanding = total_invoiced - total_paid
    
    # Revenue by period
    if period == 'daily':
        trunc_func = TruncDate
    elif period == 'weekly':
        trunc_func = TruncWeek
    else:
        trunc_func = TruncMonth
    
    revenue_by_period = invoices.filter(
        status__in=['paid', 'partial']
    ).annotate(
        period=trunc_func('invoice_date')
    ).values('period').annotate(
        revenue=Sum('amount_paid'),
        invoice_count=Count('id')
    ).order_by('period')
    
    # Revenue by payment method
    revenue_by_method = Payment.objects.filter(
        payment_date__gte=start_date,
        payment_date__lte=end_date,
        status='completed'
    ).values('payment_method').annotate(
        total=Sum('amount'),
        count=Count('id')
    ).order_by('-total')
    
    # Revenue by technician (from work orders)
    work_orders = WorkOrder.objects.filter(
        invoice__invoice_date__gte=start_date,
        invoice__invoice_date__lte=end_date,
        invoice__status__in=['paid', 'partial']
    ).select_related('assigned_to', 'invoice')
    
    revenue_by_tech = {}
    for wo in work_orders:
        if wo.assigned_to:
            tech_name = f"{wo.assigned_to.first_name} {wo.assigned_to.last_name}"
            if tech_name not in revenue_by_tech:
                revenue_by_tech[tech_name] = {
                    'revenue': Decimal('0'),
                    'work_orders': 0
                }
            revenue_by_tech[tech_name]['revenue'] += wo.invoice.amount_paid
            revenue_by_tech[tech_name]['work_orders'] += 1
    
    return Response({
        'period': {
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'grouping': period
        },
        'summary': {
            'total_invoiced': float(total_invoiced),
            'total_paid': float(total_paid),
            'total_outstanding': float(total_outstanding),
            'payment_rate': float((total_paid / total_invoiced * 100) if total_invoiced > 0 else 0)
        },
        'revenue_by_period': [
            {
                'period': item['period'].isoformat(),
                'revenue': float(item['revenue']),
                'invoice_count': item['invoice_count']
            }
            for item in revenue_by_period
        ],
        'revenue_by_payment_method': [
            {
                'method': item['payment_method'],
                'total': float(item['total']),
                'count': item['count']
            }
            for item in revenue_by_method
        ],
        'revenue_by_technician': [
            {
                'technician': name,
                'revenue': float(data['revenue']),
                'work_orders': data['work_orders']
            }
            for name, data in sorted(
                revenue_by_tech.items(),
                key=lambda x: x[1]['revenue'],
                reverse=True
            )
        ]
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def profit_margin_report(request):
    """
    Calculate profit margins by analyzing revenue vs costs
    """
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    
    if not start_date or not end_date:
        today = timezone.now().date()
        start_date = today.replace(day=1)
        end_date = today
    else:
        start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
    
    # Revenue from invoices
    invoices = Invoice.objects.filter(
        invoice_date__gte=start_date,
        invoice_date__lte=end_date,
        status__in=['paid', 'partial']
    )
    
    total_revenue = invoices.aggregate(
        labor=Sum('labor_subtotal'),
        parts=Sum('parts_subtotal'),
        total=Sum('amount_paid')
    )
    
    # Cost of parts sold (from work orders)
    work_orders = WorkOrder.objects.filter(
        invoice__invoice_date__gte=start_date,
        invoice__invoice_date__lte=end_date
    )
    
    parts_cost = Decimal('0')
    for wo in work_orders:
        # This would ideally pull actual cost from inventory
        # For now, using a simplified calculation
        parts_cost += wo.parts_subtotal * Decimal('0.6')  # Assuming 40% markup
    
    labor_revenue = total_revenue['labor'] or Decimal('0')
    parts_revenue = total_revenue['parts'] or Decimal('0')
    total_rev = total_revenue['total'] or Decimal('0')
    
    gross_profit = total_rev - parts_cost
    profit_margin = (gross_profit / total_rev * 100) if total_rev > 0 else 0
    
    return Response({
        'period': {
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat()
        },
        'revenue': {
            'labor': float(labor_revenue),
            'parts': float(parts_revenue),
            'total': float(total_rev)
        },
        'costs': {
            'parts': float(parts_cost)
        },
        'profit': {
            'gross_profit': float(gross_profit),
            'profit_margin': float(profit_margin)
        }
    })


# ============================================================================
# Operational Reports
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def work_order_statistics(request):
    """
    Comprehensive work order statistics
    """
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    
    if not start_date or not end_date:
        # Default to last 30 days
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=30)
    else:
        start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
    
    work_orders = WorkOrder.objects.filter(
        created_at__date__gte=start_date,
        created_at__date__lte=end_date
    )
    
    # Status breakdown
    by_status = work_orders.values('status').annotate(
        count=Count('id')
    ).order_by('-count')
    
    # Priority breakdown
    by_priority = work_orders.values('priority').annotate(
        count=Count('id')
    ).order_by('-count')
    
    # Average completion time (for completed work orders)
    completed = work_orders.filter(status='completed')
    avg_completion_time = None
    if completed.exists():
        total_time = timedelta()
        count = 0
        for wo in completed:
            if wo.completed_at:
                time_diff = wo.completed_at - wo.created_at
                total_time += time_diff
                count += 1
        if count > 0:
            avg_completion_time = total_time / count
            avg_completion_time = avg_completion_time.total_seconds() / 3600  # hours
    
    # Top services
    top_services = ServiceTask.objects.filter(
        work_order__created_at__date__gte=start_date,
        work_order__created_at__date__lte=end_date
    ).values('description').annotate(
        count=Count('id')
    ).order_by('-count')[:10]
    
    return Response({
        'period': {
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat()
        },
        'summary': {
            'total_work_orders': work_orders.count(),
            'completed': completed.count(),
            'average_completion_hours': float(avg_completion_time) if avg_completion_time else None
        },
        'by_status': list(by_status),
        'by_priority': list(by_priority),
        'top_services': list(top_services)
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def technician_performance(request):
    """
    Technician performance metrics
    """
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    
    if not start_date or not end_date:
        # Default to last 30 days
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=30)
    else:
        start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
    
    # Get all technicians
    technicians = User.objects.filter(role='technician')
    
    performance_data = []
    for tech in technicians:
        work_orders = WorkOrder.objects.filter(
            assigned_to=tech,
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        )
        
        completed = work_orders.filter(status='completed')
        
        # Calculate revenue
        revenue = Decimal('0')
        for wo in completed:
            if hasattr(wo, 'invoice') and wo.invoice.status in ['paid', 'partial']:
                revenue += wo.invoice.amount_paid
        
        # Calculate average time
        avg_time = None
        if completed.exists():
            total_time = timedelta()
            count = 0
            for wo in completed:
                if wo.completed_at:
                    time_diff = wo.completed_at - wo.created_at
                    total_time += time_diff
                    count += 1
            if count > 0:
                avg_time = (total_time / count).total_seconds() / 3600
        
        performance_data.append({
            'technician': {
                'id': tech.id,
                'name': f"{tech.first_name} {tech.last_name}",
                'email': tech.email
            },
            'metrics': {
                'total_work_orders': work_orders.count(),
                'completed': completed.count(),
                'in_progress': work_orders.filter(status='in_progress').count(),
                'revenue': float(revenue),
                'average_completion_hours': float(avg_time) if avg_time else None
            }
        })
    
    # Sort by revenue
    performance_data.sort(key=lambda x: x['metrics']['revenue'], reverse=True)
    
    return Response({
        'period': {
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat()
        },
        'technicians': performance_data
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def appointment_statistics(request):
    """
    Appointment statistics including no-show rate
    """
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    
    if not start_date or not end_date:
        # Default to last 30 days
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=30)
    else:
        start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
    
    appointments = Appointment.objects.filter(
        appointment_date__gte=start_date,
        appointment_date__lte=end_date
    )
    
    total = appointments.count()
    by_status = appointments.values('status').annotate(count=Count('id'))
    
    completed = appointments.filter(status='completed').count()
    no_show = appointments.filter(status='no_show').count()
    cancelled = appointments.filter(status='cancelled').count()
    
    no_show_rate = (no_show / total * 100) if total > 0 else 0
    completion_rate = (completed / total * 100) if total > 0 else 0
    
    # Appointments by service bay
    by_bay = appointments.values('service_bay__name').annotate(
        count=Count('id')
    ).order_by('-count')
    
    return Response({
        'period': {
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat()
        },
        'summary': {
            'total_appointments': total,
            'completed': completed,
            'no_show': no_show,
            'cancelled': cancelled,
            'no_show_rate': float(no_show_rate),
            'completion_rate': float(completion_rate)
        },
        'by_status': list(by_status),
        'by_service_bay': list(by_bay)
    })


# ============================================================================
# Inventory Reports
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def inventory_valuation(request):
    """
    Calculate total inventory value
    """
    parts = Part.objects.filter(status='active')
    
    total_value = Decimal('0')
    by_category = {}
    
    for part in parts:
        value = part.quantity_on_hand * part.cost
        total_value += value
        
        category = part.category.name if part.category else 'Uncategorized'
        if category not in by_category:
            by_category[category] = {
                'value': Decimal('0'),
                'items': 0,
                'quantity': 0
            }
        by_category[category]['value'] += value
        by_category[category]['items'] += 1
        by_category[category]['quantity'] += part.quantity_on_hand
    
    return Response({
        'summary': {
            'total_value': float(total_value),
            'total_items': parts.count(),
            'total_quantity': parts.aggregate(total=Sum('quantity_on_hand'))['total'] or 0
        },
        'by_category': [
            {
                'category': cat,
                'value': float(data['value']),
                'items': data['items'],
                'quantity': data['quantity']
            }
            for cat, data in sorted(
                by_category.items(),
                key=lambda x: x[1]['value'],
                reverse=True
            )
        ]
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def inventory_turnover(request):
    """
    Calculate inventory turnover rates
    """
    # Get date range (default last 90 days for turnover)
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=90)
    
    # Get parts with usage data
    parts_data = []
    for part in Part.objects.filter(status='active'):
        # Calculate usage from inventory transactions
        usage = InventoryTransaction.objects.filter(
            part=part,
            transaction_type='sale',
            transaction_date__gte=start_date,
            transaction_date__lte=end_date
        ).aggregate(total=Sum('quantity'))['total'] or 0
        
        # Calculate turnover rate
        avg_inventory = part.quantity_on_hand  # Simplified
        turnover_rate = (abs(usage) / avg_inventory) if avg_inventory > 0 else 0
        
        if usage != 0:  # Only include parts with movement
            parts_data.append({
                'part': {
                    'id': part.id,
                    'part_number': part.part_number,
                    'name': part.name,
                    'category': part.category.name if part.category else None
                },
                'metrics': {
                    'usage': abs(usage),
                    'current_stock': part.quantity_on_hand,
                    'turnover_rate': float(turnover_rate),
                    'days_of_stock': int(90 / turnover_rate) if turnover_rate > 0 else 999
                }
            })
    
    # Sort by turnover rate
    parts_data.sort(key=lambda x: x['metrics']['turnover_rate'], reverse=True)
    
    # Categorize parts
    fast_moving = [p for p in parts_data if p['metrics']['turnover_rate'] > 1.0]
    slow_moving = [p for p in parts_data if p['metrics']['turnover_rate'] < 0.3]
    
    return Response({
        'period': {
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'days': 90
        },
        'summary': {
            'total_parts': len(parts_data),
            'fast_moving': len(fast_moving),
            'slow_moving': len(slow_moving)
        },
        'fast_moving': fast_moving[:10],
        'slow_moving': slow_moving[:10],
        'all_parts': parts_data
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def low_stock_report(request):
    """
    Get low stock items that need reordering
    """
    low_stock = Part.objects.filter(
        quantity_on_hand__lte=F('reorder_point'),
        status='active'
    ).select_related('category', 'supplier').order_by('quantity_on_hand')
    
    critical_stock = low_stock.filter(quantity_on_hand__lte=F('reorder_point') / 2)
    
    return Response({
        'summary': {
            'total_low_stock': low_stock.count(),
            'critical_stock': critical_stock.count()
        },
        'items': [
            {
                'part': {
                    'id': part.id,
                    'part_number': part.part_number,
                    'name': part.name,
                    'category': part.category.name if part.category else None
                },
                'stock': {
                    'current': part.quantity_on_hand,
                    'reorder_point': part.reorder_point,
                    'reorder_quantity': part.reorder_quantity
                },
                'supplier': {
                    'id': part.supplier.id if part.supplier else None,
                    'name': part.supplier.name if part.supplier else None
                },
                'is_critical': part.quantity_on_hand <= part.reorder_point / 2
            }
            for part in low_stock
        ]
    })


# ============================================================================
# Customer Reports
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def customer_statistics(request):
    """
    Customer statistics and retention metrics
    """
    # Total customers
    total_customers = Customer.objects.count()
    active_customers = Customer.objects.filter(status='active').count()
    
    # New customers (last 30 days)
    thirty_days_ago = timezone.now() - timedelta(days=30)
    new_customers = Customer.objects.filter(
        customer_since__gte=thirty_days_ago
    ).count()
    
    # Customer lifetime value (top 10)
    top_customers = []
    for customer in Customer.objects.filter(status='active'):
        total_spent = Invoice.objects.filter(
            customer=customer,
            status__in=['paid', 'partial']
        ).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0')
        
        if total_spent > 0:
            top_customers.append({
                'customer': {
                    'id': customer.id,
                    'name': customer.name,
                    'type': customer.customer_type
                },
                'lifetime_value': float(total_spent),
                'vehicles': customer.vehicles.count(),
                'work_orders': WorkOrder.objects.filter(customer=customer).count()
            })
    
    top_customers.sort(key=lambda x: x['lifetime_value'], reverse=True)
    
    return Response({
        'summary': {
            'total_customers': total_customers,
            'active_customers': active_customers,
            'new_customers_30_days': new_customers
        },
        'top_customers': top_customers[:10]
    })


# ============================================================================
# Vehicle Reports
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def vehicle_statistics(request):
    """
    Vehicle statistics by make, model, year
    """
    vehicles = Vehicle.objects.all()
    
    by_make = vehicles.values('make').annotate(
        count=Count('id')
    ).order_by('-count')[:10]
    
    by_year = vehicles.values('year').annotate(
        count=Count('id')
    ).order_by('-year')
    
    # Vehicles by service frequency
    most_serviced = []
    for vehicle in vehicles:
        wo_count = WorkOrder.objects.filter(vehicle=vehicle).count()
        if wo_count > 0:
            most_serviced.append({
                'vehicle': {
                    'id': vehicle.id,
                    'year': vehicle.year,
                    'make': vehicle.make,
                    'model': vehicle.model,
                    'vin': vehicle.vin,
                    'license_plate': vehicle.license_plate
                },
                'customer': vehicle.customer.name,
                'service_count': wo_count
            })
    
    most_serviced.sort(key=lambda x: x['service_count'], reverse=True)
    
    return Response({
        'summary': {
            'total_vehicles': vehicles.count()
        },
        'by_make': list(by_make),
        'by_year': list(by_year),
        'most_serviced': most_serviced[:10]
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def service_due_report(request):
    """
    Vehicles due for service based on time/mileage
    """
    # This would ideally use vehicle-specific service schedules
    # For now, using a simplified approach
    
    today = timezone.now().date()
    six_months_ago = today - timedelta(days=180)
    
    # Vehicles not serviced in 6 months
    vehicles_due = []
    for vehicle in Vehicle.objects.filter(status='active'):
        last_service = WorkOrder.objects.filter(
            vehicle=vehicle,
            status='completed'
        ).order_by('-completed_at').first()
        
        if not last_service or last_service.completed_at.date() < six_months_ago:
            vehicles_due.append({
                'vehicle': {
                    'id': vehicle.id,
                    'year': vehicle.year,
                    'make': vehicle.make,
                    'model': vehicle.model,
                    'vin': vehicle.vin,
                    'license_plate': vehicle.license_plate
                },
                'customer': {
                    'id': vehicle.customer.id,
                    'name': vehicle.customer.name,
                    'email': vehicle.customer.user.email if vehicle.customer.user else None,
                    'phone': vehicle.customer.phone
                },
                'last_service_date': last_service.completed_at.date().isoformat() if last_service else None,
                'days_since_service': (today - last_service.completed_at.date()).days if last_service else 999
            })
    
    return Response({
        'summary': {
            'vehicles_due': len(vehicles_due)
        },
        'vehicles': vehicles_due
    })
