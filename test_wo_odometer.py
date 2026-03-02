import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.vehicles.models import Vehicle
from apps.accounts.models import User
from apps.workorders.models import WorkOrder
from apps.branches.models import Branch

v = Vehicle.objects.filter(status='active').first()
u = User.objects.first()
b = Branch.objects.first()

if not v or not u or not b:
    print("Missing objects")
    exit(0)

print(f"Testing on Vehicle {v.id}, current mileage: {v.current_mileage}")

# Create WO
old_mileage = v.current_mileage or 0
print(f"Attempting to create WO with {old_mileage + 10} mileage")

from apps.workorders.serializers import WorkOrderCreateSerializer
serializer = WorkOrderCreateSerializer(data={
    "customer": v.owner.id if getattr(v.owner, 'id', None) else getattr(v.owner, 'user_id', 1),
    "vehicle": v.id,
    "priority": "normal",
    "status": "draft",
    "customer_concerns": "Test",
    "maintenance_type": "general",
    "odometer_in": old_mileage + 10,
    "branch": b.id
})
serializer.context['request'] = type('MockRequest', (object,), {'user': u, 'data': {'branch': b.id}, 'GET': {}, 'headers': {}, 'META': {}})()

if serializer.is_valid():
    wo = serializer.save(branch=b)
    # views.py perform_create equivalent
    if wo.vehicle:
        wo.vehicle.update_mileage(mileage=serializer.validated_data['odometer_in'], user=u, notes="Create WO")
        
    v.refresh_from_db()
    print(f"Vehicle mileage after create: {v.current_mileage}")
else:
    print(f"Create Serializer Error: {serializer.errors}")

# Update WO
old_mileage = v.current_mileage
print(f"Attempting to update WO with {old_mileage + 5} mileage")

from apps.workorders.serializers import WorkOrderUpdateSerializer
update_serializer = WorkOrderUpdateSerializer(wo, data={
    "odometer_out": old_mileage + 5
}, partial=True)

if update_serializer.is_valid():
    wo = update_serializer.save()
    # views.py perform_update equivalent
    if wo.vehicle:
        wo.vehicle.update_mileage(mileage=update_serializer.validated_data['odometer_out'], user=u, notes="Update WO")
        
    v.refresh_from_db()
    print(f"Vehicle mileage after update: {v.current_mileage}")
else:
    print(f"Update Serializer Error: {update_serializer.errors}")

# Backwards mileage - should fail validation
print("Attempting to test backward mileage on update:")
bad_serializer = WorkOrderUpdateSerializer(wo, data={"odometer_out": old_mileage - 1}, partial=True)
if bad_serializer.is_valid():
    print("FAILED: Backwards mileage was validated successfully")
else:
    print(f"PASSED: Validation prevented backwards mileage: {bad_serializer.errors}")

exit(0)
