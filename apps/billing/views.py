from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import HasPermission, user_has_permission
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone
from django.db.models import Sum, Q, F
from decimal import Decimal
from datetime import timedelta
import logging
from auditlog.models import LogEntry
from django.contrib.contenttypes.models import ContentType

# Notification triggers
from apps.notifications_app.triggers import notification_triggers

logger = logging.getLogger(__name__)

from apps.billing.models import (
    TaxRate,
    Estimate,
    EstimateLineItem,
    Invoice,
    InvoiceLineItem,
    Payment,
    CashierTill,
    CashCount,
    PaymentAllocation,
    Refund,
    CreditNote,
    CreditNoteLineItem,
    CreditNote,
    CreditNoteLineItem,
    Bill,
    BillLineItem,
)
from apps.billing.services import PDFService, BillingService
from apps.billing.mixins import (
    BillingStatusMixin, BillingCommunicationMixin, 
    BillingReportMixin, BillingDocumentMixin,
    EstimateActionMixin, InvoiceActionMixin
)
from apps.billing.filters import InvoiceFilter_branch, EstimateFilter_branch, CreditNoteFilter_branch, PaymentFilter_branch
from apps.branches.utils import filter_queryset_for_user_branches, resolve_branch
from apps.core.services.ai_service import AIService
from apps.billing.serializers import (
    TaxRateSerializer, TaxRateCreateSerializer,
    EstimateListSerializer, EstimateDetailSerializer, EstimateCreateSerializer, EstimateUpdateSerializer,
    EstimateLineItemSerializer, EstimateLineItemCreateSerializer,
    InvoiceListSerializer, InvoiceDetailSerializer, InvoiceCreateSerializer, InvoiceUpdateSerializer,
    PaymentSerializer, PaymentCreateSerializer, RefundPaymentSerializer,
    PaymentAllocationSerializer,
    CreditNoteListSerializer,
    CreditNoteDetailSerializer,
    CreditNoteCreateSerializer,
    CreditNoteListSerializer,
    CreditNoteDetailSerializer,
    CreditNoteCreateSerializer,
    BillSerializer,
    BillCreateSerializer,
    BillLineItemSerializer,
)
from apps.billing.models import TaxRate, Estimate, EstimateLineItem, Invoice, Payment, PaymentAllocation
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
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve', 'active', 'by_location']:
            return [IsAuthenticated(), HasPermission('view_settings')]
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), HasPermission('manage_settings')]
        return [IsAuthenticated()]
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


class EstimateViewSet(BillingStatusMixin, BillingCommunicationMixin, BillingReportMixin, 
                     BillingDocumentMixin, EstimateActionMixin, viewsets.ModelViewSet):
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
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        # Allow customers to view their own estimates without billing permission
        if self.action in ['list', 'retrieve']:
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated()]
            return [IsAuthenticated(), HasPermission('view_billing')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('create_estimates')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('edit_estimates')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('manage_billing')]
        return [IsAuthenticated()]
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
        user = self.request.user

        # Customers only see their own estimates and non-drafts
        if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
            return queryset.filter(customer=user.customer_profile).exclude(status='draft')
        
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
    
    def perform_create(self, serializer):
        """Assign branch when creating estimate and handling sending"""
        request = self.request
        branch_id = request.data.get('branch') or request.data.get('branch_id')
        branch = resolve_branch(request, branch_id=branch_id)
        
        if branch is None:
            # Fallback to user's active branch
            branch = resolve_branch(request)
        
        estimate = serializer.save(branch=branch, created_by=request.user)

        # Trigger notification if status is 'sent'
        if estimate.status == 'sent':
            try:
                from apps.notifications_app.triggers import notification_triggers
                estimate.sent_by = request.user
                estimate.sent_at = timezone.now()
                estimate.save(update_fields=['sent_by', 'sent_at'])
                notification_triggers.estimate_sent(estimate)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(
                    "Failed to send estimate notification: %s", e, exc_info=True
                )
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
    
    @action(detail=False, methods=['get'])
    def next_number(self, request):
        """Get next estimated number (preview)"""
        branch = resolve_branch(request)
        if not branch:
             return Response({"error": "No branch found"}, status=status.HTTP_400_BAD_REQUEST)
        
        # Preview next number without incrementing
        next_num = branch.next_estimate_number
        formatted = f"{branch.code}-EST{next_num:06d}"
        
        return Response({"next_number": formatted})
    
    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Generate professional PDF for estimate using new print service"""
        from apps.core.services.print_service import generate_estimate_pdf
        from django.utils import timezone
        
        estimate = self.get_object()
        
        try:
            # Add print timestamp to context
            estimate.print_generated_at = timezone.now()
            return generate_estimate_pdf(estimate, branch=estimate.branch)
        except Exception as e:
            logger.error(f"PDF generation error: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to generate PDF: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def print(self, request, pk=None):
        """Return HTML for print view (same layout as PDF, for browser print)."""
        from django.http import HttpResponse
        from apps.core.services.print_service import render_estimate_print_html
        
        estimate = self.get_object()
        try:
            html = render_estimate_print_html(estimate, branch=estimate.branch, request=request)
            return HttpResponse(html, content_type='text/html; charset=utf-8')
        except Exception as e:
            logger.error(f"Print HTML generation error: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to generate print view: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Get estimate history (audit log)"""
        estimate = self.get_object()
        from auditlog.models import LogEntry
        from django.contrib.contenttypes.models import ContentType
        
        # Get logs for this estimate
        content_type = ContentType.objects.get_for_model(estimate)
        logs = LogEntry.objects.filter(
            content_type=content_type,
            object_pk=estimate.pk
        ).select_related('actor').order_by('-timestamp')
        
        # Serialize logs manually or use a serializer
        history = []
        for log in logs:
            history.append({
                'id': log.id,
                'actor': f"{log.actor.first_name} {log.actor.last_name}" if log.actor else "System",
                'action': log.get_action_display(),
                'timestamp': log.timestamp,
                'changes': log.changes,
            })
            
        return Response(history)

    @action(detail=False, methods=['post'])
    def bulk_send(self, request):
        """Send multiple estimates to customers"""
        ids = request.data.get('ids', [])
        if not ids:
            return Response({"error": "No estimates selected"}, status=status.HTTP_400_BAD_REQUEST)
        
        estimates = Estimate.objects.filter(id__in=ids)
        sent_count = 0
        errors = []
        
        for estimate in estimates:
            try:
                if estimate.status == 'draft':
                    estimate.status = 'sent'
                    estimate.sent_at = timezone.now()
                    estimate.sent_by = request.user
                    estimate.save()
                    sent_count += 1
                elif estimate.status == 'sent':
                    # Re-sending logic if needed
                    sent_count += 1
            except Exception as e:
                errors.append(f"Estimate {estimate.estimate_number}: {str(e)}")
        
        return Response({
            "message": f"Successfully processed {sent_count} estimates",
            "sent_count": sent_count,
            "errors": errors
        })

    @action(detail=False, methods=['post'])
    def bulk_update_status(self, request):
        """Update status for multiple estimates"""
        ids = request.data.get('ids', [])
        new_status = request.data.get('status')
        
        if not ids or not new_status:
            return Response(
                {"error": "Missing ids or status"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        valid_statuses = dict(Estimate.STATUS_CHOICES).keys()
        if new_status not in valid_statuses:
             return Response(
                {"error": f"Invalid status. Choices: {', '.join(valid_statuses)}"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        updated_count = Estimate.objects.filter(id__in=ids).update(status=new_status)
        
        return Response({
            "message": f"Successfully updated {updated_count} estimates",
            "updated_count": updated_count
        })

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get estimate statistics for dashboard"""
        user = self.request.user
        queryset = self.get_queryset()
        
        # Calculate counts by status
        total_count = queryset.count()
        draft_count = queryset.filter(status='draft').count()
        sent_count = queryset.filter(status='sent').count()
        approved_count = queryset.filter(status='approved').count()
        declined_count = queryset.filter(status='declined').count()
        
        # Calculate expired based on date if status not already terminal
        # "Expired" count includes those explicitly marked 'expired' OR those past valid_until date that are not yet approved/declined/converted
        today = timezone.now().date()
        expired_count = queryset.filter(
            Q(status='expired') | 
            (Q(valid_until__lt=today) & ~Q(status__in=['approved', 'declined', 'converted']))
        ).distinct().count()
        
        # Financials
        # Total Approved Value
        total_approved = queryset.filter(status='approved').aggregate(
            total=Sum('total')
        )['total'] or 0
        
        # Pipeline Value (Sent + Viewed + Draft but valid)
        # Pending usually means sent/viewed.
        total_pending = queryset.filter(
            status__in=['sent', 'viewed']
        ).aggregate(
            total=Sum('total')
        )['total'] or 0

        # Declined Value
        total_declined = queryset.filter(status='declined').aggregate(
            total=Sum('total')
        )['total'] or 0
        
        return Response({
            "counts": {
                "total": total_count,
                "draft": draft_count,
                "sent": sent_count,
                "approved": approved_count,
                "declined": declined_count,
                "expired": expired_count
            },
            "financials": {
                "total_approved": total_approved,
                "total_pending": total_pending,
                "total_declined": total_declined
            }
        })


class EstimateLineItemViewSet(viewsets.ModelViewSet):
    """ViewSet for managing estimate line items"""
    
    queryset = EstimateLineItem.objects.select_related('estimate', 'part')
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated()]
            return [IsAuthenticated(), HasPermission('view_billing')]
        return [IsAuthenticated(), HasPermission('edit_estimates')]
        
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


class InvoiceViewSet(BillingStatusMixin, BillingCommunicationMixin, BillingReportMixin, 
                     BillingDocumentMixin, InvoiceActionMixin, viewsets.ModelViewSet):
    """ViewSet for managing invoices
    
    list: Get all invoices
    retrieve: Get single invoice details
    create: Create new invoice
    update: Update invoice
    partial_update: Partially update invoice
    destroy: Delete invoice
    """
    
    queryset = Invoice.objects.select_related(
        'customer', 'vehicle', 'work_order', 'estimate',
        'created_by', 'sent_by', 'voided_by'
    ).prefetch_related('payments', 'line_items')
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        # Allow customers to view their own invoices without billing permission
        if self.action in ['list', 'retrieve']:
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated()]
            return [IsAuthenticated(), HasPermission('view_billing')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('create_invoices')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('edit_invoices')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('delete_invoices')]
        elif self.action in ['send_customer_sms', 'send_customer_email', 'suggested_message']:
            return [IsAuthenticated(), HasPermission('edit_invoices')]
        return [IsAuthenticated()]

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['customer', 'vehicle', 'work_order', 'invoice_date', 'due_date']
    search_fields = ['invoice_number', 'description', 'customer__first_name', 'customer__last_name', 'work_order__work_order_number']
    ordering_fields = [
        'invoice_number', 'invoice_date', 'due_date', 'total', 'amount_due', 'created_at',
        'customer__user__last_name', 'customer__user__first_name', 'status',
        'amount_paid', 'amount_due'
    ]
    ordering = ['-created_at']

    def get_queryset(self):
        """Filter invoices by active branch and role"""
        queryset = super().get_queryset()
        user = self.request.user

        # Customers only see their own invoices and non-drafts
        if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
            return queryset.filter(customer=user.customer_profile).exclude(status='draft')

        # Check if user wants to see all branches (for admins) or just active branch
        show_all = self.request.query_params.get('all_branches', 'false').lower() == 'true'
        queryset = filter_queryset_for_user_branches(
            queryset, 
            self.request.user, 
            request=self.request, 
            use_active_branch=not show_all,
            include_unassigned=True
        )
        
        # Handle custom status filters
        status = self.request.query_params.get('status')
        if status:
            if status == 'unpaid':
                queryset = queryset.filter(status__in=['sent', 'viewed', 'proforma', 'partial'])
            else:
                queryset = queryset.filter(status=status)

        # Date range filtering
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
        """Assign branch and handle notifications"""
        request = self.request
        branch_id = request.data.get('branch') or request.data.get('branch_id')
        branch = resolve_branch(request, branch_id=branch_id)
        
        if branch is None:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'A valid branch assignment is required.'})
        
        invoice = serializer.save(branch=branch, created_by=request.user)

        if invoice.status == 'sent':
            try:
                invoice.sent_by = request.user
                invoice.sent_at = timezone.now()
                invoice.save(update_fields=['sent_by', 'sent_at'])
                notification_triggers.invoice_sent(invoice)
            except Exception as e:
                logger.warning(f"Failed to send invoice notification: {e}")


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

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated()]
            return [IsAuthenticated(), HasPermission('view_billing')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('create_payments')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('edit_payments')]
        elif self.action in ['destroy', 'refund']:
            return [IsAuthenticated(), HasPermission('manage_billing')]
        return [IsAuthenticated()]

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
            # Secure lookup - ensure invoice belongs to customer if user is a customer
            user = request.user
            if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
                invoice = Invoice.objects.get(id=invoice_id, customer=user.customer_profile)
            else:
                # Staff can look up any invoice
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
            # Secure lookup - ensure invoice belongs to customer if user is a customer
            user = request.user
            if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
                invoice = Invoice.objects.get(id=invoice_id, customer=user.customer_profile)
            else:
                # Staff can look up any invoice
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
            
            # Refresh invoice to get latest state
            invoice.refresh_from_db()
            
            # Check if invoice is already fully paid
            if invoice.status == 'paid' or invoice.amount_due <= 0:
                return Response(
                    {"error": f"Invoice {invoice.invoice_number} is already fully paid. Cannot record additional payments."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
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
    
    @action(detail=True, methods=['get'])
    def allocations(self, request, pk=None):
        """Get all allocations for this payment"""
        payment = self.get_object()
        allocations = payment.allocations.all()
        serializer = PaymentAllocationSerializer(allocations, many=True, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def unallocated_amount(self, request, pk=None):
        """Get the unallocated amount for this payment"""
        payment = self.get_object()
        allocated = payment.allocations.aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')
        unallocated = payment.amount - allocated
        return Response({
            'payment_amount': str(payment.amount),
            'allocated': str(allocated),
            'unallocated': str(unallocated)
        })

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Generate PDF for payment receipt"""
        from apps.core.services.print_service import generate_receipt_pdf
        
        payment = self.get_object()
        return generate_receipt_pdf(payment)
    
    @action(detail=True, methods=['get'])
    def print(self, request, pk=None):
        """Return HTML for print view (same layout as PDF)."""
        from django.http import HttpResponse
        from apps.core.services.print_service import render_receipt_print_html
        
        payment = self.get_object()
        try:
            branch = payment.invoice.branch if payment.invoice else None
            html = render_receipt_print_html(payment, branch=branch, request=request)
            return HttpResponse(html, content_type='text/html; charset=utf-8')
        except Exception as e:
            logger.error(f"Print HTML generation error: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to generate print view: {str(e)}"},
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
        })
# Removed AccountingViewSet garbage

# Phase 2: Till Management ViewSet
# Add this to apps/billing/views.py after AccountingViewSet

from apps.billing.models import CashierTill, CashCount, Refund, PaymentAllocation
from apps.billing.serializers import (
    CashierTillSerializer, CashCountSerializer,
    OpenTillSerializer, CloseTillSerializer,
    RefundSerializer, RefundCreateSerializer,
    PaymentAllocationSerializer
)


class TillViewSet(viewsets.ModelViewSet):
    """Till management for cashiers"""
    
    queryset = CashierTill.objects.all()
    serializer_class = CashierTillSerializer
    permission_classes = [IsAuthenticated, HasPermission('view_billing')]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by branch if specified
        branch_id = self.request.query_params.get('branch')
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        
        # Filter by status
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)
        
        # Filter by cashier
        cashier_id = self.request.query_params.get('cashier')
        if cashier_id:
            queryset = queryset.filter(cashier_id=cashier_id)
        
        # Filter by date
        date = self.request.query_params.get('date')
        if date:
            queryset = queryset.filter(opened_at__date=date)
        
        return queryset.select_related('branch', 'cashier').prefetch_related('cash_counts')
    
    @action(detail=False, methods=['post'])
    def open(self, request):
        """Open a new till"""
        serializer = OpenTillSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Check if user already has an open till
        existing_till = CashierTill.objects.filter(
            cashier=request.user,
            status='open'
        ).first()
        
        if existing_till:
            return Response(
                {'error': 'You already have an open till'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get user's branch
        from apps.branches.utils import resolve_branch
        branch = resolve_branch(request)
        
        # Create till
        till = CashierTill.objects.create(
            branch=branch,
            cashier=request.user,
            opening_balance=serializer.validated_data['opening_balance'],
            status='open'
        )
        
        return Response(
            CashierTillSerializer(till).data,
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """Close a till with cash counts"""
        till = self.get_object()
        
        if till.status == 'closed':
            return Response(
                {'error': 'Till is already closed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if till.cashier != request.user:
            return Response(
                {'error': 'You can only close your own till'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = CloseTillSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Create cash counts
        total_counted = Decimal('0')
        for count_data in serializer.validated_data['cash_counts']:
            cash_count = CashCount.objects.create(
                till=till,
                count_type='closing',
                denomination=Decimal(str(count_data['denomination'])),
                quantity=int(count_data['quantity'])
            )
            total_counted += cash_count.total
        
        # Calculate expected balance
        # Expected = opening + all cash payments received through this till
        cash_payments = Payment.objects.filter(
            payment_method='cash',
            payment_date__gte=till.opened_at,
            payment_date__lte=timezone.now()
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        
        expected_balance = till.opening_balance + cash_payments
        
        # Update till
        till.closing_balance = total_counted
        till.expected_balance = expected_balance
        till.variance = total_counted - expected_balance
        till.closed_at = timezone.now()
        till.status = 'closed'
        till.notes = serializer.validated_data.get('notes', '')
        till.save()
        
        return Response({
            'message': 'Till closed successfully',
            'closing_balance': str(total_counted),
            'expected_balance': str(expected_balance),
            'variance': str(till.variance),
            'is_balanced': abs(till.variance) < Decimal('0.01')
        })
    
    @action(detail=False, methods=['get'])
    def current(self, request):
        """Get current user's open till"""
        till = CashierTill.objects.filter(
            cashier=request.user,
            status='open'
        ).select_related('branch').prefetch_related('cash_counts').first()
        
        if not till:
            return Response(
                {'message': 'No open till found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        return Response(CashierTillSerializer(till).data)


# Removed BranchPLComparisonViewSet


class RefundViewSet(viewsets.ModelViewSet):
    """Refund management"""
    
    queryset = Refund.objects.all()
    serializer_class = RefundSerializer
    permission_classes = [IsAuthenticated, HasPermission('view_billing')]
    filter_backends = [SearchFilter]
    search_fields = ['refund_number', 'customer__user__first_name', 'customer__user__last_name', 'customer__company_name', 'reference_number']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by customer
        customer_id = self.request.query_params.get('customer')
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        
        return queryset.select_related(
            'customer', 'customer__user', 'invoice', 'original_payment',
            'requested_by', 'approved_by', 'processed_by'
        )
    
    def get_serializer_class(self):
        if self.action == 'create':
            return RefundCreateSerializer
        return RefundSerializer
    
    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a refund"""
        refund = self.get_object()
        
        if refund.status != 'pending':
            return Response(
                {'error': 'Only pending refunds can be approved'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        refund.status = 'approved'
        refund.approved_by = request.user
        refund.approved_at = timezone.now()
        refund.save()
        
        return Response({'message': 'Refund approved'})
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a refund"""
        refund = self.get_object()
        
        if refund.status != 'pending':
            return Response(
                {'error': 'Only pending refunds can be rejected'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        refund.status = 'rejected'
        refund.approved_by = request.user
        refund.approved_at = timezone.now()
        refund.save()
        
        return Response({'message': 'Refund rejected'})
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark refund as completed"""
        refund = self.get_object()
        
        if refund.status != 'approved':
            return Response(
                {'error': 'Only approved refunds can be completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        refund.status = 'completed'
        refund.processed_by = request.user
        refund.processed_at = timezone.now()
        refund.save()
        
        # Update original payment refund amount
        payment = refund.original_payment
        payment.refund_amount = (payment.refund_amount or Decimal('0')) + refund.amount
        payment.save()
        
        return Response({'message': 'Refund completed'})


class PaymentAllocationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing payment allocations
    
    Allows tracking how payments are allocated across multiple invoices,
    which is critical for proper customer account management.
    """
    
    queryset = PaymentAllocation.objects.select_related(
        'payment', 'invoice', 'invoice__customer', 'allocated_by'
    ).all()
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated()]
            return [IsAuthenticated(), HasPermission('view_billing')]
        return [IsAuthenticated(), HasPermission('manage_billing')]
        
    serializer_class = PaymentAllocationSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['payment', 'invoice', 'invoice__customer']
    search_fields = ['payment__payment_number', 'invoice__invoice_number']
    ordering_fields = ['allocated_at', 'amount']
    ordering = ['-allocated_at']
    
    def get_queryset(self):
        """Filter allocations by user's accessible branches"""
        queryset = super().get_queryset()
        
        # For customers, filter by their invoices
        if hasattr(self.request.user, 'role') and self.request.user.role == 'customer':
            from apps.customers.models import Customer
            try:
                customer = Customer.objects.get(user=self.request.user)
                queryset = queryset.filter(invoice__customer=customer)
            except Customer.DoesNotExist:
                queryset = queryset.none()
        else:
            # For staff, filter by branch access
            from apps.branches.utils import filter_queryset_for_user_branches
            invoice_ids = filter_queryset_for_user_branches(
                Invoice.objects.all(),
                self.request.user,
                request=self.request,
                use_active_branch=True
            ).values_list('id', flat=True)
            if invoice_ids.exists():
                queryset = queryset.filter(invoice_id__in=invoice_ids)
        
        return queryset
    
    def perform_create(self, serializer):
        """Set allocated_by to current user"""
        serializer.save(allocated_by=self.request.user)
    
    @action(detail=False, methods=['post'])
    def allocate_payment(self, request):
        """
        Allocate a payment to one or more invoices
        
        POST data:
        {
            "payment_id": 123,
            "allocations": [
                {"invoice_id": 1, "amount": "50.00", "notes": "partial payment"},
                {"invoice_id": 2, "amount": "30.00"}
            ]
        }
        """
        from rest_framework import serializers
        from django.db import transaction
        
        payment_id = request.data.get('payment_id')
        allocations = request.data.get('allocations', [])
        
        if not payment_id or not allocations:
            return Response(
                {"error": "payment_id and allocations are required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            payment = Payment.objects.get(id=payment_id)
        except Payment.DoesNotExist:
            return Response(
                {"error": "Payment not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Validate payment status
        if payment.status != 'completed':
            return Response(
                {"error": "Only completed payments can be allocated"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate total allocation doesn't exceed payment amount
        total_allocated = sum(Decimal(str(a.get('amount', 0))) for a in allocations)
        if total_allocated > payment.amount:
            return Response(
                {
                    "error": f"Total allocation ({total_allocated}) exceeds payment amount ({payment.amount})"
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create allocations in a transaction
        created_allocations = []
        
        try:
            with transaction.atomic():
                # Clear existing allocations for this payment
                PaymentAllocation.objects.filter(payment=payment).delete()
                
                for alloc_data in allocations:
                    invoice_id = alloc_data.get('invoice_id')
                    amount = Decimal(str(alloc_data.get('amount', 0)))
                    
                    if amount <= 0:
                        raise serializers.ValidationError(f"Allocation amount must be greater than 0")
                    
                    try:
                        invoice = Invoice.objects.get(id=invoice_id)
                    except Invoice.DoesNotExist:
                        raise serializers.ValidationError(f"Invoice {invoice_id} not found")
                    
                    # Validate allocation doesn't exceed invoice balance
                    if amount > invoice.amount_due:
                        raise serializers.ValidationError(
                            f"Allocation amount ({amount}) exceeds invoice {invoice.invoice_number} balance ({invoice.amount_due})"
                        )
                    
                    allocation = PaymentAllocation.objects.create(
                        payment=payment,
                        invoice=invoice,
                        amount=amount,
                        allocated_by=request.user,
                        notes=alloc_data.get('notes', '')
                    )
                    created_allocations.append(allocation)
        except serializers.ValidationError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error allocating payment {payment_id}: {e}", exc_info=True)
            return Response(
                {"error": "Failed to allocate payment"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        serializer = self.get_serializer(created_allocations, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=False, methods=['post'])
    def auto_allocate(self, request):
        """
        Automatically allocate a payment to oldest unpaid invoices for the customer
        
        POST data:
        {
            "payment_id": 123
        }
        """
        from rest_framework import serializers
        from django.db import transaction
        
        payment_id = request.data.get('payment_id')
        
        if not payment_id:
            return Response(
                {"error": "payment_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            payment = Payment.objects.get(id=payment_id)
        except Payment.DoesNotExist:
            return Response(
                {"error": "Payment not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Validate payment status
        if payment.status != 'completed':
            return Response(
                {"error": "Only completed payments can be allocated"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get customer from payment
        customer = payment.customer
        if not customer:
            return Response(
                {"error": "Payment has no associated customer"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get unpaid invoices for this customer, ordered by invoice date (oldest first)
        unpaid_invoices = Invoice.objects.filter(
            customer=customer,
            status__in=['finalized', 'sent', 'viewed', 'partial']
        ).filter(
            Q(amount_due__gt=0)
        ).order_by('invoice_date', 'id')
        
        if not unpaid_invoices.exists():
            return Response(
                {"error": "No unpaid invoices found for this customer"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Auto-allocate payment to invoices
        remaining_amount = payment.amount
        created_allocations = []
        
        try:
            with transaction.atomic():
                # Clear existing allocations
                PaymentAllocation.objects.filter(payment=payment).delete()
                
                for invoice in unpaid_invoices:
                    if remaining_amount <= 0:
                        break
                    
                    # Allocate min(remaining_amount, invoice.amount_due)
                    allocation_amount = min(remaining_amount, invoice.amount_due)
                    
                    allocation = PaymentAllocation.objects.create(
                        payment=payment,
                        invoice=invoice,
                        amount=allocation_amount,
                        allocated_by=request.user,
                        notes="Auto-allocated to oldest invoice"
                    )
                    created_allocations.append(allocation)
                    remaining_amount -= allocation_amount
        
        except Exception as e:
            logger.error(f"Error auto-allocating payment {payment_id}: {e}", exc_info=True)
            return Response(
                {"error": "Failed to auto-allocate payment"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        serializer = self.get_serializer(created_allocations, many=True)
        return Response({
            "allocations": serializer.data,
            "unallocated_amount": str(remaining_amount)
        }, status=status.HTTP_201_CREATED)
    
    @action(detail=False, methods=['get'])
    def by_customer(self, request):
        """Get all allocations for a specific customer"""
        customer_id = request.query_params.get('customer_id')
        if not customer_id:
            return Response(
                {"error": "customer_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        allocations = self.get_queryset().filter(invoice__customer_id=customer_id)
        serializer = self.get_serializer(allocations, many=True)
        return Response(serializer.data)


# ============================================================================
# CREDIT NOTE VIEWS
# ============================================================================

class CreditNoteViewSet(viewsets.ModelViewSet):
    """ViewSet for managing credit notes"""
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('view_billing')]
        elif self.action in ['create']:
            return [IsAuthenticated(), HasPermission('create_credit_notes')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('edit_credit_notes')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('manage_billing')]
        return [IsAuthenticated()]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'customer', 'invoice', 'credit_date']
    search_fields = ['credit_note_number', 'customer__first_name', 'customer__last_name', 'customer__company_name']
    ordering_fields = ['credit_date', 'credit_note_number', 'amount', 'created_at']
    ordering = ['-credit_date']
    
    def get_queryset(self):
        user = self.request.user
        queryset = CreditNote.objects.all().select_related(
            'customer', 'invoice', 'created_by'
        )
        
        # Filter by branch
        branch = resolve_branch(self.request)
        if branch:
            queryset = queryset.filter(branch=branch)
            
        return queryset
        
    def get_serializer_class(self):
        if self.action == 'list':
            return CreditNoteListSerializer
        elif self.action == 'create':
            return CreditNoteCreateSerializer
        return CreditNoteDetailSerializer
        
    def perform_create(self, serializer):
        branch = resolve_branch(self.request)
        serializer.save(created_by=self.request.user, branch=branch)
        
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve and issue the credit note"""
        credit_note = self.get_object()
        
        if credit_note.status != 'draft':
            return Response(
                {"error": "Only draft credit notes can be approved"},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        credit_note.status = 'issued'
        credit_note.save()
        
        return Response({"status": "Credit note issued"})

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Generate PDF for credit note"""
        from apps.core.services.print_service import generate_credit_note_pdf
        credit_note = self.get_object()
        try:
            return generate_credit_note_pdf(credit_note, branch=credit_note.branch)
        except Exception as e:
            logger.error(f"Credit Note PDF generation error: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to generate PDF: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def print(self, request, pk=None):
        """Return HTML for print view (same layout as PDF)."""
        from django.http import HttpResponse
        from apps.core.services.print_service import render_credit_note_print_html
        
        credit_note = self.get_object()
        try:
            html = render_credit_note_print_html(credit_note, branch=credit_note.branch, request=request)
            return HttpResponse(html, content_type='text/html; charset=utf-8')
        except Exception as e:
            logger.error(f"Print HTML generation error: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to generate print view: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class BillViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing vendor bills
    """
    queryset = Bill.objects.select_related('vendor', 'branch', 'created_by').prefetch_related('line_items')
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('view_bills')]
        elif self.action in ['create']:
            return [IsAuthenticated(), HasPermission('create_bills')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('edit_bills')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('manage_billing')]
        return [IsAuthenticated()]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'vendor', 'branch', 'due_date']
    search_fields = ['bill_number', 'vendor__name', 'reference_number', 'notes']
    ordering_fields = ['bill_date', 'due_date', 'total', 'created_at']
    ordering = ['-bill_date']

    def get_queryset(self):
        """Filter bills by active branch"""
        queryset = super().get_queryset()
        user = self.request.user
        
        # Check if user wants to see all branches (for admins) or just active branch
        show_all = self.request.query_params.get('all_branches', 'false').lower() == 'true'
        queryset = filter_queryset_for_user_branches(
            queryset, 
            self.request.user, 
            request=self.request, 
            use_active_branch=not show_all
        )
        return queryset

    def get_serializer_class(self):
        if self.action == 'create':
            return BillCreateSerializer
        return BillSerializer
    
    def perform_create(self, serializer):
        request = self.request
        # Resolve branch
        branch_id = request.data.get('branch')
        branch = resolve_branch(request, branch_id=branch_id)
        
        if branch is None:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'A valid branch assignment is required.'})
            
        serializer.save(branch=branch, created_by=request.user)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Generate PDF for vendor bill"""
        from apps.core.services.print_service import generate_bill_pdf
        bill = self.get_object()
        try:
            return generate_bill_pdf(bill, branch=bill.branch)
        except Exception as e:
            logger.error(f"Bill PDF generation error: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to generate PDF: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
