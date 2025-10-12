"""
Tests for workorders app.
"""
import pytest
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APITestCase
from model_bakery import baker

from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder, ServiceTask, WorkOrderPart, TechnicianTimeLog
from apps.inventory.models import Part

User = get_user_model()


class WorkOrderModelTest(TestCase):
    """Test cases for WorkOrder model."""

    def setUp(self):
        """Set up test data."""
        self.customer_user = User.objects.create_user(
            email='customer@test.com',
            username='customer',
            password='test123',
            first_name='John',
            last_name='Doe',
            phone='1234567890',
            role='customer'
        )
        self.technician_user = User.objects.create_user(
            email='tech@test.com',
            username='technician',
            password='test123',
            first_name='Tech',
            last_name='User',
            role='technician'
        )
        self.customer = Customer.objects.create(
            user=self.customer_user
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='ABC123',
            current_mileage=50000
        )

    def test_create_workorder(self):
        """Test creating a work order."""
        workorder = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            customer_concerns='Oil change and inspection',
            odometer_in=50000,
            status='draft',
            priority='normal'
        )
        self.assertEqual(workorder.customer, self.customer)
        self.assertEqual(workorder.vehicle, self.vehicle)
        self.assertEqual(workorder.status, 'draft')
        self.assertEqual(workorder.priority, 'normal')

    def test_workorder_string_representation(self):
        """Test work order string representation."""
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            work_order_number='WO-2023-001'
        )
        expected = f"WO-2023-001 - {self.customer} - {self.vehicle}"
        self.assertEqual(str(workorder), expected)

    def test_workorder_status_choices(self):
        """Test work order status choices."""
        valid_statuses = ['draft', 'scheduled', 'in_progress', 'waiting_parts', 
                         'waiting_approval', 'completed', 'cancelled', 'on_hold']
        for status in valid_statuses:
            workorder = baker.make(
                WorkOrder,
                customer=self.customer,
                vehicle=self.vehicle,
                status=status
            )
            self.assertEqual(workorder.status, status)

    def test_workorder_priority_choices(self):
        """Test work order priority choices."""
        valid_priorities = ['low', 'medium', 'high', 'urgent']
        for priority in valid_priorities:
            workorder = baker.make(
                WorkOrder,
                customer=self.customer,
                vehicle=self.vehicle,
                priority=priority
            )
            self.assertEqual(workorder.priority, priority)

    def test_workorder_total_calculation(self):
        """Test work order total calculation."""
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            actual_labor_cost=Decimal('100.00'),
            actual_parts_cost=Decimal('50.00')
        )
        expected_total = Decimal('150.00')
        self.assertEqual(workorder.actual_total, expected_total)


class ServiceTaskModelTest(TestCase):
    """Test cases for ServiceTask model."""

    def setUp(self):
        """Set up test data."""
        self.customer = baker.make(Customer)
        self.vehicle = baker.make(Vehicle, owner=self.customer)
        self.workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle
        )
        self.technician = baker.make(User, role='technician')

    def test_create_service_task(self):
        """Test creating a service task."""
        task = ServiceTask.objects.create(
            work_order=self.workorder,
            description='Change engine oil and filter',
            estimated_hours=Decimal('1.0'),
            labor_rate=Decimal('80.00'),
            assigned_to=self.technician,
            status='pending'
        )
        self.assertEqual(task.work_order, self.workorder)
        self.assertEqual(task.description, 'Change engine oil and filter')
        self.assertEqual(task.estimated_hours, Decimal('1.0'))
        self.assertEqual(task.assigned_to, self.technician)

    def test_service_task_cost_calculation(self):
        """Test service task cost calculation."""
        task = baker.make(
            ServiceTask,
            work_order=self.workorder,
            actual_hours=Decimal('2.5'),
            labor_rate=Decimal('75.00')
        )
        expected_cost = Decimal('187.50')
        self.assertEqual(task.labor_cost, expected_cost)

    def test_service_task_status_choices(self):
        """Test service task status choices."""
        valid_statuses = ['pending', 'in_progress', 'completed', 'cancelled', 'on_hold']
        for status in valid_statuses:
            task = baker.make(
                ServiceTask,
                work_order=self.workorder,
                status=status
            )
            self.assertEqual(task.status, status)


class WorkOrderAPITest(APITestCase):
    """Test cases for WorkOrder API."""

    def setUp(self):
        """Set up test data."""
        self.admin_user = User.objects.create_user(
            email='admin@test.com',
            username='admin',
            password='admin123',
            role='admin',
            is_staff=True
        )
        self.technician_user = User.objects.create_user(
            email='tech@test.com',
            username='technician',
            password='tech123',
            role='technician',
            is_staff=True
        )
        self.customer_user = User.objects.create_user(
            email='customer@test.com',
            username='customer',
            first_name='John',
            last_name='Doe',
            phone='1234567890',
            password='customer123',
            role='customer'
        )
        self.customer = Customer.objects.create(
            user=self.customer_user
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='ABC123',
            current_mileage=50000
        )

        def test_list_workorders_authenticated(self):
            """Test listing work orders as authenticated user."""
            self.client.force_authenticate(user=self.admin_user)
            baker.make(WorkOrder, customer=self.customer, vehicle=self.vehicle, _quantity=3)
            response = self.client.get('/api/workorders/work-orders/')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(len(response.data['results']), 3)

        def test_list_workorders_unauthenticated(self):
            """Test listing work orders as unauthenticated user."""
            response = self.client.get('/api/workorders/work-orders/')
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        def test_create_workorder(self):
            """Test creating a work order via API."""
            self.client.force_authenticate(user=self.admin_user)
            data = {
                'customer': self.customer.id,
                'vehicle': self.vehicle.id,
                'description': 'Regular maintenance',
                'status': 'draft',
                'priority': 'medium',
                'estimated_completion_date': '2023-12-31'
            }
            response = self.client.post('/api/workorders/work-orders/', data)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            self.assertEqual(WorkOrder.objects.count(), 1)

        def test_technician_can_view_assigned_workorders(self):
            """Test that technicians can view work orders assigned to them."""
            self.client.force_authenticate(user=self.technician_user)
            workorder = baker.make(
                WorkOrder,
                customer=self.customer,
                vehicle=self.vehicle,
                primary_technician=self.technician_user
            )
            response = self.client.get('/api/workorders/work-orders/')
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        def test_customer_cannot_create_workorder(self):
            """Test that customers cannot create work orders directly."""
            self.client.force_authenticate(user=self.customer_user)
            data = {
                'customer': self.customer.id,
                'vehicle': self.vehicle.id,
                'description': 'Regular maintenance',
                'status': 'draft'
            }
            response = self.client.post('/api/workorders/work-orders/', data)
            # This should be forbidden or return a different status based on your permissions
            self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED])


@pytest.mark.django_db
class TestWorkOrderWorkflow:
    """Test work order workflow and business logic."""

    def test_workorder_status_progression(self):
        """Test work order status progression logic."""
        workorder = baker.make(WorkOrder, status='draft')
        
        # Draft -> Scheduled
        workorder.status = 'scheduled'
        workorder.save()
        assert workorder.status == 'scheduled'
        
        # Scheduled -> In Progress
        workorder.status = 'in_progress'
        workorder.save()
        assert workorder.status == 'in_progress'
        
        # In Progress -> Completed
        workorder.status = 'completed'
        workorder.save()
        assert workorder.status == 'completed'

    def test_workorder_with_multiple_tasks(self):
        """Test work order with multiple service tasks."""
        workorder = baker.make(WorkOrder)
        tasks = baker.make(ServiceTask, work_order=workorder, _quantity=3)
        
        assert workorder.servicetask_set.count() == 3
        assert len(tasks) == 3

    def test_workorder_with_parts(self):
        """Test work order with parts."""
        workorder = baker.make(WorkOrder)
        part = baker.make(Part)
        workorder_part = baker.make(
            WorkOrderPart,
            work_order=workorder,
            part=part,
            quantity_used=2
        )
        
        assert workorder.workorderpart_set.count() == 1
        assert workorder_part.quantity_used == 2

    def test_technician_time_logging(self):
        """Test technician time logging."""
        workorder = baker.make(WorkOrder)
        technician = baker.make(User, role='technician')
        time_log = baker.make(
            TechnicianTimeLog,
            work_order=workorder,
            technician=technician,
            hours_worked=Decimal('3.5')
        )
        
        assert time_log.work_order == workorder
        assert time_log.technician == technician
        assert time_log.hours_worked == Decimal('3.5')


@pytest.mark.django_db
class TestWorkOrderCalculations:
    """Test work order financial calculations."""

    def test_labor_cost_calculation(self):
        """Test labor cost calculation."""
        workorder = baker.make(WorkOrder)
        task1 = baker.make(
            ServiceTask,
            work_order=workorder,
            estimated_hours=Decimal('2.0'),
            hourly_rate=Decimal('80.00')
        )
        task2 = baker.make(
            ServiceTask,
            work_order=workorder,
            estimated_hours=Decimal('1.5'),
            hourly_rate=Decimal('75.00')
        )
        
        total_labor = task1.estimated_cost + task2.estimated_cost
        expected_total = Decimal('160.00') + Decimal('112.50')
        assert total_labor == expected_total

    def test_parts_cost_calculation(self):
        """Test parts cost calculation."""
        workorder = baker.make(WorkOrder)
        part = baker.make(Part, selling_price=Decimal('25.00'))
        workorder_part = baker.make(
            WorkOrderPart,
            work_order=workorder,
            part=part,
            quantity_used=3,
            unit_price=part.selling_price
        )
        
        expected_cost = Decimal('75.00')  # 3 * 25.00
        assert workorder_part.total_cost == expected_cost

    def test_workorder_grand_total(self):
        """Test work order grand total calculation."""
        workorder = baker.make(
            WorkOrder,
            labor_total=Decimal('200.00'),
            parts_total=Decimal('150.00'),
            tax_amount=Decimal('35.00'),
            discount_amount=Decimal('20.00')
        )
        
        expected_total = Decimal('365.00')  # 200 + 150 + 35 - 20
        assert workorder.total_amount == expected_total


@pytest.mark.django_db
class TestWorkOrderSecurity:
    """Test work order security and permissions."""

    def test_workorder_customer_ownership(self):
        """Test that work order belongs to correct customer."""
        customer1 = baker.make(Customer)
        customer2 = baker.make(Customer)
        vehicle1 = baker.make(Vehicle, owner=customer1)
        vehicle2 = baker.make(Vehicle, owner=customer2)
        
        workorder1 = baker.make(WorkOrder, customer=customer1, vehicle=vehicle1)
        workorder2 = baker.make(WorkOrder, customer=customer2, vehicle=vehicle2)
        
        assert workorder1.customer == customer1
        assert workorder1.vehicle.owner == customer1
        assert workorder2.customer == customer2
        assert workorder2.vehicle.owner == customer2

    def test_technician_assignment(self):
        """Test technician assignment to work orders."""
        technician = baker.make(User, role='technician')
        workorder = baker.make(WorkOrder, primary_technician=technician)
        
        assert workorder.primary_technician == technician
        assert workorder.primary_technician.role == 'technician'
