from .models import WorkOrder, WorkOrderPart, WorkOrderNote, ServiceTask
from django.db.models import Max
from django.utils import timezone
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
            skill = Skill.objects.filter(name__icontains=task.description).first()
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

def get_all_workflow_configs():
    """
    Get all workflow tasks configurations natively and from DB overrides.
    Returns a dict mapped by status.
    """
    WORKFLOW_TASK_CONFIG = {
        'inspection': {'task_type': 'inspection', 'description': 'Initial Inspection', 'sequence_order': 1},
        'intake': {'task_type': 'inspection', 'description': 'Customer Intake', 'sequence_order': 2},
        'assigned': {'task_type': 'coordination', 'description': 'Service Coordinator Assigned - Ready for Diagnosis', 'sequence_order': 3},
        'diagnosis': {'task_type': 'diagnostic', 'description': 'Perform Diagnosis', 'sequence_order': 4},
        'awaiting_approval': {'task_type': 'other', 'description': 'Await Customer Approval', 'sequence_order': 5},
        'approved': {'task_type': 'other', 'description': 'Customer Approval Received', 'sequence_order': 6},
        'in_progress': {'task_type': 'repair', 'description': 'Repair Work', 'sequence_order': 7},
        'quality_check': {'task_type': 'inspection', 'description': 'Perform Quality Check', 'sequence_order': 8},
        'completed': {'task_type': 'other', 'description': 'Finalize Work Order', 'sequence_order': 9},
        'invoiced': {'task_type': 'other', 'description': 'Generate Invoice', 'sequence_order': 10},
        'closed': {'task_type': 'other', 'description': 'Close Work Order', 'sequence_order': 11},
    }
    
    try:
        from apps.workorders.models import WorkflowConfiguration
        configs = WorkflowConfiguration.objects.filter(is_active=True)
        for config in configs:
            WORKFLOW_TASK_CONFIG[config.status] = {
                'task_type': config.task_type,
                'description': config.description,
                'sequence_order': config.sequence_order,
            }
    except Exception:
        pass
        
    return WORKFLOW_TASK_CONFIG


def get_workflow_task_config(status):
    """
    Get configuration for workflow task based on status.
    Returns dict with task_type, description, and sequence_order, or None if no task needed.
    """
    return get_all_workflow_configs().get(status)


def handle_workflow_tasks(work_order, old_status, new_status, user=None):
    """
    Automatically synchronize workflow tasks based on the work order's current status.
    Uses a declarative state model mathematically bound by sequence_order.
    """
    try:
        from django.utils import timezone
        from django.db import DatabaseError
        from django.core.exceptions import FieldDoesNotExist
        from django.db.models import Max
        
        try:
            fields = [f.name for f in work_order.tasks.model._meta.get_fields()]
            workflow_fields_exist = 'is_workflow_task' in fields and 'workflow_phase' in fields
        except (AttributeError, FieldDoesNotExist, Exception):
            workflow_fields_exist = False
        
        if not workflow_fields_exist:
            return
            
        all_configs = get_all_workflow_configs()
        new_config = all_configs.get(new_status)
        
        # 1. Handle Side States (No direct sequence assigned)
        if not new_config or new_status in ['paused', 'additional_work_found']:
            # Pause all active workflow tasks
            active_tasks = work_order.tasks.filter(is_workflow_task=True, status='in_progress')
            for task in active_tasks:
                task.status = 'pending'
                task.save(update_fields=['status'])
            return

        target_seq = new_config['sequence_order']
        
        # Determine phases by timing mathematically via sequence_order
        past_phases = [k for k, v in all_configs.items() if v['sequence_order'] < target_seq]
        future_phases = [k for k, v in all_configs.items() if v['sequence_order'] > target_seq]

        # 2. Complete previous stages flawlessly
        past_tasks = work_order.tasks.filter(
            is_workflow_task=True,
            workflow_phase__in=past_phases,
        ).exclude(status='completed')
        
        for task in past_tasks:
            task.status = 'completed'
            task.completed_at = timezone.now()
            task.save(update_fields=['status', 'completed_at'])

        # 3. Purge future stages if moving backward to avoid dirty orphaned data
        work_order.tasks.filter(
            is_workflow_task=True,
            workflow_phase__in=future_phases
        ).delete()
        
        # 4. Activate or Create Current Stage
        current_task = work_order.tasks.filter(
            is_workflow_task=True,
            workflow_phase=new_status
        ).first()
        
        auto_start_phases = ['inspection', 'intake', 'assigned', 'diagnosis', 'in_progress', 'quality_check']
        initial_status = 'in_progress' if new_status in auto_start_phases else 'pending'
        
        if current_task:
            if current_task.status != initial_status and current_task.status != 'completed':
                current_task.status = initial_status
                if initial_status == 'in_progress' and not current_task.started_at:
                    current_task.started_at = timezone.now()
                update_fields = ['status', 'started_at'] if initial_status == 'in_progress' else ['status']
                current_task.save(update_fields=update_fields)
        else:
            max_manual_seq = work_order.tasks.filter(is_workflow_task=False).aggregate(
                max_seq=Max('sequence_order')
            )['max_seq'] or 0
            
            assigned_user = None
            if new_status == 'assigned' and work_order.service_coordinator:
                assigned_user = work_order.service_coordinator
            elif work_order.primary_technician:
                assigned_user = work_order.primary_technician
                
            workflow_task = ServiceTask.objects.create(
                work_order=work_order,
                workflow_phase=new_status,
                is_workflow_task=True,
                task_type=new_config['task_type'],
                description=new_config['description'],
                sequence_order=new_config['sequence_order'] + max_manual_seq,
                status=initial_status,
                assigned_to=assigned_user,
            )
            
            if initial_status == 'in_progress':
                ServiceTask.objects.filter(pk=workflow_task.pk).update(started_at=timezone.now())

        # Recalculate Work Order if tasks were modified
        work_order.recalculate_totals()

    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error in handle_workflow_tasks: {e}", exc_info=True)
