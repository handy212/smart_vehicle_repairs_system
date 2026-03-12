from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError as DRFValidationError
from django.core.exceptions import ValidationError
from django.utils import timezone
from datetime import timedelta
from apps.notifications_app import triggers as notification_triggers
from apps.workorders.models import WorkOrder, WorkOrderNote

class WorkOrderStateTransitionMixin:
    """Mixin for work order state transitions"""

    @action(detail=False, methods=['post'])
    def bulk_update_status(self, request):
        """Bulk update status for multiple work orders"""
        work_order_ids = request.data.get('work_order_ids', [])
        new_status = request.data.get('status')
        
        if not work_order_ids or not new_status:
            return Response(
                {'error': 'work_order_ids and status are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if new_status not in dict(WorkOrder.STATUS_CHOICES):
            return Response(
                {'error': 'Invalid status'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get work orders
        work_orders = self.get_queryset().filter(id__in=work_order_ids)
        updated = []
        errors = []
        
        for wo in work_orders:
            can_transition, error = wo.can_transition_to(new_status)
            if can_transition:
                field_errors = wo.validate_before_status_change(new_status)
                if not field_errors:
                    try:
                        wo.transition_to(new_status, request.user)
                        updated.append(wo.id)
                    except ValidationError as e:
                        errors.append({
                            'work_order_id': wo.id,
                            'work_order_number': wo.work_order_number,
                            'error': str(e)
                        })
                else:
                    errors.append({
                        'work_order_id': wo.id,
                        'work_order_number': wo.work_order_number,
                        'error': '; '.join(field_errors)
                    })
            else:
                errors.append({
                    'work_order_id': wo.id,
                    'work_order_number': wo.work_order_number,
                    'error': error
                })
        
        return Response({
            'updated': updated,
            'updated_count': len(updated),
            'errors': errors,
            'error_count': len(errors)
        })

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        """Reopen a closed work order"""
        work_order = self.get_object()
        
        if work_order.status != 'closed':
            return Response(
                {'error': 'Only closed work orders can be reopened'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Determine appropriate status based on context
        # Check if there's an invoice
        from apps.billing.models import Invoice
        has_invoice = Invoice.objects.filter(work_order=work_order).exists()
        
        if has_invoice:
            new_status = 'invoiced'
        elif work_order.completed_at:
            new_status = 'completed'
        else:
            new_status = 'in_progress'
        
        try:
            # Use notify=False to avoid sending notifications on reopen
            work_order.transition_to(new_status, user=request.user, notify=False)
            
            # Create note
            WorkOrderNote.objects.create(
                work_order=work_order,
                note_type='internal',
                note='Work order reopened',
                created_by=request.user
            )
            
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """Close work order after customer pickup"""
        import logging
        logger = logging.getLogger(__name__)
        
        work_order = self.get_object()
        payment_received = request.data.get('payment_received', True)
        closing_notes = request.data.get('closing_notes', '')
        
        # Store closing information in notes if provided
        if closing_notes:
            from apps.workorders.models import WorkOrderNote
            WorkOrderNote.objects.create(
                work_order=work_order,
                created_by=request.user,
                note_type='internal',
                note=f"Closing Notes: {closing_notes}\nPayment Received: {'Yes' if payment_received else 'No'}",
            )
        
        try:
            work_order.transition_to('closed', user=request.user)
            logger.info(f"Work order {work_order.work_order_number} closed by {request.user.username}. Payment: {payment_received}")
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            error_msg = str(e)
            logger.warning(f"Failed to close WO {work_order.work_order_number}: {error_msg}")
            return Response(
                {'error': error_msg},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    # ========== DATA RETRIEVAL ACTIONS ==========

    @action(detail=True, methods=['post'])
    def mark_invoiced(self, request, pk=None):
        """Mark work order as invoiced"""
        import logging
        logger = logging.getLogger(__name__)
        
        work_order = self.get_object()
        odometer_out = request.data.get('odometer_out')
        
        # Set odometer_out if provided in request
        if odometer_out and not work_order.odometer_out:
            try:
                work_order.odometer_out = int(odometer_out)
                work_order.save(update_fields=['odometer_out'])
                logger.info(f"Set odometer_out={odometer_out} for WO {work_order.work_order_number}")
            except (ValueError, TypeError):
                return Response(
                    {'error': 'Invalid odometer_out value. Must be a positive integer.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        try:
            work_order.transition_to('invoiced', user=request.user)
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            error_msg = str(e)
            # Provide helpful error message
            if 'odometer out' in error_msg.lower():
                error_msg = "Odometer out reading is required. Please provide the odometer reading before marking as invoiced."
            logger.warning(f"Failed to mark WO {work_order.work_order_number} as invoiced: {error_msg}")
            return Response(
                {'error': error_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark work order as completed"""
        work_order = self.get_object()
        odometer_out = request.data.get('odometer_out')
        completion_notes = request.data.get('completion_notes', '')
        
        # Skip quality check if not required
        if not work_order.quality_check_required:
            work_order.quality_check_completed = True
            work_order.quality_check_passed = True
            work_order.quality_check_by = request.user
            work_order.quality_check_at = timezone.now()
        
        if odometer_out:
            work_order.odometer_out = odometer_out
        
        try:
            work_order.transition_to('completed', user=request.user)
            
            # Create completion note
            if completion_notes:
                WorkOrderNote.objects.create(
                    work_order=work_order,
                    note_type='internal',
                    note=f"Work completed. {completion_notes}",
                    created_by=request.user
                )
            
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def quality_check(self, request, pk=None):
        """Perform quality check"""
        import logging
        logger = logging.getLogger(__name__)
        
        work_order = self.get_object()
        passed = request.data.get('passed', False)
        notes = request.data.get('notes', '')
        checklist = request.data.get('checklist', {})
        if not isinstance(checklist, dict):
            checklist = {}
        
        if work_order.status != 'quality_check':
            return Response(
                {'error': 'Work order must be in quality check status.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Build comprehensive notes including checklist results
        checklist_notes = []
        if checklist:
            checklist_items = {
                'allTasksCompleted': 'All tasks completed',
                'allPartsInstalled': 'All parts installed or returned',
                'vehicleClean': 'Vehicle cleaned and presentable',
                'noDamage': 'No new damage or scratches',
                'testDrivePassed': 'Test drive passed',
                'customerSatisfied': 'Customer satisfaction confirmed',
            }
            
            for key, label in checklist_items.items():
                check_mark = '✓' if checklist.get(key, False) else '✗'
                checklist_notes.append(f"{check_mark} {label}")
        
        # Combine checklist and notes
        full_notes = notes
        if checklist_notes:
            checklist_summary = "\n".join(checklist_notes)
            full_notes = f"Quality Check Checklist:\n{checklist_summary}\n\nNotes: {notes}" if notes else f"Quality Check Checklist:\n{checklist_summary}"
        
        work_order.quality_check_completed = True
        work_order.quality_check_by = request.user
        work_order.quality_check_at = timezone.now()
        work_order.quality_check_notes = full_notes
        work_order.quality_check_passed = passed
        work_order.quality_check_signature = request.data.get('signature')
        
        # Handle odometer_out if provided
        odometer_out = request.data.get('odometer_out')
        if odometer_out:
            try:
                work_order.odometer_out = int(odometer_out)
                # Update vehicle mileage
                if work_order.vehicle:
                    work_order.vehicle.update_mileage(
                        mileage=work_order.odometer_out,
                        user=request.user,
                        notes=f"Recorded at Quality Check for Work Order {work_order.work_order_number}"
                    )
                logger.info(f"Set odometer_out={odometer_out} for WO {work_order.work_order_number}")
            except (ValueError, TypeError):
                logger.warning(f"Invalid odometer_out value provided: {odometer_out}")

        
        logger.info(f"Quality check performed for WO {work_order.work_order_number} by {request.user.username}: {'PASSED' if passed else 'FAILED'}")
        
        # Determine next status
        if passed:
            try:
                # Auto-return unused parts to allow completion
                unused_parts = work_order.parts.exclude(status__in=['installed', 'returned', 'ready'])
                if unused_parts.exists():
                    logger.info(f"Auto-returning {unused_parts.count()} unused parts for WO {work_order.work_order_number}")
                    for part in unused_parts:
                        part.status = 'returned'
                        part.save(update_fields=['status'])

                work_order.transition_to('completed', user=request.user)
            except ValidationError as e:
                logger.warning(f"Validation error during QC completion for WO {work_order.work_order_number}: {e}")
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )
            except Exception as e:
                logger.error(f"Unexpected error during QC completion for WO {work_order.work_order_number}: {e}", exc_info=True)
                return Response(
                    {'error': f"An unexpected error occurred: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        else:
            # Failed QC, back to in_progress
            try:
                work_order.transition_to('in_progress', user=request.user)
                
                # Send notification about failed QC
                try:
                    notification_triggers.work_order_quality_check_failed(work_order)
                except Exception as e:
                    logger.error(f"Failed to send quality check failed notification: {e}", exc_info=True)
            except ValidationError as e:
                logger.warning(f"Validation error during QC failure transition for WO {work_order.work_order_number}: {e}")
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )
            except Exception as e:
                logger.error(f"Unexpected error during QC failure transition for WO {work_order.work_order_number}: {e}", exc_info=True)
                return Response(
                    {'error': f"An unexpected error occurred: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        
        serializer = self.get_serializer(work_order)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def request_quality_check(self, request, pk=None):
        """Request quality check"""
        work_order = self.get_object()
        
        try:
            work_order.transition_to('quality_check', user=request.user)
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def resume(self, request, pk=None):
        """Resume paused work order"""
        work_order = self.get_object()
        
        try:
            work_order.transition_to('in_progress', user=request.user)
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def pause(self, request, pk=None):
        """Pause work order"""
        work_order = self.get_object()
        reason = request.data.get('reason', '')
        
        try:
            work_order.transition_to('paused', user=request.user)
            
            # Create note about pause
            WorkOrderNote.objects.create(
                work_order=work_order,
                note_type='internal',
                note=f"Work order paused. Reason: {reason}",
                created_by=request.user
            )
            
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['get'])
    def check_readiness(self, request, pk=None):
        """Check if work order is ready to start work"""
        work_order = self.get_object()
        
        can_start, errors = work_order.can_start_work()
        unavailable_parts = work_order.check_parts_availability()
        
        return Response({
            'can_start': can_start,
            'errors': errors,
            'unavailable_parts': [
                {
                    'part_name': p['part'].part_name,
                    'reason': p['reason']
                }
                for p in unavailable_parts
            ]
        })

    @action(detail=True, methods=['post'])
    def start_work(self, request, pk=None):
        """Start work on approved work order"""
        import logging
        logger = logging.getLogger(__name__)
        
        work_order = self.get_object()
        logger.info(f"Starting work for WO {work_order.work_order_number}, current status: {work_order.status}")
        
        # Auto-assign current user as technician if none assigned and user is eligible
        # This improves the workflow by removing the friction of manual assignment
        if not work_order.primary_technician and not work_order.assigned_technicians.exists():
            if request.user.role in ['technician', 'manager', 'admin']:
                work_order.primary_technician = request.user
                work_order.save(update_fields=['primary_technician'])
                logger.info(f"Auto-assigned {request.user.username} as primary technician for WO {work_order.work_order_number}")
                
                # Assign to existing tasks if they are unassigned
                work_order.tasks.filter(assigned_to__isnull=True).update(assigned_to=request.user)
        
        # Check if work can be started
        can_start, errors = work_order.can_start_work()
        if not can_start:
            error_msg = '; '.join(errors) if errors else "Cannot start work - validation failed"
            logger.warning(f"Start work failed for WO {work_order.work_order_number}: {errors}")
            return Response(
                {'error': error_msg, 'errors': errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Convert approved repair recommendations to tasks before starting
            tasks_created, parts_linked = work_order.convert_recommendations_to_tasks(user=request.user)
            
            # Transition to in_progress
            work_order.transition_to('in_progress', user=request.user)
            
            # Refresh work order to get updated data
            work_order.refresh_from_db()
            
            serializer = self.get_serializer(work_order)
            response_data = serializer.data
            response_data['tasks_created'] = tasks_created
            response_data['parts_linked'] = parts_linked
            
            return Response(response_data)
        except ValidationError as e:
            # Django ValidationError - convert to string message
            error_msg = str(e)
            # Handle ValidationError messages - they might be a list or string
            if hasattr(e, 'messages') and e.messages:
                error_msg = '; '.join(str(msg) for msg in e.messages)
            elif hasattr(e, 'message_dict'):
                # Handle field-specific errors
                error_msg = '; '.join(f"{k}: {', '.join(v) if isinstance(v, list) else v}" 
                                    for k, v in e.message_dict.items())
            logger.error(f"Django ValidationError starting work for WO {work_order.work_order_number}: {error_msg}")
            # Convert to DRF ValidationError for proper response formatting
            raise DRFValidationError({'error': error_msg, 'detail': error_msg})
        except DRFValidationError as e:
            # DRF ValidationError - already properly formatted
            logger.error(f"DRF ValidationError starting work for WO {work_order.work_order_number}: {e.detail}")
            raise
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Unexpected error starting work for WO {work_order.work_order_number}: {error_msg}", exc_info=True)
            return Response(
                {'error': f'Failed to start work: {error_msg}', 'detail': error_msg},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Mark work order as approved by customer"""
        work_order = self.get_object()
        approval_method = request.data.get('approval_method', 'phone')
        approval_notes = request.data.get('approval_notes', '')
        
        work_order.approved_by_customer = True
        work_order.approved_at = timezone.now()
        work_order.approval_method = approval_method
        work_order.approval_notes = approval_notes
        
        try:
            work_order.transition_to('approved', user=request.user)
            
            # Send approval notification to technician
            try:
                notification_triggers.work_order_approved(work_order)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(
                    "Failed to send work order approved notification: %s", e, exc_info=True
                )
            
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def request_approval(self, request, pk=None):
        """Request customer approval"""
        from apps.billing.models import Estimate, EstimateLineItem
        from decimal import Decimal
        
        work_order = self.get_object()
        
        work_order.requires_approval = True
        work_order.approval_requested_at = timezone.now()
        
        try:
            # Validate prerequisites
            errors = work_order.validate_before_status_change('awaiting_approval')
            if errors:
                return Response(
                    {'error': '; '.join(errors)},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if estimate already exists (from diagnosis stage)
            estimate = None
            if hasattr(work_order, 'estimate') and work_order.estimate:
                estimate = work_order.estimate
                # Recalculate totals to ensure they're up to date
                estimate.calculate_totals()
                # Update existing estimate status to 'sent'
                estimate.status = 'sent'
                estimate.sent_by = request.user
                estimate.sent_at = timezone.now()
                estimate.save()
            else:
                # Create new estimate from work order data
                estimate = Estimate.objects.create(
                    customer=work_order.customer,
                    vehicle=work_order.vehicle,
                    work_order=work_order,
                    status='sent',
                    estimate_date=timezone.now().date(),
                    valid_until=(timezone.now() + timedelta(days=30)).date(),
                    title=f"Estimate for {work_order.vehicle.year} {work_order.vehicle.make} {work_order.vehicle.model}",
                    description=work_order.diagnosis_notes or work_order.customer_concerns or "Repair estimate",
                    labor_subtotal=work_order.estimated_labor_cost or Decimal('0'),
                    parts_subtotal=work_order.estimated_parts_cost or Decimal('0'),
                    subtotal=work_order.estimated_total or Decimal('0'),
                    total=work_order.estimated_total or Decimal('0'),
                    created_by=request.user,
                    sent_by=request.user,
                )
                
                # Create line items from work order parts
                for part in work_order.parts.all():
                    EstimateLineItem.objects.create(
                        estimate=estimate,
                        item_type='part',
                        description=f"{part.part_name} ({part.part_number})",
                        quantity=part.quantity,
                        unit_price=part.unit_cost,
                        total=part.selling_price,
                        part_number=part.part_number,
                        is_taxable=True,
                    )
                
                # Create line items from work order tasks (labor)
                for task in work_order.tasks.filter(status__in=['pending', 'in_progress', 'completed']):
                    if task.estimated_hours and task.labor_rate:
                        EstimateLineItem.objects.create(
                            estimate=estimate,
                            item_type='labor',
                            description=f"{task.get_task_type_display()} - {task.description}",
                            quantity=task.estimated_hours,
                            unit_price=task.labor_rate,
                            total=task.estimated_hours * task.labor_rate,
                            labor_hours=task.estimated_hours,
                            labor_rate=task.labor_rate,
                            is_taxable=True,
                        )
                
                # Recalculate estimate totals from line items
                estimate.calculate_totals()
                estimate.save()
            
            # Transition work order status
            work_order.transition_to('awaiting_approval', user=request.user)
            
            # Send approval request notification
            try:
                notification_triggers.work_order_requires_approval(work_order)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(
                    "Failed to send approval request notification: %s", e, exc_info=True
                )
            
            serializer = self.get_serializer(work_order)
            return Response({
                **serializer.data,
                'estimate_number': estimate.estimate_number if estimate else None,
                'message': f'Estimate #{estimate.estimate_number if estimate else "N/A"} submitted for customer approval'
            })
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def complete_diagnosis(self, request, pk=None):
        """Complete diagnosis and optionally request approval"""
        work_order = self.get_object()
        diagnosis_notes = request.data.get('diagnosis_notes', '')
        # Handle boolean conversion - could be string "true"/"false" or boolean
        requires_approval_raw = request.data.get('requires_approval', False)
        if isinstance(requires_approval_raw, str):
            requires_approval = requires_approval_raw.lower() in ('true', '1', 'yes')
        else:
            requires_approval = bool(requires_approval_raw)
        estimated_labor_hours = request.data.get('estimated_labor_hours')
        estimated_labor_cost = request.data.get('estimated_labor_cost')
        estimated_parts_cost = request.data.get('estimated_parts_cost')
        
        if work_order.status != 'diagnosis':
            return Response(
                {'error': 'Work order must be in diagnosis status.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate diagnosis_notes is provided
        if not diagnosis_notes or not diagnosis_notes.strip():
            return Response(
                {'error': 'Diagnosis notes are required to complete diagnosis.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        work_order.diagnosis_notes = diagnosis_notes
        work_order.diagnosis_completed_at = timezone.now()
        work_order.diagnosis_by = request.user
        work_order.requires_approval = requires_approval
        
        # Update estimates - convert to Decimal and handle None/empty values
        from decimal import Decimal
        if estimated_labor_hours is not None:
            work_order.estimated_labor_hours = Decimal(str(estimated_labor_hours))
        if estimated_labor_cost:
            work_order.estimated_labor_cost = Decimal(str(estimated_labor_cost))
        else:
            work_order.estimated_labor_cost = Decimal('0')
        if estimated_parts_cost:
            work_order.estimated_parts_cost = Decimal(str(estimated_parts_cost))
        else:
            work_order.estimated_parts_cost = Decimal('0')
        
        work_order.save()
        
        # Determine next status using transition_to
        try:
            if requires_approval:
                # Validate that estimated total is greater than 0 when approval is required
                if work_order.estimated_total <= 0:
                    return Response(
                        {'error': 'Estimated total must be greater than 0 when customer approval is required. Please provide estimated labor cost and/or parts cost.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                work_order.approval_requested_at = timezone.now()
                work_order.transition_to('awaiting_approval', user=request.user)
            else:
                # Auto-approve if approval not required
                work_order.approved_by_customer = True
                work_order.approved_at = timezone.now()
                work_order.save()
                # Try to transition to in_progress if technician is assigned
                # If no technician, keep in diagnosis status (approved but waiting for technician)
                if work_order.primary_technician or work_order.assigned_technicians.exists():
                    work_order.transition_to('in_progress', user=request.user)
                else:
                    # Create a note so the user knows the WO is waiting for assignment
                    WorkOrderNote.objects.create(
                        work_order=work_order,
                        note_type='internal',
                        note='Diagnosis completed and auto-approved. Awaiting technician assignment before work can begin.',
                        created_by=request.user,
                        is_important=True
                    )
        except (ValidationError, DRFValidationError) as e:
            # Handle both Django and DRF ValidationErrors
            error_message = str(e)
            if hasattr(e, 'message_dict'):
                # Django ValidationError with message_dict
                error_message = '; '.join([f"{k}: {', '.join(v)}" for k, v in e.message_dict.items()])
            elif hasattr(e, 'messages'):
                # Django ValidationError with messages list
                error_message = '; '.join(e.messages)
            return Response(
                {'error': error_message},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            import logging
            import traceback
            logging.getLogger(__name__).error(
                "Error in complete_diagnosis: %s\n%s", e, traceback.format_exc(), exc_info=True
            )
            from django.conf import settings
            msg = f'An error occurred: {str(e)}' if settings.DEBUG else 'An error occurred while completing diagnosis.'
            return Response(
                {'error': msg},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        try:
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except Exception as e:
            import logging
            import traceback
            logging.getLogger(__name__).error(
                "Serializer error for work order %s: %s\n%s",
                work_order.id, e, traceback.format_exc(),
                exc_info=True
            )
            from django.conf import settings
            msg = f'Error serializing work order: {str(e)}' if settings.DEBUG else 'Error loading work order.'
            return Response(
                {
                    'error': msg,
                    'work_order_id': work_order.id,
                    'work_order_number': work_order.work_order_number,
                    'status': work_order.status
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def start_diagnosis(self, request, pk=None):
        """Start diagnosis phase - can only be triggered by Service Coordinator from assigned status"""
        work_order = self.get_object()
        
        # Validate that user is the assigned Service Coordinator or has manager/admin role
        user = request.user
        if work_order.service_coordinator and work_order.service_coordinator != user:
            if user.role not in ['manager', 'admin']:
                return Response(
                    {'error': 'Only the assigned Service Coordinator can trigger diagnosis, or managers/admins.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        try:
            work_order.transition_to('diagnosis', user=request.user)
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def start_intake(self, request, pk=None):
        """Move work order to intake status, then to assigned status after Service Coordinator is assigned"""
        work_order = self.get_object()
        service_coordinator_id = request.data.get('service_coordinator')
        
        try:
            # First transition to intake
            if work_order.status != 'intake':
                work_order.transition_to('intake', user=request.user)
            
            # If Service Coordinator is provided, assign them and transition to assigned
            if service_coordinator_id:
                work_order.service_coordinator_id = service_coordinator_id
                work_order.save(update_fields=['service_coordinator'])
                # Transition to assigned status
                work_order.transition_to('assigned', user=request.user)
            else:
                # Just move to intake if no SC provided yet
                pass
            
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
