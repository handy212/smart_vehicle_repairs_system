from django.test import TestCase
from django.contrib.auth import get_user_model
from apps.workorders.models import WorkOrder, WorkOrderPart, ServiceTask
from apps.diagnosis.models import Diagnosis, RepairRecommendation
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.branches.models import Branch
from decimal import Decimal

User = get_user_model()

class PartsIntegrationTests(TestCase):
    def setUp(self):
        # Create users
        self.technician = User.objects.create_user(
            username='tech', password='password', role='technician', email='tech@example.com'
        )
        self.manager = User.objects.create_user(
            username='manager', password='password', role='manager', email='manager@example.com'
        )
        
        # Create branch
        self.branch = Branch.objects.create(name="Test Branch", created_by=self.manager)
        
        # Create customer and vehicle
        self.customer = Customer.objects.create(
            user=User.objects.create_user(username='customer', password='password', email='cust@example.com')
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            vin='12345678901234567',
            make='Toyota',
            model='Camry',
            year=2020,
            current_mileage=10000
        )
        
        # Create Work Order
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='diagnosis',
            primary_technician=self.technician,
            service_coordinator=self.manager,
            odometer_in=10000
        )
        
        # Create Diagnosis
        self.diagnosis = Diagnosis.objects.create(
            work_order=self.work_order,
            technician=self.technician,
            status='in_progress'
        )

    def test_convert_recommendation_creates_parts(self):
        """Test that converting a recommendation creates new parts if they don't exist"""
        
        # Create recommendation with parts
        parts_data = [
            {'part_name': 'New Brake Pad', 'part_number': 'BP-001', 'quantity': 2, 'unit_cost': 50.0},
            {'part_name': 'New Rotor', 'part_number': 'RT-001', 'quantity': 2, 'unit_cost': 100.0}
        ]
        
        rec = RepairRecommendation.objects.create(
            diagnosis=self.diagnosis,
            recommendation_type='replace',
            description='Replace brakes',
            parts_needed=parts_data,
            customer_approved=True
        )
        
        # Convert to tasks
        tasks_created, parts_linked = self.work_order.convert_recommendations_to_tasks(user=self.manager)
        
        # Assert conversion results
        self.assertEqual(tasks_created, 1)
        self.assertEqual(parts_linked, 2)
        
        # Assert tasks created
        task = ServiceTask.objects.get(work_order=self.work_order, description='Replace brakes')
        self.assertIsNotNone(task)
        
        # Assert parts created and linked
        parts = WorkOrderPart.objects.filter(work_order=self.work_order)
        self.assertEqual(parts.count(), 2)
        
        brake_pad = parts.get(part_number='BP-001')
        self.assertEqual(brake_pad.part_name, 'New Brake Pad')
        self.assertEqual(brake_pad.quantity, 2)
        self.assertEqual(brake_pad.task, task)
        self.assertEqual(brake_pad.requested_by, self.manager)
        self.assertEqual(brake_pad.status, 'draft')
        
        rotor = parts.get(part_number='RT-001')
        self.assertEqual(rotor.part_name, 'New Rotor')
        self.assertEqual(rotor.task, task)

    def test_convert_recommendation_links_existing_parts_if_unlinked(self):
        """Test that it links existing unlinked parts instead of creating duplicates"""
        
        # Create existing unlinked part
        existing_part = WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name='Existing Filter',
            part_number='FL-001',
            quantity=1,
            unit_cost=10.0,
            status='draft'
        )
        
        # Create recommendation
        parts_data = [
            {'part_name': 'Existing Filter', 'part_number': 'FL-001', 'quantity': 1, 'unit_cost': 10.0}
        ]
        
        rec = RepairRecommendation.objects.create(
            diagnosis=self.diagnosis,
            recommendation_type='service',
            description='Change Filter',
            parts_needed=parts_data,
            customer_approved=True
        )
        
        # Convert
        tasks_created, parts_linked = self.work_order.convert_recommendations_to_tasks(user=self.manager)
        
        # Assert part was linked, not duplicated
        self.assertEqual(WorkOrderPart.objects.filter(work_order=self.work_order).count(), 1)
        existing_part.refresh_from_db()
        self.assertIsNotNone(existing_part.task)
        self.assertEqual(existing_part.task.description, 'Change Filter')

    def test_convert_recommendation_creates_new_if_existing_linked(self):
        """Test that it creates a NEW part if the existing one is already linked to another task"""
        
        # Create another task and link part
        other_task = ServiceTask.objects.create(work_order=self.work_order, description='Other Task')
        linked_part = WorkOrderPart.objects.create(
            work_order=self.work_order,
            task=other_task,
            part_name='Spark Plug',
            part_number='SP-001',
            quantity=4
        )
        
        # Create recommendation needing same part
        parts_data = [
            {'part_name': 'Spark Plug', 'part_number': 'SP-001', 'quantity': 4}
        ]
        
        rec = RepairRecommendation.objects.create(
            diagnosis=self.diagnosis,
            recommendation_type='replace',
            description='Replace Plugs again',
            parts_needed=parts_data,
            customer_approved=True
        )
        
        # Convert
        tasks_created, parts_linked = self.work_order.convert_recommendations_to_tasks(user=self.manager)
        
        # Assert we now have 2 parts
        self.assertEqual(WorkOrderPart.objects.filter(work_order=self.work_order, part_number='SP-001').count(), 2)
