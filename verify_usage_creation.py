import os
import django
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.accounts.models import User
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.subscriptions.models import Subscription, Package
from apps.roadside.models import RoadsideRequest
from apps.roadside.serializers import RoadsideRequestCreateSerializer

def verify_usage_creation():
    # Setup
    admin, _ = User.objects.get_or_create(username='admin_tester', role='admin', email='admin@test.com')
    user, _ = User.objects.get_or_create(username='cust_tester', role='customer', email='cust@test.com')
    customer, _ = Customer.objects.get_or_create(user=user, customer_number='CUST-TEST')
    
    vehicle, _ = Vehicle.objects.get_or_create(
        owner=customer, 
        license_plate='GH-TEST-123',
        defaults={'make': 'Toyota', 'model': 'Corolla', 'year': 2020}
    )
    
    package, _ = Package.objects.get_or_create(
        code='TEST_PKG',
        defaults={'name': 'Test Package', 'price': 100, 'duration_months': 12, 'features': {'towing_services_km': 100}}
    )
    
    # Active subscription but future activation date
    sub = Subscription.objects.create(
        customer=customer,
        vehicle=vehicle,
        package=package,
        start_date=timezone.now().date(),
        end_date=timezone.now().date() + timedelta(days=365),
        status='active',
        payment_status='paid',
        activation_date=timezone.now().date() + timedelta(days=5) # FUTURE
    )
    
    print(f"Subscription ID: {sub.id}, Active Status: {sub.status}, is_active(): {sub.is_active()}")
    
    # Simulate Request Creation via View Logic (simplified)
    # We copy the logic from RoadsideRequestViewSet.perform_create
    
    # 1. Create Request
    curr_req = RoadsideRequest.objects.create(
        customer=customer,
        vehicle=vehicle,
        service_type='towing',
        breakdown_location='Test Loc',
        tow_distance_km=10,
        customer_phone='1234567890',
        created_by=user
    )
    
    # 2. Run Subscription Logic
    from apps.subscriptions.services import SubscriptionUsageService
    
    print("Checking allowance...")
    has_allowance, subscription, remaining = SubscriptionUsageService.check_allowance(
        customer, 'towing_services_km', quantity_needed=10, vehicle=vehicle
    )
    
    print(f"Has Allowance: {has_allowance}")
    print(f"Returned Subscription: {subscription}")
    
    if has_allowance and subscription:
        print("Consuming allowance...")
        try:
            usage = SubscriptionUsageService.consume_allowance(
                subscription=subscription,
                usage_type='towing_services_km',
                quantity_used=10
            )
            print(f"Usage created: {usage.id}")
            curr_req.subscription_used = subscription
            curr_req.subscription_usage_record = usage
            curr_req.is_covered_by_subscription = True
            curr_req.save()
        except Exception as e:
            print(f"Error consuming: {e}")
    else:
        print("No allowance consumed (likely fallback to paid)")
        
    # Check Result
    curr_req.refresh_from_db()
    print(f"Request Covered: {curr_req.is_covered_by_subscription}")
    print(f"Usage Record: {curr_req.subscription_usage_record}")
    
    # Clean up
    sub.delete()
    curr_req.delete()

if __name__ == "__main__":
    verify_usage_creation()
