from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from apps.customers.models import Customer
from rest_framework.test import APIClient
from datetime import timedelta

User = get_user_model()

class CustomerStatsTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(
            username='admin',
            email='admin@example.com',
            password='password123',
            role='admin'
        )
        self.client.force_authenticate(user=self.user)
        
        # Create some customers for this month
        today = timezone.now()
        for i in range(5):
            u = User.objects.create(username=f'cust{i}', email=f'c{i}@ex.com', role='customer')
            Customer.objects.create(user=u, customer_number=f'CUST-{i:05d}', status='active')
            
        # Create some customers for last month
        last_month = today - timedelta(days=32)
        for i in range(3):
            u = User.objects.create(username=f'oldcust{i}', email=f'oc{i}@ex.com', role='customer')
            c = Customer.objects.create(user=u, customer_number=f'CUST-OLD-{i:05d}', status='active')
            # Manually update created_at since auto_now_add=True
            Customer.objects.filter(id=c.id).update(created_at=last_month)

    def test_dashboard_stats(self):
        response = self.client.get('/api/customers/customers/dashboard_stats/')
        self.assertEqual(response.status_code, 200)
        data = response.data
        
        self.assertEqual(data['total_customers'], 8)
        self.assertEqual(data['new_this_month'], 5)
        # 5 this month, 3 last month. Growth = (5-3)/3 * 100 = 66.7%
        self.assertEqual(data['growth_percentage'], 66.7)
