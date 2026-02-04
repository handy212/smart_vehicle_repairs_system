import os
import django
import sys

sys.path.append('/home/dev/smart_vehicle_repairs_system')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.accounts.models import User

try:
    user = User.objects.get(id=sys.argv[1])
    print(f"User ID: {user.id}")
    print(f"Role: {user.role}")
    print(f"Is Technician: {getattr(user, 'is_technician', 'N/A')}")
except User.DoesNotExist:
    print("User not found")
except Exception as e:
    print(f"Error: {e}")
