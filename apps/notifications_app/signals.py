from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone
from apps.workorders.models import WorkOrder
from apps.appointments.models import Appointment
from .triggers import NotificationTriggers

triggers = NotificationTriggers()

@receiver(pre_save, sender=WorkOrder)
def cache_work_order_status(sender, instance, **kwargs):
    """Cache the old status to detect changes"""
    if instance.pk:
        try:
            old_instance = WorkOrder.objects.get(pk=instance.pk)
            instance._old_status = old_instance.status
        except WorkOrder.DoesNotExist:
            instance._old_status = None
    else:
        instance._old_status = None

@receiver(post_save, sender=WorkOrder)
def work_order_status_notifications(sender, instance, created, **kwargs):
    """Trigger notifications on Work Order status changes"""
    if created:
        triggers.work_order_created(instance)
        return

    if not hasattr(instance, '_old_status') or instance._old_status == instance.status:
        return

    old_status = instance._old_status
    new_status = instance.status

    if new_status == 'inspection':
        triggers.work_order_inspection_started(instance)
    elif new_status == 'intake':
        triggers.work_order_intake(instance)
    elif new_status == 'assigned':
        triggers.work_order_assigned(instance)
    elif new_status == 'diagnosis':
        triggers.work_order_diagnosis_started(instance)
    elif new_status == 'awaiting_approval':
        triggers.work_order_requires_approval(instance)
    elif new_status == 'approved':
        triggers.work_order_approved(instance)
    elif new_status == 'in_progress':
        if old_status in ['approved', 'assigned']:
            triggers.work_order_started(instance)
        elif old_status == 'paused':
            triggers.work_order_resumed(instance)
    elif new_status == 'additional_work_found':
        triggers.work_order_additional_work_found(instance)
    elif new_status == 'paused':
        triggers.work_order_paused(instance)
    elif new_status == 'quality_check':
        triggers.work_order_quality_check_requested(instance)
    elif new_status == 'discontinued_pending_bill':
        triggers.work_order_discontinued_pending_bill(instance)
    elif new_status == 'completed':
        triggers.work_order_completed(instance)
    elif new_status == 'invoiced':
        triggers.work_order_invoiced(instance)
    elif new_status == 'closed':
        triggers.work_order_closed(instance)


@receiver(pre_save, sender=Appointment)
def cache_appointment_status(sender, instance, **kwargs):
    """Cache the old status to detect changes"""
    if instance.pk:
        try:
            old_instance = Appointment.objects.get(pk=instance.pk)
            instance._old_status = old_instance.status
        except Appointment.DoesNotExist:
            instance._old_status = None
    else:
        instance._old_status = None

@receiver(post_save, sender=Appointment)
def appointment_notifications(sender, instance, created, **kwargs):
    """Trigger notifications on Appointment events"""
    if created:
        triggers.appointment_created(instance)
        
    elif hasattr(instance, '_old_status') and instance._old_status != instance.status:
        # Status changed
        new_status = instance.status
        
        if new_status == 'confirmed':
            triggers.appointment_confirmed(instance)
            
        elif new_status == 'cancelled':
            triggers.appointment_cancelled(instance)
