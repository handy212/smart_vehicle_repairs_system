from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from apps.workorders.models import WorkOrder, ServiceTask, TechnicianTimeLog
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle

from apps.accounts.permission_models import Role, Permission
from unittest.mock import patch

User = get_user_model()

@patch('apps.workorders.views.filter_queryset_for_user_branches', side_effect=lambda qs, *args, **kwargs: qs)
class MobileAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # Create permissions
        self.view_wo_perm = Permission.objects.create(
            code='view_workorders',
            name='View Work Orders',
            category='workorders'
        )
        self.edit_wo_perm = Permission.objects.create(
            code='edit_workorders',
            name='Edit Work Orders',
            category='workorders'
        )
        
        # Create technician role
        self.tech_role = Role.objects.create(
            code='technician',
            name='Technician'
        )
        self.tech_role.permissions.add(self.view_wo_perm, self.edit_wo_perm)
        
        # Create users
        self.technician = User.objects.create_user(
            username='tech1',
            email='tech1@example.com',
            password='password123',
            role='technician',
            hourly_rate=50.00
        )
        self.advisor = User.objects.create_user(
            username='advisor1',
            email='advisor1@example.com',
            password='password123',
            role='advisor'
        )
        
        # Create customer user and profile
        self.customer_user = User.objects.create_user(
            username='customer1',
            email='john@example.com',
            password='password123',
            role='customer',
            phone='555-0100',
            first_name='John',
            last_name='Doe'
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            customer_number='CUST-001'
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            year=2020,
            make='Toyota',
            model='Camry',
            license_plate='ABC-123',
            current_mileage=10000
        )
        
        # Create work order
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            odometer_in=10000,
            status='approved',
            priority='normal',
            primary_technician=self.technician,
            customer_concerns='Oil change',
            created_by=self.advisor
        )
        
        # Create a task
        self.task = ServiceTask.objects.create(
            work_order=self.work_order,
            description='Change Oil',
            status='pending',
            estimated_hours=0.5
        )
        
        # Authenticate as technician
        self.client.force_authenticate(user=self.technician)

    def test_time_tracking_flow(self, mock_filter):
        """Test the full time tracking flow for a technician"""
        
        # 1. Clock In (create time log)
        # Mobile app sends only work_order, technician and rate should auto-populate
        clock_in_data = {
            'work_order': self.work_order.id,
            'description': 'Starting work',
            'clock_in': timezone.now().isoformat()
        }
        
        response = self.client.post('/api/workorders/time-logs/', clock_in_data, format='json')
        if response.status_code != 201:
            print(f"Clock In Failed: {response.data}")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['technician'], self.technician.id)
        self.assertEqual(float(response.data['hourly_rate']), 50.00)
        
        time_log_id = response.data['id']
        
        # 2. Check Active Log
        response = self.client.get('/api/workorders/time-logs/active/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], time_log_id)
        # Verify expanded fields
        self.assertTrue('work_order_number' in response.data)
        
        # 3. Clock Out
        clock_out_data = {
            'clock_out': timezone.now().isoformat(),
            'notes': 'Done for now'
        }
        response = self.client.post(f'/api/workorders/time-logs/{time_log_id}/clock_out/', clock_out_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data['clock_out'])
        
        # 4. Check Active Log again (should return 200 with None)
        response = self.client.get('/api/workorders/time-logs/active/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data)

    def test_work_order_mobile_actions(self, mock_filter):
        """Test work order actions used in mobile app"""
        
        # 1. Start Work
        response = self.client.post(f'/api/workorders/work-orders/{self.work_order.id}/start_work/')
        if response.status_code != 200:
            print(f"Start Work Failed: {response.data}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.work_order.refresh_from_db()
        self.assertEqual(self.work_order.status, 'in_progress')
        
        # 2. Pause Work
        response = self.client.post(f'/api/workorders/work-orders/{self.work_order.id}/pause/', {'reason': 'Lunch'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.work_order.refresh_from_db()
        self.assertEqual(self.work_order.status, 'paused')
        
        # 3. Resume Work
        response = self.client.post(f'/api/workorders/work-orders/{self.work_order.id}/resume/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.work_order.refresh_from_db()
        self.assertEqual(self.work_order.status, 'in_progress')
        
        # 4. Complete the mechanical task with actual labor
        response = self.client.post(f'/api/workorders/tasks/{self.task.id}/start/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.post(
            f'/api/workorders/tasks/{self.task.id}/complete/',
            {'actual_hours': '0.50', 'notes': 'Oil and filter replaced'},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # 5. Request Quality Check
        self.work_order.quality_check_required = True
        self.work_order.save()
        
        response = self.client.post(f'/api/workorders/work-orders/{self.work_order.id}/request_quality_check/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.work_order.refresh_from_db()
        self.assertEqual(self.work_order.status, 'quality_check')
        
        # 6. Perform Quality Check (Pass)
        # Verify complete flow via quality check success
        qc_data = {
            'passed': True,
            'notes': 'QC Passed',
            'checklist': {'allTasksCompleted': True}
        }
        
        response = self.client.post(f'/api/workorders/work-orders/{self.work_order.id}/quality_check/', qc_data, format='json')
        if response.status_code != 200:
             print("QC/Complete failed:", response.data)
             
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.work_order.refresh_from_db()
        self.assertEqual(self.work_order.status, 'completed')

    def test_cannot_complete_task_without_actual_hours_or_time_logs(self, mock_filter):
        self.client.post(f'/api/workorders/work-orders/{self.work_order.id}/start_work/')
        self.client.post(f'/api/workorders/tasks/{self.task.id}/start/')

        response = self.client.post(
            f'/api/workorders/tasks/{self.task.id}/complete/',
            {'notes': 'Done'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Actual labor hours are required', response.data['error'])

    def test_request_quality_check_is_idempotent_when_already_requested(self, mock_filter):
        """Repeated QC requests should return the current work order instead of failing."""
        self.work_order.status = 'quality_check'
        self.work_order.quality_check_required = True
        self.work_order.save(update_fields=['status', 'quality_check_required'])

        response = self.client.post(f'/api/workorders/work-orders/{self.work_order.id}/request_quality_check/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'quality_check')
        self.assertEqual(response.data['workflow_message'], 'Quality check already requested.')

    def test_request_quality_check_is_idempotent_when_already_completed(self, mock_filter):
        """QC requests after completion should return a clear already-completed message."""
        self.work_order.status = 'completed'
        self.work_order.quality_check_required = True
        self.work_order.quality_check_completed = True
        self.work_order.quality_check_passed = True
        self.work_order.save(update_fields=[
            'status',
            'quality_check_required',
            'quality_check_completed',
            'quality_check_passed',
        ])

        response = self.client.post(f'/api/workorders/work-orders/{self.work_order.id}/request_quality_check/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'completed')
        self.assertEqual(response.data['workflow_message'], 'Quality check already completed.')

    def test_assigned_work_orders(self, mock_filter):
        """Test retrieving assigned work orders"""
        response = self.client.get('/api/workorders/work-orders/', {'primary_technician': self.technician.id, 'status': 'approved'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], self.work_order.id)
        # Verify vehicle_display is present
        self.assertTrue('vehicle_display' in response.data['results'][0])

    def test_part_request(self, mock_filter):
        """Test technician requesting a part"""
        part_data = {
            'work_order': self.work_order.id,
            'part_name': 'Oil Filter',
            'quantity': 1,
            'status': 'pending'
        }
        
        response = self.client.post('/api/workorders/parts/', part_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'pending')
        self.assertEqual(float(response.data['quantity']), 1.0)
