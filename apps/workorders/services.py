from .models import WorkOrder, WorkOrderPart, WorkOrderNote
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
            # If no specific skills found, return all available active technicians
            return Technician.objects.filter(
                user__is_active=True,
                current_status='available'
            ).select_related('user')
            
        # Find technicians with these skills
        # We want to prioritize those who have MOST of the skills and are AVAILABLE
        
        candidates = Technician.objects.filter(
            user__is_active=True,
            skills__id__in=required_skills
        ).annotate(
            skill_match_count=Count('skills', filter=Q(skills__id__in=required_skills))
        ).order_by('-skill_match_count', 'current_status') 
        # ordering by status will put 'available' (a) before 'busy' (b) if we are lucky?
        # 'available' < 'busy' < 'offline'? 
        # 'available' starts with 'a', so yes.
        
        return candidates

    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error suggesting technicians for WO {work_order.id}: {e}")
        return []
