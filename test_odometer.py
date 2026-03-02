import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.vehicles.models import Vehicle
from apps.accounts.models import User

# Grab any active vehicle
v = Vehicle.objects.filter(status='active').first()
if not v:
    print("No vehicle found. Test aborting.")
    exit(0)

# Grab any user
u = User.objects.first()

old_mileage = v.current_mileage or 0

print(f"Testing on Vehicle {v.id}, current mileage: {old_mileage}")

# Try lower mileage
try:
    v.update_mileage(old_mileage - 10, user=u)
    print("FAILED: Lower mileage did not raise error")
except ValueError as e:
    print(f"PASSED: Lower mileage raised ValueError: {e}")

# Try higher mileage
try:
    success = v.update_mileage(old_mileage + 10, user=u, notes="Test Odometer Update")
    if success:
        print(f"PASSED: Higher mileage updated to {v.current_mileage}")
        
        # Check history
        hist = v.mileage_history.last()
        if hist and hist.mileage == v.current_mileage:
            print("PASSED: History record created")
        else:
            print("FAILED: History record not found")
    else:
        print("FAILED: Did not return success")
except Exception as e:
    print(f"FAILED: Higher mileage update threw exception: {e}")

exit(0)
