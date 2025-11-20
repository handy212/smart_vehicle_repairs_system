from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone
from django.db.models import Sum, Q, F
from decimal import Decimal
from datetime import timedelta
import logging

# Notification triggers
from apps.notifications_app.triggers import notification_triggers

logger = logging.getLogger(__name__)

from apps.billing.models import TaxRate, Estimate, EstimateLineItem, Invoice, Payment
from apps.billing.payment_gateways import get_payment_gateway
from apps.branches.utils import resolve_branch, filter_queryset_for_user_branches
from apps.billing.serializers import (
    TaxRateSerializer, TaxRateCreateSerializer,
    EstimateListSerializer, EstimateDetailSerializer, EstimateCreateSerializer, EstimateUpdateSerializer,
    EstimateLineItemSerializer, EstimateLineItemCreateSerializer,
    InvoiceListSerializer, InvoiceDetailSerializer, InvoiceCreateSerializer, InvoiceUpdateSerializer,
    PaymentSerializer, PaymentCreateSerializer, RefundPaymentSerializer
)
from apps.billing.tax_service import TaxService


class TaxRateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing tax rates
    
    list: Get all tax rates
    retrieve: Get single tax rate details
    create: Create new tax rate
    update: Update tax rate
    partial_update: Partially update tax rate
    destroy: Delete tax rate
    
    Custom actions:
    - active: Get active tax rates
    - by_location: Get tax rates for specific location
    """
    
    queryset = TaxRate.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active', 'state', 'county', 'city']
    search_fields = ['name', 'description', 'state', 'county', 'city']
    ordering_fields = ['name', 'rate', 'effective_date', 'created_at']
    ordering = ['name']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return TaxRateCreateSerializer
        return TaxRateSerializer
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get all active tax rates"""
        today = timezone.now().date()
        active_rates = self.queryset.filter(
            is_active=True,
            effective_date__lte=today
        ).filter(
            Q(expiration_date__isnull=True) | Q(expiration_date__gte=today)
        )
        
        serializer = self.get_serializer(active_rates, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def by_location(self, request):
        """Get tax rates by location"""
        state = request.query_params.get('state')
        county = request.query_params.get('county')
        city = request.query_params.get('city')
        zip_code = request.query_params.get('zip_code')
        
        if not any([state, county, city, zip_code]):
            return Response(
                {"error": "At least one location parameter is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        filters = Q(is_active=True)
        
        if state:
            filters &= Q(state=state) | Q(state='')
        if county:
            filters &= Q(county=county) | Q(county='')
        if city:
            filters &= Q(city=city) | Q(city='')
        if zip_code:
            filters &= Q(zip_code=zip_code) | Q(zip_code='')
        
        rates = self.queryset.filter(filters)
        serializer = self.get_serializer(rates, many=True)
        return Response(serializer.data)


class EstimateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing estimates
    
    list: Get all estimates
    retrieve: Get single estimate details
    create: Create new estimate
    update: Update estimate
    partial_update: Partially update estimate
    destroy: Delete estimate
    
    Custom actions:
    - send: Send estimate to customer
    - mark_viewed: Mark estimate as viewed by customer
    - approve: Approve estimate
    - decline: Decline estimate
    - convert_to_work_order: Convert estimate to work order
    - add_line_item: Add line item to estimate
    - pending: Get pending estimates
    - expiring_soon: Get estimates expiring soon
    """
    
    queryset = Estimate.objects.select_related(
        'customer', 'vehicle', 'work_order', 'created_by', 'approved_by', 'sent_by'
    ).prefetch_related('line_items')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'customer', 'vehicle', 'estimate_date']
    search_fields = ['estimate_number', 'title', 'description', 'customer__first_name', 'customer__last_name']
    ordering_fields = [
        'estimate_number', 'estimate_date', 'valid_until', 'total', 'created_at',
        'customer__user__last_name', 'customer__user__first_name', 'status'
    ]
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Filter estimates by active branch from session"""
        queryset = super().get_queryset()
        # Check if user wants to see all branches (for admins) or just active branch
        show_all = self.request.query_params.get('all_branches', 'false').lower() == 'true'
        queryset = filter_queryset_for_user_branches(
            queryset, 
            self.request.user, 
            request=self.request, 
            use_active_branch=not show_all
        )
        
        # Date range filtering for estimates
        if self.action == 'list':
            date_from = self.request.query_params.get('estimate_date__gte') or self.request.query_params.get('date_from')
            date_to = self.request.query_params.get('estimate_date__lte') or self.request.query_params.get('date_to')
            if date_from:
                queryset = queryset.filter(estimate_date__gte=date_from)
            if date_to:
                queryset = queryset.filter(estimate_date__lte=date_to)
        
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'list':
            return EstimateListSerializer
        elif self.action == 'create':
            return EstimateCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return EstimateUpdateSerializer
        return EstimateDetailSerializer
    
    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        """Send estimate to customer"""
        estimate = self.get_object()
        
        if estimate.status not in ['draft', 'sent']:
            return Response(
                {"error": "Only draft or sent estimates can be sent"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        estimate.status = 'sent'
        estimate.sent_by = request.user
        estimate.sent_at = timezone.now()
        estimate.save()
        
        serializer = self.get_serializer(estimate)
        return Response({
            "message": "Estimate sent successfully",
            "estimate": serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def mark_viewed(self, request, pk=None):
        """Mark estimate as viewed by customer"""
        estimate = self.get_object()
        
        if estimate.status == 'sent' and not estimate.viewed_at:
            estimate.status = 'viewed'
            estimate.viewed_at = timezone.now()
            estimate.save()
        
        serializer = self.get_serializer(estimate)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve estimate"""
        estimate = self.get_object()
        
        if not estimate.can_be_approved:
            return Response(
                {"error": "Estimate cannot be approved in current status or has expired"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        estimate.status = 'approved'
        estimate.approved_date = timezone.now()
        estimate.approved_by = request.user
        estimate.save()
        
        serializer = self.get_serializer(estimate)
        return Response({
            "message": "Estimate approved successfully",
            "estimate": serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        """Decline estimate"""
        estimate = self.get_object()
        
        if estimate.status in ['approved', 'converted', 'expired']:
            return Response(
                {"error": "Cannot decline estimate in current status"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        estimate.status = 'declined'
        estimate.declined_date = timezone.now()
        estimate.save()
        
        serializer = self.get_serializer(estimate)
        return Response({
            "message": "Estimate declined",
            "estimate": serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def convert_to_work_order(self, request, pk=None):
        """Convert estimate to work order"""
        estimate = self.get_object()
        
        if not estimate.can_be_converted:
            return Response(
                {"error": "Estimate cannot be converted or already has a work order"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Import here to avoid circular imports
        from apps.workorders.models import WorkOrder
        
        branch = estimate.branch or resolve_branch(request)
        if branch is None:
            return Response(
                {"error": "Unable to determine branch for new work order."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create work order from estimate
        work_order = WorkOrder.objects.create(
            customer=estimate.customer,
            vehicle=estimate.vehicle,
            branch=branch,
            customer_concerns=estimate.description or "Converted from estimate",
            special_instructions=estimate.notes or "",
            status='draft',
            odometer_in=getattr(estimate.vehicle, 'current_mileage', 0) or 0,
            created_by=request.user
        )
        
        # Link estimate to work order
        estimate.work_order = work_order
        estimate.status = 'converted'
        estimate.converted_date = timezone.now()
        estimate.save()
        
        return Response({
            "message": "Estimate converted to work order successfully",
            "work_order_id": work_order.id,
            "work_order_number": work_order.work_order_number
        })
    
    @action(detail=True, methods=['post'])
    def add_line_item(self, request, pk=None):
        """Add line item to estimate"""
        estimate = self.get_object()
        
        if estimate.status not in ['draft']:
            return Response(
                {"error": "Can only add items to draft estimates"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = EstimateLineItemCreateSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(estimate=estimate)
            estimate.calculate_totals()
            
            return Response({
                "message": "Line item added successfully",
                "item": serializer.data,
                "new_total": str(estimate.total)
            }, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def pending(self, request):
        """Get pending estimates (sent, viewed)"""
        pending = self.queryset.filter(status__in=['sent', 'viewed'])
        
        page = self.paginate_queryset(pending)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(pending, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def expiring_soon(self, request):
        """Get estimates expiring within 7 days"""
        days = int(request.query_params.get('days', 7))
        cutoff_date = timezone.now().date() + timedelta(days=days)
        
        expiring = self.queryset.filter(
            status__in=['sent', 'viewed'],
            valid_until__lte=cutoff_date,
            valid_until__gte=timezone.now().date()
        )
        
        serializer = self.get_serializer(expiring, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Generate PDF for estimate"""
        from django.template.loader import render_to_string
        from django.http import HttpResponse
        import traceback
        
        estimate = self.get_object()
        
        try:
            from weasyprint import HTML
            
            # Prepare context
            context = {
                'estimate': estimate,
                'print_generated_at': timezone.now(),
                'print_branch': estimate.branch or (estimate.work_order.branch if estimate.work_order else None),
            }
            
            # Render HTML template
            html_string = render_to_string('billing/estimate_print.html', context, request=request)
            
            # Generate PDF
            pdf = HTML(string=html_string).write_pdf()
            
            # Return PDF response
            response = HttpResponse(pdf, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="estimate_{estimate.estimate_number}.pdf"'
            return response
            
        except ImportError as e:
            logger.error(f"WeasyPrint import error: {str(e)}")
            return Response(
                {"error": "PDF generation requires WeasyPrint. Please install it: pip install weasyprint"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except AttributeError as e:
            # Handle WeasyPrint/pycparser compatibility issues
            logger.error(f"WeasyPrint compatibility error: {str(e)}\n{traceback.format_exc()}")
            return Response(
                {"error": "PDF generation is currently unavailable due to a dependency issue. Please use the Print button and save as PDF from your browser."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except Exception as e:
            logger.error(f"PDF generation error: {str(e)}\n{traceback.format_exc()}")
            return Response(
                {"error": f"Error generating PDF: {str(e)}. Please use the Print button and save as PDF from your browser."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def perform_create(self, serializer):
        """Assign branch when creating estimate"""
        request = self.request
        branch_id = request.data.get('branch') or request.data.get('branch_id')
        branch = resolve_branch(request, branch_id=branch_id)
        
        if branch is None:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'A valid branch assignment is required.'})
        
        serializer.save(branch=branch, created_by=request.user)


class EstimateLineItemViewSet(viewsets.ModelViewSet):
    """ViewSet for managing estimate line items"""
    
    queryset = EstimateLineItem.objects.select_related('estimate', 'part')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['estimate', 'item_type', 'is_taxable']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return EstimateLineItemCreateSerializer
        return EstimateLineItemSerializer
    
    def perform_destroy(self, instance):
        estimate = instance.estimate
        super().perform_destroy(instance)
        estimate.calculate_totals()


class InvoiceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing invoices
    
    list: Get all invoices
    retrieve: Get single invoice details
    create: Create new invoice
    update: Update invoice
    partial_update: Partially update invoice
    destroy: Delete invoice
    
    Custom actions:
    - send: Send invoice to customer
    - mark_viewed: Mark invoice as viewed by customer
    - void: Void invoice
    - unpaid: Get unpaid invoices
    - overdue: Get overdue invoices
    - aging_report: Get accounts receivable aging report
    - revenue_summary: Get revenue summary
    """
    
    queryset = Invoice.objects.select_related(
        'customer', 'vehicle', 'work_order', 'estimate',
        'created_by', 'sent_by', 'voided_by'
    ).prefetch_related('payments', 'line_items')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'customer', 'vehicle', 'work_order', 'invoice_date', 'due_date']
    search_fields = ['invoice_number', 'description', 'customer__first_name', 'customer__last_name', 'work_order__work_order_number']
    ordering_fields = [
        'invoice_number', 'invoice_date', 'due_date', 'total', 'amount_due', 'created_at',
        'customer__user__last_name', 'customer__user__first_name', 'status',
        'amount_paid', 'balance_due'
    ]
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Filter invoices by active branch from session"""
        queryset = super().get_queryset()
        # Check if user wants to see all branches (for admins) or just active branch
        show_all = self.request.query_params.get('all_branches', 'false').lower() == 'true'
        queryset = filter_queryset_for_user_branches(
            queryset, 
            self.request.user, 
            request=self.request, 
            use_active_branch=not show_all
        )
        
        # Date range filtering for invoices
        if self.action == 'list':
            date_from = self.request.query_params.get('invoice_date__gte') or self.request.query_params.get('date_from')
            date_to = self.request.query_params.get('invoice_date__lte') or self.request.query_params.get('date_to')
            if date_from:
                queryset = queryset.filter(invoice_date__gte=date_from)
            if date_to:
                queryset = queryset.filter(invoice_date__lte=date_to)
        
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'list':
            return InvoiceListSerializer
        elif self.action == 'create':
            return InvoiceCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return InvoiceUpdateSerializer
        return InvoiceDetailSerializer
    
    def perform_create(self, serializer):
        """Assign branch when creating invoice"""
        request = self.request
        branch_id = request.data.get('branch') or request.data.get('branch_id')
        branch = resolve_branch(request, branch_id=branch_id)
        
        if branch is None:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'A valid branch assignment is required.'})
        
        serializer.save(branch=branch, created_by=request.user)
    
    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        """Send invoice to customer"""
        invoice = self.get_object()
        
        if invoice.status == 'void':
            return Response(
                {"error": "Cannot send voided invoice"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if invoice.status == 'draft':
            invoice.status = 'sent'
        
        invoice.sent_by = request.user
        invoice.sent_at = timezone.now()
        invoice.save()
        
        # Send invoice notification
        try:
            notification_triggers.invoice_sent(invoice)
        except Exception as e:
            print(f"Failed to send invoice notification: {e}")
        
        serializer = self.get_serializer(invoice)
        return Response({
            "message": "Invoice sent successfully",
            "invoice": serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def mark_viewed(self, request, pk=None):
        """Mark invoice as viewed by customer"""
        invoice = self.get_object()
        
        if invoice.status == 'sent' and not invoice.viewed_at:
            invoice.status = 'viewed'
            invoice.viewed_at = timezone.now()
            invoice.save()
        
        serializer = self.get_serializer(invoice)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        """Void invoice"""
        invoice = self.get_object()
        
        if invoice.status in ['paid', 'void', 'refunded']:
            return Response(
                {"error": "Cannot void invoice in current status"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        void_reason = request.data.get('reason', '')
        if not void_reason:
            return Response(
                {"error": "Void reason is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        invoice.status = 'void'
        invoice.voided_at = timezone.now()
        invoice.voided_by = request.user
        invoice.void_reason = void_reason
        invoice.save()
        
        serializer = self.get_serializer(invoice)
        return Response({
            "message": "Invoice voided successfully",
            "invoice": serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def unpaid(self, request):
        """Get unpaid invoices"""
        unpaid = self.queryset.filter(
            status__in=['sent', 'viewed', 'overdue', 'partial']
        ).exclude(
            status='void'
        )
        
        page = self.paginate_queryset(unpaid)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(unpaid, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """Get overdue invoices"""
        today = timezone.now().date()
        overdue = self.queryset.filter(
            due_date__lt=today,
            status__in=['sent', 'viewed', 'overdue', 'partial']
        ).exclude(
            status__in=['paid', 'void', 'refunded']
        )
        
        page = self.paginate_queryset(overdue)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(overdue, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Generate PDF for invoice"""
        from django.template.loader import render_to_string
        from django.http import HttpResponse
        import traceback
        
        invoice = self.get_object()
        
        try:
            from weasyprint import HTML
            
            # Prepare context
            context = {
                'invoice': invoice,
                'print_generated_at': timezone.now(),
                'print_branch': invoice.branch or (invoice.work_order.branch if invoice.work_order else None),
            }
            
            # Render HTML template
            html_string = render_to_string('billing/invoice_print.html', context, request=request)
            
            # Generate PDF
            pdf = HTML(string=html_string).write_pdf()
            
            # Return PDF response
            response = HttpResponse(pdf, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="invoice_{invoice.invoice_number}.pdf"'
            return response
            
        except ImportError as e:
            logger.error(f"WeasyPrint import error: {str(e)}")
            return Response(
                {"error": "PDF generation requires WeasyPrint. Please install it: pip install weasyprint"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except AttributeError as e:
            # Handle WeasyPrint/pycparser compatibility issues
            logger.error(f"WeasyPrint compatibility error: {str(e)}\n{traceback.format_exc()}")
            return Response(
                {"error": "PDF generation is currently unavailable due to a dependency issue. Please use the Print button and save as PDF from your browser."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except Exception as e:
            logger.error(f"PDF generation error: {str(e)}\n{traceback.format_exc()}")
            return Response(
                {"error": f"Error generating PDF: {str(e)}. Please use the Print button and save as PDF from your browser."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def aging_report(self, request):
        """Get accounts receivable aging report"""
        today = timezone.now().date()
        
        # Get all unpaid invoices
        unpaid_invoices = self.queryset.filter(
            status__in=['sent', 'viewed', 'overdue', 'partial']
        ).exclude(status='void')
        
        # Aging buckets
        current = Decimal('0')  # Not yet due
        days_1_30 = Decimal('0')  # 1-30 days overdue
        days_31_60 = Decimal('0')  # 31-60 days overdue
        days_61_90 = Decimal('0')  # 61-90 days overdue
        days_over_90 = Decimal('0')  # Over 90 days overdue
        
        for invoice in unpaid_invoices:
            amount_due = invoice.amount_due
            
            if invoice.due_date >= today:
                current += amount_due
            else:
                days_overdue = (today - invoice.due_date).days
                if days_overdue <= 30:
                    days_1_30 += amount_due
                elif days_overdue <= 60:
                    days_31_60 += amount_due
                elif days_overdue <= 90:
                    days_61_90 += amount_due
                else:
                    days_over_90 += amount_due
        
        total = current + days_1_30 + days_31_60 + days_61_90 + days_over_90
        
        return Response({
            "aging_report": {
                "current": str(current),
                "1_30_days": str(days_1_30),
                "31_60_days": str(days_31_60),
                "61_90_days": str(days_61_90),
                "over_90_days": str(days_over_90),
                "total_outstanding": str(total)
            },
            "invoice_count": unpaid_invoices.count()
        })
    
    @action(detail=False, methods=['get'])
    def revenue_summary(self, request):
        """Get revenue summary"""
        # Get date range from query params
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        if not start_date or not end_date:
            return Response(
                {"error": "start_date and end_date are required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        invoices = self.queryset.filter(
            invoice_date__gte=start_date,
            invoice_date__lte=end_date
        ).exclude(status='void')
        
        # Calculate totals
        total_invoiced = invoices.aggregate(total=Sum('total'))['total'] or Decimal('0')
        total_paid = invoices.aggregate(paid=Sum('amount_paid'))['paid'] or Decimal('0')
        total_outstanding = invoices.aggregate(due=Sum('amount_due'))['due'] or Decimal('0')
        
        # Count by status
        status_counts = {}
        for s in Invoice.STATUS_CHOICES:
            status_code = s[0]
            count = invoices.filter(status=status_code).count()
            if count > 0:
                status_counts[status_code] = count
        
        return Response({
            "revenue_summary": {
                "start_date": start_date,
                "end_date": end_date,
                "total_invoiced": str(total_invoiced),
                "total_paid": str(total_paid),
                "total_outstanding": str(total_outstanding),
                "invoice_count": invoices.count(),
                "status_breakdown": status_counts
            }
        })


class PaymentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing payments
    
    list: Get all payments
    retrieve: Get single payment details
    create: Create new payment
    update: Update payment
    partial_update: Partially update payment
    destroy: Delete payment
    
    Custom actions:
    - refund: Refund a payment
    - recent: Get recent payments
    - by_method: Get payments by payment method
    """
    
    queryset = Payment.objects.select_related(
        'invoice', 'customer', 'processed_by', 'refunded_by'
    )
    permission_classes = [IsAuthenticated]
    serializer_class = PaymentSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['invoice', 'customer', 'payment_method', 'status', 'payment_date']
    search_fields = ['payment_number', 'reference_number', 'invoice__invoice_number', 'customer__first_name', 'customer__last_name']
    ordering_fields = ['payment_number', 'payment_date', 'amount', 'created_at']
    ordering = ['-payment_date']
    
    def get_queryset(self):
        """Filter payments by customer for customer users"""
        queryset = super().get_queryset()
        
        # For customers, filter by their customer profile
        if hasattr(self.request.user, 'role') and self.request.user.role == 'customer':
            from apps.customers.models import Customer
            try:
                customer = Customer.objects.get(user=self.request.user)
                queryset = queryset.filter(customer=customer)
            except Customer.DoesNotExist:
                queryset = queryset.none()
        else:
            # For staff, use branch filtering if needed
            from apps.branches.utils import filter_queryset_for_user_branches
            # Filter by invoice's branch
            invoice_ids = filter_queryset_for_user_branches(
                Invoice.objects.all(), 
                self.request.user, 
                request=self.request, 
                use_active_branch=True
            ).values_list('id', flat=True)
            if invoice_ids.exists():
                queryset = queryset.filter(invoice_id__in=invoice_ids)
        
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'create':
            return PaymentCreateSerializer
        elif self.action == 'refund':
            return RefundPaymentSerializer
        return PaymentSerializer
    
    @action(detail=True, methods=['post'])
    def refund(self, request, pk=None):
        """Refund a payment (full or partial)"""
        payment = self.get_object()
        
        if payment.status != 'completed':
            return Response(
                {"error": "Only completed payments can be refunded"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = RefundPaymentSerializer(
            data=request.data,
            context={'payment': payment}
        )
        
        if serializer.is_valid():
            refund_amount = serializer.validated_data['refund_amount']
            refund_reason = serializer.validated_data['refund_reason']
            
            # Update payment
            payment.refund_amount += refund_amount
            payment.refund_date = timezone.now()
            payment.refund_reason = refund_reason
            payment.refunded_by = request.user
            
            # If fully refunded, update status
            if payment.refund_amount >= payment.amount:
                payment.status = 'refunded'
            
            payment.save()
            
            # Update invoice amount_paid
            payment.update_invoice_payment()
            
            return Response({
                "message": "Payment refunded successfully",
                "payment": PaymentSerializer(payment).data
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def recent(self, request):
        """Get recent payments (last 100)"""
        recent = self.queryset.order_by('-payment_date')[:100]
        serializer = self.get_serializer(recent, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def by_method(self, request):
        """Get payments summary by payment method"""
        # Get date range from query params
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        filters = Q(status='completed')
        if start_date:
            filters &= Q(payment_date__gte=start_date)
        if end_date:
            filters &= Q(payment_date__lte=end_date)
        
        payments = self.queryset.filter(filters)
        
        # Group by payment method
        summary = {}
        for method_code, method_name in Payment.PAYMENT_METHOD_CHOICES:
            method_payments = payments.filter(payment_method=method_code)
            total = method_payments.aggregate(
                total=Sum(F('amount') - F('refund_amount'))
            )['total'] or Decimal('0')
            
            if total > 0:
                summary[method_name] = {
                    "count": method_payments.count(),
                    "total": str(total)
                }
        
        return Response({
            "payment_summary": summary,
            "date_range": {
                "start_date": start_date,
                "end_date": end_date
            }
        })
    
    @action(detail=False, methods=['post'])
    def create_payment_intent(self, request):
        """
        Create a payment intent using payment gateway (Paystack/Stripe/Square)
        
        POST /api/billing/payments/create_payment_intent/
        Body: {
            "invoice_id": 123,
            "amount": "100.00",
            "gateway": "paystack",  # optional, defaults to settings (paystack)
            "currency": "GHS",  # optional, defaults to GHS for Paystack
            "callback_url": "https://..."  # optional, for redirect-based payments
        }
        """
        invoice_id = request.data.get('invoice_id')
        amount = request.data.get('amount')
        gateway_name = request.data.get('gateway', 'paystack')
        currency = request.data.get('currency', 'GHS')
        callback_url = request.data.get('callback_url')
        
        if not invoice_id:
            return Response(
                {"error": "invoice_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not amount:
            return Response(
                {"error": "amount is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            invoice = Invoice.objects.get(id=invoice_id)
            amount_decimal = Decimal(str(amount))
            
            # Get payment gateway
            gateway = get_payment_gateway(gateway_name)
            
            # Create payment intent
            metadata = {
                'invoice_id': str(invoice.id),
                'invoice_number': invoice.invoice_number,
                'customer_id': str(invoice.customer.id),
                'customer_name': invoice.customer.full_name if hasattr(invoice.customer, 'full_name') else str(invoice.customer),
            }
            
            # Get customer email (required for Paystack)
            customer_email = None
            if hasattr(invoice.customer, 'email'):
                customer_email = invoice.customer.email
            elif hasattr(invoice.customer, 'user') and invoice.customer.user:
                customer_email = invoice.customer.user.email
            
            success, result = gateway.create_payment_intent(
                amount=amount_decimal,
                currency=currency,
                metadata=metadata,
                email=customer_email,
                callback_url=callback_url
            )
            
            if success:
                response_data = {
                    "success": True,
                    "gateway": gateway_name,
                    "payment_intent_id": result.get('payment_intent_id') or result.get('reference'),
                    "status": result.get('status'),
                }
                
                # Add gateway-specific fields
                if gateway_name == 'paystack':
                    response_data['authorization_url'] = result.get('authorization_url')
                    response_data['access_code'] = result.get('access_code')
                    response_data['reference'] = result.get('reference')
                elif gateway_name == 'stripe':
                    response_data['client_secret'] = result.get('client_secret')
                
                return Response(response_data)
            else:
                return Response(
                    {"error": result},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Invoice.DoesNotExist:
            return Response(
                {"error": "Invoice not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'])
    def confirm_payment_intent(self, request):
        """
        Confirm a payment intent and create payment record
        
        POST /api/billing/payments/confirm_payment_intent/
        Body: {
            "payment_intent_id": "pi_xxx" or "INV-xxx-123" (reference),
            "invoice_id": 123,
            "gateway": "paystack"  # optional, defaults to paystack
        }
        """
        payment_intent_id = request.data.get('payment_intent_id') or request.data.get('reference')
        invoice_id = request.data.get('invoice_id')
        gateway_name = request.data.get('gateway', 'paystack')
        
        if not payment_intent_id or not invoice_id:
            return Response(
                {"error": "payment_intent_id (or reference) and invoice_id are required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            invoice = Invoice.objects.get(id=invoice_id)
            gateway = get_payment_gateway(gateway_name)
            
            # Confirm/verify payment
            success, result = gateway.confirm_payment(payment_intent_id)
            
            if not success:
                return Response(
                    {"error": result},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if payment already exists
            existing_payment = Payment.objects.filter(
                transaction_id=payment_intent_id
            ).first()
            
            if existing_payment:
                return Response({
                    "success": True,
                    "message": "Payment already recorded",
                    "payment": PaymentSerializer(existing_payment).data
                })
            
            # Determine payment method based on gateway
            payment_method_map = {
                'paystack': 'paystack',
                'stripe': 'credit_card',
                'square': 'credit_card',
            }
            payment_method = payment_method_map.get(gateway_name, 'credit_card')
            
            # Get payment amount
            payment_amount = result.get('amount') or invoice.amount_due
            
            # Create payment record
            payment = Payment.objects.create(
                invoice=invoice,
                customer=invoice.customer,
                amount=payment_amount,
                payment_method=payment_method,
                status='completed',
                transaction_id=payment_intent_id,
                processed_by=request.user,
                notes=f"Payment via {gateway_name} gateway" + (f" - {result.get('channel', '')}" if result.get('channel') else ''),
                payment_date=result.get('paid_at') if result.get('paid_at') else timezone.now()
            )
            
            # Update invoice
            invoice.amount_paid += payment.amount
            invoice.amount_due = invoice.total - invoice.amount_paid
            
            if invoice.amount_due <= 0:
                invoice.status = 'paid'
            elif invoice.amount_paid > 0:
                invoice.status = 'partial'
            
            invoice.save()
            
            # Send payment notification
            try:
                notification_triggers.payment_received(payment)
            except Exception as e:
                logger.error(f"Failed to send payment notification: {e}")
            
            return Response({
                "success": True,
                "message": "Payment confirmed and recorded",
                "payment": PaymentSerializer(payment).data
            })
        except Invoice.DoesNotExist:
            return Response(
                {"error": "Invoice not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error confirming payment: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class TaxConfigurationView(APIView):
    """Expose configured tax regime and rates."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = TaxService.get_config()
        return Response({
            'enabled': config.enabled,
            'regime': config.regime,
            'vat_rate': str(config.vat_rate),
            'nhil_rate': str(config.nhil_rate),
            'getfund_rate': str(config.getfund_rate),
            'covid_rate': str(config.covid_rate),
        })
