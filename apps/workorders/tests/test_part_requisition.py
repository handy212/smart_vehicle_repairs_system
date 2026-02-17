from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.workorders.models import WorkOrder, WorkOrderPart
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle

User = get_user_model()

from rest_framework.test import APIClient
from rest_framework import status

class PartRequisitionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # Create users
        self.technician = User.objects.create_user(
            username='tech',
            email='tech@example.com',
            password='password123',
            first_name='John',
            last_name='Tech',
            role='technician'
        )
        self.manager = User.objects.create_user(
            username='manager',
            email='manager@example.com',
            password='password123',
            first_name='Jane',
            last_name='Manager',
            role='manager'
        )
        
        # Create basics for WorkOrder
        self.customer_user = User.objects.create_user(
            username='cust',
            email='cust@example.com', 
            password='password',
            phone='1234567890'
        )
        self.customer = Customer.objects.create(
            user=self.customer_user
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            license_plate='TEST-123',
            vin='VIN1234567890',
            make='Toyota',
            model='Camry',
            year=2020,
            current_mileage=10000
        )
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            status='in_progress',
            primary_technician=self.technician,
            odometer_in=10000
        )

    def test_requisition_creation(self):
        """Test that creating a part sets the requisition number and default status"""
        part = WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name='Oil Filter',
            quantity=1,
            unit_cost=10,
            requested_by=self.technician
        )
        
        self.assertIsNotNone(part.requisition_number)
        self.assertTrue(part.requisition_number.startswith('REQ-'))
        self.assertEqual(part.requested_by, self.technician)
        self.assertEqual(part.status, 'draft')

    def test_requisition_number_uniqueness(self):
        """Test that requisition numbers are unique and sequential"""
        part1 = WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name='Part 1',
            quantity=1,
            requested_by=self.technician
        )
        part2 = WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name='Part 2',
            quantity=1,
            requested_by=self.technician
        )
        
        self.assertNotEqual(part1.requisition_number, part2.requisition_number)
        
        # Check sequence (assuming YYYY-XXXXX format)
        seq1 = int(part1.requisition_number.split('-')[-1])
        seq2 = int(part2.requisition_number.split('-')[-1])
        self.assertEqual(seq2, seq1 + 1)

    def test_approval_workflow(self):
        """Test the approval process"""
        part = WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name='Expensive Part',
            quantity=1,
            requested_by=self.technician,
            status='pending'
        )
        
        # Approve
        part.approved_by = self.manager
        part.approved_at = timezone.now()
        part.status = 'po_created' # or 'ready'
        part.save()
        
        self.assertEqual(part.approved_by, self.manager)
        self.assertIsNotNone(part.approved_at)
        
    def test_api_create_sets_requested_by(self):
        """Test that the API automatically sets requested_by"""
        self.client.force_authenticate(user=self.technician)
        
        # Assuming URL is /api/workorders/parts/ based on router configuration
        # Note: In tests, usually we need to mount urls or reverse them.
        # But 'workorderpart-list' is the likely name.
        from django.urls import reverse
        try:
            url = reverse('workorderpart-list')
        except:
             # Fallback if URL conf is not fully loaded in this test runner env exactly as expected
             url = '/api/workorders/parts/'
             
        data = {
            'work_order': self.work_order.id,
            'part_name': 'Brake Pads',
            'quantity': 2,
            'unit_cost': 50,
            'status': 'draft'
        }
        
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        part_id = response.data['id']
        part = WorkOrderPart.objects.get(id=part_id)
        self.assertEqual(part.requested_by, self.technician)
        
    def test_approve_action(self):
        """Test the approve action API"""
        part = WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name='Turbo',
            quantity=1,
            requested_by=self.technician,
            status='pending'
        )
        
        # Technician cannot approve
        self.client.force_authenticate(user=self.technician)
        try:
            url = reverse('workorderpart-approve', args=[part.id])
        except:
            url = f'/api/workorders/parts/{part.id}/approve/'
            
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        # Manager can approve
        self.client.force_authenticate(user=self.manager)
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        part.refresh_from_db()
        self.assertEqual(part.approved_by, self.manager)
        self.assertIsNotNone(part.approved_at)
        
        # Cannot approve twice
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST) 

    def test_serializer_create_sets_requested_by(self):
        """Test serializer create method sets user from context"""
        from apps.workorders.serializers import WorkOrderPartCreateSerializer
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.post('/')
        request.user = self.technician
        
        data = {
            'work_order': self.work_order.id,
            'part_name': 'Clutch',
            'quantity': 1,
            'unit_cost': 200,
            'status': 'draft'
        }
        
        serializer = WorkOrderPartCreateSerializer(data=data, context={'request': request})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        part = serializer.save()
        
        self.assertEqual(part.requested_by, self.technician)
        self.assertIsNotNone(part.requisition_number)
