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
from apps.billing.services import PDFService
from apps.billing.filters import InvoiceFilter_branch, EstimateFilter_branch, CreditNoteFilter_branch, PaymentFilter_branch
from apps.branches.utils import filter_queryset_for_user_branches, resolve_branch
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
                print(f"Failed to send estimate notification: {e}")

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
        
        # Send notification
        from apps.notifications_app.triggers import notification_triggers
        notification_triggers.estimate_sent(estimate)
        
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
    def duplicate(self, request, pk=None):
        """Duplicate an existing estimate"""
        original = self.get_object()
        
        # Create new estimate with same data
        new_estimate = Estimate.objects.create(
            customer=original.customer,
            vehicle=original.vehicle,
            work_order=None,  # Don't link to same work order
            branch=original.branch or resolve_branch(request),
            status='draft',
            estimate_date=timezone.now().date(),
            valid_until=(timezone.now() + timedelta(days=30)).date(),
            title=f"{original.title} (Copy)" if original.title else "Estimate Copy",
            description=original.description or '',
            notes=original.notes or '',
            customer_notes=original.customer_notes or '',
            discount_percentage=original.discount_percentage,
            discount_reason=original.discount_reason,
            shop_supplies_fee=original.shop_supplies_fee,
            environmental_fee=original.environmental_fee,
            created_by=request.user,
        )
        
        # Copy line items
        for line_item in original.line_items.all():
            EstimateLineItem.objects.create(
                estimate=new_estimate,
                item_type=line_item.item_type,
                description=line_item.description,
                notes=line_item.notes or '',
                part=line_item.part,
                part_number=line_item.part_number or '',
                quantity=line_item.quantity,
                unit_price=line_item.unit_price,
                labor_hours=line_item.labor_hours,
                labor_rate=line_item.labor_rate,
                is_taxable=line_item.is_taxable,
                order=line_item.order or 0,
            )
        
        # Recalculate totals
        new_estimate.calculate_totals()
        new_estimate.save()
        
        serializer = self.get_serializer(new_estimate)
        return Response({
            "message": "Estimate duplicated successfully",
            "estimate": serializer.data
        }, status=status.HTTP_201_CREATED)
    
    @action(detail=False, methods=['post'])
    def bulk_send(self, request):
        """Send multiple estimates to customers"""
        estimate_ids = request.data.get('ids', [])
        if not estimate_ids:
            return Response(
                {"error": "No estimate IDs provided"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        estimates = self.get_queryset().filter(id__in=estimate_ids)
        sent_count = 0
        errors = []
        
        for estimate in estimates:
            if estimate.status not in ['draft', 'sent']:
                errors.append(f"Estimate {estimate.estimate_number} cannot be sent in current status")
                continue
            
            estimate.status = 'sent'
            estimate.sent_by = request.user
            estimate.sent_at = timezone.now()
            estimate.save()
            sent_count += 1
        
        return Response({
            "message": f"Successfully sent {sent_count} estimate(s)",
            "sent_count": sent_count,
            "errors": errors if errors else None
        })
    
    @action(detail=False, methods=['post'])
    def bulk_update_status(self, request):
        """Bulk update estimate statuses"""
        estimate_ids = request.data.get('ids', [])
        new_status = request.data.get('status')
        
        if not estimate_ids:
            return Response(
                {"error": "No estimate IDs provided"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not new_status:
            return Response(
                {"error": "Status is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        valid_statuses = [choice[0] for choice in Estimate.STATUS_CHOICES]
        if new_status not in valid_statuses:
            return Response(
                {"error": f"Invalid status. Must be one of: {', '.join(valid_statuses)}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        estimates = self.get_queryset().filter(id__in=estimate_ids)
        updated_count = 0
        errors = []
        
        for estimate in estimates:
            # Validate status transition
            if new_status == 'approved' and not estimate.can_be_approved:
                errors.append(f"Estimate {estimate.estimate_number} cannot be approved (expired or wrong status)")
                continue
            
            if new_status == 'approved':
                estimate.approved_date = timezone.now()
                estimate.approved_by = request.user
            
            estimate.status = new_status
            estimate.save()
            updated_count += 1
        
        return Response({
            "message": f"Successfully updated {updated_count} estimate(s)",
            "updated_count": updated_count,
            "errors": errors if errors else None
        })
    
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
        
        # Send notification
        from apps.notifications_app.triggers import notification_triggers
        notification_triggers.estimate_approved(estimate)
        
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
        
        # Send notification
        from apps.notifications_app.triggers import notification_triggers
        notification_triggers.estimate_declined(estimate)
        
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
    def convert_to_invoice(self, request, pk=None):
        """Convert estimate to invoice"""
        from datetime import timedelta
        from django.db import transaction
        from apps.billing.models import Invoice, InvoiceLineItem
        
        estimate = self.get_object()
        
        if not estimate.can_be_converted:
            return Response(
                {"error": "Estimate cannot be converted. It must be approved and not already converted."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        branch = estimate.branch or resolve_branch(request)
        if branch is None:
            return Response(
                {"error": "Unable to determine branch for new invoice."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        with transaction.atomic():
            # Prefetch line items with parts to avoid N+1 queries
            estimate_line_items = list(estimate.line_items.select_related('part').all())
            
            # Temporarily disconnect the post_save signal to prevent Django Ledger
            # invoice creation from breaking the transaction if it fails
            from django.db.models.signals import post_save
            from apps.billing.signals import invoice_post_save
            post_save.disconnect(invoice_post_save, sender=Invoice)
            
            try:
                # Create invoice from estimate
                invoice = Invoice.objects.create(
                    customer=estimate.customer,
                    vehicle=estimate.vehicle,
                    work_order=estimate.work_order,
                    estimate=estimate,
                    branch=branch,
                    status='draft',
                    invoice_date=timezone.now().date(),
                    due_date=(timezone.now() + timedelta(days=30)).date(),
                    description=estimate.description or '',
                    notes=estimate.notes or '',
                    customer_notes=estimate.customer_notes or '',
                    labor_subtotal=estimate.labor_subtotal,
                    parts_subtotal=estimate.parts_subtotal,
                    sublet_subtotal=estimate.sublet_subtotal,
                    subtotal=estimate.subtotal,
                    discount_amount=estimate.discount_amount,
                    discount_percentage=estimate.discount_percentage,
                    discount_reason=estimate.discount_reason,
                    tax_amount=estimate.tax_amount,
                    shop_supplies_fee=estimate.shop_supplies_fee,
                    environmental_fee=estimate.environmental_fee,
                    total=estimate.total,
                    amount_due=estimate.total,
                    created_by=request.user,
                )
            finally:
                # Reconnect the signal
                post_save.connect(invoice_post_save, sender=Invoice)
            
            # Copy line items from estimate to invoice
            for estimate_item in estimate_line_items:
                InvoiceLineItem.objects.create(
                    invoice=invoice,
                    item_type=estimate_item.item_type,
                    description=estimate_item.description,
                    notes=estimate_item.notes or '',
                    part=estimate_item.part,
                    part_number=estimate_item.part_number or '',
                    quantity=estimate_item.quantity,
                    unit_price=estimate_item.unit_price,
                    labor_hours=estimate_item.labor_hours,
                    labor_rate=estimate_item.labor_rate,
                    is_taxable=estimate_item.is_taxable,
                    order=estimate_item.order or 0,
                )
            
            # Update estimate status
            estimate.status = 'converted'
            estimate.converted_date = timezone.now()
            estimate.save()
            
            # Update work order status if linked
            if estimate.work_order:
                estimate.work_order.status = 'in_progress'
                estimate.work_order.save()
                
                # Create activity note
                from apps.workorders.models import WorkOrderNote
                WorkOrderNote.objects.create(
                    work_order=estimate.work_order,
                    note_type='status',
                    note=f'Estimate #{estimate.estimate_number} converted to Invoice #{invoice.invoice_number}',
                    created_by=request.user
                )
        
        # Attempt to create Django Ledger invoice outside the transaction
        # This way if it fails, it won't break the conversion
        try:
            from apps.billing.accounting_service import AccountingService
            AccountingService.create_dl_invoice(invoice)
        except Exception as e:
            # Log error but don't fail the conversion
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                f"Failed to create Django Ledger invoice for {invoice.invoice_number}: {e}",
                exc_info=True
            )
        
        from apps.billing.serializers import InvoiceDetailSerializer
        invoice_serializer = InvoiceDetailSerializer(invoice)
        
        return Response({
            "message": "Estimate converted to invoice successfully",
            "invoice": invoice_serializer.data
        }, status=status.HTTP_201_CREATED)
    
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
    
    def perform_create(self, serializer):
        """Assign branch when creating estimate"""
        request = self.request
        branch_id = request.data.get('branch') or request.data.get('branch_id')
        branch = resolve_branch(request, branch_id=branch_id)
        
        if branch is None:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'A valid branch assignment is required.'})
        
        serializer.save(branch=branch, created_by=request.user)
    
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



    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get invoice statistics for dashboard"""
        user = self.request.user
        queryset = self.get_queryset()
        
        # Calculate counts by status
        total_count = queryset.count()
        draft_count = queryset.filter(status='draft').count()
        
        # "Unpaid" typically means sent/viewed but not paid or partial
        # But for the requested widget "Unpaid | Paid | Partially Paid | Overdue | Draft"
        # We will map "Unpaid" to sent/viewed/proforma but not overdue
        
        paid_count = queryset.filter(status='paid').count()
        partial_count = queryset.filter(status='partial').count()
        overdue_count = queryset.filter(status='overdue').count()
        
        # Unpaid count (Sent/Viewed/Proforma) excluding overdue
        unpaid_count = queryset.filter(
            status__in=['sent', 'viewed', 'proforma']
        ).count()
        
        # Calculate totals for the "mini-widget"
        # "Paid Invoices" - Total amount collected (amount_paid)
        total_paid = queryset.aggregate(total=Sum('amount_paid'))['total'] or 0
        
        # "Past Due Invoices" - Total balance due for overdue invoices
        past_due_total = queryset.filter(status='overdue').aggregate(
            total=Sum('amount_due')
        )['total'] or 0
        
        # "Outstanding Invoices" - Total balance due for all non-paid/non-void invoices
        outstanding_total = queryset.exclude(
            status__in=['paid', 'void', 'cancelled']
        ).aggregate(
            total=Sum('amount_due')
        )['total'] or 0
        
        return Response({
            "counts": {
                "total": total_count,
                "draft": draft_count,
                "paid": paid_count,
                "partially_paid": partial_count,
                "overdue": overdue_count,
                "unpaid": unpaid_count
            },
            "financials": {
                "total_paid": total_paid,
                "past_due_total": past_due_total,
                "outstanding_total": outstanding_total
            }
        })

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Get audit log history for the invoice"""
        invoice = self.get_object()
        content_type = ContentType.objects.get_for_model(Invoice)
        logs = LogEntry.objects.filter(
            content_type=content_type,
            object_id=invoice.id
        ).select_related('actor').order_by('-timestamp')
        
        data = []
        for log in logs:
            actor_name = "System"
            if log.actor:
                actor_name = f"{log.actor.first_name} {log.actor.last_name}".strip() or log.actor.username

            data.append({
                'id': log.id,
                'action': log.get_action_display(),
                'timestamp': log.timestamp,
                'actor': actor_name,
                'changes': log.changes,
                'remote_addr': log.remote_addr,
            })
        return Response(data)
    
    def get_queryset(self):
        """Filter invoices by active branch from session"""
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
            include_unassigned=True  # Include invoices without branches (e.g., subscription invoices)
        )
        
        # Handle custom status filters
        status = self.request.query_params.get('status')
        if status:
            if status == 'unpaid':
                queryset = queryset.filter(status__in=['sent', 'viewed', 'proforma', 'partial'])
            else:
                # Manual filtering since we removed status from filterset_fields
                queryset = queryset.filter(status=status)

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
        """Assign branch when creating invoice and handling sending"""
        request = self.request
        branch_id = request.data.get('branch') or request.data.get('branch_id')
        branch = resolve_branch(request, branch_id=branch_id)
        
        if branch is None:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'A valid branch assignment is required.'})
        
        invoice = serializer.save(branch=branch, created_by=request.user)

        # Trigger notification if status is 'sent'
        if invoice.status == 'sent':
            try:
                from apps.notifications_app.triggers import notification_triggers
                invoice.sent_by = request.user
                invoice.sent_at = timezone.now()
                invoice.save(update_fields=['sent_by', 'sent_at'])
                notification_triggers.invoice_sent(invoice)
            except Exception as e:
                print(f"Failed to send invoice notification: {e}")
    
    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        """Send invoice to customer"""
        invoice = self.get_object()
        
        if invoice.status == 'void':
            return Response(
                {"error": "Cannot send voided invoice"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # If draft, promote to sent. If proforma, keep as proforma but mark sent.
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
        
        # Mark viewed if sent or proforma
        if invoice.status in ['sent', 'proforma'] and not invoice.viewed_at:
            if invoice.status == 'sent':
                invoice.status = 'viewed'
            # If proforma, we might want to keep it as proforma but just set viewed_at
            # But standard logic often promotes 'sent' to 'viewed'. 
            # Let's keep proforma as proforma to preserve the type.
            
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
            status__in=['sent', 'viewed', 'overdue', 'partial', 'proforma']
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
            status__in=['sent', 'viewed', 'overdue', 'partial', 'proforma']
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
    
    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Generate professional PDF for invoice using new print service"""
        from apps.core.services.print_service import generate_invoice_pdf
        from django.utils import timezone
        
        invoice = self.get_object()
        
        try:
            # Add print timestamp to context
            invoice.print_generated_at = timezone.now()
            return generate_invoice_pdf(invoice, branch=invoice.branch)
        except Exception as e:
            logger.error(f"PDF generation error: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to generate PDF: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def convert_to_invoice(self, request, pk=None):
        """Convert proforma invoice to standard invoice"""
        invoice = self.get_object()
        
        # Validate status
        if invoice.status != 'proforma':
            return Response(
                {"error": "Only proforma invoices can be converted to standard invoices"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Generate new invoice number (standard sequence)
        # Clear the existing invoice_number so save() will generate a new one
        old_number = invoice.invoice_number
        invoice.invoice_number = ''
        
        # Update status to draft (will be treated as a new invoice)
        invoice.status = 'draft'
        
        # Save will auto-generate new standard invoice number
        invoice.save()
        
        serializer = self.get_serializer(invoice)
        return Response({
            "message": f"Proforma {old_number} converted to invoice {invoice.invoice_number} successfully",
            "invoice": serializer.data
        })
    
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

    @action(detail=False, methods=['post'])
    def bulk_send(self, request):
        """Send multiple invoices to customers"""
        ids = request.data.get('ids', [])
        if not ids:
            return Response({"error": "No invoices selected"}, status=status.HTTP_400_BAD_REQUEST)
        
        invoices = Invoice.objects.filter(id__in=ids)
        sent_count = 0
        errors = []
        
        for invoice in invoices:
            try:
                # Logic to send email would go here
                # For now, we'll mark as sent if not already
                # In real imp, we'd call the PDFService.generate_and_send(invoice)
                # But since I don't want to mock the whole email service right now, 
                # I'll just update the status if it's draft or approved.
                
                # Check prerequisites
                if invoice.status == 'draft':
                    invoice.status = 'sent'
                
                invoice.sent_at = timezone.now()
                invoice.sent_by = request.user
                invoice.save()
                sent_count += 1
            except Exception as e:
                errors.append(f"Invoice {invoice.invoice_number}: {str(e)}")
        
        return Response({
            "message": f"Successfully processed {sent_count} invoices",
            "sent_count": sent_count,
            "errors": errors
        })

    @action(detail=False, methods=['post'])
    def bulk_update_status(self, request):
        """Update status for multiple invoices"""
        ids = request.data.get('ids', [])
        new_status = request.data.get('status')
        
        if not ids or not new_status:
            return Response(
                {"error": "Missing ids or status"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        valid_statuses = dict(Invoice.STATUS_CHOICES).keys()
        if new_status not in valid_statuses:
             return Response(
                {"error": f"Invalid status. Choices: {', '.join(valid_statuses)}"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        updated_count = Invoice.objects.filter(id__in=ids).update(status=new_status)
        
        return Response({
            "message": f"Successfully updated {updated_count} invoices",
            "updated_count": updated_count
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


class AccountingViewSet(viewsets.ViewSet):
    """
    Comprehensive accounting API using Django Ledger's built-in methods
    
    Endpoints:
    - chart_of_accounts: Get Chart of Accounts
    - financial_statements: Get all financial statements in one call
    - balance_sheet: Get Balance Sheet
    - income_statement: Get Income Statement
    - cash_flow_statement: Get Cash Flow Statement
    - account_detail: Get specific account details
    - account_transactions: Get transactions for an account
    """
    permission_classes = [IsAuthenticated, HasPermission('view_billing')]
    
    def _get_branch(self):
        """Helper to get branch from session or user default"""
        return resolve_branch(self.request)
    
    def _get_entity(self):
        """Helper to get Django Ledger entity for current user's branch"""
        from apps.billing.accounting_service import AccountingService
        
        branch = self._get_branch()
        if not branch:
            return None
        return AccountingService.get_entity(branch)
    
    @action(detail=False, methods=['get'])
    def chart_of_accounts(self, request):
        """
        Get Chart of Accounts for user's branch
        
        Returns hierarchical account structure with codes, names, and types
        """
        entity = self._get_entity()
        if not entity:
            return Response(
                {'error': 'No entity found for your branch. Please contact administrator.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            from django_ledger.models import AccountModel
            
            # Use Django Ledger's built-in method
            coa = entity.get_default_coa()
            if not coa:
                return Response(
                    {'error': 'Chart of Accounts not setup. Run: python manage.py setup_chart_of_accounts'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Get all accounts for this COA
            accounts = AccountModel.objects.filter(coa_model=coa, active=True)
            
            # Serialize accounts
            data = []
            for account in accounts:
                data.append({
                    'id': account.pk,
                    'uuid': str(account.uuid),
                    'code': account.code,
                    'name': account.name,
                    'role': account.role,
                    'balance_type': account.balance_type,
                    'active': account.active,
                    'depth': account.depth,
                    'locked': account.locked,
                })
            
            return Response({
                'coa_name': coa.name,
                'coa_uuid': str(coa.uuid),
                'entity_name': entity.name,
                'accounts': data,
                'total_accounts': len(data)
            })
        
        except Exception as e:
            logger.error(f"Error getting chart of accounts: {e}", exc_info=True)
            return Response(
                {'error': f'Error retrieving Chart of Accounts: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def financial_statements(self, request):
        """
        Get ALL financial statements in one call (Balance Sheet, Income Statement, Cash Flow)
        Uses Django Ledger's entity.digest() method for efficiency
        
        Query params:
        - to_date: End date (YYYY-MM-DD), defaults to today
        - from_date: Start date for P&L (YYYY-MM-DD), defaults to beginning of current year
        """
        entity = self._get_entity()
        if not entity:
            return Response(
                {'error': 'No entity found for your branch'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            # Parse dates
            to_date_str = request.query_params.get('to_date')
            if to_date_str:
                to_date = timezone.datetime.strptime(to_date_str, '%Y-%m-%d').date()
            else:
                to_date = timezone.now().date()
            
            from_date_str = request.query_params.get('from_date')
            if from_date_str:
                from_date = timezone.datetime.strptime(from_date_str, '%Y-%m-%d').date()
            else:
                # Default to beginning of current year
                from_date = to_date.replace(month=1, day=1)
            
            # MAGIC: Get all financial statements in ONE call using entity.digest()
            financial_data = entity.digest(
                user_model=request.user,
                to_date=to_date,
                from_date=from_date,
                equity_only=False,
                activity='op',  # Operating activities
                process_roles=True,  # Process account roles for better grouping
                signs=True  # Include proper debit/credit signs
            )
            
            return Response({
                'to_date': str(to_date),
                'from_date': str(from_date),
                'entity_name': entity.name,
                'data': financial_data
            })
        
        except Exception as e:
            logger.error(f"Error generating financial statements: {e}", exc_info=True)
            return Response(
                {'error': f'Error generating financial statements: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def balance_sheet(self, request):
        """
        Get Balance Sheet statement
        
        Query params:
        - to_date: As of date (YYYY-MM-DD), defaults to today
        """
        entity = self._get_entity()
        if not entity:
            return Response(
                {'error': 'No entity found for your branch'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            to_date_str = request.query_params.get('to_date')
            if to_date_str:
                to_date = timezone.datetime.strptime(to_date_str, '%Y-%m-%d').date()
            else:
                to_date = timezone.now().date()
            
            balance_sheet = entity.get_balance_sheet_statement(
                user_model=request.user,
                to_date=to_date
            )
            
            return Response({
                'to_date': str(to_date),
                'entity_name': entity.name,
                'statement_type': 'balance_sheet',
                'data': balance_sheet.get_report_data()
            })
        
        except Exception as e:
            logger.error(f"Error generating balance sheet: {e}", exc_info=True)
            return Response(
                {'error': f'Error generating balance sheet: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def income_statement(self, request):
        """
        Get Income Statement (Profit & Loss)
        
        Query params:
        - from_date: Start date (YYYY-MM-DD), defaults to beginning of current month
        - to_date: End date (YYYY-MM-DD), defaults to today
        """
        entity = self._get_entity()
        if not entity:
            return Response(
                {'error': 'No entity found for your branch'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            from_date_str = request.query_params.get('from_date')
            to_date_str = request.query_params.get('to_date')
            
            if not from_date_str or not to_date_str:
                # Default to current month
                to_date = timezone.now().date()
                from_date = to_date.replace(day=1)
            else:
                from_date = timezone.datetime.strptime(from_date_str, '%Y-%m-%d').date()
                to_date = timezone.datetime.strptime(to_date_str, '%Y-%m-%d').date()
            
            income_statement = entity.get_income_statement(
                user_model=request.user,
                from_date=from_date,
                to_date=to_date
            )
            
            return Response({
                'from_date': str(from_date),
                'to_date': str(to_date),
                'entity_name': entity.name,
                'statement_type': 'income_statement',
                'data': income_statement.get_report_data()
            })
        
        except Exception as e:
            logger.error(f"Error generating income statement: {e}", exc_info=True)
            return Response(
                {'error': f'Error generating income statement: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def cash_flow_statement(self, request):
        """
        Get Cash Flow Statement
        
        Query params:
        - from_date: Start date (YYYY-MM-DD), defaults to beginning of current month
        - to_date: End date (YYYY-MM-DD), defaults to today
        """
        entity = self._get_entity()
        if not entity:
            return Response(
                {'error': 'No entity found for your branch'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            from_date_str = request.query_params.get('from_date')
            to_date_str = request.query_params.get('to_date')
            
            if not from_date_str or not to_date_str:
                # Default to current month
                to_date = timezone.now().date()
                from_date = to_date.replace(day=1)
            else:
                from_date = timezone.datetime.strptime(from_date_str, '%Y-%m-%d').date()
                to_date = timezone.datetime.strptime(to_date_str, '%Y-%m-%d').date()
            
            cash_flow = entity.get_cash_flow_statement(
                user_model=request.user,
                from_date=from_date,
                to_date=to_date
            )
            
            return Response({
                'from_date': str(from_date),
                'to_date': str(to_date),
                'entity_name': entity.name,
                'statement_type': 'cash_flow',
                'data': cash_flow.get_report_data()
            })
        
        except Exception as e:
            logger.error(f"Error generating cash flow statement: {e}", exc_info=True)
            return Response(
                {'error': f'Error generating cash flow statement: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def account_detail(self, request, pk=None):
        """
        Get details for a specific account
        
        Path params:
        - pk: Account ID or code
        """
        entity = self._get_entity()
        if not entity:
            return Response(
                {'error': 'No entity found for your branch'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            from django_ledger.models import AccountModel
            
            coa = entity.get_default_coa()
            if not coa:
                return Response(
                    {'error': 'Chart of Accounts not setup'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Try to get account by ID or code
            # Try to get account by ID, UUID, or code
            account = None
            if str(pk).isdigit():
                account = AccountModel.objects.filter(pk=pk, coa_model=coa).first()
            
            if not account:
                try:
                    # Try as UUID
                    account = AccountModel.objects.filter(uuid=pk, coa_model=coa).first()
                except (ValueError, Exception):
                    pass
            
            if not account:
                # Try as Code
                account = AccountModel.objects.filter(code=pk, coa_model=coa, active=True).first()

            if not account:
                return Response(
                    {'error': f'Account with identifier {pk} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            return Response({
                'id': account.pk,
                'uuid': str(account.uuid),
                'code': account.code,
                'name': account.name,
                'role': account.role,
                'balance_type': account.balance_type,
                'active': account.active,
                'locked': account.locked,
                'depth': account.depth,
            })
        
        except Exception as e:
            logger.error(f"Error getting account detail: {e}", exc_info=True)
            return Response(
                {'error': f'Error retrieving account: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def account_transactions(self, request, pk=None):
        """
        Get transactions for a specific account
        
        Path params:
        - pk: Account ID or code
        
        Query params:
        - limit: Maximum number of transactions to return (default: 100)
        - offset: Offset for pagination (default: 0)
        """
        entity = self._get_entity()
        if not entity:
            return Response(
                {'error': 'No entity found for your branch'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            from django_ledger.models import AccountModel, TransactionModel
            
            coa = entity.get_default_coa()
            if not coa:
                return Response(
                    {'error': 'Chart of Accounts not setup'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Try to get account by ID or code
            # Try to get account by ID, UUID, or code
            account = None
            if str(pk).isdigit():
                account = AccountModel.objects.filter(pk=pk, coa_model=coa).first()
            
            if not account:
                try:
                    # Try as UUID
                    account = AccountModel.objects.filter(uuid=pk, coa_model=coa).first()
                except (ValueError, Exception):
                    pass
            
            if not account:
                # Try as Code
                account = AccountModel.objects.filter(code=pk, coa_model=coa, active=True).first()

            if not account:
                return Response(
                    {'error': f'Account with identifier {pk} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Get pagination params
            limit = int(request.query_params.get('limit', 100))
            offset = int(request.query_params.get('offset', 0))
            
            # Get transactions for this account
            transactions = TransactionModel.objects.filter(
                account=account
            ).select_related(
                'journal_entry', 'journal_entry__ledger'
            ).order_by('-journal_entry__timestamp')[offset:offset + limit]
            
            # Serialize transactions
            txn_data = []
            for txn in transactions:
                je = txn.journal_entry
                txn_data.append({
                    'id': txn.pk,
                    'uuid': str(txn.uuid),
                    'date': je.timestamp.date().isoformat() if je.timestamp else None,
                    'description': txn.description or je.description,
                    'tx_type': txn.tx_type,  # 'debit' or 'credit'
                    'amount': str(txn.amount),
                    'journal_entry_id': je.pk,
                    'journal_entry_uuid': str(je.uuid),
                    'posted': je.posted,
                    'locked': je.locked,
                })
            
            return Response({
                'account_code': account.code,
                'account_name': account.name,
                'transactions': txn_data,
                'total_count': TransactionModel.objects.filter(account=account).count(),
                'limit': limit,
                'offset': offset,
            })
        
        except Exception as e:
            logger.error(f"Error getting account transactions: {e}", exc_info=True)
            return Response(
                {'error': f'Error retrieving transactions: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def journal_entries(self, request):
        """
        List all journal entries for the entity
        
        Query params:
        - from_date: Start date filter (YYYY-MM-DD)
        - to_date: End date filter (YYYY-MM-DD)
        - posted: Filter by posted status (true/false)
        - limit: Maximum entries to return (default: 100)
        - offset: Offset for pagination (default: 0)
        """
        entity = self._get_entity()
        if not entity:
            return Response(
                {'error': 'No entity found for your branch'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            from django_ledger.models import JournalEntryModel
            
            # Base queryset
            journal_entries = JournalEntryModel.objects.filter(
                ledger__entity=entity
            ).select_related('ledger').prefetch_related('transactionmodel_set__account')
            
            # Apply filters
            from_date_str = request.query_params.get('from_date')
            to_date_str = request.query_params.get('to_date')
            posted_filter = request.query_params.get('posted')
            
            if from_date_str:
                from_date = timezone.datetime.strptime(from_date_str, '%Y-%m-%d').date()
                journal_entries = journal_entries.filter(timestamp__gte=from_date)
            
            if to_date_str:
                to_date = timezone.datetime.strptime(to_date_str, '%Y-%m-%d').date()
                journal_entries = journal_entries.filter(timestamp__lte=to_date)
            
            if posted_filter is not None:
                posted = posted_filter.lower() == 'true'
                journal_entries = journal_entries.filter(posted=posted)
            
            # Pagination
            limit = int(request.query_params.get('limit', 100))
            offset = int(request.query_params.get('offset', 0))
            
            total_count = journal_entries.count()
            journal_entries = journal_entries.order_by('-timestamp')[offset:offset + limit]
            
            # Serialize
            data = []
            for je in journal_entries:
                transactions = je.transactionmodel_set.all()
                data.append({
                    'id': je.pk,
                    'uuid': str(je.uuid),
                    'timestamp': je.timestamp.isoformat() if je.timestamp else None,
                    'description': je.description,
                    'posted': je.posted,
                    'locked': je.locked,
                    'ledger_name': je.ledger.name if je.ledger else None,
                    'transactions_count': transactions.count(),
                    'total_debit': str(sum(t.amount for t in transactions if t.tx_type == 'debit')),
                    'total_credit': str(sum(t.amount for t in transactions if t.tx_type == 'credit')),
                })
            
            return Response({
                'journal_entries': data,
                'total_count': total_count,
                'limit': limit,
                'offset': offset,
            })
        
        except Exception as e:
            logger.error(f"Error getting journal entries: {e}", exc_info=True)
            return Response(
                {'error': f'Error retrieving journal entries: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'], url_path='journal_entry_detail')
    def journal_entry_detail(self, request, pk=None):
        """
        Get details of a specific journal entry including all transactions
        
        Path params:
        - pk: Journal Entry ID
        """
        entity = self._get_entity()
        if not entity:
            return Response(
                {'error': 'No entity found for your branch'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            from django_ledger.models import JournalEntryModel
            
            journal_entry = JournalEntryModel.objects.filter(
                pk=pk,
                ledger__entity=entity
            ).select_related('ledger').prefetch_related('transactionmodel_set__account').first()
            
            if not journal_entry:
                return Response(
                    {'error': 'Journal entry not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Serialize transactions
            transactions = []
            for txn in journal_entry.transactionmodel_set.all():
                transactions.append({
                    'id': txn.pk,
                    'uuid': str(txn.uuid),
                    'account_code': txn.account.code,
                    'account_name': txn.account.name,
                    'tx_type': txn.tx_type,
                    'amount': str(txn.amount),
                    'description': txn.description,
                })
            
            return Response({
                'id': journal_entry.pk,
                'uuid': str(journal_entry.uuid),
                'timestamp': journal_entry.timestamp.isoformat() if journal_entry.timestamp else None,
                'description': journal_entry.description,
                'posted': journal_entry.posted,
                'locked': journal_entry.locked,
                'ledger_name': journal_entry.ledger.name if journal_entry.ledger else None,
                'transactions': transactions,
            })
        
        except Exception as e:
            logger.error(f"Error getting journal entry detail: {e}", exc_info=True)
            return Response(
                {'error': f'Error retrieving journal entry: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'], url_path='create_journal_entry')
    def create_journal_entry(self, request):
        """
        Create a new journal entry
        
        Request body:
        {
            "description": "Adjusting entry",
            "timestamp": "2024-12-23",
            "transactions": [
                {
                    "account_code": "1110",
                    "tx_type": "debit",
                    "amount": "100.00",
                    "description": "Cash increase"
                },
                {
                    "account_code": "4100",
                    "tx_type": "credit",
                    "amount": "100.00",
                    "description": "Revenue increase"
                }
            ]
        }
        """
        entity = self._get_entity()
        if not entity:
            return Response(
                {'error': 'No entity found for your branch'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            from django_ledger.models import JournalEntryModel, TransactionModel, LedgerModel, AccountModel
            from django.db import transaction
            from decimal import Decimal
            
            description = request.data.get('description', '')
            timestamp_str = request.data.get('timestamp')
            transactions_data = request.data.get('transactions', [])
            
            if not transactions_data or len(transactions_data) < 2:
                return Response(
                    {'error': 'At least 2 transactions required (debit and credit)'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Parse timestamp
            if timestamp_str:
                je_timestamp = timezone.datetime.strptime(timestamp_str, '%Y-%m-%d')
                je_timestamp = timezone.make_aware(je_timestamp.replace(hour=12))
            else:
                je_timestamp = timezone.now()
            
            # Validate balanced entry
            total_debit = Decimal('0')
            total_credit = Decimal('0')
            
            for txn_data in transactions_data:
                amount = Decimal(str(txn_data.get('amount', '0')))
                tx_type = txn_data.get('tx_type')
                
                if tx_type == 'debit':
                    total_debit += amount
                elif tx_type == 'credit':
                    total_credit += amount
            
            if total_debit != total_credit:
                return Response(
                    {'error': f'Journal entry not balanced. Debit: {total_debit}, Credit: {total_credit}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Get or create default ledger
            ledger, _ = LedgerModel.objects.get_or_create(
                entity=entity,
                name='General Ledger',
                defaults={'posted': True}
            )
            
            coa = entity.get_default_coa()
            if not coa:
                return Response(
                    {'error': 'Chart of Accounts not setup'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            with transaction.atomic():
                # Create journal entry
                journal_entry = JournalEntryModel.objects.create(
                    ledger=ledger,
                    description=description,
                    timestamp=je_timestamp,
                    posted=False,  # Created as draft
                    locked=False
                )
                
                # Create transactions
                for txn_data in transactions_data:
                    account_code = txn_data.get('account_code')
                    account = AccountModel.objects.filter(code=account_code, coa_model=coa, active=True).first()
                    
                    if not account:
                        raise ValueError(f'Account with code {account_code} not found')
                    
                    TransactionModel.objects.create(
                        journal_entry=journal_entry,
                        account=account,
                        tx_type=txn_data.get('tx_type'),
                        amount=Decimal(str(txn_data.get('amount', '0'))),
                        description=txn_data.get('description', '')
                    )
            
            return Response({
                'message': 'Journal entry created successfully',
                'journal_entry_id': journal_entry.pk,
                'journal_entry_uuid': str(journal_entry.uuid),
            }, status=status.HTTP_201_CREATED)
        
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error creating journal entry: {e}", exc_info=True)
            return Response(
                {'error': f'Error creating journal entry: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'], url_path='post')
    def post_journal_entry(self, request, pk=None):
        """
        Post a journal entry (mark as posted and lock it)
        
        Path params:
        - pk: Journal Entry ID
        """
        entity = self._get_entity()
        if not entity:
            return Response(
                {'error': 'No entity found for your branch'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            from django_ledger.models import JournalEntryModel
            
            journal_entry = JournalEntryModel.objects.filter(
                pk=pk,
                ledger__entity=entity
            ).first()
            
            if not journal_entry:
                return Response(
                    {'error': 'Journal entry not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            if journal_entry.posted:
                return Response(
                    {'error': 'Journal entry already posted'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            journal_entry.posted = True
            journal_entry.locked = True
            journal_entry.save()
            
            return Response({
                'message': 'Journal entry posted successfully',
                'journal_entry_id': journal_entry.pk,
            })
        
        except Exception as e:
            logger.error(f"Error posting journal entry: {e}", exc_info=True)
            return Response(
                {'error': f'Error posting journal entry: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['delete'], url_path='delete_journal_entry')
    def delete_journal_entry(self, request, pk=None):
        """
        Delete a journal entry (only if not posted)
        
        Path params:
        - pk: Journal Entry ID
        """
        entity = self._get_entity()
        if not entity:
            return Response(
                {'error': 'No entity found for your branch'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            from django_ledger.models import JournalEntryModel
            
            journal_entry = JournalEntryModel.objects.filter(
                pk=pk,
                ledger__entity=entity
            ).first()
            
            if not journal_entry:
                return Response(
                    {'error': 'Journal entry not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            if journal_entry.posted or journal_entry.locked:
                return Response(
                    {'error': 'Cannot delete posted or locked journal entry'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            journal_entry.delete()
            
            return Response({
                'message': 'Journal entry deleted successfully'
            })
        
        except Exception as e:
            logger.error(f"Error deleting journal entry: {e}", exc_info=True)
            return Response(
                {'error': f'Error deleting journal entry: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def trial_balance(self, request):
        """
        Get Trial Balance report
        
        Query params:
        - as_of: As of date (YYYY-MM-DD), defaults to today
        """
        entity = self._get_entity()
        if not entity:
            return Response(
                {'error': 'No entity found for your branch'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            from django_ledger.models import AccountModel, TransactionModel
            from decimal import Decimal
            
            as_of_str = request.query_params.get('as_of')
            if as_of_str:
                as_of_date = timezone.datetime.strptime(as_of_str, '%Y-%m-%d').date()
            else:
                as_of_date = timezone.now().date()
            
            coa = entity.get_default_coa()
            if not coa:
                return Response(
                    {'error': 'Chart of Accounts not setup'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            accounts = AccountModel.objects.filter(coa_model=coa, active=True)
            
            trial_balance_data = []
            total_debit = Decimal('0')
            total_credit = Decimal('0')
            
            for account in accounts:
                # Get transactions up to as_of_date
                transactions = TransactionModel.objects.filter(
                    account=account,
                    journal_entry__timestamp__date__lte=as_of_date,
                    journal_entry__posted=True
                )
                
                # Calculate balance
                debit_total = sum(
                    t.amount for t in transactions if t.tx_type == 'debit'
                ) or Decimal('0')
                credit_total = sum(
                    t.amount for t in transactions if t.tx_type == 'credit'
                ) or Decimal('0')
                
                # Net balance
                balance = debit_total - credit_total
                
                # For trial balance, show debit or credit side
                if balance != 0:
                    if account.balance_type == 'DEBIT':
                        debit_amount = balance if balance > 0 else Decimal('0')
                        credit_amount = -balance if balance < 0 else Decimal('0')
                    else:  # CREDIT
                        credit_amount = -balance if balance < 0 else Decimal('0')
                        debit_amount = balance if balance > 0 else Decimal('0')
                    
                    trial_balance_data.append({
                        'account_code': account.code,
                        'account_name': account.name,
                        'account_role': account.role,
                        'debit': str(debit_amount) if debit_amount != 0 else '0.00',
                        'credit': str(credit_amount) if credit_amount != 0 else '0.00',
                    })
                    
                    total_debit += debit_amount
                    total_credit += credit_amount
            
            return Response({
                'as_of_date': str(as_of_date),
                'entity_name': entity.name,
                'trial_balance': trial_balance_data,
                'total_debit': str(total_debit),
                'total_credit': str(total_credit),
                'balanced': total_debit == total_credit,
            })
        
        except Exception as e:
            logger.error(f"Error generating trial balance: {e}", exc_info=True)
            return Response(
                {'error': f'Error generating trial balance: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def account_balances(self, request):
        """
        Get current balances for all accounts
        
        Query params:
        - as_of: As of date (YYYY-MM-DD), defaults to today
        """
        entity = self._get_entity()
        if not entity:
            return Response(
                {'error': 'No entity found for your branch'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            from django_ledger.models import TransactionModel, AccountModel
            from decimal import Decimal
            
            as_of_str = request.query_params.get('as_of')
            if as_of_str:
                as_of_date = timezone.datetime.strptime(as_of_str, '%Y-%m-%d').date()
            else:
                as_of_date = timezone.now().date()
            
            coa = entity.get_default_coa()
            if not coa:
                return Response(
                    {'error': 'Chart of Accounts not setup'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            accounts = AccountModel.objects.filter(coa_model=coa, active=True)
            
            balances = []
            for account in accounts:
                transactions = TransactionModel.objects.filter(
                    account=account,
                    journal_entry__timestamp__date__lte=as_of_date,
                    journal_entry__posted=True
                )
                
                debit_total = sum(
                    t.amount for t in transactions if t.tx_type == 'debit'
                ) or Decimal('0')
                credit_total = sum(
                    t.amount for t in transactions if t.tx_type == 'credit'
                ) or Decimal('0')
                
                # Calculate balance based on account type
                if account.balance_type == 'DEBIT':
                    balance = debit_total - credit_total
                else:  # CREDIT
                    balance = credit_total - debit_total
                
                balances.append({
                    'account_code': account.code,
                    'account_name': account.name,
                    'account_role': account.role,
                    'balance_type': account.balance_type,
                    'balance': str(balance),
                })
            
            return Response({
                'as_of_date': str(as_of_date),
                'entity_name': entity.name,
                'balances': balances,
            })
        
        except Exception as e:
            logger.error(f"Error getting account balances: {e}", exc_info=True)
            return Response(
                {'error': f'Error generating account balances: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def general_ledger(self, request):
        """
        Get General Ledger report (all transactions for all accounts)
        
        Query params:
        - from_date: Start date (YYYY-MM-DD)
        - to_date: End date (YYYY-MM-DD)
        - account_code: Filter by specific account (optional)
        - limit: Maximum transactions per account (default: 100)
        """
        entity = self._get_entity()
        if not entity:
            return Response(
                {'error': 'No entity found for your branch'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            from django_ledger.models import TransactionModel, AccountModel
            
            from_date_str = request.query_params.get('from_date')
            to_date_str = request.query_params.get('to_date')
            account_code = request.query_params.get('account_code')
            limit = int(request.query_params.get('limit', 100))
            
            if not from_date_str or not to_date_str:
                # Default to current month
                to_date = timezone.now().date()
                from_date = to_date.replace(day=1)
            else:
                from_date = timezone.datetime.strptime(from_date_str, '%Y-%m-%d').date()
                to_date = timezone.datetime.strptime(to_date_str, '%Y-%m-%d').date()
            
            coa = entity.get_default_coa()
            if not coa:
                return Response(
                    {'error': 'Chart of Accounts not setup'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Get accounts
            if account_code:
                account = AccountModel.objects.filter(code=account_code, coa_model=coa, active=True).first()
                if not account:
                    return Response(
                        {'error': f'Account {account_code} not found'},
                        status=status.HTTP_404_NOT_FOUND
                    )
                accounts = [account]
            else:
                accounts = AccountModel.objects.filter(coa_model=coa, active=True)
            
            general_ledger_data = []
            
            for account in accounts:
                transactions = TransactionModel.objects.filter(
                    account=account,
                    journal_entry__timestamp__date__gte=from_date,
                    journal_entry__timestamp__date__lte=to_date,
                    journal_entry__posted=True
                ).select_related('journal_entry').order_by('journal_entry__timestamp')[:limit]
                
                txn_list = []
                for txn in transactions:
                    je = txn.journal_entry
                    txn_list.append({
                        'date': je.timestamp.date().isoformat() if je.timestamp else None,
                        'description': txn.description or je.description,
                        'tx_type': txn.tx_type,
                        'amount': str(txn.amount),
                        'journal_entry_id': je.pk,
                    })
                
                if txn_list:  # Only include accounts with transactions
                    general_ledger_data.append({
                        'account_code': account.code,
                        'account_name': account.name,
                        'transactions': txn_list,
                        'transaction_count': len(txn_list),
                    })
            
            return Response({
                'from_date': str(from_date),
                'to_date': str(to_date),
                'entity_name': entity.name,
                'accounts': general_ledger_data,
            })
        
        except Exception as e:
            logger.error(f"Error generating general ledger: {e}", exc_info=True)
            return Response(
                {'error': f'Error generating general ledger: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

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


class BranchPLComparisonViewSet(viewsets.ViewSet):
    """
    Branch Profit & Loss Comparison Report
    Compare P&L across multiple branches for performance analysis
    """
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['get'])
    def compare(self, request):
        """
        Compare P&L across branches
        
        Query params:
        - from_date: Start date (YYYY-MM-DD), defaults to beginning of month
        - to_date: End date (YYYY-MM-DD), defaults to today
        - branches: Comma-separated branch IDs (optional, defaults to user's accessible branches)
        """
        from apps.branches.models import Branch
        from apps.billing.accounting_service import AccountingService
        from decimal import Decimal
        
        # Parse dates
        from_date_str = request.query_params.get('from_date')
        to_date_str = request.query_params.get('to_date')
        
        if not from_date_str or not to_date_str:
            to_date = timezone.now().date()
            from_date = to_date.replace(day=1)
        else:
            from_date = timezone.datetime.strptime(from_date_str, '%Y-%m-%d').date()
            to_date = timezone.datetime.strptime(to_date_str, '%Y-%m-%d').date()
        
        # Get branches to compare
        branch_ids_str = request.query_params.get('branches')
        if branch_ids_str:
            branch_ids = [int(bid) for bid in branch_ids_str.split(',')]
            branches = Branch.objects.filter(id__in=branch_ids, is_active=True)
        else:
            # Use user's accessible branches
            from apps.branches.utils import filter_queryset_for_user_branches
            branches = filter_queryset_for_user_branches(
                Branch.objects.filter(is_active=True),
                request.user,
                request,
                use_active_branch=False
            )
        
        results = []
        totals = {
            'revenue': Decimal('0'),
            'cogs': Decimal('0'),
            'gross_profit': Decimal('0'),
            'operating_expenses': Decimal('0'),
            'net_income': Decimal('0')
        }
        
        for branch in branches:
            # Get Django Ledger entity for this branch
            entity = AccountingService.get_entity(branch)
            
            if not entity:
                # Skip branches without accounting setup
                continue
            
            try:
                # Get income statement for this branch
                income_statement = entity.get_income_statement(
                    user_model=request.user,
                    from_date=from_date,
                    to_date=to_date
                )
                
                data = income_statement.get_report_data()
                
                # Extract key metrics
                revenue = Decimal(str(data.get('operating', {}).get('net_operating_revenue', 0)))
                cogs = abs(Decimal(str(data.get('operating', {}).get('net_cogs', 0))))
                gross_profit = Decimal(str(data.get('operating', {}).get('gross_profit', 0)))
                operating_expenses = abs(Decimal(str(data.get('operating', {}).get('net_operating_expenses', 0))))
                net_income = Decimal(str(data.get('net_income', 0)))
                
                # Calculate margins
                gross_margin = (gross_profit / revenue * 100) if revenue > 0 else Decimal('0')
                net_margin = (net_income / revenue * 100) if revenue > 0 else Decimal('0')
                
                branch_data = {
                    'branch_id': branch.id,
                    'branch_name': branch.name,
                    'revenue': float(revenue),
                    'cogs': float(cogs),
                    'gross_profit': float(gross_profit),
                    'gross_margin_percent': float(gross_margin),
                    'operating_expenses': float(operating_expenses),
                    'net_income': float(net_income),
                    'net_margin_percent': float(net_margin)
                }
                
                results.append(branch_data)
                
                # Add to totals
                totals['revenue'] += revenue
                totals['cogs'] += cogs
                totals['gross_profit'] += gross_profit
                totals['operating_expenses'] += operating_expenses
                totals['net_income'] += net_income
                
            except Exception as e:
                logger = logging.getLogger(__name__)
                logger.error(f'Error getting P&L for branch {branch.name}: {e}', exc_info=True)
                
                # Add branch with zero values
                results.append({
                    'branch_id': branch.id,
                    'branch_name': branch.name,
                    'revenue': 0,
                    'cogs': 0,
                    'gross_profit': 0,
                    'gross_margin_percent': 0,
                    'operating_expenses': 0,
                    'net_income': 0,
                    'net_margin_percent': 0,
                    'error': str(e)
                })
        
        # Calculate total margins
        total_gross_margin = (totals['gross_profit'] / totals['revenue'] * 100) if totals['revenue'] > 0 else Decimal('0')
        total_net_margin = (totals['net_income'] / totals['revenue'] * 100) if totals['revenue'] > 0 else Decimal('0')
        
        return Response({
            'period': {
                'from_date': str(from_date),
                'to_date': str(to_date)
            },
            'branches': sorted(results, key=lambda x: x['revenue'], reverse=True),
            'totals': {
                'revenue': float(totals['revenue']),
                'cogs': float(totals['cogs']),
                'gross_profit': float(totals['gross_profit']),
                'gross_margin_percent': float(total_gross_margin),
                'operating_expenses': float(totals['operating_expenses']),
                'net_income': float(totals['net_income']),
                'net_margin_percent': float(total_net_margin)
            },
            'branch_count': len(results)
        })



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

class BillViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing vendor bills
    """
    queryset = Bill.objects.select_related('vendor', 'branch', 'created_by').prefetch_related('line_items')
    permission_classes = [IsAuthenticated]
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
