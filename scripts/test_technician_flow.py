
import os, django
from decimal import Decimal
from datetime import timedelta
import sys

# Setup Django
sys.path.append('/home/dev/smart_vehicle_repairs_system')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.utils import timezone
from apps.accounts.models import User
from apps.technicians.models import Technician
from apps.workorders.models import WorkOrder, TechnicianTimeLog

def test_technician_flow():
    print("Starting Technician Flow Test...")
    
    # 1. Setup Data
    # Get or create a technician user
    user, created = User.objects.get_or_create(
        email='tech_test@example.com',
        defaults={'username': 'tech_test', 'role': 'technician', 'hourly_rate': Decimal('50.00')}
    )
    if created:
        user.set_password('password')
        user.save()
        print(f"Created user: {user.username}")
        
    # Ensure Technician profile
    tech_profile, created = Technician.objects.get_or_create(user=user)
    tech_profile.current_status = 'available'
    tech_profile.save()
    print(f"Technician Value: {tech_profile} Status: {tech_profile.current_status}")

    # Get a work order
    wo = WorkOrder.objects.first()
    if not wo:
        print("No work orders found. Creating dummy.")
        from apps.vehicles.models import Vehicle
        v = Vehicle.objects.first()
        wo = WorkOrder.objects.create(vehicle=v, customer=v.owner, maintenance_type='repair')

    # 2. Test Clock In
    print("\n[Action] Clocking In...")
    log = TechnicianTimeLog.objects.create(
        work_order=wo,
        technician=user,
        clock_in=timezone.now(),
        description="Testing flow"
    )
    
    # refresh profile
    tech_profile.refresh_from_db()
    print(f"Technician Status after Clock In: {tech_profile.current_status} (Expected: busy)")
    
    if tech_profile.current_status != 'busy':
        print("FAIL: Status did not change to busy")
    else:
        print("PASS: Status changed to busy")

    # 3. Test Clock Out
    print("\n[Action] Clocking Out...")
    # Simulate 2 hours later
    log.clock_out = log.clock_in + timedelta(hours=2)
    log.save()
    
    # refresh everything
    log.refresh_from_db()
    tech_profile.refresh_from_db()
    
    print(f"Duration: {log.duration_hours} (Expected: 2.00)")
    print(f"Labor Cost: {log.labor_cost} (Expected: 100.00)")
    print(f"Technician Status after Clock Out: {tech_profile.current_status} (Expected: available)")
    
    if log.labor_cost == Decimal('100.00'):
        print("PASS: Labor cost calculated correctly")
    else:
        print(f"FAIL: Labor cost incorrect. Got {log.labor_cost}")
        
    if tech_profile.current_status == 'available':
        print("PASS: Status changed to available")
    else:
        print(f"FAIL: Status incorrect. Got {tech_profile.current_status}")

    # Cleanup
    print("\nCleaning up...")
    log.delete()
    # Don't delete user/profile to avoid cascading deletes affecting other tests

if __name__ == "__main__":
    test_technician_flow()
