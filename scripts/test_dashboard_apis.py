#!/usr/bin/env python3
"""
Test dashboard API endpoints to identify data querying issues
"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, '/home/dev/smart_vehicle_repairs_system')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from django.contrib.auth import get_user_model
from django.test import RequestFactory
from apps.reporting import views
import json

User = get_user_model()

# Get a user to test with
try:
    user = User.objects.filter(is_staff=True).first()
    if not user:
        user = User.objects.first()
    
    if not user:
        print("ERROR: No users found in the database")
        sys.exit(1)
    
    print(f"Testing with user: {user.username} (role: {user.role})")
    print("=" * 80)
    
    factory = RequestFactory()
    
    # Test dashboard overview
    print("\n1. Testing /api/reporting/dashboard-overview/")
    print("-" * 80)
    request = factory.get('/api/reporting/dashboard-overview/')
    request.user = user
    
    try:
        response = views.dashboard_overview(request)
        data = response.data
        print("Status Code:", response.status_code)
        print("\nResponse Data:")
        print(json.dumps(data, indent=2, default=str))
        
        # Check for any errors in response
        if 'error' in data:
            print(f"\n⚠️  ERROR FOUND: {data['error']}")
        
        # Validate key fields
        print("\n📊 Data Summary:")
        print(f"  Today's Appointments: {data.get('today', {}).get('appointments', 'N/A')}")
        print(f"  Today's Revenue: ${data.get('today', {}).get('revenue', 0):.2f}")
        print(f"  Week Revenue: ${data.get('week', {}).get('revenue', 0):.2f}")
        print(f"  Month Revenue: ${data.get('month', {}).get('revenue', 0):.2f}")
        print(f"  Active Work Orders: {data.get('alerts', {}).get('active_work_orders', 'N/A')}")
        print(f"  Low Stock Items: {data.get('alerts', {}).get('low_stock_items', 'N/A')}")
        print(f"  Active Subscriptions: {data.get('subscriptions', {}).get('active_count', 'N/A')}")
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    # Test revenue report
    print("\n\n2. Testing /api/reporting/revenue-report/")
    print("-" * 80)
    from datetime import datetime, timedelta
    today = datetime.now().date()
    week_ago = today - timedelta(days=7)
    
    request = factory.get(
        f'/api/reporting/revenue-report/?start_date={week_ago}&end_date={today}&period=daily'
    )
    request.user = user
    
    try:
        response = views.revenue_report(request)
        data = response.data
        print("Status Code:", response.status_code)
        
        if 'error' in data:
            print(f"\n⚠️  ERROR FOUND: {data['error']}")
        else:
            print(f"\n📊 Summary:")
            print(f"  Total Invoiced: ${data.get('summary', {}).get('total_invoiced', 0):.2f}")
            print(f"  Total Paid: ${data.get('summary', {}).get('total_paid', 0):.2f}")
            print(f"  Revenue by Period entries: {len(data.get('revenue_by_period', []))}")
            print(f"  Payment Methods: {len(data.get('revenue_by_payment_method', []))}")
            
            if data.get('revenue_by_period'):
                print(f"\n  Sample period data:")
                for period in data['revenue_by_period'][:3]:
                    print(f"    {period['period']}: ${period['revenue']:.2f}")
                    
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    # Test work order statistics
    print("\n\n3. Testing /api/reporting/work-order-statistics/")
    print("-" * 80)
    request = factory.get(
        f'/api/reporting/work-order-statistics/?start_date={week_ago}&end_date={today}'
    )
    request.user = user
    
    try:
        response = views.work_order_statistics(request)
        data = response.data
        print("Status Code:", response.status_code)
        
        if 'error' in data:
            print(f"\n⚠️  ERROR FOUND: {data['error']}")
        else:
            print(f"\n📊 Summary:")
            print(f"  Total Work Orders: {data.get('summary', {}).get('total_work_orders', 0)}")
            print(f"  Completed: {data.get('summary', {}).get('completed', 0)}")
            print(f"  Active: {data.get('summary', {}).get('active_count', 0)}")
            print(f"  Status breakdown entries: {len(data.get('by_status', []))}")
            
            if data.get('by_status'):
                print(f"\n  Status breakdown:")
                for status in data['by_status'][:5]:
                    print(f"    {status['status']}: {status['count']}")
                    
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    # Test low stock
    print("\n\n4. Testing /api/reporting/low-stock-report/")
    print("-" * 80)
    request = factory.get('/api/reporting/low-stock-report/')
    request.user = user
    
    try:
        response = views.low_stock_report(request)
        data = response.data
        print("Status Code:", response.status_code)
        print(f"\n📊 Summary:")
        print(f"  Total Low Stock: {data.get('summary', {}).get('total_low_stock', 0)}")
        print(f"  Critical: {data.get('summary', {}).get('critical', 0)}")
        print(f"  Low items entries: {len(data.get('low_stock_items', []))}")
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "=" * 80)
    print("✅ API Testing Complete")
    
except Exception as e:
    print(f"FATAL ERROR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
