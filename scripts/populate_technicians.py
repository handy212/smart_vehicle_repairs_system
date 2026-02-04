import os
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from apps.technicians.models import Technician

User = get_user_model()

def populate_technicians():
    users = User.objects.filter(role__in=['technician', 'service_coordinator'])
    created_count = 0
    existing_count = 0
    
    for user in users:
        profile, created = Technician.objects.get_or_create(user=user)
        if created:
            created_count += 1
        else:
            existing_count += 1
            
    print(f"Retroactive population complete.")
    print(f"Created {created_count} new technician profiles.")
    print(f"Found {existing_count} existing technician profiles.")

if __name__ == "__main__":
    populate_technicians()
