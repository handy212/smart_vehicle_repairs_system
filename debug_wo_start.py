import os
import django
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.accounts.models import User
from apps.branches.models import Branch
from apps.workorders.models import WorkOrder
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.diagnosis.models import Diagnosis, RepairRecommendation
from django.db import transaction

def reproduction():
    print("Setting up data...")
    import random
    suffix = random.randint(1000, 9999)
    try:
        # Create Users
        manager = User.objects.create_user(username=f'debug_mgr_{suffix}', email=f'mgr_{suffix}@ex.com', password='pwd', role='manager')
        tech = User.objects.create_user(username=f'debug_tech_{suffix}', email=f'tech_{suffix}@ex.com', password='pwd', role='technician')
        
        # Branch
        branch = Branch.objects.create(name=f"Debug Branch {suffix}", code=f"DBG{suffix}", created_by=manager)
        tech.branch = branch
        tech.save()
        manager.managed_branches.add(branch)
        
        # Customer/Vehicle
        cust_user = User.objects.create_user(username=f'debug_cust_{suffix}', email=f'cust_{suffix}@ex.com', role='customer')
        customer = Customer.objects.create(user=cust_user, customer_number=f"C{suffix}")
        vehicle = Vehicle.objects.create(
            owner=customer, vin=f"VIN{suffix}", year=2021, make="Test", model="Model", current_mileage=1000,
            license_plate=f"LP{suffix}"
        )
        
        # Work Order
        wo = WorkOrder.objects.create(
            branch=branch,
            customer=customer,
            vehicle=vehicle,
            created_by=manager,
            status='approved',
            approved_by_customer=True,
            primary_technician=tech,
            odometer_in=1000,
            customer_concerns="Debug issue"
        )
        
        # Diagnosis
        diagnosis = Diagnosis.objects.create(work_order=wo, technician=tech, customer_complaint="Issue")
        
        # Recommendation
        RepairRecommendation.objects.create(
            diagnosis=diagnosis,
            description="Fix thing",
            priority='high',
            estimated_labor_hours=1.0,
            estimated_labor_cost=100.00, 
            customer_approved=True
        )
        
        print(f"Work Order {wo.id} created status={wo.status}")
        
        # Try convert task (simulating view logic)
        print("Converting recommendations...")
        tasks, parts = wo.convert_recommendations_to_tasks(user=manager)
        print(f"Converted: tasks={tasks}, parts={parts}")
        
        # Try transition
        print("Transitioning to in_progress...")
        wo.transition_to('in_progress', user=manager)
        print(f"Transition Success! Status={wo.status}")
        
    except Exception as e:
        print(f"CAUGHT ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    reproduction()
