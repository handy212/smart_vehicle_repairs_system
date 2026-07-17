from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from apps.accounts.permissions import HasAnyPermission, HasPermission, user_has_permission, IsModuleEnabled
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone
from django.db.models import Sum, Q, F, Prefetch
from django.db import transaction, IntegrityError
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
    TillCashMovement,
    PaymentAllocation,
    Refund,
    CreditNote,
    CreditNoteLineItem,
    CreditNoteApplication,
    VendorCredit,
    VendorCreditApplication,
    Bill,
    BillLineItem,
    BillPayment,
    SalesOrder,
    VendorExpense,
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
    TaxRateSerializer,
    TaxRateCreateSerializer,
    EstimateListSerializer,
    EstimateDetailSerializer,
    EstimateCreateSerializer,
    EstimateUpdateSerializer,
    EstimateLineItemSerializer,
    EstimateLineItemCreateSerializer,
    InvoiceListSerializer,
    InvoiceDetailSerializer,
    InvoiceCreateSerializer,
    InvoiceUpdateSerializer,
    PaymentSerializer,
    PaymentCreateSerializer,
    RefundPaymentSerializer,
    PaymentAllocationSerializer,
    CreditNoteListSerializer,
    CreditNoteDetailSerializer,
    CreditNoteCreateSerializer,
    CreditNoteApplySerializer,
    VendorCreditListSerializer,
    VendorCreditDetailSerializer,
    VendorCreditCreateSerializer,
    VendorCreditApplySerializer,
    BillSerializer,
    BillCreateSerializer,
    BillLineItemSerializer,
    BillPaymentSerializer,
    BillPaymentCreateSerializer,
    BillPaymentListSerializer,
    PayBillsBatchSerializer,
    VendorExpenseSerializer,
    VendorExpenseCreateSerializer,
    VendorExpenseUpdateSerializer,
    SalesOrderListSerializer,
    SalesOrderDetailSerializer,
    SalesOrderCreateSerializer,
    CashierTillSerializer,
    CashCountSerializer,
    OpenTillSerializer,
    CloseTillSerializer,
    TillCashMovementSerializer,
    RecordTillMovementSerializer,
    RefundSerializer,
    RefundCreateSerializer,
)
from apps.billing.tax_service import TaxService


def log_accounting_audit(user, action, resource_type, resource_id, details, metadata=None):
    try:
        from apps.accounting.models import AuditLog
        AuditLog.objects.create(
            user=user,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id),
            details=details,
            metadata=metadata or {},
        )
    except Exception:
        logger.warning("Failed to write accounting audit log", exc_info=True)


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
    permission_classes = [IsAuthenticated, IsModuleEnabled('billing')]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve', 'active', 'by_location']:
            return [IsAuthenticated(), IsModuleEnabled('billing')(), HasPermission('view_settings')()]
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsModuleEnabled('billing')(), HasPermission('manage_settings')()]
        return [IsAuthenticated(), IsModuleEnabled('billing')(), HasPermission('view_settings')()]
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
    permission_classes = [IsAuthenticated, IsModuleEnabled('billing')]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        # Allow customers to view their own estimates without billing permission
        if self.action in ['list', 'retrieve', 'pdf', 'print']:
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated(), IsModuleEnabled('billing')]
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('view_billing')]
        elif self.action == 'create':
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('create_estimates')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('edit_estimates')]
        elif self.action in ['history', 'pdf', 'print', 'next_number']:
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('view_billing')]
        elif self.action in ['bulk_update_status', 'bulk_send', 'send', 'send_whatsapp', 'send_customer_sms', 'send_customer_email', 'suggested_message']:
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('edit_estimates')]
        elif self.action == 'approve':
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated(), IsModuleEnabled('billing')]
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('approve_estimates')]
        elif self.action == 'decline':
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated(), IsModuleEnabled('billing')]
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('reject_estimates')]
        elif self.action == 'duplicate':
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('create_estimates')]
        elif self.action == 'mark_ready':
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('view_billing')]
        elif self.action == 'convert_to_invoice':
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('convert_estimate_to_invoice')]
        elif self.action == 'convert_to_work_order':
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('create_workorders')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('manage_billing')]
        return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('view_billing')]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['branch'] = resolve_branch(self.request)
        return context

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'customer', 'vehicle', 'estimate_date']
    search_fields = [
        'estimate_number', 'title', 'description',
        'customer__customer_number', 'customer__company_name',
        'customer__user__first_name', 'customer__user__last_name',
        'customer__user__email',
    ]
    ordering_fields = [
        'estimate_number', 'estimate_date', 'valid_until', 'total', 'created_at',
        'customer__user__last_name', 'customer__user__first_name', 'status'
    ]
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Filter estimates by active branch from session"""
        queryset = super().get_queryset()
        user = self.request.user

        # Customers only see estimates that have intentionally been released.
        if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
            return queryset.filter(
                customer=user.customer_profile,
                status__in=['sent', 'viewed', 'approved', 'declined', 'expired'],
            )
        
        # Check if user wants to see all branches (for admins) or just active branch
        show_all = self.request.query_params.get('all_branches', 'false').lower() == 'true'
        queryset = filter_queryset_for_user_branches(
            queryset, 
            self.request.user, 
            request=self.request, 
            use_active_branch=not show_all,
            include_unassigned=True,
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
        
        estimates = self.get_queryset().filter(id__in=ids)
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

        if new_status in {'approved', 'declined', 'sent', 'viewed'}:
            stale_link = (
                self.get_queryset()
                .filter(id__in=ids, work_order__isnull=False)
                .exclude(work_order__status='awaiting_approval')
                .select_related('work_order')
                .first()
            )
            if stale_link:
                return Response(
                    {
                        "error": (
                            f"Estimate {stale_link.estimate_number} is linked to work order "
                            f"{stale_link.work_order.work_order_number}, which is "
                            f"{stale_link.work_order.get_status_display()}. Use the current workflow action "
                            "or issue a new estimate."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        
        queryset = self.get_queryset().filter(id__in=ids)
        record_ids = list(queryset.values_list('id', flat=True))
        updated_count = queryset.update(status=new_status)

        from apps.quickbooks_online.status_sync import schedule_syncs_after_bulk_status_update
        schedule_syncs_after_bulk_status_update(Estimate, record_ids, new_status)
        
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
    permission_classes = [IsAuthenticated, IsModuleEnabled('billing')]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve', 'pdf', 'print']:
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated(), IsModuleEnabled('billing')]
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('view_billing')]
        return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('edit_estimates')]
        
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
    ).prefetch_related('payments', 'line_items__revenue_product', 'line_items__part')
    permission_classes = [IsAuthenticated, IsModuleEnabled('billing')]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        # Allow customers to view their own invoices without billing permission
        if self.action in ['list', 'retrieve', 'pdf', 'print']:
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated(), IsModuleEnabled('billing')]
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('view_billing')]
        elif self.action == 'create':
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('create_invoices')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('edit_invoices')]
        elif self.action in ['history', 'pdf', 'print', 'unpaid', 'overdue', 'work_order_line_preview']:
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('view_billing')]
        elif self.action in ['bulk_update_status', 'bulk_send', 'send', 'send_whatsapp', 'send_customer_sms', 'send_customer_email', 'suggested_message']:
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('edit_invoices')]
        elif self.action == 'convert_to_invoice':
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('create_invoices')]
        elif self.action == 'void':
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('delete_invoices')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('delete_invoices')]
        return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('view_billing')]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['branch'] = resolve_branch(self.request)
        return context

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['customer', 'vehicle', 'work_order', 'invoice_date', 'due_date']
    search_fields = [
        'invoice_number', 'description',
        'customer__customer_number', 'customer__company_name',
        'customer__user__first_name', 'customer__user__last_name',
        'customer__user__email',
        'work_order__work_order_number',
    ]
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
            queryset = queryset.filter(customer=user.customer_profile).exclude(status__in=['draft', 'void'])

            status = self.request.query_params.get('status')
            if status:
                if status == 'unpaid':
                    queryset = queryset.filter(status__in=['sent', 'viewed', 'proforma', 'partial', 'overdue'])
                else:
                    queryset = queryset.filter(status=status)

            return queryset

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
        
        # Filter for invoices with remaining balance (for allocation use cases)
        has_balance = self.request.query_params.get('has_balance', 'false').lower() == 'true'
        if has_balance:
            from django.db.models import Q
            queryset = queryset.exclude(amount_due__lte=0).exclude(status='paid')
        
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
            work_order_id = request.data.get('work_order')
            if work_order_id:
                from apps.workorders.models import WorkOrder
                work_order = (
                    WorkOrder.objects.filter(pk=work_order_id)
                    .select_related('branch', 'estimate')
                    .first()
                )
                if work_order and work_order.branch_id:
                    branch = work_order.branch
                elif work_order:
                    estimate = getattr(work_order, 'estimate', None)
                    if estimate and estimate.branch_id:
                        branch = estimate.branch

        if branch is None:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'A valid branch assignment is required.'})

        invoice = serializer.save(branch=branch, created_by=request.user)

        if invoice.status == 'sent':
            try:
                invoice.sent_by = request.user
                invoice.sent_at = timezone.now()
                invoice.save(update_fields=['sent_by', 'sent_at'])
            except Exception as e:
                logger.warning(f"Failed to update sent metadata on invoice: {e}")

    def perform_destroy(self, instance):
        """Delete invoices in any document status when no financial records depend on them."""
        blocking_records = []
        if instance.payments.exists():
            blocking_records.append("payments")
        if instance.refunds.exists():
            blocking_records.append("refunds")
        if instance.credit_note_applications.exists():
            blocking_records.append("credit note applications")

        if blocking_records:
            raise ValidationError({
                "detail": (
                    "This invoice has related "
                    f"{', '.join(blocking_records)} and cannot be deleted. "
                    "Void or reverse those records first."
                )
            })

        super().perform_destroy(instance)


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
        'invoice', 'customer', 'processed_by', 'refunded_by',
        'till', 'till__till_account', 'bank_account'
    ).prefetch_related('allocations')
    permission_classes = [IsAuthenticated, IsModuleEnabled('billing')]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated(), IsModuleEnabled('billing')]
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('view_billing')]
        elif self.action == 'create':
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('process_payments')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('edit_payments')]
        elif self.action == 'refund':
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('refund_payments')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('manage_billing')]
        return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('view_billing')]

    serializer_class = PaymentSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['invoice', 'customer', 'payment_method', 'status', 'payment_date']
    search_fields = [
        'payment_number', 'reference_number', 'invoice__invoice_number',
        'customer__customer_number', 'customer__company_name',
        'customer__user__first_name', 'customer__user__last_name',
        'customer__user__email',
    ]
    ordering_fields = ['payment_number', 'payment_date', 'amount', 'created_at', 'status', 'payment_method', 'customer__user__last_name', 'invoice__invoice_number']
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
            refund = Refund.objects.create(
                original_payment=payment,
                invoice=payment.invoice,
                customer=payment.customer,
                amount=serializer.validated_data['refund_amount'],
                reason=serializer.validated_data['refund_reason'],
                refund_method='original_method',
                requested_by=request.user,
            )
            return Response({
                "message": "Refund request created. Approve and complete it to post cash/bank and accounting entries.",
                "refund": RefundSerializer(refund).data,
            }, status=status.HTTP_201_CREATED)
        
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
            invoice.recalculate_amount_paid_from_collections()
            
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
        """Get the unallocated prepayment credit remaining on this payment."""
        from apps.billing.balance_utils import payment_allocated_total, payment_net_amount, payment_unallocated_balance

        payment = self.get_object()
        unallocated = payment_unallocated_balance(payment)
        allocated = payment_allocated_total(payment)
        return Response({
            'payment_amount': str(payment_net_amount(payment)),
            'allocated': str(allocated),
            'unallocated': str(unallocated),
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

    permission_classes = [IsAuthenticated, IsModuleEnabled('billing'), HasPermission('view_billing')]

    def get(self, request):
        config = TaxService.get_config()
        return Response({
            'enabled': config.enabled,
            'regime': config.regime,
            'vat_rate': str(config.vat_rate),
            'nhil_rate': str(config.nhil_rate),
            'getfund_rate': str(config.getfund_rate),
        })


class TillViewSet(viewsets.ModelViewSet):
    """Till management for cashiers"""
    
    queryset = CashierTill.objects.all()
    serializer_class = CashierTillSerializer
    module_slug = 'billing'
    read_permission = 'manage_billing'
    write_permission = 'manage_billing'
    manage_permission = 'manage_billing'
    permission_classes = [IsAuthenticated, IsModuleEnabled('billing'), HasPermission('view_billing')]

    def get_permissions(self):
        """Open/close tills require payment privileges; read uses view_billing."""
        base = [IsAuthenticated(), IsModuleEnabled(self.module_slug)]
        if self.action in ('open', 'close', 'record_movement'):
            return base + [HasPermission(self.write_permission)]
        if self.action in ('approve_variance',):
            return base + [HasPermission(self.manage_permission)]
        if self.action in ('list', 'retrieve', 'current', 'movements'):
            return base + [HasPermission(self.read_permission)]
        return base + [HasPermission(self.manage_permission)]
    
    def get_queryset(self):
        queryset = filter_queryset_for_user_branches(
            super().get_queryset(),
            self.request.user,
            request=self.request,
            use_active_branch=True,
        )
        
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

        till_account = self.request.query_params.get('till_account') or self.request.query_params.get('account')
        if till_account:
            queryset = queryset.filter(till_account_id=till_account)
        
        # Filter by date
        date = self.request.query_params.get('date')
        if date:
            queryset = queryset.filter(opened_at__date=date)
        
        return queryset.select_related('branch', 'cashier', 'closed_by', 'till_account').prefetch_related(
            'cash_counts',
            Prefetch(
                'cash_movements',
                queryset=TillCashMovement.objects.select_related('recorded_by').order_by('-created_at'),
            ),
        )
    
    @action(detail=False, methods=['post'])
    def open(self, request):
        """Open a new till"""
        serializer = OpenTillSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        
        branch = resolve_branch(request)
        if branch is None:
            return Response(
                {'error': 'A branch context is required to open a till. Select a branch and try again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        till_account = serializer.validated_data['till_account']
        existing_till = CashierTill.objects.filter(
            branch=branch,
            till_account=till_account,
            status='open'
        ).first()
        if existing_till:
            return Response(
                {'error': 'This cash account already has an open till for the selected branch.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                till = CashierTill.objects.create(
                    branch=branch,
                    cashier=request.user,
                    till_account=till_account,
                    opening_balance=serializer.validated_data['opening_balance'],
                    status='open'
                )

                for count_data in serializer.validated_data.get('cash_counts', []):
                    CashCount.objects.create(
                        till=till,
                        count_type='opening',
                        denomination=Decimal(str(count_data['denomination'])),
                        quantity=int(count_data['quantity'])
                    )
                log_accounting_audit(
                    request.user,
                    'create',
                    'CashierTill',
                    till.id,
                    (
                        f"Opened till for {till_account.code} - {till_account.name}; "
                        f"Branch: {branch}; Opening balance: {till.opening_balance}"
                    ),
                    metadata={
                        'event': 'till_opened',
                        'branch_id': branch.id,
                        'till_account_id': till_account.id,
                        'opening_balance': str(till.opening_balance),
                    },
                )
        except IntegrityError:
            return Response(
                {'error': 'This cash account already has an open till for the selected branch.'},
                status=status.HTTP_400_BAD_REQUEST,
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
        
        serializer = CloseTillSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        with transaction.atomic():
            # Replace any previous closing count attempt before final close.
            till.cash_counts.filter(count_type='closing').delete()

            total_counted = Decimal('0')
            for count_data in serializer.validated_data.get('cash_counts', []):
                cash_count = CashCount.objects.create(
                    till=till,
                    count_type='closing',
                    denomination=Decimal(str(count_data['denomination'])),
                    quantity=int(count_data['quantity'])
                )
                total_counted += cash_count.total
            if not serializer.validated_data.get('cash_counts'):
                total_counted = serializer.validated_data['counted_amount']

            expected_balance = till.calculate_expected_balance()
            variance = (total_counted - expected_balance).quantize(Decimal('0.01'))
            notes = serializer.validated_data.get('notes', '')
            if variance != 0 and not notes.strip():
                return Response(
                    {'error': 'A variance reason is required before closing a till with shortage or excess.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            till.closing_balance = total_counted
            till.expected_balance = expected_balance
            till.variance = variance
            till.closed_at = timezone.now()
            till.closed_by = request.user
            till.status = 'closed'
            till.notes = notes
            till.set_variance_approval_status()
            till.save()
            log_accounting_audit(
                request.user,
                'update',
                'CashierTill',
                till.id,
                (
                    f"Closed till for {till.till_account}; Opening: {till.opening_balance}; "
                    f"Expected: {till.expected_balance}; Actual: {till.closing_balance}; "
                    f"Variance: {till.variance}; Approval: {till.variance_approval_status}; "
                    f"Reason: {till.notes}"
                ),
                metadata={
                    'event': 'till_closed',
                    'branch_id': till.branch_id,
                    'till_account_id': till.till_account_id,
                    'opening_balance': str(till.opening_balance),
                    'expected_balance': str(till.expected_balance),
                    'actual_counted_balance': str(till.closing_balance),
                    'variance': str(till.variance),
                    'variance_approval_status': till.variance_approval_status,
                    'reason': till.notes,
                },
            )
        
        return Response({
            'message': 'Till closed successfully',
            'closing_balance': str(total_counted),
            'expected_balance': str(expected_balance),
            'variance': str(till.variance),
            'variance_approval_status': till.variance_approval_status,
            'is_balanced': abs(till.variance) < Decimal('0.01')
        })

    @action(detail=True, methods=['get'])
    def movements(self, request, pk=None):
        """List pay-in / pay-out movements for this till (audit trail)."""
        till = self.get_object()
        qs = till.cash_movements.select_related('recorded_by').order_by('-created_at')
        serializer = TillCashMovementSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='approve-variance')
    def approve_variance(self, request, pk=None):
        """Supervisor approval for a closed till variance."""
        till = self.get_object()
        if till.status != 'closed':
            return Response(
                {'error': 'Only closed tills can have variances approved.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if till.variance in (None, Decimal('0')):
            return Response(
                {'error': 'This till has no variance to approve.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        till.variance_approval_status = 'approved'
        till.save(update_fields=['variance_approval_status', 'updated_at'])
        log_accounting_audit(
            request.user,
            'update',
            'CashierTill',
            till.id,
            f"Approved till variance {till.variance} for {till.till_account}; Branch: {till.branch}",
            metadata={
                'event': 'till_variance_approved',
                'branch_id': till.branch_id,
                'till_account_id': till.till_account_id,
                'variance': str(till.variance),
                'approval_state': till.variance_approval_status,
            },
        )
        return Response(CashierTillSerializer(till).data)

    @action(detail=True, methods=['post'])
    def record_movement(self, request, pk=None):
        """Record pay-in or pay-out against an open till you own."""
        till = self.get_object()
        if till.status != 'open':
            return Response(
                {'error': 'Till is not open'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = RecordTillMovementSerializer(
            data=request.data,
            context={'till': till, 'request': request},
        )
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            movement = TillCashMovement.objects.create(
                till=till,
                movement_type=serializer.validated_data['movement_type'],
                amount=serializer.validated_data['amount'],
                reason=serializer.validated_data.get('reason') or '',
                recorded_by=request.user,
            )
            log_accounting_audit(
                request.user,
                'create',
                'TillCashMovement',
                movement.id,
                (
                    f"{movement.get_movement_type_display()} {movement.amount} on "
                    f"{till.till_account}; Branch: {till.branch}; Reason: {movement.reason}"
                ),
                metadata={
                    'event': 'till_cash_movement',
                    'branch_id': till.branch_id,
                    'till_account_id': till.till_account_id,
                    'movement_type': movement.movement_type,
                    'amount': str(movement.amount),
                    'reason': movement.reason,
                },
            )
        return Response(
            TillCashMovementSerializer(movement).data,
            status=status.HTTP_201_CREATED,
        )
    
    @action(detail=False, methods=['get'])
    def current(self, request):
        """Get current open till for account/branch, or current user's latest open till."""
        qs = CashierTill.objects.filter(status='open')
        account_id = request.query_params.get('till_account') or request.query_params.get('account')
        if account_id:
            qs = qs.filter(till_account_id=account_id)
        branch = resolve_branch(request)
        if branch:
            qs = qs.filter(branch=branch)
        elif not account_id:
            qs = qs.filter(cashier=request.user)
        till = qs.select_related('branch', 'till_account').order_by('-opened_at').prefetch_related(
            'cash_counts',
            Prefetch(
                'cash_movements',
                queryset=TillCashMovement.objects.select_related('recorded_by').order_by('-created_at'),
            ),
        ).first()
        
        if not till:
            return Response(
                {'message': 'No open till found', 'id': None},
                status=status.HTTP_200_OK
            )
        
        return Response(CashierTillSerializer(till).data)


# Removed BranchPLComparisonViewSet


class RefundViewSet(viewsets.ModelViewSet):
    """Refund management"""
    
    queryset = Refund.objects.all()
    serializer_class = RefundSerializer
    permission_classes = [IsAuthenticated, IsModuleEnabled('billing')]
    filter_backends = [SearchFilter, OrderingFilter]

    def get_permissions(self):
        base = [IsAuthenticated(), IsModuleEnabled('billing')]
        if self.action in ('list', 'retrieve'):
            return base + [HasPermission('view_billing')()]
        if self.action in ('approve', 'reject', 'complete'):
            return base + [HasPermission('refund_payments')()]
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return base + [HasPermission('view_billing')()]
        return base + [HasPermission('process_payments')()]
    search_fields = ['refund_number', 'customer__user__first_name', 'customer__user__last_name', 'customer__company_name', 'reference_number']
    ordering_fields = [
        'refund_number', 'amount', 'status', 'refund_method', 'requested_at', 'created_at',
        'customer__user__last_name', 'customer__company_name',
    ]
    ordering = ['-requested_at']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        from apps.branches.utils import filter_queryset_for_user_branches

        invoice_ids = filter_queryset_for_user_branches(
            Invoice.objects.all(),
            self.request.user,
            request=self.request,
            use_active_branch=True,
        ).values_list('id', flat=True)
        queryset = queryset.filter(invoice_id__in=invoice_ids)
        
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
            'original_payment__bank_account', 'original_payment__till', 'original_payment__till__till_account',
            'requested_by', 'approved_by', 'processed_by', 'bank_account', 'till', 'till__till_account'
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

        is_cash_refund = (
            refund.refund_method == 'cash'
            or (
                refund.refund_method == 'original_method'
                and refund.original_payment.payment_method == 'cash'
            )
        )
        if is_cash_refund:
            cash_account_id = request.data.get('cash_account')
            cash_account = None
            if cash_account_id:
                from apps.accounting.models import Account
                cash_account = Account.objects.filter(pk=cash_account_id, is_till_enabled=True).first()
            if cash_account is None and refund.original_payment.till_id:
                cash_account = refund.original_payment.till.till_account
            till_qs = CashierTill.objects.filter(status='open')
            if cash_account:
                till_qs = till_qs.filter(till_account=cash_account)
            if refund.invoice.branch_id:
                till_qs = till_qs.filter(branch_id=refund.invoice.branch_id)
            till = till_qs.order_by('-opened_at').first()
            if not till:
                return Response(
                    {'error': 'Open a till for the selected cash account before completing a cash refund'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            refund.till = till
            refund.bank_account = None
        else:
            from apps.accounting.models import Account
            bank_account_id = request.data.get('bank_account')
            bank_account = None
            if bank_account_id:
                bank_account = Account.objects.filter(
                    pk=bank_account_id,
                    is_active=True,
                    account_type='asset',
                    account_subtype__in=['bank', 'cash_equivalent'],
                ).first()
            if bank_account is None and refund.refund_method == 'original_method':
                bank_account = refund.original_payment.bank_account
            if bank_account is None:
                return Response(
                    {'error': 'Select the bank or cash-equivalent account before completing this refund'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not bank_account.is_leaf:
                return Response(
                    {'error': 'Refund bank account must be a detail/leaf account'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            refund.bank_account = bank_account
            refund.till = None

        with transaction.atomic():
            refund.status = 'completed'
            refund.processed_by = request.user
            refund.processed_at = timezone.now()
            refund.save()

            # Update original payment refund amount
            payment = Payment.objects.select_for_update().get(pk=refund.original_payment_id)
            payment.refund_amount = (payment.refund_amount or Decimal('0')) + refund.amount
            payment.refund_date = timezone.now()
            payment.refund_reason = refund.reason
            payment.refunded_by = request.user
            if payment.refund_amount >= payment.amount:
                payment.status = 'refunded'
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
    permission_classes = [IsAuthenticated, IsModuleEnabled('billing')]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated(), IsModuleEnabled('billing')()]
            return [IsAuthenticated(), IsModuleEnabled('billing')(), HasPermission('view_billing')()]
        return [IsAuthenticated(), IsModuleEnabled('billing')(), HasPermission('process_payments')()]
        
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
        
        logger.warning(f"allocate_payment called | payment_id: {payment_id} | allocations: {allocations} | User: {request.user}")
        
        if not payment_id or not allocations:
            logger.error(f"Missing required fields | payment_id: {payment_id} | allocations: {allocations}")
            return Response(
                {"error": "payment_id and allocations are required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            payment = Payment.objects.get(id=payment_id)
        except Payment.DoesNotExist:
            logger.error(f"Payment not found | payment_id: {payment_id}")
            return Response(
                {"error": "Payment not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Validate payment status
        if payment.status != 'completed':
            logger.error(f"Payment status validation failed | payment_id: {payment_id} | status: {payment.status} | required: completed")
            return Response(
                {"error": "Only completed payments can be allocated"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate total allocation doesn't exceed payment amount
        total_allocated = sum(Decimal(str(a.get('amount', 0))) for a in allocations)
        if total_allocated > payment.amount:
            logger.error(f"Total allocation exceeds payment amount | payment_id: {payment_id} | total_allocated: {total_allocated} | payment.amount: {payment.amount}")
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
                    
                    logger.debug(f"Processing allocation | invoice_id: {invoice_id} | amount: {amount}")
                    
                    if amount <= 0:
                        logger.error(f"Invalid allocation amount | amount: {amount}")
                        raise serializers.ValidationError(f"Allocation amount must be greater than 0")
                    
                    try:
                        invoice = Invoice.objects.get(id=invoice_id)
                    except Invoice.DoesNotExist:
                        logger.error(f"Invoice not found | invoice_id: {invoice_id}")
                        raise serializers.ValidationError(f"Invoice {invoice_id} not found")
                    
                    # Check if invoice is already fully paid
                    if invoice.amount_due <= 0:
                        logger.warning(f"Invoice is already fully paid | invoice_id: {invoice_id} | invoice_number: {invoice.invoice_number} | amount_due: {invoice.amount_due}")
                        raise serializers.ValidationError(
                            f"Invoice {invoice.invoice_number} is already fully paid and cannot receive additional allocation"
                        )
                    
                    # Validate allocation doesn't exceed invoice balance
                    if amount > invoice.amount_due:
                        logger.error(f"Allocation exceeds invoice balance | invoice_id: {invoice_id} | invoice_number: {invoice.invoice_number} | amount: {amount} | amount_due: {invoice.amount_due}")
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
            logger.error(f"ValidationError in allocate_payment | payment_id: {payment_id} | error: {str(e)}")
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
        
        logger.warning(f"auto_allocate called | payment_id: {payment_id} | User: {request.user}")
        
        if not payment_id:
            logger.error(f"Missing payment_id in auto_allocate request")
            return Response(
                {"error": "payment_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            payment = Payment.objects.get(id=payment_id)
        except Payment.DoesNotExist:
            logger.error(f"Payment not found | payment_id: {payment_id}")
            return Response(
                {"error": "Payment not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Validate payment status
        if payment.status != 'completed':
            logger.error(f"Payment status validation failed | payment_id: {payment_id} | status: {payment.status}")
            return Response(
                {"error": "Only completed payments can be allocated"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get customer from payment
        customer = payment.customer
        if not customer:
            logger.error(f"Payment has no customer | payment_id: {payment_id}")
            return Response(
                {"error": "Payment has no associated customer"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get unpaid invoices for this customer, ordered by invoice date (oldest first)
        unpaid_invoices = Invoice.objects.filter(
            customer=customer,
            status__in=['sent', 'viewed', 'partial', 'overdue', 'proforma'],
            amount_due__gt=0,
        ).order_by('invoice_date', 'id')
        
        logger.info(f"Found {unpaid_invoices.count()} unpaid invoices for customer {customer.id}")
        
        if not unpaid_invoices.exists():
            logger.error(f"No unpaid invoices found | payment_id: {payment_id} | customer: {customer.id}")
            return Response(
                {"error": "No unpaid invoices found for this customer"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Auto-allocate payment to invoices
        from apps.billing.balance_utils import payment_unallocated_balance

        remaining_amount = payment_unallocated_balance(payment)
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
    permission_classes = [IsAuthenticated, IsModuleEnabled('billing')]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('view_billing')]
        elif self.action in ['create']:
            return [IsAuthenticated(), HasPermission('create_credit_notes')]
        elif self.action in ['update', 'partial_update', 'apply']:
            return [IsAuthenticated(), HasPermission('edit_credit_notes')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('manage_billing')]
        return [IsAuthenticated(), IsModuleEnabled('billing')(), HasPermission('view_billing')()]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'customer', 'invoice', 'credit_date']
    search_fields = [
        'credit_note_number',
        'customer__customer_number', 'customer__company_name',
        'customer__user__first_name', 'customer__user__last_name',
        'customer__user__email',
    ]
    ordering_fields = ['credit_date', 'credit_note_number', 'amount', 'status', 'customer__user__last_name', 'created_at']
    ordering = ['-credit_date']
    
    def get_queryset(self):
        user = self.request.user
        queryset = CreditNote.objects.all().select_related(
            'customer', 'invoice', 'created_by'
        ).prefetch_related(
            'line_items',
            Prefetch(
                'applications',
                queryset=CreditNoteApplication.objects.select_related('invoice', 'applied_by'),
            ),
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
            
        credit_note.calculate_totals()
        credit_note.status = 'issued'
        credit_note.save()
        
        return Response({"status": "Credit note issued"})

    @action(detail=True, methods=['post'])
    def apply(self, request, pk=None):
        """
        Apply unused credit from an issued note toward an open invoice (same customer).
        Body: { "invoice": <id>, "amount": "<optional decimal>" }
        If amount is omitted, applies min(unused credit, invoice balance due).
        """
        serializer = CreditNoteApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice_id = serializer.validated_data['invoice']
        requested_amount = serializer.validated_data.get('amount')

        credit_note = self.get_object()

        try:
            with transaction.atomic():
                cn = CreditNote.objects.select_for_update().get(pk=credit_note.pk)
                invoice = Invoice.objects.select_for_update().get(pk=invoice_id)

                if cn.status != 'issued':
                    return Response(
                        {'error': 'Only issued credit notes can be applied. Approve the note first, or it is already fully applied.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if cn.unused_amount <= 0:
                    return Response(
                        {'error': 'This credit note has no remaining balance.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if invoice.customer_id != cn.customer_id:
                    return Response(
                        {'error': 'Invoice must belong to the same customer as the credit note.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if cn.branch_id and invoice.branch_id and cn.branch_id != invoice.branch_id:
                    return Response(
                        {'error': 'Credit note and invoice must be for the same branch.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if invoice.status in ('void', 'refunded'):
                    return Response(
                        {'error': 'Cannot apply credit to a void or refunded invoice.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                request_branch = resolve_branch(request)
                if request_branch:
                    if cn.branch_id and cn.branch_id != request_branch.id:
                        return Response(
                            {'error': 'Credit note is not in your current branch context.'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    if invoice.branch_id and invoice.branch_id != request_branch.id:
                        return Response(
                            {'error': 'Invoice is not in your current branch context.'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                invoice.refresh_from_db()
                amount_due = invoice.amount_due
                if amount_due <= 0:
                    return Response(
                        {'error': 'This invoice has no open balance.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                cap = min(cn.unused_amount, amount_due).quantize(Decimal('0.01'))
                if requested_amount is None:
                    apply_amt = cap
                else:
                    apply_amt = min(cap, requested_amount.quantize(Decimal('0.01')))
                if apply_amt <= 0:
                    return Response(
                        {'error': 'Nothing to apply (check invoice balance and credit availability).'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if requested_amount is not None and requested_amount > cap:
                    return Response(
                        {'error': 'Requested amount exceeds unused credit or invoice balance due.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                CreditNoteApplication.objects.create(
                    credit_note=cn,
                    invoice=invoice,
                    amount=apply_amt,
                    applied_by=request.user,
                )
                cn.calculate_totals()
                invoice.refresh_from_db()
                invoice.recalculate_amount_paid_from_collections()
                cn.refresh_from_db()

                application = cn.applications.filter(invoice=invoice).order_by('-id').first()
                if application:
                    from apps.accounting.services import AccountingService
                    AccountingService.post_credit_note_application(application)

        except Invoice.DoesNotExist:
            return Response({'error': 'Invoice not found.'}, status=status.HTTP_404_NOT_FOUND)

        out = CreditNoteDetailSerializer(cn, context={'request': request})
        return Response(out.data, status=status.HTTP_200_OK)

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


class VendorCreditViewSet(viewsets.ModelViewSet):
    """ViewSet for vendor credit memos (AP credits)."""

    permission_classes = [IsAuthenticated, IsModuleEnabled('billing')]

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('view_bills')]
        if self.action == 'create':
            return [IsAuthenticated(), HasPermission('create_bills')]
        if self.action in ['update', 'partial_update', 'apply', 'issue']:
            return [IsAuthenticated(), HasPermission('edit_bills')]
        if self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('manage_billing')]
        return [IsAuthenticated(), HasPermission('view_bills')]

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'vendor', 'bill', 'credit_date']
    search_fields = ['credit_number', 'vendor__name', 'vendor__supplier_code', 'reason']
    ordering_fields = ['credit_date', 'credit_number', 'total', 'status', 'created_at']
    ordering = ['-credit_date']

    def get_queryset(self):
        queryset = VendorCredit.objects.select_related(
            'vendor', 'bill', 'branch', 'created_by'
        ).prefetch_related('line_items', 'applications__bill')
        queryset = filter_queryset_for_user_branches(
            queryset,
            self.request.user,
            request=self.request,
            use_active_branch=True,
        )

        bill_id = self.request.query_params.get('bill')
        if bill_id:
            accessible_bills = filter_queryset_for_user_branches(
                Bill.objects.filter(pk=bill_id),
                self.request.user,
                request=self.request,
                use_active_branch=False,
            )
            bill = accessible_bills.only('branch_id', 'vendor_id').first()
            if bill is None:
                return queryset.none()
            if bill.branch_id:
                queryset = queryset.filter(branch_id=bill.branch_id)
            if bill.vendor_id:
                queryset = queryset.filter(vendor_id=bill.vendor_id)

        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return VendorCreditListSerializer
        if self.action == 'create':
            return VendorCreditCreateSerializer
        return VendorCreditDetailSerializer

    def perform_create(self, serializer):
        branch = resolve_branch(self.request)
        serializer.save(created_by=self.request.user, branch=branch)

    @action(detail=True, methods=['post'])
    def issue(self, request, pk=None):
        vendor_credit = self.get_object()
        if vendor_credit.status != 'draft':
            return Response({'error': 'Only draft vendor credits can be issued.'}, status=status.HTTP_400_BAD_REQUEST)
        vendor_credit.status = 'issued'
        vendor_credit.save(update_fields=['status', 'updated_at'])
        return Response(VendorCreditDetailSerializer(vendor_credit, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def apply(self, request, pk=None):
        serializer = VendorCreditApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bill_id = serializer.validated_data['bill']
        requested_amount = serializer.validated_data.get('amount')
        vendor_credit = self.get_object()

        try:
            with transaction.atomic():
                vc = VendorCredit.objects.select_for_update().get(pk=vendor_credit.pk)
                bill = Bill.objects.select_for_update().get(pk=bill_id)

                if vc.status != 'issued':
                    return Response({'error': 'Only issued vendor credits can be applied.'}, status=status.HTTP_400_BAD_REQUEST)
                if vc.unused_amount <= 0:
                    return Response({'error': 'This vendor credit has no remaining balance.'}, status=status.HTTP_400_BAD_REQUEST)
                if bill.vendor_id != vc.vendor_id:
                    return Response({'error': 'Bill must belong to the same vendor as the credit.'}, status=status.HTTP_400_BAD_REQUEST)
                if vc.branch_id and bill.branch_id and vc.branch_id != bill.branch_id:
                    return Response({'error': 'Vendor credit and bill must be for the same branch.'}, status=status.HTTP_400_BAD_REQUEST)
                if bill.status in ('void', 'paid', 'draft', 'pending_approval', 'rejected'):
                    return Response({'error': 'Cannot apply credit to this bill status.'}, status=status.HTTP_400_BAD_REQUEST)

                bill.refresh_from_db()
                amount_due = bill.amount_due
                if amount_due <= 0:
                    return Response({'error': 'This bill has no open balance.'}, status=status.HTTP_400_BAD_REQUEST)

                cap = min(vc.unused_amount, amount_due).quantize(Decimal('0.01'))
                apply_amt = cap if requested_amount is None else min(cap, requested_amount.quantize(Decimal('0.01')))
                if apply_amt <= 0:
                    return Response({'error': 'Nothing to apply.'}, status=status.HTTP_400_BAD_REQUEST)

                application = VendorCreditApplication.objects.create(
                    vendor_credit=vc,
                    bill=bill,
                    amount=apply_amt,
                    applied_by=request.user,
                )
                vc.calculate_totals()
                bill.recalculate_amount_paid_from_collections()
                vc.refresh_from_db()

                from apps.accounting.services import AccountingService
                AccountingService.post_vendor_credit_application(application)
        except Bill.DoesNotExist:
            return Response({'error': 'Bill not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            VendorCreditDetailSerializer(vc, context={'request': request}).data,
            status=status.HTTP_200_OK,
        )


class BillViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing vendor bills
    """
    queryset = Bill.objects.select_related(
        'vendor', 'branch', 'purchase_order', 'created_by',
        'submitted_by', 'assigned_approver', 'approved_by', 'rejected_by'
    ).prefetch_related('line_items', 'payments', 'vendor_credit_applications__vendor_credit')
    permission_classes = [IsAuthenticated, IsModuleEnabled('billing')]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('view_bills')]
        elif self.action in ['create']:
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('create_bills')]
        elif self.action in ['update', 'partial_update', 'record_payment', 'void']:
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('edit_bills')]
        elif self.action in ['submit_for_approval', 'approvers', 'open_draft']:
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasAnyPermission(['create_bills', 'edit_bills', 'manage_billing'])]
        elif self.action in ['approve', 'reject']:
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasAnyPermission(['edit_bills', 'manage_billing'])]
        elif self.action == 'destroy':
            return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('manage_billing')]
        return [IsAuthenticated(), IsModuleEnabled('billing'), HasPermission('view_bills')]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'vendor', 'branch', 'purchase_order', 'due_date']
    search_fields = ['bill_number', 'vendor__name', 'purchase_order__po_number', 'reference_number', 'notes']
    ordering_fields = ['bill_number', 'bill_date', 'due_date', 'total', 'amount_due', 'status', 'created_at']
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
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        date_from = self.request.query_params.get('bill_date__gte') or self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('bill_date__lte') or self.request.query_params.get('date_to')
        due_date_from = self.request.query_params.get('due_date__gte') or self.request.query_params.get('due_date_from')
        due_date_to = self.request.query_params.get('due_date__lte') or self.request.query_params.get('due_date_to')
        if date_from:
            queryset = queryset.filter(bill_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(bill_date__lte=date_to)
        if due_date_from:
            queryset = queryset.filter(due_date__gte=due_date_from)
        if due_date_to:
            queryset = queryset.filter(due_date__lte=due_date_to)
        return queryset

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
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

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Vendor bill statistics for list dashboard cards."""
        from .services import BillingService

        return Response(BillingService.get_bill_stats(self.get_queryset()))

    @action(detail=False, methods=['get'])
    def approvers(self, request):
        """Return active users who can approve standalone vendor bills."""
        from apps.accounts.models import User

        from apps.accounts.permissions import user_can_approve_bills

        users = User.objects.filter(is_active=True).exclude(id=request.user.id).order_by(
            'first_name', 'last_name', 'email'
        )
        users = [user for user in users if user_can_approve_bills(user)]

        return Response([
            {
                'id': user.id,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'full_name': user.get_full_name(),
                'role': user.role,
            }
            for user in users
        ])

    @action(detail=True, methods=['post'], url_path='submit-for-approval')
    def submit_for_approval(self, request, pk=None):
        """Submit a standalone vendor bill for approval."""
        bill = self.get_object()
        if bill.purchase_order_id:
            return Response(
                {"error": "PO-linked bills use purchase order approval and do not need bill approval."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if bill.status not in ['draft', 'rejected']:
            return Response(
                {"error": "Only draft or rejected standalone bills can be submitted for approval."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if bill.total <= 0:
            return Response(
                {"error": "Bill total must be greater than zero before approval."},
                status=status.HTTP_400_BAD_REQUEST
            )
        approver_id = request.data.get('approver_id')
        if not approver_id:
            return Response(
                {"error": "Select an approver before submitting this bill."},
                status=status.HTTP_400_BAD_REQUEST
            )
        from apps.accounts.models import User
        try:
            approver = User.objects.get(id=approver_id, is_active=True)
        except User.DoesNotExist:
            return Response(
                {"error": "Selected approver was not found."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if approver.id == request.user.id:
            return Response(
                {"error": "Bills must be approved by someone other than the submitter."},
                status=status.HTTP_400_BAD_REQUEST
            )
        from apps.accounts.permissions import user_can_approve_bills

        if not user_can_approve_bills(approver):
            return Response(
                {"error": "Selected approver does not have bill approval permissions."},
                status=status.HTTP_400_BAD_REQUEST
            )
        bill.status = 'pending_approval'
        bill.assigned_approver = approver
        bill.submitted_by = request.user
        bill.submitted_at = timezone.now()
        bill.rejection_reason = ''
        bill.save()
        try:
            notification_triggers.bill_approval_request(bill, approver)
        except Exception as e:
            logger.warning("Failed to send bill approval notification: %s", e, exc_info=True)
        return Response(BillSerializer(bill).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a standalone vendor bill and open it for AP posting."""
        bill = self.get_object()
        if bill.purchase_order_id:
            return Response(
                {"error": "PO-linked bills are approved through the purchase order workflow."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if bill.status != 'pending_approval':
            return Response(
                {"error": "Only pending approval bills can be approved."},
                status=status.HTTP_400_BAD_REQUEST
            )
        is_assigned_approver = bill.assigned_approver_id == request.user.id
        if not is_assigned_approver and not user_has_permission(request.user, 'manage_billing'):
            return Response(
                {"error": "Only the assigned approver or a billing manager can approve this bill."},
                status=status.HTTP_403_FORBIDDEN
            )
        with transaction.atomic():
            bill.refresh_from_db()
            bill.calculate_totals()
            bill.status = 'open'
            bill.approved_by = request.user
            bill.approved_at = timezone.now()
            bill.save()
        return Response(BillSerializer(bill).data)

    @action(detail=True, methods=['post'], url_path='open-draft')
    def open_draft(self, request, pk=None):
        """Open a PO-linked draft bill so it can enter AP/payment workflow."""
        bill = self.get_object()
        if not bill.purchase_order_id:
            return Response(
                {"error": "Only purchase-order-linked bills can be opened directly from draft."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if bill.status != 'draft':
            return Response(
                {"error": "Only draft purchase-order bills can be opened."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if bill.total <= 0:
            return Response(
                {"error": "Bill total must be greater than zero before opening this bill."},
                status=status.HTTP_400_BAD_REQUEST
            )
        with transaction.atomic():
            bill.refresh_from_db()
            bill.calculate_totals()
            bill.status = 'open'
            bill.save()
        return Response(BillSerializer(bill).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a standalone vendor bill back for correction."""
        bill = self.get_object()
        if bill.purchase_order_id:
            return Response(
                {"error": "PO-linked bills are controlled by the purchase order workflow."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if bill.status != 'pending_approval':
            return Response(
                {"error": "Only pending approval bills can be rejected."},
                status=status.HTTP_400_BAD_REQUEST
            )
        is_assigned_approver = bill.assigned_approver_id == request.user.id
        if not is_assigned_approver and not user_has_permission(request.user, 'manage_billing'):
            return Response(
                {"error": "Only the assigned approver or a billing manager can reject this bill."},
                status=status.HTTP_403_FORBIDDEN
            )
        bill.status = 'rejected'
        bill.rejected_by = request.user
        bill.rejected_at = timezone.now()
        if request.data.get('reason'):
            bill.rejection_reason = request.data['reason']
            bill.notes = f"{bill.notes}\nRejection reason: {request.data['reason']}".strip()
        bill.save()
        return Response(BillSerializer(bill).data)

    @action(detail=True, methods=['post'])
    def record_payment(self, request, pk=None):
        """Record a payment made to the vendor for this bill."""
        bill = self.get_object()
        if bill.status in ['draft', 'pending_approval', 'rejected', 'void']:
            return Response(
                {"error": "Payments can only be recorded for approved/open, overdue, or partially paid bills."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = BillPaymentCreateSerializer(data=request.data, context={'request': request, 'bill': bill})
        serializer.is_valid(raise_exception=True)
        wht_amount = serializer.validated_data.get('wht_amount') or Decimal('0')
        gross = serializer.validated_data['amount'] + wht_amount
        if gross > bill.amount_due:
            return Response(
                {"error": "Payment amount (including WHT) cannot exceed the bill amount due."},
                status=status.HTTP_400_BAD_REQUEST
            )
        payment = serializer.save(bill=bill, paid_by=request.user)
        return Response(BillPaymentSerializer(payment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        """Void a vendor bill when no payment has been recorded."""
        bill = self.get_object()
        if bill.amount_paid > 0:
            return Response(
                {"error": "Bills with recorded payments cannot be voided."},
                status=status.HTTP_400_BAD_REQUEST
            )
        from django.contrib.contenttypes.models import ContentType
        from apps.accounting.models import JournalEntry

        if JournalEntry.objects.filter(
            content_type=ContentType.objects.get_for_model(bill),
            object_id=bill.id
        ).exists():
            return Response(
                {"error": "Posted bills cannot be voided without a reversal workflow."},
                status=status.HTTP_400_BAD_REQUEST
            )
        bill.status = 'void'
        bill.save()
        return Response(BillSerializer(bill).data)

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


class BillPaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """Vendor bill payment history."""

    permission_classes = [IsAuthenticated, IsModuleEnabled('billing'), HasPermission('view_bills')]
    serializer_class = BillPaymentListSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['payment_method', 'payment_date']
    ordering_fields = ['payment_date', 'amount', 'created_at']
    ordering = ['-payment_date', '-created_at']

    def get_queryset(self):
        qs = BillPayment.objects.select_related(
            'bill', 'bill__vendor', 'paid_by', 'till__till_account', 'bank_account'
        )
        vendor_id = self.request.query_params.get('vendor')
        if vendor_id:
            qs = qs.filter(bill__vendor_id=vendor_id)
        bill_id = self.request.query_params.get('bill')
        if bill_id:
            qs = qs.filter(bill_id=bill_id)
        date_from = self.request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(payment_date__gte=date_from)
        date_to = self.request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(payment_date__lte=date_to)
        return qs


class PayBillsBatchView(APIView):
    """Pay multiple open vendor bills in one batch (QBO Pay Bills workflow)."""

    permission_classes = [
        IsAuthenticated,
        IsModuleEnabled('billing'),
        HasAnyPermission(['edit_bills', 'manage_billing']),
    ]

    @transaction.atomic
    def post(self, request):
        import uuid

        serializer = PayBillsBatchSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        bills = data.pop('_bills', {})
        payment_batch = f'batch-{uuid.uuid4().hex[:16]}'

        created_payments = []
        for line in data['lines']:
            bill = bills[line['bill_id']]
            pay_data = {
                'amount': line['amount'],
                'payment_date': data['payment_date'],
                'payment_method': data['payment_method'],
                'reference_number': data.get('reference_number', ''),
                'notes': data.get('notes', ''),
            }
            if data['payment_method'] == 'cash':
                cash_account = data.get('cash_account')
                pay_data['cash_account'] = cash_account.pk if cash_account is not None else None
            else:
                bank_account = data.get('bank_account')
                pay_data['bank_account'] = bank_account.pk if bank_account is not None else None

            pay_serializer = BillPaymentCreateSerializer(
                data=pay_data,
                context={'request': request, 'bill': bill},
            )
            pay_serializer.is_valid(raise_exception=True)
            payment = pay_serializer.save(bill=bill, paid_by=request.user, payment_batch=payment_batch)
            created_payments.append(payment)

        return Response(
            BillPaymentListSerializer(created_payments, many=True).data,
            status=status.HTTP_201_CREATED,
        )


class VendorExpenseViewSet(viewsets.ModelViewSet):
    """Immediate vendor expenses (QBO Purchase / Expense)."""

    permission_classes = [IsAuthenticated, IsModuleEnabled('billing'), HasPermission('view_bills')]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'vendor', 'branch', 'payment_method']
    search_fields = ['expense_number', 'vendor__name', 'reference_number', 'notes']
    ordering_fields = ['expense_date', 'expense_number', 'total', 'created_at']
    ordering = ['-expense_date', '-created_at']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'void']:
            return [
                IsAuthenticated(),
                IsModuleEnabled('billing'),
                HasAnyPermission(['edit_bills', 'manage_billing']),
            ]
        return [
            IsAuthenticated(),
            IsModuleEnabled('billing'),
            HasAnyPermission(['view_bills', 'manage_billing']),
        ]

    def get_queryset(self):
        qs = VendorExpense.objects.select_related(
            'vendor', 'branch', 'created_by', 'till', 'till__till_account', 'bank_account',
        ).prefetch_related('line_items')
        return filter_queryset_for_user_branches(qs, self.request.user, request=self.request)

    def get_serializer_class(self):
        if self.action == 'create':
            return VendorExpenseCreateSerializer
        if self.action in ['update', 'partial_update']:
            return VendorExpenseUpdateSerializer
        return VendorExpenseSerializer

    def perform_create(self, serializer):
        serializer.save()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        expense = serializer.instance
        output = VendorExpenseSerializer(expense, context=self.get_serializer_context())
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        """Void a vendor expense and reverse its GL posting."""
        expense = self.get_object()
        if expense.status == 'void':
            return Response({'error': 'Expense is already void.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.accounting.services import AccountingService

        reason = (request.data.get('reason') or '').strip() or f'Void vendor expense {expense.expense_number}'
        AccountingService.reverse_vendor_expense_journal_entries(expense, request.user, reason=reason)
        expense.status = 'void'
        expense.save(update_fields=['status', 'updated_at'])
        return Response(VendorExpenseSerializer(expense, context={'request': request}).data)


class SalesOrderViewSet(viewsets.ModelViewSet):
    """Formal sales order documents linking customer, estimate, and work order."""

    permission_classes = [IsAuthenticated, IsModuleEnabled('billing'), HasPermission('view_billing')]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'customer', 'order_date']
    search_fields = [
        'sales_order_number', 'reference_number',
        'customer__company_name', 'customer__user__first_name', 'customer__user__last_name',
    ]
    ordering_fields = ['order_date', 'sales_order_number', 'status', 'created_at']
    ordering = ['-order_date', '-created_at']

    def get_permissions(self):
        if self.action == 'create':
            return [IsAuthenticated(), IsModuleEnabled('billing')(), HasPermission('create_estimates')()]
        if self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), IsModuleEnabled('billing')(), HasPermission('edit_estimates')()]
        if self.action == 'destroy':
            return [IsAuthenticated(), IsModuleEnabled('billing')(), HasPermission('manage_billing')()]
        return [permission() for permission in self.permission_classes]

    def get_queryset(self):
        qs = SalesOrder.objects.select_related(
            'customer', 'customer__user', 'vehicle', 'estimate', 'work_order', 'sales_agent', 'branch'
        )
        return filter_queryset_for_user_branches(
            qs, self.request.user, request=self.request, include_unassigned=True
        )

    def get_serializer_class(self):
        if self.action == 'list':
            return SalesOrderListSerializer
        if self.action == 'create':
            return SalesOrderCreateSerializer
        if self.action in ['update', 'partial_update']:
            return SalesOrderCreateSerializer
        return SalesOrderDetailSerializer

    def perform_create(self, serializer):
        branch = resolve_branch(self.request)
        serializer.save(created_by=self.request.user, branch=branch)

    @action(detail=True, methods=['post'])
    def link_estimate(self, request, pk=None):
        sales_order = self.get_object()
        estimate_id = request.data.get('estimate_id')
        if not estimate_id:
            return Response({'error': 'estimate_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        estimate = Estimate.objects.filter(pk=estimate_id, customer_id=sales_order.customer_id).first()
        if not estimate:
            return Response({'error': 'Estimate not found for this customer.'}, status=status.HTTP_404_NOT_FOUND)
        sales_order.estimate = estimate
        if estimate.work_order_id and not sales_order.work_order_id:
            sales_order.work_order = estimate.work_order
        sales_order.save()
        return Response(SalesOrderDetailSerializer(sales_order).data)

    @action(detail=True, methods=['post'])
    def convert_to_work_order(self, request, pk=None):
        sales_order = self.get_object()
        if sales_order.work_order_id:
            return Response({'error': 'Sales order already has a work order.'}, status=status.HTTP_400_BAD_REQUEST)
        if not sales_order.estimate_id:
            return Response({'error': 'Link an estimate before converting to a work order.'}, status=status.HTTP_400_BAD_REQUEST)
        work_order = sales_order.estimate.convert_to_work_order()
        sales_order.work_order = work_order
        sales_order.status = 'in_progress'
        sales_order.save()
        return Response(SalesOrderDetailSerializer(sales_order).data)
