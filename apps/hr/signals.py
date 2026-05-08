"""
HR Management Signals
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_employee_profile(sender, instance, created, **kwargs):
    """
    Ensure operational staff accounts always have an EmployeeProfile.
    """
    from .serializers import STAFF_PROFILE_ROLES
    if hasattr(instance, 'role') and instance.role in STAFF_PROFILE_ROLES:
        from .models import EmployeeProfile
        EmployeeProfile.objects.get_or_create(
            user=instance,
            defaults={'start_date': instance.hire_date},
        )


@receiver(post_save, sender='hr.EmployeeProfile')
def create_leave_balances_for_new_employee(sender, instance, created, **kwargs):
    """
    Auto-create LeaveBalance records for new employees
    for all active leave types in the current year.
    """
    if created:
        from .models import LeaveType, LeaveBalance
        from django.utils import timezone
        current_year = timezone.now().year
        active_leave_types = LeaveType.objects.filter(is_active=True)
        for lt in active_leave_types:
            LeaveBalance.objects.get_or_create(
                employee=instance,
                leave_type=lt,
                year=current_year,
                defaults={'total_days': lt.days_allowed},
            )
