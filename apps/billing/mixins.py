from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction
from django.db.models import Sum, Q, F
from django.contrib.contenttypes.models import ContentType
from auditlog.models import LogEntry
from .services import BillingService
import logging

logger = logging.getLogger(__name__)

class BillingStatusMixin:
    """Mixin for status-related actions (history, bulk updates, voiding, etc)"""
    
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Get audit log history for the object"""
        obj = self.get_object()
        content_type = ContentType.objects.get_for_model(obj.__class__)
        logs = LogEntry.objects.filter(
            content_type=content_type,
            object_id=obj.id
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

    @action(detail=True, methods=['post'])
    def mark_viewed(self, request, pk=None):
        """Mark object as viewed by customer"""
        obj = self.get_object()
        if hasattr(obj, 'status') and obj.status in ['sent', 'proforma'] and not getattr(obj, 'viewed_at', None):
            if obj.status == 'sent':
                obj.status = 'viewed'
            obj.viewed_at = timezone.now()
            obj.save()
        serializer = self.get_serializer(obj)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def bulk_update_status(self, request):
        """Update status for multiple records"""
        ids = request.data.get('ids', [])
        new_status = request.data.get('status')
        model_class = self.queryset.model
        
        if not ids or not new_status:
            return Response({"error": "Missing ids or status"}, status=status.HTTP_400_BAD_REQUEST)
            
        valid_statuses = dict(model_class.STATUS_CHOICES).keys()
        if new_status not in valid_statuses:
             return Response({"error": f"Invalid status. Choices: {', '.join(valid_statuses)}"}, status=status.HTTP_400_BAD_REQUEST)
        
        record_ids = list(model_class.objects.filter(id__in=ids).values_list('id', flat=True))
        updated_count = model_class.objects.filter(id__in=ids).update(status=new_status)

        from apps.quickbooks_online.status_sync import schedule_syncs_after_bulk_status_update
        schedule_syncs_after_bulk_status_update(model_class, record_ids, new_status)

        return Response({"message": f"Successfully updated {updated_count} records", "updated_count": updated_count})

class BillingCommunicationMixin:
    """Mixin for sending notifications and AI suggestions"""

    def _linked_work_order_send_error(self, obj):
        work_order = getattr(obj, 'work_order', None)
        if not work_order:
            return None

        if obj.__class__.__name__ == 'Estimate' and work_order.status != 'awaiting_approval':
            return (
                f"Cannot send estimate {obj.estimate_number} because linked work order "
                f"{work_order.work_order_number} is {work_order.get_status_display()}, "
                "not awaiting customer approval."
            )

        return None

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        """Send document to customer"""
        obj = self.get_object()
        if hasattr(obj, 'status') and obj.status == 'void':
            return Response({"error": "Cannot send voided document"}, status=status.HTTP_400_BAD_REQUEST)

        linked_error = self._linked_work_order_send_error(obj)
        if linked_error:
            return Response({"error": linked_error}, status=status.HTTP_400_BAD_REQUEST)
        
        if obj.status == 'draft':
            obj.status = 'sent'
        
        obj.sent_by = request.user
        obj.sent_at = timezone.now()
        obj.save()
        
        # Invoice/estimate notifications are sent from model save hooks (invoice) or here (estimate)
        if obj.__class__.__name__ == 'Estimate':
            try:
                from apps.notifications_app.triggers import notification_triggers
                notification_triggers.estimate_sent(obj)
            except Exception as e:
                logger.warning("Failed to send notification: %s", e, exc_info=True)
            
        return Response({"message": f"{obj.__class__.__name__} sent successfully", "data": self.get_serializer(obj).data})

    @action(detail=True, methods=['post'])
    def send_customer_sms(self, request, pk=None):
        """Send custom SMS to customer"""
        obj = self.get_object()
        message = request.data.get('message')
        if not message:
            return Response({'error': 'Message is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        customer_user = obj.customer.user if obj.customer else None
        if not customer_user or not customer_user.phone:
            return Response({'error': 'Customer phone number not available'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            from apps.notifications_app.models import Notification
            from apps.notifications_app.services import NotificationService
            notification = Notification.objects.create(
                recipient=customer_user,
                notification_type='custom',
                channel='sms',
                priority='high',
                message=message,
                related_object_type=obj.__class__.__name__.lower(),
                related_object_id=obj.id
            )
            success = NotificationService().send_notification(notification)
            if success:
                return Response({'success': True, 'message': 'SMS sent successfully'})
            return Response({'error': 'Failed to send SMS.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Error sending custom SMS: {e}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def send_customer_email(self, request, pk=None):
        """Send custom email to customer"""
        obj = self.get_object()
        subject = request.data.get('subject', f"{obj.__class__.__name__} Notification")
        message = request.data.get('message')
        if not message:
            return Response({'error': 'Message is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        customer_user = obj.customer.user if obj.customer else None
        if not customer_user or not customer_user.email:
            return Response({'error': 'Customer email address not available'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            from apps.notifications_app.models import Notification
            from apps.notifications_app.services import NotificationService
            notification = Notification.objects.create(
                recipient=customer_user,
                notification_type='custom',
                channel='email',
                priority='high',
                title=subject,
                message=message,
                related_object_type=obj.__class__.__name__.lower(),
                related_object_id=obj.id
            )
            success = NotificationService().send_notification(notification)
            if success:
                return Response({'success': True, 'message': 'Email sent successfully'})
            else:
                return Response({'error': 'Failed to send email.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Error sending custom email: {e}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def bulk_send(self, request):
        """Send multiple records to customers"""
        ids = request.data.get('ids', [])
        if not ids:
            return Response({"error": "No records selected"}, status=status.HTTP_400_BAD_REQUEST)
        
        model_name = self.queryset.model.__name__
        records = self.queryset.model.objects.filter(id__in=ids)
        processed_count = 0
        errors = []
        
        for record in records:
            try:
                if hasattr(record, 'status') and record.status == 'draft':
                    record.status = 'sent'
                
                if hasattr(record, 'sent_at'):
                    record.sent_at = timezone.now()
                if hasattr(record, 'sent_by'):
                    record.sent_by = request.user
                record.save()
                
                if model_name == 'Estimate':
                    try:
                        from apps.notifications_app.triggers import notification_triggers
                        notification_triggers.estimate_sent(record)
                    except Exception as e:
                        logger.warning(f"Notification failed for {model_name} {record.id}: {e}")
                
                processed_count += 1
            except Exception as e:
                errors.append(f"{model_name} {record.id}: {str(e)}")
        
        return Response({
            "message": f"Successfully processed {processed_count} {model_name}s",
            "processed_count": processed_count,
            "errors": errors
        })

    @action(detail=True, methods=['get'])
    def suggested_message(self, request, pk=None):
        """Get a suggested message using AI service"""
        from apps.core.services.ai_service import AIService
        obj = self.get_object()
        channel = request.query_params.get('channel', 'email')
        context_type = 'invoice' if obj.__class__.__name__ == 'Invoice' else 'estimate'
        suggestion = AIService.get_suggested_message(obj, channel=channel, context_type=context_type, user=request.user)
        return Response(suggestion)

class BillingReportMixin:
    """Mixin for statistics and financial reports"""

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get statistics for dashboard"""
        queryset = self.get_queryset()
        if self.queryset.model.__name__ == 'Invoice':
            return Response(BillingService.get_invoice_stats(queryset))
        # Handle estimate stats if needed, or other models
        return Response({"message": "Stats not implemented for this model"})

    @action(detail=False, methods=['get'])
    def aging_report(self, request):
        """Get accounts receivable aging report"""
        queryset = self.get_queryset()
        return Response(BillingService.get_aging_report_data(queryset))

    @action(detail=False, methods=['get'])
    def revenue_summary(self, request):
        """Get revenue summary for date range"""
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        if not start_date or not end_date:
            return Response({"error": "start_date and end_date are required"}, status=status.HTTP_400_BAD_REQUEST)
        
        queryset = self.get_queryset()
        return Response(BillingService.get_revenue_summary(queryset, start_date, end_date))

    @action(detail=False, methods=['get'])
    def aging_report_pdf(self, request):
        """Generate PDF for aging report"""
        from apps.core.services.print_service import generate_aging_report_pdf
        queryset = self.get_queryset()
        data = BillingService.get_aging_report_data(queryset)
        try:
            return generate_aging_report_pdf(data)
        except Exception as e:
            logger.error(f"Aging report PDF error: {e}", exc_info=True)
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'])
    def revenue_summary_pdf(self, request):
        """Generate PDF for revenue summary"""
        from apps.core.services.print_service import generate_revenue_summary_pdf
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        if not start_date or not end_date:
            return Response({"error": "start_date and end_date are required"}, status=status.HTTP_400_BAD_REQUEST)
        
        queryset = self.get_queryset()
        data = BillingService.get_revenue_summary(queryset, start_date, end_date)
        try:
            return generate_revenue_summary_pdf(data)
        except Exception as e:
            logger.error(f"Revenue summary PDF error: {e}", exc_info=True)
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class BillingDocumentMixin:
    """Mixin for document generation (PDF/Print)"""

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Generate professional PDF"""
        from apps.core.services.print_service import generate_invoice_pdf, generate_estimate_pdf
        obj = self.get_object()
        try:
            if obj.__class__.__name__ == 'Invoice':
                obj.print_generated_at = timezone.now()
                return generate_invoice_pdf(obj, branch=getattr(obj, 'branch', None))
            elif obj.__class__.__name__ == 'Estimate':
                return generate_estimate_pdf(obj, branch=getattr(obj, 'branch', None))
        except Exception as e:
            logger.error(f"PDF generation error: {e}", exc_info=True)
            return Response({"error": f"Failed to generate PDF: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'])
    def print(self, request, pk=None):
        """Return HTML for print view"""
        from django.http import HttpResponse
        from apps.core.services.print_service import render_invoice_print_html, render_estimate_print_html
        obj = self.get_object()
        try:
            if obj.__class__.__name__ == 'Invoice':
                html = render_invoice_print_html(obj, branch=getattr(obj, 'branch', None), request=request)
            elif obj.__class__.__name__ == 'Estimate':
                html = render_estimate_print_html(obj, branch=getattr(obj, 'branch', None), request=request)
            return HttpResponse(html, content_type='text/html; charset=utf-8')
        except Exception as e:
            logger.error(f"Print HTML generation error: {e}", exc_info=True)
            return Response({"error": f"Failed to generate print view: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class EstimateActionMixin:
    """Specialized actions for the Estimate lifecycle"""

    def _estimate_work_order_action_error(self, estimate):
        work_order = getattr(estimate, 'work_order', None)
        if not work_order:
            return None

        if work_order.status != 'awaiting_approval':
            status_display = work_order.get_status_display() if hasattr(work_order, 'get_status_display') else work_order.status
            return (
                f"This estimate is no longer actionable because work order "
                f"{work_order.work_order_number} is {status_display}. "
                "Ask the service advisor to issue a current estimate if more approval is needed."
            )

        return None

    def _schedule_estimate_qbo_sync(self, estimate_id: int) -> None:
        from django.conf import settings

        if not getattr(settings, 'QUICKBOOKS_AUTO_SYNC_ENABLED', True):
            return
        from apps.quickbooks_online.task_dispatch import schedule_entity_sync
        from apps.quickbooks_online.tasks import task_sync_estimate_to_qbo

        schedule_entity_sync('estimate', estimate_id, task=task_sync_estimate_to_qbo)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve estimate"""
        estimate = self.get_object()
        if hasattr(estimate, 'can_be_approved') and not estimate.can_be_approved:
            return Response(
                {"error": "Estimate cannot be approved in current status or has expired"},
                status=status.HTTP_400_BAD_REQUEST
            )

        work_order_error = self._estimate_work_order_action_error(estimate)
        if work_order_error:
            return Response({"error": work_order_error}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            work_order = getattr(estimate, 'work_order', None)
            if work_order:
                can_transition, error_message = work_order.can_transition_to('approved')
                if not can_transition:
                    transaction.set_rollback(True)
                    return Response({"error": error_message}, status=status.HTTP_400_BAD_REQUEST)

                work_order.approve_customer_work(
                    user=request.user,
                    method='digital' if getattr(request.user, 'role', None) == 'customer' else 'staff',
                    notes=f"Estimate {estimate.estimate_number} approved.",
                    linked_estimate=estimate,
                )
            else:
                estimate.status = 'approved'
                estimate.approved_date = timezone.now()
                estimate.approved_by = request.user
                estimate.save(update_fields=['status', 'approved_date', 'approved_by', 'updated_at'])

            estimate.refresh_from_db()
            if estimate.status == 'approved':
                estimate.apply_quoted_prices_to_work_order()

        self._schedule_estimate_qbo_sync(estimate.id)
        
        # Trigger notification
        try:
            from apps.notifications_app.triggers import notification_triggers
            notification_triggers.estimate_approved(estimate)
        except Exception as e:
            logger.warning(f"Notification failed for estimate approval {estimate.id}: {e}")
            
        return Response({"message": "Estimate approved", "data": self.get_serializer(estimate).data})

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        """Decline estimate"""
        estimate = self.get_object()
        work_order_error = self._estimate_work_order_action_error(estimate)
        if work_order_error:
            return Response({"error": work_order_error}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            estimate.status = 'declined'
            estimate.declined_date = timezone.now()
            estimate.declined_by = request.user
            estimate.save()

            work_order = getattr(estimate, 'work_order', None)
            if work_order:
                reason = request.data.get('reason') or request.data.get('notes') or 'Estimate declined.'
                work_order.approved_by_customer = False
                work_order.approved_at = None
                work_order.approval_notes = reason
                work_order.save(update_fields=['approved_by_customer', 'approved_at', 'approval_notes'])

                if hasattr(work_order, 'diagnosis'):
                    work_order.diagnosis.reopen_for_revision(
                        user=request.user,
                        reason=f"Customer declined estimate {estimate.estimate_number}. Reason: {reason}",
                    )
                elif work_order.status == 'awaiting_approval':
                    work_order.diagnosis_completed_at = None
                    work_order.save(update_fields=['diagnosis_completed_at'])
                    work_order.transition_to('diagnosis', user=request.user)

        self._schedule_estimate_qbo_sync(estimate.id)
        return Response({"message": "Estimate declined", "data": self.get_serializer(estimate).data})

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Duplicate an existing estimate"""
        estimate = self.get_object()
        new_estimate = estimate.duplicate()
        return Response({
            "message": "Estimate duplicated successfully", 
            "data": self.get_serializer(new_estimate).data
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def mark_ready(self, request, pk=None):
        """Mark a linked work-order stores quotation as ready."""
        estimate = self.get_object()
        work_order = getattr(estimate, 'work_order', None)
        if not work_order:
            return Response(
                {"error": "Only work-order-linked estimates can be marked as ready."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            diagnosis = work_order.diagnosis
        except Exception:
            diagnosis = None

        if diagnosis is None:
            return Response(
                {"error": "This work order has no diagnosis record to update."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.diagnosis.views import DiagnosisViewSet, assert_diagnosis_editable

        assert_diagnosis_editable(diagnosis)
        if not DiagnosisViewSet._user_has_quote_completion_role(request.user):
            return Response(
                {"error": "Only parts managers, managers, or admins can mark quotations as ready."},
                status=status.HTTP_403_FORBIDDEN,
            )

        recommendations = diagnosis.repair_recommendations.filter(
            approval_status__in=['pending_approval', 'approved'],
            quotation_status='requested',
            converted_to_task__isnull=True,
            quotation_estimate_id=estimate.id,
        )

        if not recommendations.exists():
            return Response(
                {"error": "No pending stores quotation requests are linked to this estimate."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        linked_estimate, estimate_error = DiagnosisViewSet._validate_quote_ready_for_recommendations(recommendations)
        if estimate_error:
            return Response({"error": estimate_error}, status=status.HTTP_400_BAD_REQUEST)

        for recommendation in recommendations:
            DiagnosisViewSet._sync_recommendation_costs_from_quote_estimate(recommendation)
            recommendation.mark_quoted(quoted_by=request.user)

        try:
            from apps.notifications_app.triggers import notification_triggers
            notification_triggers.stores_quotation_ready(
                work_order,
                quoted_by=request.user,
                recommendations_count=recommendations.count(),
                estimate=estimate,
                diagnosis_id=diagnosis.id,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                "Failed to notify staff after estimate mark-quoted: %s", e, exc_info=True
            )

        estimate.refresh_from_db()
        work_order.refresh_from_db()
        return Response({
            "message": f"Marked {recommendations.count()} quotation request(s) as ready.",
            "estimate": self.get_serializer(estimate).data,
            "work_order": {
                "id": work_order.id,
                "status": work_order.status,
                "quote_stage": work_order.get_current_quote_stage(),
                "quote_stage_display": work_order.get_current_quote_stage_display(),
            },
            "quotation_estimate_id": getattr(linked_estimate, "id", None),
            "quotation_estimate_number": getattr(linked_estimate, "estimate_number", None),
        })

    @action(detail=True, methods=['post'])
    def convert_to_work_order(self, request, pk=None):
        """Convert estimate to work order"""
        estimate = self.get_object()
        if estimate.status != 'approved':
            return Response({"error": "Only approved estimates can be converted"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            work_order = estimate.convert_to_work_order()
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"message": "Work Order created", "work_order_id": work_order.id})

    @action(detail=True, methods=['post'])
    def convert_to_invoice(self, request, pk=None):
        """Convert estimate to invoice"""
        estimate = self.get_object()
        if estimate.status != 'approved':
            return Response({"error": "Only approved estimates can be converted"}, status=status.HTTP_400_BAD_REQUEST)
        
        invoice = estimate.convert_to_invoice()
        return Response({
            "message": "Invoice created",
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
        })

    @action(detail=False, methods=['get'])
    def next_number(self, request):
        """Get next estimated number (preview)"""
        from apps.billing.models import Estimate
        last_est = Estimate.objects.order_by('-id').first()
        next_num = f"EST-{(last_est.id + 1) if last_est else 1:05d}"
        return Response({"next_number": next_num})

class InvoiceActionMixin:
    """Specialized actions for the Invoice lifecycle"""

    @action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        """Void invoice and reverse posted GL entries when safe."""
        invoice = self.get_object()
        if invoice.status in ['paid', 'void', 'refunded']:
            return Response({"error": "Cannot void invoice in current status"}, status=status.HTTP_400_BAD_REQUEST)

        void_reason = request.data.get('reason', '')
        if not void_reason:
            return Response({"error": "Void reason is required"}, status=status.HTTP_400_BAD_REQUEST)

        blocking_records = []
        if invoice.amount_paid > 0:
            blocking_records.append("payments or credits")
        if invoice.payments.exists():
            blocking_records.append("payments")
        if invoice.refunds.exists():
            blocking_records.append("refunds")
        if invoice.credit_note_applications.exists():
            blocking_records.append("credit note applications")

        if blocking_records:
            return Response(
                {
                    "error": (
                        "This invoice has related "
                        f"{', '.join(dict.fromkeys(blocking_records))} and cannot be voided. "
                        "Reverse or reallocate those records first."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.accounting.services import AccountingService

        with transaction.atomic():
            AccountingService.reverse_invoice_journal_entries(
                invoice,
                request.user,
                reason=void_reason,
            )
            invoice.status = 'void'
            invoice.voided_at = timezone.now()
            invoice.voided_by = request.user
            invoice.void_reason = void_reason
            invoice.save()

        return Response({"message": "Invoice voided successfully", "invoice": self.get_serializer(invoice).data})

    @action(detail=False, methods=['get'])
    def unpaid(self, request):
        """Get unpaid invoices"""
        unpaid = self.get_queryset().filter(status__in=['sent', 'viewed', 'overdue', 'partial', 'proforma']).exclude(status='void')
        page = self.paginate_queryset(unpaid)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(self.get_serializer(unpaid, many=True).data)

    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """Get overdue invoices"""
        today = timezone.now().date()
        overdue = self.get_queryset().filter(due_date__lt=today, status__in=['sent', 'viewed', 'overdue', 'partial', 'proforma']).exclude(status__in=['paid', 'void', 'refunded'])
        page = self.paginate_queryset(overdue)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(self.get_serializer(overdue, many=True).data)

    @action(detail=False, methods=['get'], url_path='work-order-line-preview')
    def work_order_line_preview(self, request):
        """Preview resolved invoice lines (incl. revenue products) for a work order."""
        from decimal import Decimal

        from apps.billing.work_order_line_preview import build_work_order_invoice_line_payloads
        from apps.workorders.models import WorkOrder

        work_order_id = request.query_params.get('work_order')
        if not work_order_id:
            return Response({'error': 'work_order query parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

        work_order = (
            WorkOrder.objects.filter(pk=work_order_id)
            .select_related('customer', 'vehicle', 'branch')
            .prefetch_related('tasks', 'parts')
            .first()
        )
        if work_order is None:
            return Response({'error': 'Work order not found'}, status=status.HTTP_404_NOT_FOUND)

        lines = []
        for payload in build_work_order_invoice_line_payloads(work_order):
            row = {}
            for key, value in payload.items():
                if isinstance(value, Decimal):
                    row[key] = str(value)
                else:
                    row[key] = value
            lines.append(row)
        return Response({'work_order_id': work_order.id, 'line_items': lines})

    @action(detail=True, methods=['post'])
    def convert_to_invoice(self, request, pk=None):
        """Convert a proforma invoice to a real invoice"""
        proforma = self.get_object()
        if proforma.status != 'proforma':
            return Response({"error": "Only proforma invoices can be converted"}, status=status.HTTP_400_BAD_REQUEST)
        
        proforma.status = 'draft'
        if proforma.invoice_number.startswith('PRO-'):
            proforma.invoice_number = proforma.invoice_number.replace('PRO-', 'INV-')
        
        proforma.save()
        return Response({"message": "Successfully converted to draft invoice", "data": self.get_serializer(proforma).data})
