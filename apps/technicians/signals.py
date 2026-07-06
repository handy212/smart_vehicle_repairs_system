from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from apps.technicians.models import Technician

User = get_user_model()

@receiver(post_save, sender=User)
def create_technician_profile(sender, instance, created, **kwargs):
    """
    Automatically create a Technician profile for users with 'technician' 
    or 'service_coordinator' roles.
    """
    if instance.role in ['technician', 'service_coordinator']:
        # Ensure Technician profile exists
        Technician.objects.get_or_create(user=instance)
    else:
        # Optional: If role changed from technician to something else, 
        # should we delete the profile? Probably not, to preserve history.
        # But we could mark them as offline or inactive if there was such a field.
        pass
