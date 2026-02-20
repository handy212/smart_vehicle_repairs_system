from .models import WorkOrder, WorkOrderPart, WorkOrderNote, ServiceTask
from django.db.models import Max
from apps.inventory.models import ServiceBundle

def apply_service_bundle(work_order):
    """
    Apply service bundle parts to a work order if it's a routine maintenance type.
    """
    if work_order.maintenance_type == 'routine' and work_order.service_type:
        try:
            # Find bundle linked to this service type
            bundle = ServiceBundle.objects.filter(service_type=work_order.service_type, is_active=True).first()
            
            if bundle:
                # Create note
                WorkOrderNote.objects.create(
                    work_order=work_order,
                    note_type='internal',
                    note=f"Applied service bundle: {bundle.name}",
                    is_important=False
                )
                
                # Add parts
                for item in bundle.items.all():
                    WorkOrderPart.objects.create(
                        work_order=work_order,
                        part_number=item.part.part_number,
                        part_name=item.part.name,
                        description=f"Included in {bundle.name}",
                        quantity=item.quantity,
                        unit_cost=item.part.cost_price,
                        markup_percentage=item.part.markup_percentage,
                        inventory_part=item.part,
                        status='pending'  # dependent on workflow
                    )
                
                # Automatically reserve parts if we have a branch
                if work_order.branch:
                    from apps.inventory.services import InventoryService
                    InventoryService.reserve_parts_for_work_order(work_order)
                
                return True
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to apply service bundle for WO {work_order.work_order_number}: {e}")
            return False
    return False

def update_vehicle_service_schedule(work_order):
    """
    Update the vehicle's service schedule when a routine maintenance work order is completed.
    """
    if work_order.status == 'completed' and work_order.maintenance_type == 'routine' and work_order.service_type:
        try:
            from apps.vehicles.models import VehicleServiceSchedule
            
            # Find or create the schedule for this service type
            schedule, created = VehicleServiceSchedule.objects.get_or_create(
                vehicle=work_order.vehicle,
                service_type=work_order.service_type,
                defaults={
                    'is_active': True,
                    'last_service_date': work_order.completed_at.date() if work_order.completed_at else timezone.now().date(),
                    'last_service_mileage': work_order.odometer_out or work_order.odometer_in
                }
            )
            
            if not created:
                schedule.last_service_date = work_order.completed_at.date() if work_order.completed_at else timezone.now().date()
                if work_order.odometer_out:
                    schedule.last_service_mileage = work_order.odometer_out
                elif work_order.odometer_in:
                    schedule.last_service_mileage = work_order.odometer_in
                schedule.save()
            
            # Recalculate next due date/mileage
            schedule.calculate_next_service_due()
            
            # Create a note on the work order
            from .models import WorkOrderNote
            WorkOrderNote.objects.create(
                work_order=work_order,
                note_type='internal',
                note=f"Updated vehicle service schedule for {work_order.service_type.name}. "
                     f"Next service due: {schedule.next_service_due_date} or {schedule.next_service_due_mileage} miles.",
                is_important=False
            )
            
            return True
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to update vehicle service schedule for WO {work_order.work_order_number}: {e}")
            return False
    return False

def assign_technician_by_skill(work_order):
    """
    Suggest technicians for a work order based on required skills.
    Returns a list of technicians ordered by matching skills and availability.
    """
    try:
        from apps.technicians.models import Technician, Skill
        from django.db.models import Count, Q
        
        # determine required skills based on service type or tasks
        required_skills = set()
        
        # 1. Check Service Type
        if work_order.service_type:
            # assuming service type name might map to a skill
            # In a real app, ServiceType would have a ManyToMany to Skill
            # For now, we do simple name matching
            skill = Skill.objects.filter(name__icontains=work_order.service_type.name).first()
            if skill:
                required_skills.add(skill.id)
                
        # 2. Check Tasks
        for task in work_order.tasks.all():
            skill = Skill.objects.filter(name__icontains=task.name).first()
            if skill:
                required_skills.add(skill.id)
                
        if not required_skills:
            # If no specific skills found, return all available active technicians ordered by workload
            return Technician.objects.filter(
                user__is_active=True,
                current_status='available'
            ).annotate(
                active_tasks_count=Count('user__assigned_tasks', filter=Q(user__assigned_tasks__status__in=['pending', 'in_progress', 'paused']))
            ).select_related('user').order_by('active_tasks_count')
            
        # Find technicians with these skills
        # We want to prioritize those who have MOST of the skills, are AVAILABLE, and have the LEAST workload
        
        candidates = Technician.objects.filter(
            user__is_active=True,
            skills__id__in=required_skills
        ).annotate(
            skill_match_count=Count('skills', filter=Q(skills__id__in=required_skills)),
            active_tasks_count=Count('user__assigned_tasks', filter=Q(user__assigned_tasks__status__in=['pending', 'in_progress', 'paused']))
        ).order_by('-skill_match_count', 'current_status', 'active_tasks_count') 
        
        return candidates

    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error suggesting technicians for WO {work_order.id}: {e}")
        return []

def get_workflow_task_config(status):
    """
    Get configuration for workflow task based on status.
    Returns dict with task_type, description, and sequence_order, or None if no task needed.
    """
    try:
        from apps.workorders.models import WorkflowConfiguration
        config = WorkflowConfiguration.objects.filter(status=status, is_active=True).first()
        if config:
            return {
                'task_type': config.task_type,
                'description': config.description,
                'sequence_order': config.sequence_order,
            }
    except Exception:
        pass
        
    WORKFLOW_TASK_CONFIG = {
        'inspection': {
            'task_type': 'inspection',
            'description': 'Initial Inspection',
            'sequence_order': 1,
        },
        'intake': {
            'task_type': 'inspection',
            'description': 'Customer Intake',
            'sequence_order': 2,
        },
        'assigned': {
            'task_type': 'coordination',
            'description': 'Service Coordinator Assigned - Ready for Diagnosis',
            'sequence_order': 3,
        },
        'diagnosis': {
            'task_type': 'diagnostic',
            'description': 'Perform Diagnosis',
            'sequence_order': 4,
        },
        'awaiting_approval': {
            'task_type': 'other',
            'description': 'Await Customer Approval',
            'sequence_order': 5,
        },
        'approved': {
            'task_type': 'other',
            'description': 'Customer Approval Received',
            'sequence_order': 6,
        },
        'in_progress': {
            'task_type': 'repair',
            'description': 'Repair Work',
            'sequence_order': 7,
        },
        'quality_check': {
            'task_type': 'inspection',
            'description': 'Perform Quality Check',
            'sequence_order': 8,
        },
        'completed': {
            'task_type': 'other',
            'description': 'Finalize Work Order',
            'sequence_order': 9,
        },
        'invoiced': {
            'task_type': 'other',
            'description': 'Generate Invoice',
            'sequence_order': 10,
        },
        'closed': {
            'task_type': 'other',
            'description': 'Close Work Order',
            'sequence_order': 11,
        },
    }
    return WORKFLOW_TASK_CONFIG.get(status)

def handle_workflow_tasks(work_order, old_status, new_status, user=None):
    """
    Automatically create and complete workflow tasks based on status transitions.
    """
    try:
        from django.utils import timezone
        from django.db import DatabaseError
        
        # Check if workflow task fields exist in the database
        # If migration hasn't been run, fields won't exist and queries will fail
        try:
            # Test if the fields exist by checking the model's meta
            from django.db import connection
            fields = [f.name for f in work_order.tasks.model._meta.get_fields()]
            workflow_fields_exist = 'is_workflow_task' in fields and 'workflow_phase' in fields
        except (AttributeError, FieldDoesNotExist, Exception):
            # Fields don't exist yet - migration not run, or error checking
            workflow_fields_exist = False
        
        if not workflow_fields_exist:
            # Migration hasn't been run yet - skip workflow task creation
            return
        
        # Complete the task for the old status if it exists
        # BUT: Don't complete if transitioning to/from paused - just pause/resume the task
        if old_status:
            # Special handling for paused status - don't complete tasks when pausing/resuming
            if new_status == 'paused' or old_status == 'paused':
                # When pausing: just pause the workflow task, don't complete it
                if new_status == 'paused' and old_status in ['in_progress']:
                    try:
                        old_task = work_order.tasks.filter(
                            workflow_phase=old_status,
                            is_workflow_task=True
                        ).first()
                        
                        if old_task and old_task.status == 'in_progress':
                            # Pause the task instead of completing it
                            ServiceTask.objects.filter(pk=old_task.pk).update(
                                status='pending',  # Set back to pending when paused
                            )
                    except (DatabaseError, AttributeError) as e:
                        import logging
                        logger = logging.getLogger(__name__)
                        logger.warning(f"Failed to pause workflow task for phase {old_status}: {e}")
                # When resuming: reactivate the existing workflow task
                elif old_status == 'paused' and new_status == 'in_progress':
                    try:
                        # Find existing workflow task for in_progress
                        existing_task = work_order.tasks.filter(
                            workflow_phase='in_progress',
                            is_workflow_task=True
                        ).first()
                        
                        if existing_task:
                            # Reactivate the task
                            ServiceTask.objects.filter(pk=existing_task.pk).update(
                                status='in_progress',
                                started_at=timezone.now()
                            )
                            # Don't create a new task - we'll return early
                            return
                    except (DatabaseError, AttributeError) as e:
                        import logging
                        logger = logging.getLogger(__name__)
                        logger.warning(f"Failed to resume workflow task: {e}")
            else:
                # Normal transition - complete the old task
                try:
                    old_task = work_order.tasks.filter(
                        workflow_phase=old_status,
                        is_workflow_task=True
                    ).first()
                    
                    if old_task and old_task.status != 'completed':
                        old_task.status = 'completed'
                        old_task.completed_at = timezone.now()
                        # Bypass save() recursion by using update()
                        ServiceTask.objects.filter(pk=old_task.pk).update(
                            status='completed',
                            completed_at=timezone.now()
                        )
                        # Update totals after completion
                        work_order.recalculate_totals()
                except (DatabaseError, AttributeError) as e:
                    # Log error but don't fail the status transition
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Failed to complete workflow task for phase {old_status}: {e}")
        
        # Create task for new status if config exists and task doesn't already exist
        # Skip creating workflow task for paused status (no config exists anyway)
        if new_status == 'paused':
            return  # Don't create a workflow task for paused status
        
        task_config = get_workflow_task_config(new_status)
        if task_config:
            try:
                existing_task = work_order.tasks.filter(
                    workflow_phase=new_status,
                    is_workflow_task=True
                ).first()
                
                # If resuming from paused, we already reactivated the task above, so skip creating new one
                if old_status == 'paused' and new_status == 'in_progress' and existing_task:
                    return
                
                if not existing_task:
                    # Get max sequence order for non-workflow tasks to place workflow tasks appropriately
                    max_manual_seq = work_order.tasks.filter(is_workflow_task=False).aggregate(
                        max_seq=Max('sequence_order')
                    )['max_seq'] or 0
                    
                    # Auto-start workflow tasks for certain phases
                    auto_start_phases = ['inspection', 'intake', 'assigned', 'diagnosis', 'in_progress', 'quality_check']
                    initial_status = 'in_progress' if new_status in auto_start_phases else 'pending'
                    
                    # Assign task based on phase
                    # For "assigned" phase, assign to Service Coordinator
                    # For other phases, assign to primary technician or keep unassigned
                    assigned_user = None
                    if new_status == 'assigned' and work_order.service_coordinator:
                        assigned_user = work_order.service_coordinator
                    elif work_order.primary_technician:
                        assigned_user = work_order.primary_technician
                    
                    workflow_task = ServiceTask.objects.create(
                        work_order=work_order,
                        workflow_phase=new_status,
                        is_workflow_task=True,
                        task_type=task_config['task_type'],
                        description=task_config['description'],
                        sequence_order=task_config['sequence_order'] + max_manual_seq,
                        status=initial_status,
                        assigned_to=assigned_user,
                    )
                    
                    # Set started_at if auto-started
                    if initial_status == 'in_progress':
                        ServiceTask.objects.filter(pk=workflow_task.pk).update(
                            started_at=timezone.now()
                        )
            except (DatabaseError, AttributeError) as e:
                # Log error but don't fail the status transition
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Failed to create workflow task for phase {new_status}: {e}")
    except Exception as e:
        # Catch any other errors and log them without failing the transition
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error in _handle_workflow_tasks: {e}", exc_info=True)
