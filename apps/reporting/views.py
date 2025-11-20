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
from apps.billing.models import Invoice, Payment, Estimate
from apps.inventory.models import Part, PurchaseOrder, InventoryTransaction
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.inspections.models import VehicleInspection
from apps.accounts.models import User
from apps.branches.utils import (
    filter_queryset_for_user_branches,
    get_user_accessible_branches,
    resolve_branch,
)


def _filter_branch_queryset(queryset, request, use_active_branch=True):
    return filter_queryset_for_user_branches(
        queryset, request.user, request, use_active_branch
    )


def _get_branch_ids(request, use_active_branch=True):
    user = getattr(request, "user", None)
    if not user or not getattr(user, "is_authenticated", False):
        return []
    branches = get_user_accessible_branches(user)
    if use_active_branch:
        active_branch = resolve_branch(request)
        if active_branch:
            return [active_branch.id]
    return list(branches.values_list("id", flat=True))


# ============================================================================
# Dashboard Views
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_overview(request):
    """
    Get comprehensive dashboard overview with key metrics
    """
    import traceback
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        today = timezone.now().date()
        week_start = today - timedelta(days=today.weekday())
        month_start = today.replace(day=1)
        
        appointments_qs = filter_queryset_for_user_branches(Appointment.objects.all(), request.user, request)
        invoices_qs = filter_queryset_for_user_branches(Invoice.objects.all(), request.user, request)
        work_orders_qs = filter_queryset_for_user_branches(WorkOrder.objects.all(), request.user, request)
        parts_qs = filter_queryset_for_user_branches(Part.objects.all(), request.user, request)
        estimates_qs = filter_queryset_for_user_branches(Estimate.objects.all(), request.user, request)
        
        appointments_today = appointments_qs.filter(appointment_date=today).count()
        
        revenue_today = invoices_qs.filter(
            invoice_date=today,
            status__in=['paid', 'partial']
        ).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0')
        
        active_work_orders = work_orders_qs.filter(
            status__in=['pending', 'in_progress', 'on_hold']
        ).count()
        
        revenue_week = invoices_qs.filter(
            invoice_date__gte=week_start,
            status__in=['paid', 'partial']
        ).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0')
        
        revenue_month = invoices_qs.filter(
            invoice_date__gte=month_start,
            status__in=['paid', 'partial']
        ).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0')
        
        overdue_invoices = invoices_qs.filter(
            status__in=['sent', 'viewed', 'partial'],
            due_date__lt=today
        ).aggregate(
            count=Count('id'),
            total=Sum('amount_due')
        )
        
        low_stock_count = parts_qs.filter(
            is_active=True,
            quantity_in_stock__lte=F('reorder_point')
        ).count()
        
        pending_estimates = estimates_qs.filter(
            status__in=['draft', 'awaiting_approval', 'sent']
        ).count()
        
        recent_work_orders = work_orders_qs.select_related(
            'customer', 'vehicle', 'customer__user'
        ).order_by('-created_at')[:5]
        
        recent_appointments = appointments_qs.select_related(
            'customer', 'vehicle', 'customer__user'
        ).order_by('-created_at')[:5]
        
        # Build work orders list with safe attribute access
        work_orders_list = []
        for wo in recent_work_orders:
            try:
                customer_name = 'Unknown'
                if wo.customer:
                    if hasattr(wo.customer, 'company_name') and wo.customer.company_name:
                        customer_name = wo.customer.company_name
                    elif hasattr(wo.customer, 'full_name') and wo.customer.full_name:
                        customer_name = wo.customer.full_name
                    elif wo.customer.user:
                        customer_name = f"{wo.customer.user.first_name} {wo.customer.user.last_name}".strip() or wo.customer.user.username
                
                vehicle_info = 'Unknown'
                if wo.vehicle:
                    parts = []
                    if wo.vehicle.year:
                        parts.append(str(wo.vehicle.year))
                    if wo.vehicle.make:
                        parts.append(wo.vehicle.make)
                    if wo.vehicle.model:
                        parts.append(wo.vehicle.model)
                    vehicle_info = ' '.join(parts) if parts else 'Unknown'
                
                work_orders_list.append({
                    'id': wo.id,
                    'wo_number': wo.work_order_number,
                    'customer': customer_name,
                    'vehicle': vehicle_info,
                    'status': wo.status,
                    'created_at': wo.created_at.isoformat()
                })
            except Exception:
                continue
        
        # Build appointments list with safe attribute access
        appointments_list = []
        for apt in recent_appointments:
            try:
                customer_name = 'Unknown'
                if apt.customer:
                    if hasattr(apt.customer, 'full_name') and apt.customer.full_name:
                        customer_name = apt.customer.full_name
                    elif apt.customer.user:
                        customer_name = f"{apt.customer.user.first_name} {apt.customer.user.last_name}".strip() or apt.customer.user.username
                
                vehicle_info = 'Unknown'
                if apt.vehicle:
                    parts = []
                    if apt.vehicle.year:
                        parts.append(str(apt.vehicle.year))
                    if apt.vehicle.make:
                        parts.append(apt.vehicle.make)
                    if apt.vehicle.model:
                        parts.append(apt.vehicle.model)
                    vehicle_info = ' '.join(parts) if parts else 'Unknown'
                
                appointments_list.append({
                    'id': apt.id,
                    'customer': customer_name,
                    'vehicle': vehicle_info,
                    'appointment_date': apt.appointment_date.isoformat(),
                    'status': apt.status
                })
            except Exception:
                continue
        
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
                'work_orders': work_orders_list,
                'appointments': appointments_list
            }
        })
    except Exception as e:
        logger.error(f"Error in dashboard_overview: {e}")
        logger.error(traceback.format_exc())
        # Return a minimal response that won't break the frontend
        today = timezone.now().date()
        return Response({
            'today': {'appointments': 0, 'revenue': 0.0, 'date': today.isoformat()},
            'week': {'revenue': 0.0, 'start_date': (today - timedelta(days=today.weekday())).isoformat()},
            'month': {'revenue': 0.0, 'start_date': today.replace(day=1).isoformat()},
            'alerts': {'active_work_orders': 0, 'overdue_invoices': {'count': 0, 'total': 0.0}, 'low_stock_items': 0, 'pending_estimates': 0},
            'recent_activity': {'work_orders': [], 'appointments': []},
            'error': str(e)
        }, status=status.HTTP_200_OK)


# ============================================================================
# Financial Reports
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def revenue_report(request):
    """
    Detailed revenue report with breakdown by period, service type, and technician
    """
    import traceback
    import logging
    logger = logging.getLogger(__name__)
    
    try:
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
        
        invoices_qs = _filter_branch_queryset(Invoice.objects.all(), request)
        invoices = invoices_qs.filter(
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
        branch_ids = _get_branch_ids(request)
        revenue_by_method = Payment.objects.filter(
            invoice__branch_id__in=branch_ids,
            payment_date__gte=start_date,
            payment_date__lte=end_date,
            status='completed'
        ).values('payment_method').annotate(
            total=Sum('amount'),
            count=Count('id')
        ).order_by('-total')
        
        # Revenue by technician (from work orders)
        work_orders = _filter_branch_queryset(WorkOrder.objects.all(), request).filter(
            invoice__invoice_date__gte=start_date,
            invoice__invoice_date__lte=end_date,
            invoice__status__in=['paid', 'partial']
        ).select_related('primary_technician', 'invoice').prefetch_related('assigned_technicians')
        
        revenue_by_tech = {}
        for wo in work_orders:
            try:
                # Use primary technician or first assigned technician
                tech = wo.primary_technician
                if not tech and wo.assigned_technicians.exists():
                    tech = wo.assigned_technicians.first()
                
                if tech:
                    tech_name = f"{tech.first_name} {tech.last_name}".strip() or tech.username
                    
                    # Try to get invoice revenue
                    revenue = Decimal('0')
                    try:
                        if hasattr(wo, 'invoice') and wo.invoice:
                            revenue = wo.invoice.amount_paid or Decimal('0')
                    except Exception:
                        pass
                    
                    if tech_name not in revenue_by_tech:
                        revenue_by_tech[tech_name] = {
                            'revenue': Decimal('0'),
                            'work_orders': 0
                        }
                    revenue_by_tech[tech_name]['revenue'] += revenue
                    revenue_by_tech[tech_name]['work_orders'] += 1
            except Exception:
                continue
        
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
    except Exception as e:
        logger.error(f"Error in revenue_report: {e}")
        logger.error(traceback.format_exc())
        # Return a minimal response that won't break the frontend
        today = timezone.now().date()
        try:
            period_val = period
        except:
            period_val = 'daily'
        return Response({
            'period': {'start_date': today.replace(day=1).isoformat(), 'end_date': today.isoformat(), 'grouping': period_val},
            'summary': {'total_invoiced': 0.0, 'total_paid': 0.0, 'total_outstanding': 0.0, 'payment_rate': 0.0},
            'revenue_by_period': [],
            'revenue_by_payment_method': [],
            'revenue_by_technician': [],
            'error': str(e)
        }, status=status.HTTP_200_OK)


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
    invoices = _filter_branch_queryset(
        Invoice.objects.filter(
        invoice_date__gte=start_date,
        invoice_date__lte=end_date,
        status__in=['paid', 'partial']
        ),
        request
    )
    
    total_revenue = invoices.aggregate(
        labor=Sum('labor_subtotal'),
        parts=Sum('parts_subtotal'),
        total=Sum('amount_paid')
    )
    
    # Cost of parts sold (from work orders)
    work_orders = _filter_branch_queryset(
        WorkOrder.objects.filter(
        invoice__invoice_date__gte=start_date,
        invoice__invoice_date__lte=end_date
        ),
        request
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
    
    work_orders = _filter_branch_queryset(
        WorkOrder.objects.filter(
        created_at__date__gte=start_date,
        created_at__date__lte=end_date
        ),
        request
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
    branch_ids = _get_branch_ids(request)
    top_services = ServiceTask.objects.filter(
        work_order__created_at__date__gte=start_date,
        work_order__created_at__date__lte=end_date,
        work_order__branch_id__in=branch_ids
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
        # Get work orders where tech is primary or assigned
        work_orders = WorkOrder.objects.filter(
            Q(primary_technician=tech) | Q(assigned_technicians=tech),
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).distinct()
        
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
    parts = _filter_branch_queryset(
        Part.objects.filter(is_active=True).defer('branch'),
        request
    )
    
    total_value = Decimal('0')
    by_category = {}
    
    for part in parts:
        if part.cost_price and part.quantity_in_stock:
            value = part.quantity_in_stock * part.cost_price
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
            by_category[category]['quantity'] += part.quantity_in_stock
    
    return Response({
        'summary': {
            'total_value': float(total_value),
            'total_items': parts.count(),
            'total_quantity': parts.aggregate(total=Sum('quantity_in_stock'))['total'] or 0
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
    branch_parts = _filter_branch_queryset(
        Part.objects.filter(is_active=True).defer('branch'),
        request
    )
    for part in branch_parts:
        # Calculate usage from inventory transactions
        usage = InventoryTransaction.objects.filter(
            part=part,
            transaction_type='sale',
            transaction_date__gte=start_date,
            transaction_date__lte=end_date
        ).aggregate(total=Sum('quantity'))['total'] or 0
        
        # Calculate turnover rate
        avg_inventory = part.quantity_in_stock or 0  # Simplified
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
                    'current_stock': part.quantity_in_stock or 0,
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
    low_stock = _filter_branch_queryset(
        Part.objects.filter(
        quantity_in_stock__lte=F('reorder_point'),
        is_active=True
        ).select_related('category', 'preferred_supplier').defer('branch').order_by('quantity_in_stock'),
        request
    )
    
    critical_stock = low_stock.filter(quantity_in_stock__lte=F('reorder_point') / 2)
    
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
                    'current': part.quantity_in_stock or 0,
                    'reorder_point': part.reorder_point,
                    'reorder_quantity': part.reorder_quantity
                },
                'supplier': {
                    'id': part.preferred_supplier.id if part.preferred_supplier else None,
                    'name': part.preferred_supplier.name if part.preferred_supplier else None
                },
                'is_critical': (part.quantity_in_stock or 0) <= (part.reorder_point / 2)
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
        created_at__gte=thirty_days_ago
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
                    'name': customer.company_name or customer.full_name,
                    'type': customer.customer_type
                },
                'lifetime_value': float(total_spent),
                'vehicles': customer.vehicles.count(),
                'work_orders': WorkOrder.objects.filter(customer=customer).count()
            })
    
    top_customers.sort(key=lambda x: x['lifetime_value'], reverse=True)
    
    return Response({
        'total_customers': total_customers,
        'new_customers': new_customers,
        'active_customers': active_customers,
        'by_type': [],  # TODO: Add customer type breakdown
        'top_customers': [
            {
                'id': item['customer']['id'],
                'name': item['customer']['name'],
                'revenue': item['lifetime_value'],
                'work_orders': item['work_orders']
            }
            for item in top_customers[:10]
        ]
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
    try:
        # Get statistics without loading all vehicles
        try:
            by_make = list(Vehicle.objects.values('make').annotate(
                count=Count('id')
            ).order_by('-count')[:10])
        except Exception as e:
            by_make = []
        
        try:
            by_year = list(Vehicle.objects.values('year').annotate(
                count=Count('id')
            ).order_by('-year'))
        except Exception as e:
            by_year = []
        
        try:
            total_vehicles = Vehicle.objects.count()
        except Exception as e:
            total_vehicles = 0
        
        # Vehicles by service frequency - get top 10
        # Use aggregation to get work order counts efficiently
        most_serviced = []
        try:
            vehicles_with_counts = Vehicle.objects.annotate(
                wo_count=Count('work_orders')
            ).filter(wo_count__gt=0).order_by('-wo_count')[:10].select_related('customer', 'customer__user')
            
            for vehicle in vehicles_with_counts:
                try:
                    wo_count = vehicle.wo_count
                    
                    # Get customer name safely
                    customer_name = 'Unknown'
                    try:
                        if vehicle.customer:
                            customer = vehicle.customer
                            if customer.company_name:
                                customer_name = customer.company_name
                            elif hasattr(customer, 'full_name'):
                                try:
                                    customer_name = customer.full_name
                                except:
                                    if customer.user:
                                        customer_name = f"{customer.user.first_name} {customer.user.last_name}".strip() or customer.user.username
                            elif customer.user:
                                customer_name = f"{customer.user.first_name} {customer.user.last_name}".strip() or customer.user.username
                    except:
                        pass
                    
                    most_serviced.append({
                        'vehicle': {
                            'id': vehicle.id,
                            'year': vehicle.year if vehicle.year else 0,
                            'make': vehicle.make if vehicle.make else '',
                            'model': vehicle.model if vehicle.model else '',
                            'vin': vehicle.vin if vehicle.vin else '',
                            'license_plate': vehicle.license_plate if vehicle.license_plate else ''
                        },
                        'customer': customer_name,
                        'service_count': wo_count
                    })
                except Exception as e:
                    # Skip vehicles with errors
                    continue
        except Exception as e:
            # If aggregation fails, return empty list
            most_serviced = []
        
        return Response({
            'total_vehicles': total_vehicles,
            'average_age': None,  # TODO: Calculate average vehicle age
            'by_make': by_make,
            'by_year': by_year,
            'most_serviced': most_serviced
        })
    except Exception as e:
        import traceback
        return Response({
            'error': str(e),
            'traceback': traceback.format_exc()
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def service_due_report(request):
    """
    Vehicles due for service based on time/mileage
    """
    try:
        # This would ideally use vehicle-specific service schedules
        # For now, using a simplified approach
        
        today = timezone.now().date()
        six_months_ago = today - timedelta(days=180)
        
        # Vehicles not serviced in 6 months
        vehicles_due = []
        active_vehicles = Vehicle.objects.filter(status='active')
        
        for vehicle in active_vehicles:
            try:
                last_service = WorkOrder.objects.filter(
                    vehicle=vehicle,
                    status='completed'
                ).order_by('-completed_at').first()
                
                last_service_date = None
                if last_service and last_service.completed_at:
                    try:
                        last_service_date = last_service.completed_at.date()
                    except:
                        pass
                
                # Include vehicle if no service or service was more than 6 months ago
                should_include = False
                if not last_service:
                    should_include = True
                elif last_service_date and last_service_date < six_months_ago:
                    should_include = True
                
                if should_include:
                    # Build vehicle info safely
                    parts = []
                    if vehicle.year:
                        parts.append(str(vehicle.year))
                    if vehicle.make:
                        parts.append(vehicle.make)
                    if vehicle.model:
                        parts.append(vehicle.model)
                    vehicle_info = ' '.join(parts) if parts else f"Vehicle #{vehicle.id}"
                    if vehicle.license_plate:
                        vehicle_info += f" ({vehicle.license_plate})"
                    
                    vehicles_due.append({
                        'id': vehicle.id,
                        'year': vehicle.year if vehicle.year else None,
                        'make': vehicle.make or '',
                        'model': vehicle.model or '',
                        'license_plate': vehicle.license_plate or '',
                        'vehicle_info': vehicle_info,
                        'last_service_date': last_service_date.isoformat() if last_service_date else None,
                        'next_service_due': None,  # TODO: Calculate based on service schedule
                        'mileage': vehicle.current_mileage if vehicle.current_mileage else None
                    })
            except Exception as e:
                # Skip vehicles with errors
                continue
        
        return Response({
            'vehicles': vehicles_due
        })
    except Exception as e:
        import traceback
        return Response({
            'error': str(e),
            'traceback': traceback.format_exc()
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
