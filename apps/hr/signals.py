"""
HR Management Signals
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_employee_profile(sender, instance, created, **kwargs):
    """
    Auto-create an EmployeeProfile for new non-customer users.
    This mirrors the pattern used in technicians app.
    """
    if created and hasattr(instance, 'role') and instance.role != 'customer':
        from .models import EmployeeProfile
        # Only create if profile doesn't already exist
        if not hasattr(instance, 'employee_profile'):
            EmployeeProfile.objects.create(
                user=instance,
                start_date=instance.hire_date,
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
