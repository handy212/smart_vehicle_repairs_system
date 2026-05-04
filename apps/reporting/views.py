import logging

from rest_framework import viewsets, status, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
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
from apps.accounts.permissions import IsModuleEnabled
from .models import ReportExportLog, ReportSchedule, SavedReport
from .serializers import ReportExportLogSerializer, ReportScheduleSerializer, SavedReportSerializer

logger = logging.getLogger(__name__)


def _parse_date_range(request, default_days=30, default_current_month=False):
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')

    if not start_date or not end_date:
        today = timezone.now().date()
        if default_current_month:
            return today.replace(day=1), today
        return today - timedelta(days=default_days), today

    try:
        parsed_start = datetime.strptime(start_date, '%Y-%m-%d').date()
        parsed_end = datetime.strptime(end_date, '%Y-%m-%d').date()
    except (TypeError, ValueError):
        raise ValueError('Dates must use YYYY-MM-DD format')

    if parsed_start > parsed_end:
        raise ValueError('start_date cannot be after end_date')

    return parsed_start, parsed_end


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


def _branch_customer_ids(request):
    branch_ids = _get_branch_ids(request, use_active_branch=True)
    if not branch_ids:
        return None

    invoice_customers = Invoice.objects.filter(branch_id__in=branch_ids).values_list('customer_id', flat=True)
    work_order_customers = WorkOrder.objects.filter(branch_id__in=branch_ids).values_list('customer_id', flat=True)
    appointment_customers = Appointment.objects.filter(branch_id__in=branch_ids).values_list('customer_id', flat=True)
    vehicle_customers = Vehicle.objects.filter(work_orders__branch_id__in=branch_ids).values_list('owner_id', flat=True)

    return set(invoice_customers) | set(work_order_customers) | set(appointment_customers) | set(vehicle_customers)


def _branch_vehicle_ids(request):
    branch_ids = _get_branch_ids(request, use_active_branch=True)
    if not branch_ids:
        return None

    work_order_vehicles = WorkOrder.objects.filter(branch_id__in=branch_ids).values_list('vehicle_id', flat=True)
    appointment_vehicles = Appointment.objects.filter(branch_id__in=branch_ids).values_list('vehicle_id', flat=True)
    invoice_vehicles = WorkOrder.objects.filter(invoice__branch_id__in=branch_ids).values_list('vehicle_id', flat=True)

    return set(work_order_vehicles) | set(appointment_vehicles) | set(invoice_vehicles)


REPORT_CATALOG = [
    {'key': 'revenue', 'name': 'Revenue Report', 'category': 'financial', 'endpoint': 'revenue-report', 'exports': ['pdf'], 'drill_down': True},
    {'key': 'profit_margin', 'name': 'Profit Margin', 'category': 'financial', 'endpoint': 'profit-margin-report', 'exports': [], 'drill_down': False},
    {'key': 'work_orders', 'name': 'Work Order Statistics', 'category': 'operations', 'endpoint': 'work-order-statistics', 'exports': [], 'drill_down': True},
    {'key': 'technician_performance', 'name': 'Technician Performance', 'category': 'operations', 'endpoint': 'technician-performance', 'exports': [], 'drill_down': True},
    {'key': 'appointments', 'name': 'Appointment Statistics', 'category': 'operations', 'endpoint': 'appointment-statistics', 'exports': [], 'drill_down': True},
    {'key': 'inventory', 'name': 'Inventory Valuation', 'category': 'inventory', 'endpoint': 'inventory-valuation', 'exports': [], 'drill_down': True},
    {'key': 'inventory_turnover', 'name': 'Inventory Turnover', 'category': 'inventory', 'endpoint': 'inventory-turnover', 'exports': [], 'drill_down': True},
    {'key': 'low_stock', 'name': 'Low Stock Alert', 'category': 'inventory', 'endpoint': 'low-stock-report', 'exports': [], 'drill_down': True},
    {'key': 'customers', 'name': 'Customer Statistics', 'category': 'customers', 'endpoint': 'customer-statistics', 'exports': [], 'drill_down': True},
    {'key': 'vehicles', 'name': 'Vehicle Statistics', 'category': 'vehicles', 'endpoint': 'vehicle-statistics', 'exports': [], 'drill_down': True},
    {'key': 'service_due', 'name': 'Service Due Report', 'category': 'vehicles', 'endpoint': 'service-due-report', 'exports': [], 'drill_down': True},
    {'key': 'subscriptions', 'name': 'Subscription Analytics', 'category': 'subscriptions', 'endpoint': 'subscription-analytics', 'exports': [], 'drill_down': True},
    {'key': 'service_bundles', 'name': 'Service Bundle Popularity', 'category': 'operations', 'endpoint': 'service-bundle-popularity', 'exports': [], 'drill_down': True},
    {'key': 'controls', 'name': 'Controls & Overrides', 'category': 'governance', 'endpoint': 'frontend-controls', 'exports': [], 'drill_down': True},
]


class SavedReportViewSet(viewsets.ModelViewSet):
    serializer_class = SavedReportSerializer
    permission_classes = [IsAuthenticated, IsModuleEnabled('reports')]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['name', 'description', 'report_type']
    filterset_fields = ['report_type', 'is_public']

    def get_queryset(self):
        user = self.request.user
        return SavedReport.objects.filter(Q(created_by=user) | Q(is_public=True)).select_related('created_by')

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        if serializer.instance.created_by_id != self.request.user.id and getattr(self.request.user, 'role', None) != 'admin':
            raise PermissionDenied('You can only update reports you created')
        serializer.save()


class ReportScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = ReportScheduleSerializer
    permission_classes = [IsAuthenticated, IsModuleEnabled('reports')]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['name', 'report_type', 'email_recipients']
    filterset_fields = ['report_type', 'frequency', 'is_active']

    def get_queryset(self):
        user = self.request.user
        queryset = ReportSchedule.objects.select_related('created_by')
        if getattr(user, 'role', None) == 'admin':
            return queryset
        return queryset.filter(created_by=user)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ReportExportLogViewSet(viewsets.ModelViewSet):
    serializer_class = ReportExportLogSerializer
    permission_classes = [IsAuthenticated, IsModuleEnabled('reports')]
    http_method_names = ['get', 'post', 'head', 'options']
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['report_type', 'report_name', 'file_name']
    filterset_fields = ['report_type', 'export_format', 'status']

    def get_queryset(self):
        user = self.request.user
        queryset = ReportExportLog.objects.select_related('created_by')
        if getattr(user, 'role', None) == 'admin':
            return queryset
        return queryset.filter(created_by=user)

    def perform_create(self, serializer):
        request = self.request
        serializer.save(
            created_by=request.user,
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('reports')])
def report_catalog(request):
    """Return available enterprise report definitions and enabled controls."""
    saved_count = SavedReport.objects.filter(Q(created_by=request.user) | Q(is_public=True)).count()
    if getattr(request.user, 'role', None) == 'admin':
        schedule_count = ReportSchedule.objects.count()
    else:
        schedule_count = ReportSchedule.objects.filter(created_by=request.user).count()
    export_count = ReportExportLog.objects.filter(created_by=request.user).count()

    return Response({
        'reports': REPORT_CATALOG,
        'controls': {
            'saved_reports': saved_count,
            'scheduled_reports': schedule_count,
            'export_logs': export_count,
            'branch_scoped': True,
            'date_validation': True,
        }
    })


# ============================================================================
# Dashboard Views
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('reports')])
def dashboard_overview(request):
    """
    Get comprehensive dashboard overview with key metrics
    """
    try:
        today = timezone.now().date()
        week_start = today - timedelta(days=today.weekday())
        month_start = today.replace(day=1)
        
        appointments_qs = filter_queryset_for_user_branches(Appointment.objects.all(), request.user, request)
        invoices_qs = filter_queryset_for_user_branches(Invoice.objects.all(), request.user, request)
        work_orders_qs = filter_queryset_for_user_branches(WorkOrder.objects.all(), request.user, request)
        parts_qs = filter_queryset_for_user_branches(Part.objects.all(), request.user, request)
        estimates_qs = filter_queryset_for_user_branches(Estimate.objects.all(), request.user, request)
        
        # Roadside requests
        try:
            from apps.roadside.models import RoadsideRequest
            roadside_qs = filter_queryset_for_user_branches(
                RoadsideRequest.objects.all(), 
                request.user, 
                request
            )
            roadside_today = roadside_qs.filter(requested_at__date=today).count()
            roadside_active = roadside_qs.filter(
                status__in=['requested', 'dispatched', 'en_route', 'on_site', 'in_progress']
            ).count()
            roadside_completed_today = roadside_qs.filter(
                status='completed',
                completed_at__date=today
            ).count()
        except ImportError:
            roadside_today = 0
            roadside_active = 0
            roadside_completed_today = 0
        
        # Get Payment records - filter by branch through invoice
        # Revenue should be calculated from actual payment dates, not invoice dates
        payments_qs = Payment.objects.filter(
            invoice__isnull=False,
            status='completed'
        ).select_related('invoice')
        
        # Filter payments by branch (Payment -> Invoice -> Branch)
        branch_ids = _get_branch_ids(request, use_active_branch=True)
        if branch_ids:
            payments_qs = payments_qs.filter(invoice__branch_id__in=branch_ids)
        
        appointments_today = appointments_qs.filter(appointment_date=today).count()
        
        # Calculate revenue based on actual payment dates (not invoice dates)
        # Revenue = payment amount - refund amount (for net revenue)
        # Today's revenue: payments received today (net of refunds)
        revenue_today = payments_qs.filter(
            payment_date__date=today
        ).aggregate(
            total=Sum(
                ExpressionWrapper(
                    F('amount') - F('refund_amount'),
                    output_field=DecimalField(max_digits=10, decimal_places=2)
                )
            )
        )['total'] or Decimal('0')
        
        # Active work orders: any status before completed
        # Based on WorkOrder.STATUS_CHOICES: draft, inspection, intake, assigned, diagnosis,
        # awaiting_approval, approved, in_progress, additional_work_found, paused, quality_check
        active_work_orders = work_orders_qs.filter(
            status__in=['assigned', 'diagnosis', 'awaiting_approval', 'approved', 
                       'in_progress', 'additional_work_found', 'paused', 'quality_check']
        ).count()
        
        # Week revenue: payments received since week start (net of refunds)
        revenue_week = payments_qs.filter(
            payment_date__date__gte=week_start
        ).aggregate(
            total=Sum(
                ExpressionWrapper(
                    F('amount') - F('refund_amount'),
                    output_field=DecimalField(max_digits=10, decimal_places=2)
                )
            )
        )['total'] or Decimal('0')
        
        # Month revenue: payments received since month start (net of refunds)
        revenue_month = payments_qs.filter(
            payment_date__date__gte=month_start
        ).aggregate(
            total=Sum(
                ExpressionWrapper(
                    F('amount') - F('refund_amount'),
                    output_field=DecimalField(max_digits=10, decimal_places=2)
                )
            )
        )['total'] or Decimal('0')
        
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
            status__in=['draft', 'sent', 'viewed']
        ).count()
        
        # Subscription metrics
        try:
            from apps.subscriptions.models import Subscription
            active_subscriptions_qs = Subscription.objects.filter(
                status='active',
                payment_status='paid'
            )
            customer_ids = _branch_customer_ids(request)
            if customer_ids is not None:
                active_subscriptions_qs = active_subscriptions_qs.filter(customer_id__in=customer_ids)
            active_subscriptions = active_subscriptions_qs.count()
            
            # Calculate MRR (Monthly Recurring Revenue)
            # MRR = Sum of (purchase_price / duration_months) for all active paid subscriptions
            active_subs = active_subscriptions_qs.select_related('package')
            
            mrr = Decimal('0')
            for sub in active_subs:
                if sub.package.duration_months > 0:
                    monthly_value = sub.purchase_price / Decimal(str(sub.package.duration_months))
                    mrr += monthly_value
            
            # ARR (Annual Recurring Revenue) = MRR * 12
            arr = mrr * Decimal('12')
            
        except ImportError:
            # Subscriptions app not available
            active_subscriptions = 0
            mrr = Decimal('0')
            arr = Decimal('0')
        
        recent_work_orders = work_orders_qs.select_related(
            'customer', 'vehicle', 'customer__user'
        ).prefetch_related('gate_passes').order_by('-created_at')[:5]
        
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
                
                # Derive gate_pass_status from prefetched gate_passes
                gate_pass_status = None
                try:
                    gp_all = list(wo.gate_passes.all())
                    if gp_all:
                        # Prefer 'completed' if any gate pass is completed
                        if any(gp.status == 'completed' for gp in gp_all):
                            gate_pass_status = 'completed'
                        else:
                            gate_pass_status = gp_all[0].status
                except Exception:
                    pass

                work_orders_list.append({
                    'id': wo.id,
                    'wo_number': wo.work_order_number,
                    'customer': customer_name,
                    'vehicle': vehicle_info,
                    'status': wo.status,
                    'created_at': wo.created_at.isoformat(),
                    'diagnosis_notes': wo.diagnosis_notes,
                    'gate_pass_status': gate_pass_status,
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
                'roadside_requests': roadside_today,
                'roadside_completed': roadside_completed_today,
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
                'active_roadside_requests': roadside_active,
                'overdue_invoices': {
                    'count': overdue_invoices['count'] or 0,
                    'total': float(overdue_invoices['total'] or 0)
                },
                'low_stock_items': low_stock_count,
                'pending_estimates': pending_estimates
            },
            'subscriptions': {
                'active_count': active_subscriptions,
                'mrr': float(mrr),
                'arr': float(arr)
            },
            'recent_activity': {
                'work_orders': work_orders_list,
                'appointments': appointments_list
            }
        })
    except Exception as e:
        logger.exception("Error in dashboard_overview")
        return Response(
            {'detail': 'Unable to generate dashboard overview', 'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ============================================================================
# Financial Reports
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('reports')])
def revenue_report(request):
    """
    Detailed revenue report with breakdown by period, service type, and technician
    """
    try:
        # Get date range from query params
        period = request.query_params.get('period', 'daily')  # daily, weekly, monthly
        if period not in {'daily', 'weekly', 'monthly'}:
            return Response({'detail': 'period must be daily, weekly, or monthly'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            start_date, end_date = _parse_date_range(request, default_current_month=True)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        
        invoices_qs = _filter_branch_queryset(Invoice.objects.all(), request)
        invoices = invoices_qs.filter(
            invoice_date__gte=start_date,
            invoice_date__lte=end_date
        )
        
        # Separate subscription invoices
        subscription_invoices = invoices.filter(
            description__icontains="Subscription:"
        )
        service_invoices = invoices.exclude(
            description__icontains="Subscription:"
        )
        
        # Total revenue
        total_invoiced = invoices.aggregate(total=Sum('total'))['total'] or Decimal('0')
        total_paid = invoices.filter(
            status__in=['paid', 'partial']
        ).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0')
        total_outstanding = total_invoiced - total_paid
        
        # Subscription revenue breakdown
        subscription_invoiced = subscription_invoices.aggregate(total=Sum('total'))['total'] or Decimal('0')
        subscription_paid = subscription_invoices.filter(
            status__in=['paid', 'partial']
        ).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0')
        
        # Service revenue breakdown
        service_invoiced = service_invoices.aggregate(total=Sum('total'))['total'] or Decimal('0')
        service_paid = service_invoices.filter(
            status__in=['paid', 'partial']
        ).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0')
        
        # Revenue by period - Use Payment records for accurate revenue by payment date
        # This matches the dashboard overview calculation
        branch_ids = _get_branch_ids(request)
        payments_qs = Payment.objects.filter(
            invoice__isnull=False,
            status='completed'
        ).select_related('invoice')
        
        if branch_ids:
            payments_qs = payments_qs.filter(invoice__branch_id__in=branch_ids)
        
        payments_in_range = payments_qs.filter(
            payment_date__date__gte=start_date,
            payment_date__date__lte=end_date
        )
        
        if period == 'daily':
            trunc_func = TruncDate
        elif period == 'weekly':
            trunc_func = TruncWeek
        else:
            trunc_func = TruncMonth
        
        revenue_by_period = payments_in_range.annotate(
            period=trunc_func('payment_date')
        ).values('period').annotate(
            revenue=Sum(
                ExpressionWrapper(
                    F('amount') - F('refund_amount'),
                    output_field=DecimalField(max_digits=10, decimal_places=2)
                )
            ),
            invoice_count=Count('invoice_id', distinct=True)
        ).order_by('period')
        
        # Revenue by payment method - use same payments queryset
        revenue_by_method = payments_in_range.values('payment_method').annotate(
            total=Sum(
                ExpressionWrapper(
                    F('amount') - F('refund_amount'),
                    output_field=DecimalField(max_digits=10, decimal_places=2)
                )
            ),
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
                'payment_rate': float((total_paid / total_invoiced * 100) if total_invoiced > 0 else 0),
                'subscription_revenue': float(subscription_paid),
                'service_revenue': float(service_paid)
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
        logger.exception("Error in revenue_report")
        return Response(
            {'detail': 'Unable to generate revenue report', 'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('reports')])
def profit_margin_report(request):
    """
    Calculate profit margins by analyzing revenue vs costs
    """
    try:
        start_date, end_date = _parse_date_range(request, default_current_month=True)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    
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
@permission_classes([IsAuthenticated, IsModuleEnabled('reports')])
def work_order_statistics(request):
    """
    Comprehensive work order statistics
    """
    try:
        start_date, end_date = _parse_date_range(request, default_days=30)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    
    work_orders = _filter_branch_queryset(
        WorkOrder.objects.filter(
        created_at__date__gte=start_date,
        created_at__date__lte=end_date
        ),
        request
    )
    
    # Status breakdown - Order by workflow progression, then by count
    STATUS_ORDER = {
        'draft': 1,
        'inspection': 2,
        'intake': 3,
        'assigned': 4,
        'diagnosis': 5,
        'awaiting_approval': 6,
        'approved': 7,
        'in_progress': 8,
        'additional_work_found': 9,
        'paused': 10,
        'quality_check': 11,
        'completed': 12,
        'invoiced': 13,
        'closed': 14,
    }
    
    by_status_raw = work_orders.values('status').annotate(
        count=Count('id')
    )
    
    # Convert to list and sort by status order, then by count
    by_status_list = list(by_status_raw)
    by_status = sorted(
        by_status_list,
        key=lambda x: (STATUS_ORDER.get(x['status'], 99), -x['count'])
    )
    
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
    
    total_work_orders = work_orders.count()
    
    return Response({
        'period': {
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat()
        },
        'summary': {
            'total_work_orders': total_work_orders,
            'completed': completed.count() + work_orders.filter(
                status='closed',
                gate_passes__status='completed'
            ).distinct().count(),
            'average_completion_hours': float(avg_completion_time) if avg_completion_time else None,
            # Active: work orders currently being worked on
            'active_count': work_orders.filter(
                status__in=['approved', 'in_progress']
            ).count(),
            # Pending: work orders awaiting action or assignment
            'pending_count': work_orders.filter(
                status__in=['draft', 'inspection', 'intake', 'assigned', 'diagnosis', 'awaiting_approval']
            ).count(),
            # Attention: work orders that need special attention
            'attention_count': work_orders.filter(
                status__in=['paused', 'quality_check', 'additional_work_found']
            ).count(),
        },
        'by_status': list(by_status),
        'by_priority': list(by_priority),
        'top_services': list(top_services)
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('reports')])
def technician_performance(request):
    """
    Technician performance metrics including efficiency
    """
    try:
        start_date, end_date = _parse_date_range(request, default_days=30)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    
    # Get technicians and service coordinators, filtered by active branch
    staff_qs = User.objects.filter(role__in=['technician', 'service_coordinator'])
    active_branch = resolve_branch(request)
    if active_branch:
        staff_qs = staff_qs.filter(branch=active_branch)
    technicians = staff_qs
    
    performance_data = []
    for tech in technicians:
        # Get work orders where tech is primary or assigned
        work_orders = WorkOrder.objects.filter(
            Q(primary_technician=tech) | Q(assigned_technicians=tech),
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).distinct()
        
        # Filter by branch
        work_orders = _filter_branch_queryset(work_orders, request)
        
        completed = work_orders.filter(status__in=['completed', 'invoiced', 'closed'])
        
        # Calculate revenue & hours
        revenue = Decimal('0')
        total_estimated_hours = Decimal('0')
        total_actual_hours = Decimal('0')
        
        for wo in completed:
            if hasattr(wo, 'invoice') and wo.invoice.status in ['paid', 'partial']:
                revenue += wo.invoice.amount_paid
            
            # Sum hours for efficiency
            total_estimated_hours += wo.estimated_labor_hours or Decimal('0')
            total_actual_hours += wo.actual_labor_hours or Decimal('0')
        
        # Calculate efficiency
        # Efficiency = (Standard Hours / Actual Hours) * 100
        # If actual is 0 or less, efficiency is undefined (or 100% if estimated > 0?)
        # Let's say if actual is 0 but estimated > 0, efficiency is capped?
        efficiency = 0.0
        if total_actual_hours > 0:
            efficiency = float((total_estimated_hours / total_actual_hours) * 100)
        elif total_estimated_hours > 0:
            efficiency = 100.0 # Perfect efficiency if done in 0 time?
            
        # Calculate average time
        avg_time = None
        if completed.exists():
            total_duration = timedelta()
            count = 0
            for wo in completed:
                if wo.completed_at and wo.started_at: # Better to use started to completed
                     time_diff = wo.completed_at - wo.started_at
                     total_duration += time_diff
                     count += 1
                elif wo.completed_at: # Fallback to created_at
                    time_diff = wo.completed_at - wo.created_at
                    total_duration += time_diff
                    count += 1
            if count > 0:
                avg_time = (total_duration / count).total_seconds() / 3600
        
        performance_data.append({
            'technician': {
                'id': tech.id,
                'name': f"{tech.first_name} {tech.last_name}",
                'email': tech.email,
                'role': tech.role,
            },
            'metrics': {
                'total_work_orders': work_orders.count(),
                'completed': completed.count(),
                'in_progress': work_orders.filter(status='in_progress').count(),
                'revenue': float(revenue),
                'average_completion_hours': float(avg_time) if avg_time else None,
                'total_estimated_hours': float(total_estimated_hours),
                'total_actual_hours': float(total_actual_hours),
                'efficiency_percentage': efficiency
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
@permission_classes([IsAuthenticated, IsModuleEnabled('reports')])
def appointment_statistics(request):
    """
    Appointment statistics including no-show rate
    """
    try:
        start_date, end_date = _parse_date_range(request, default_days=30)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    
    appointments = _filter_branch_queryset(
        Appointment.objects.filter(
            appointment_date__gte=start_date,
            appointment_date__lte=end_date
        ),
        request
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
@permission_classes([IsAuthenticated, IsModuleEnabled('reports')])
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
@permission_classes([IsAuthenticated, IsModuleEnabled('reports')])
def inventory_turnover(request):
    """
    Calculate inventory turnover rates
    """
    try:
        start_date, end_date = _parse_date_range(request, default_days=90)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    
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
            transaction_date__date__gte=start_date,
            transaction_date__date__lte=end_date
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
            'days': (end_date - start_date).days + 1
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
@permission_classes([IsAuthenticated, IsModuleEnabled('reports')])
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
@permission_classes([IsAuthenticated, IsModuleEnabled('reports')])
def customer_statistics(request):
    """
    Customer statistics and retention metrics
    """
    try:
        start_date, end_date = _parse_date_range(request, default_days=30)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    customers_qs = Customer.objects.all()
    customer_ids = _branch_customer_ids(request)
    if customer_ids is not None:
        customers_qs = customers_qs.filter(id__in=customer_ids)

    # Total customers
    total_customers = customers_qs.count()
    active_customers = customers_qs.filter(status='active').count()
    
    # New customers in period
    new_customers = customers_qs.filter(
        created_at__date__gte=start_date,
        created_at__date__lte=end_date,
    ).count()
    
    # Subscription metrics
    try:
        from apps.subscriptions.models import Subscription
        customers_with_subscriptions = customers_qs.filter(
            subscriptions__status='active',
            subscriptions__payment_status='paid'
        ).distinct().count()
        subscription_adoption_rate = (customers_with_subscriptions / active_customers * 100) if active_customers > 0 else 0
    except ImportError:
        customers_with_subscriptions = 0
        subscription_adoption_rate = 0
    
    # Customer lifetime value (top 10)
    top_customers = []
    for customer in customers_qs.filter(status='active'):
        total_spent = _filter_branch_queryset(Invoice.objects.filter(
            customer=customer,
            status__in=['paid', 'partial']
        ), request).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0')
        
        # Check if customer has active subscription
        has_active_subscription = False
        try:
            from apps.subscriptions.models import Subscription
            has_active_subscription = Subscription.objects.filter(
                customer=customer,
                status='active',
                payment_status='paid'
            ).exists()
        except ImportError:
            pass
        
        if total_spent > 0:
            top_customers.append({
                'customer': {
                    'id': customer.id,
                    'name': customer.company_name or customer.full_name,
                    'type': customer.customer_type,
                    'has_subscription': has_active_subscription
                },
                'lifetime_value': float(total_spent),
                'vehicles': customer.vehicles.count(),
                'work_orders': WorkOrder.objects.filter(customer=customer).count()
            })
    
    top_customers.sort(key=lambda x: x['lifetime_value'], reverse=True)

    # Customer type breakdown
    by_type_qs = customers_qs.values('customer_type').annotate(
        count=Count('id')
    ).order_by('-count')
    type_label_map = dict(Customer.CUSTOMER_TYPE_CHOICES)
    by_type = [
        {
            'type': row['customer_type'],
            'label': type_label_map.get(row['customer_type'], row['customer_type']),
            'count': row['count'],
        }
        for row in by_type_qs
    ]
    
    return Response({
        'total_customers': total_customers,
        'new_customers': new_customers,
        'active_customers': active_customers,
        'customers_with_subscriptions': customers_with_subscriptions,
        'subscription_adoption_rate': float(subscription_adoption_rate),
        'by_type': by_type,
        'top_customers': [
            {
                'id': item['customer']['id'],
                'name': item['customer']['name'],
                'revenue': item['lifetime_value'],
                'work_orders': item['work_orders'],
                'has_subscription': item['customer']['has_subscription']
            }
            for item in top_customers[:10]
        ]
    })


# ============================================================================
# Vehicle Reports
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('reports')])
def vehicle_statistics(request):
    """
    Vehicle statistics by make, model, year
    """
    try:
        vehicles_qs = Vehicle.objects.all()
        vehicle_ids = _branch_vehicle_ids(request)
        if vehicle_ids is not None:
            vehicles_qs = vehicles_qs.filter(id__in=vehicle_ids)

        # Get statistics without loading all vehicles
        try:
            by_make = list(vehicles_qs.values('make').annotate(
                count=Count('id')
            ).order_by('-count')[:10])
        except Exception as e:
            by_make = []
        
        try:
            by_year = list(vehicles_qs.values('year').annotate(
                count=Count('id')
            ).order_by('-year'))
        except Exception as e:
            by_year = []
        
        try:
            total_vehicles = vehicles_qs.count()
        except Exception as e:
            total_vehicles = 0
        
        # Average vehicle age (in years) based on manufacturing year
        try:
            current_year = timezone.now().year
            avg_age_val = vehicles_qs.aggregate(
                avg_age=Avg(
                    ExpressionWrapper(
                        current_year - F('year'),
                        output_field=DecimalField(max_digits=5, decimal_places=2),
                    )
                )
            )['avg_age']
            average_age = float(avg_age_val) if avg_age_val is not None else None
        except Exception as e:
            average_age = None
        
        # Vehicles by service frequency - get top 10
        # Use aggregation to get work order counts efficiently
        most_serviced = []
        try:
            vehicles_with_counts = vehicles_qs.annotate(
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
            'average_age': average_age,
            'by_make': by_make,
            'by_year': by_year,
            'most_serviced': most_serviced
        })
    except Exception as e:
        import logging
        import traceback
        logging.getLogger(__name__).error("Error in vehicle_analytics: %s\n%s", e, traceback.format_exc(), exc_info=True)
        from django.conf import settings
        msg = str(e) if settings.DEBUG else 'An error occurred while generating the report.'
        return Response({'error': msg}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('reports')])
def subscription_analytics(request):
    """
    Comprehensive subscription analytics and metrics
    """
    try:
        from apps.subscriptions.models import Subscription, Package
        
        try:
            start_date, end_date = _parse_date_range(request, default_days=30)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        subscriptions_qs = Subscription.objects.all()
        customer_ids = _branch_customer_ids(request)
        if customer_ids is not None:
            subscriptions_qs = subscriptions_qs.filter(customer_id__in=customer_ids)
        
        # Active subscriptions
        active_subscriptions = subscriptions_qs.filter(
            status='active',
            payment_status='paid'
        )
        
        # Calculate MRR and ARR
        mrr = Decimal('0')
        arr = Decimal('0')
        for sub in active_subscriptions.select_related('package'):
            if sub.package.duration_months > 0:
                monthly_value = sub.purchase_price / Decimal(str(sub.package.duration_months))
                mrr += monthly_value
        arr = mrr * Decimal('12')
        
        # Subscription counts by status
        subscriptions_by_status = subscriptions_qs.values('status').annotate(
            count=Count('id')
        )
        
        # New subscriptions in period
        new_subscriptions = subscriptions_qs.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).count()
        
        # Renewals in period
        renewals = subscriptions_qs.filter(
            metadata__has_key='renewal_invoice_id',
            updated_at__date__gte=start_date,
            updated_at__date__lte=end_date,
            status='active'
        ).count()
        
        # Churn (expired/cancelled in period)
        churned = subscriptions_qs.filter(
            status__in=['expired', 'cancelled'],
            updated_at__date__gte=start_date,
            updated_at__date__lte=end_date
        ).count()
        
        # Revenue by package
        revenue_by_package = []
        for package in Package.objects.filter(is_active=True):
            package_subs = subscriptions_qs.filter(
                package=package,
                status='active',
                payment_status='paid'
            )
            package_count = package_subs.count()
            package_mrr = Decimal('0')
            for sub in package_subs:
                if package.duration_months > 0:
                    monthly_value = sub.purchase_price / Decimal(str(package.duration_months))
                    package_mrr += monthly_value
            
            revenue_by_package.append({
                'package_id': package.id,
                'package_name': package.name,
                'active_subscriptions': package_count,
                'mrr': float(package_mrr),
                'arr': float(package_mrr * Decimal('12'))
            })
        
        revenue_by_package.sort(key=lambda x: x['mrr'], reverse=True)
        
        # Subscription trends (new subscriptions over time)
        subscriptions_trend = subscriptions_qs.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).annotate(
            period=TruncMonth('created_at')
        ).values('period').annotate(
            count=Count('id')
        ).order_by('period')
        
        # Average subscription value
        avg_subscription_value = active_subscriptions.aggregate(
            avg=Avg('purchase_price')
        )['avg'] or Decimal('0')
        
        # Renewal rate calculation (simplified)
        total_eligible_for_renewal = subscriptions_qs.filter(
            status='active',
            end_date__lte=end_date + timedelta(days=30)  # Expiring in next 30 days
        ).count()
        renewal_rate = (renewals / total_eligible_for_renewal * 100) if total_eligible_for_renewal > 0 else 0
        
        return Response({
            'period': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            },
            'summary': {
                'active_subscriptions': active_subscriptions.count(),
                'total_subscriptions': subscriptions_qs.count(),
                'mrr': float(mrr),
                'arr': float(arr),
                'average_subscription_value': float(avg_subscription_value),
                'new_subscriptions': new_subscriptions,
                'renewals': renewals,
                'churned': churned,
                'renewal_rate': float(renewal_rate)
            },
            'by_status': list(subscriptions_by_status),
            'revenue_by_package': revenue_by_package,
            'trends': [
                {
                    'period': item['period'].isoformat() if item['period'] else None,
                    'count': item['count']
                }
                for item in subscriptions_trend
            ]
        })
    except ImportError:
        # Subscriptions app not available
        return Response({
            'error': 'Subscriptions module not available'
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as e:
        logger.exception("Error in subscription_analytics")
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('reports')])
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
        vehicle_ids = _branch_vehicle_ids(request)
        if vehicle_ids is not None:
            active_vehicles = active_vehicles.filter(id__in=vehicle_ids)
        
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
                        'next_service_due': (
                            vehicle.service_schedules.filter(
                                is_active=True,
                                next_service_due_date__isnull=False
                            ).order_by('next_service_due_date')
                            .values_list('next_service_due_date', flat=True)
                            .first()
                            or None
                        ),
                        'mileage': vehicle.current_mileage if vehicle.current_mileage else None
                    })
            except Exception as e:
                # Skip vehicles with errors
                continue
        
        return Response({
            'vehicles': vehicles_due
        })
    except Exception as e:
        import logging
        import traceback
        logger.error("Error in service_due_report: %s\n%s", e, traceback.format_exc(), exc_info=True)
        from django.conf import settings
        msg = str(e) if settings.DEBUG else 'An error occurred while generating the report.'
        return Response({'error': msg}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('reports')])
def service_bundle_popularity(request):
    """
    Detailed report on service bundle popularity and revenue
    """
    # Import locally to avoid potential circular imports
    from apps.inventory.models import ServiceBundle
    
    try:
        start_date, end_date = _parse_date_range(request, default_days=30)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    # Get all active bundles
    bundles = ServiceBundle.objects.filter(is_active=True).order_by('name')
    
    report_data = []
    
    for bundle in bundles:
        # Count appointments for this bundle in range
        appt_count = _filter_branch_queryset(
            Appointment.objects.filter(
                service_bundle=bundle,
                appointment_date__gte=start_date,
                appointment_date__lte=end_date
            ),
            request
        ).count()
        
        # Count work orders for this bundle in range
        wo_qs = _filter_branch_queryset(
            WorkOrder.objects.filter(
                service_bundle=bundle,
                created_at__date__gte=start_date,
                created_at__date__lte=end_date
            ),
            request
        )
        wo_count = wo_qs.count()
        
        # Calculate revenue from completed work orders linked to this bundle
        revenue = Decimal('0')
        completed_wos = wo_qs.filter(status='completed')
        
        for wo in completed_wos:
            if hasattr(wo, 'invoice') and wo.invoice:
                 # Use amount_paid to be conservative and match other reports
                 revenue += wo.invoice.amount_paid
        
        if appt_count > 0 or wo_count > 0:
            report_data.append({
                'id': bundle.id,
                'name': bundle.name,
                'description': bundle.description,
                'price': float(bundle.total_price) if bundle.total_price else 0.0,
                'appointment_count': appt_count,
                'work_order_count': wo_count,
                'total_revenue': float(revenue),
                'conversion_rate': float((wo_count / appt_count * 100)) if appt_count > 0 else 0.0
            })
            
    # Sort by revenue descending
    report_data.sort(key=lambda x: x['total_revenue'], reverse=True)
    
    return Response({
        'period': {
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat()
        },
        'bundles': report_data
    })
