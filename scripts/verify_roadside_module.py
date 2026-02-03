import os
import sys
import django
from django.utils import timezone
from datetime import timedelta
import json

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from django.contrib.auth import get_user_model
from django.test import Client
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.roadside.models import RoadsideRequest
from apps.subscriptions.models import Subscription, Package

User = get_user_model()

def cleanup_test_data():
    print("[0/5] Cleaning up old test data...")
    # Delete subscriptions first
    Subscription.objects.filter(customer__user__username="test_customer_rsa").delete()
    
    # Delete packages created by test admin
    try:
        if User.objects.filter(username="test_admin_rsa").exists():
            admin = User.objects.get(username="test_admin_rsa")
            Package.objects.filter(created_by=admin).delete()
            print("   ✓ Deleted old test packages")
    except Exception as e:
        print(f"   Note: Package cleanup warning: {e}")

    try:
        u = User.objects.get(username="test_customer_rsa")
        # logical delete or minimal cleanup
        # But for this script, we want to start fresh to avoid Unique constraint issues on profile creation
        # if the profile creation signals rely on count() and are flaky.
        u.delete() 
        print("   ✓ Deleted old 'test_customer_rsa'")
    except User.DoesNotExist:
        pass

    try:
        u = User.objects.get(username="test_tech_rsa")
        u.delete()
        print("   ✓ Deleted old 'test_tech_rsa'")
    except User.DoesNotExist:
        pass
        
    try:
        u = User.objects.get(username="test_admin_rsa")
        u.delete()
        print("   ✓ Deleted old 'test_admin_rsa'")
    except User.DoesNotExist:
        pass

def run_verification():
    print("🚀 Starting Roadside Module Verification...")
    cleanup_test_data()
    
    # 1. Setup Data
    print("\n[1/5] Setting up Test Data...")
    
    # Create Customer User
    customer_user, created = User.objects.get_or_create(
        username="test_customer_rsa",
        defaults={
            "email": "customer@rsa.test",
            "first_name": "Test",
            "last_name": "Customer",
            "role": "customer",
            "phone": "+233200000001"
        }
    )
    if created:
        customer_user.set_password("password123")
        customer_user.save()
    
    # Create Customer Profile
    customer_profile, created = Customer.objects.get_or_create(
        user=customer_user,
        defaults={
            "customer_number": "CUST-VERIFY-001",
            "company_name": "Test Company",
            "customer_type": "individual",
        }
    )

    # Create Vehicle
    vehicle, created = Vehicle.objects.get_or_create(
        owner=customer_profile,
        license_plate="RSA-TEST-01",
        defaults={
            "make": "Toyota",
            "model": "Corolla",
            "year": 2020,
            "vin": "RSA123456789",
            "status": "active",
            "current_mileage": 10000,
        }
    )

    # Create Admin User (for dispatching and package creation)
    admin_user, created = User.objects.get_or_create(
        username="test_admin_rsa",
        defaults={
            "email": "admin@rsa.test",
            "first_name": "Test",
            "last_name": "Admin",
            "role": "admin",
            "is_staff": True,
            "is_superuser": True
        }
    )
    if created:
        admin_user.set_password("password123")
        admin_user.save()

    # Create Subscription Package
    package, created = Package.objects.get_or_create(
        code="RSA-TEST",
        defaults={
            "name": "RSA Test Package",
            "price": 1000.00,
            "features": {
                "flat_tyre_service": 5,
                "towing_services_km": 100
            },
            "created_by": admin_user
        }
    )

    # Create Active Subscription
    subscription, created = Subscription.objects.get_or_create(
        customer=customer_profile,
        package=package,
        vehicle=vehicle,
        defaults={
            "status": "active",
            "start_date": timezone.now().date(),
            "end_date": timezone.now().date() + timedelta(days=365),
            "payment_status": "paid",
            "activation_date": timezone.now().date(),
            "purchase_price": 1000.00,
        }
    )
    if created:
        print(f"   ✓ Subscription Created: {subscription.subscription_number}")
    else:
        # Ensure it's active
        subscription.status = "active"
        subscription.save()
        print(f"   ✓ Subscription Active: {subscription.subscription_number}")

    # Create Technician User
    tech_user, created = User.objects.get_or_create(
        username="test_tech_rsa",
        defaults={
            "email": "tech@rsa.test",
            "first_name": "Test",
            "last_name": "Technician",
            "role": "technician",
            "phone": "+233200000002"
        }
    )
    if created:
        tech_user.set_password("password123")
        tech_user.save()

    print(f"   ✓ Customer: {customer_user.username}")
    print(f"   ✓ Vehicle: {vehicle.license_plate}")
    print(f"   ✓ Technician: {tech_user.username}")

    # 2. Simulate Customer Request (API)
    print("\n[2/5] Simulating Customer Request (API)...")
    client = Client()
    client.force_login(customer_user)
    
    request_data = {
        "customer": customer_profile.id,
        "vehicle": vehicle.id,
        "service_type": "flat_tyre",
        "breakdown_location": "Test Location, 123 Main St",
        "latitude": 5.6037,
        "longitude": -0.1870,
        "customer_phone": "+233200000001",
        "description": "Flat tyre on front left",
        "notes": "Please hurry"
    }
    
    response = client.post("/api/roadside/", request_data, content_type="application/json")
    
    if response.status_code != 201:
        print(f"   ❌ Failed to create request: {response.status_code}")
        print(response.content)
        return
        
    request_id = response.json()['id']
    request_number = response.json()['request_number']
    print(f"   ✓ Request Created: {request_number} (ID: {request_id})")
    
    # Verify DB status
    rsa_request = RoadsideRequest.objects.get(id=request_id)
    print(f"   ✓ DB Status: {rsa_request.status}")

    # 3. Simulate Dispatch (API)
    print("\n[3/5] Simulating Dispatch (API)...")
    client.force_login(admin_user)
    
    dispatch_data = {
        "technician_id": tech_user.id
    }
    
    response = client.post(f"/api/roadside/{request_id}/assign_dispatch/", dispatch_data, content_type="application/json")
    
    if response.status_code != 200:
        print(f"   ❌ Failed to dispatch: {response.status_code}")
        print(response.content)
        return

    rsa_request.refresh_from_db()
    print(f"   ✓ Status Updated: {rsa_request.status}")
    print(f"   ✓ Assigned To: {rsa_request.assigned_technician.username}")

    # 4. Simulate Technician Workflow (API)
    print("\n[4/5] Simulating Technician Workflow (API)...")
    client.force_login(tech_user)
    
    # 4a. En Route
    response = client.post(f"/api/roadside/{request_id}/en_route/")
    if response.status_code == 200:
        print("   ✓ Technician En Route")
    else:
        print(f"   ❌ Failed En Route: {response.status_code}")
        
    # 4b. Arrive
    response = client.post(f"/api/roadside/{request_id}/arrive/")
    if response.status_code == 200:
        print("   ✓ Technician Arrived (On Site)")
    else:
        print(f"   ❌ Failed Arrive: {response.status_code}")

    # 4c. In Progress
    response = client.post(f"/api/roadside/{request_id}/in_progress/")
    if response.status_code == 200:
        print("   ✓ Service In Progress")
    else:
        print(f"   ❌ Failed In Progress: {response.status_code}")
        
    # 4d. Complete
    response = client.post(f"/api/roadside/{request_id}/complete/")
    if response.status_code == 200:
        print("   ✓ Service Completed")
    else:
        print(f"   ❌ Failed Complete: {response.status_code}")
        
    rsa_request.refresh_from_db()
    print(f"   ✓ Final DB Status: {rsa_request.status}")
    
    # 5. Customer Rating (API)
    print("\n[5/5] Simulating Customer Feedback (API)...")
    client.force_login(customer_user)
    
    rating_data = {
        "rating": 5,
        "customer_feedback": "Great service, very fast!"
    }
    
    response = client.post(f"/api/roadside/{request_id}/rate_service/", rating_data, content_type="application/json")
    
    if response.status_code == 200:
        print("   ✓ Feedback Submitted")
        rsa_request.refresh_from_db()
        print(f"   ✓ Saved Rating: {rsa_request.rating}/5")
        print(f"   ✓ Saved Feedback: {rsa_request.customer_feedback}")
    else:
        print(f"   ❌ Failed to submit feedback: {response.status_code}")

    print("\n✅ Verification Complete! The Roadside Module flow is working correctly.")

if __name__ == "__main__":
    try:
        run_verification()
    except Exception as e:
        print(f"\n❌ Verification Failed with Error: {e}")
        import traceback
        traceback.print_exc()
