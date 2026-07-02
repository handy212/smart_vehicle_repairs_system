from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.inventory.models import Part, PartCategory, Supplier, ServiceBundle, ServiceBundleItem
from apps.vehicles.models import ServiceType, Vehicle
from apps.customers.models import Customer
from apps.branches.models import Branch
from apps.workorders.job_type_seed import seed_workflow_profiles_and_job_types
from apps.workorders.models import WorkOrder, WorkOrderPart, WorkOrderNote
from apps.workorders.serializers import WorkOrderCreateSerializer, WorkOrderUpdateSerializer
from rest_framework.test import APIRequestFactory
from unittest import mock

User = get_user_model()

class ServiceBundleTests(TestCase):
    def setUp(self):
        seed_workflow_profiles_and_job_types(overwrite=True)
        # Create Basic Data
        self.user = User.objects.create_user(username='tech', email='tech@example.com', password='password', role='technician')
        self.branch = Branch.objects.create(name="Test Branch", code="TB", created_by=self.user)
        self.customer_user = User.objects.create_user(username='customer', email='customer@example.com', password='password', role='customer')
        self.customer = Customer.objects.create(user=self.customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer, 
            make="Toyota", 
            model="Corolla", 
            year=2020, 
            vin="1234567890ABCDEFG",
            current_mileage=10000
        )
        
        # Create ServiceType
        self.service_type = ServiceType.objects.create(name="Minor Service")
        
        # Create Parts
        self.category = PartCategory.objects.create(name="Fluids")
        self.supplier = Supplier.objects.create(name="AutoParts Inc")
        self.oil_filter = Part.objects.create(
            part_number="OF123", 
            name="Oil Filter", 
            category=self.category,
            cost_price=Decimal("10.00"),
            selling_price=Decimal("15.00"),
            quantity_in_stock=100
        )
        self.engine_oil = Part.objects.create(
            part_number="EO5W30", 
            name="Engine Oil 5W30", 
            category=self.category, 
            unit="L",
            cost_price=Decimal("5.00"),
            selling_price=Decimal("8.00"),
            quantity_in_stock=200
        )
        
        # Create Service Bundle
        self.bundle = ServiceBundle.objects.create(
            name="Available Minor Service Bundle",
            service_type=self.service_type,
            is_active=True
        )
        
        # Add items to bundle
        ServiceBundleItem.objects.create(bundle=self.bundle, part=self.oil_filter, quantity=1)
        ServiceBundleItem.objects.create(bundle=self.bundle, part=self.engine_oil, quantity=4.5)
        
    def test_apply_bundle_on_create(self):
        """Test that WorkOrderCreateSerializer applies parts from bundle"""
        
        data = {
            'work_order_number': 'WO-TEST-001',
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'branch': self.branch.id,
            'status': 'draft',
            'priority': 'normal',
            'maintenance_type': 'routine',
            'service_type': self.service_type.id,
            'estimated_completion': timezone.now() + timezone.timedelta(days=1),
            'customer_concerns': 'Routine checkup',
            'odometer_in': 10000
        }
        
        # Mock request context for user
        request = mock.Mock()
        request.user = self.user
        request.data = data
        request.GET = {}
        request.headers = {}
        request.META = {}
        request.session = {}
        
        serializer = WorkOrderCreateSerializer(data=data, context={'request': request})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        work_order = serializer.save()
        
        # Assertions
        self.assertEqual(work_order.parts.count(), 2)
        
        # Check specific parts
        oil_part = work_order.parts.get(part_number='EO5W30')
        self.assertEqual(oil_part.quantity, Decimal('4.50'))
        self.assertEqual(oil_part.unit_cost, Decimal('5.00'))
        
        filter_part = work_order.parts.get(part_number='OF123')
        self.assertEqual(filter_part.quantity, Decimal('1.00'))
        
        # Check Note
        note = WorkOrderNote.objects.filter(work_order=work_order, note_type='internal').first()
        self.assertIsNotNone(note)
        self.assertIn(self.bundle.name, note.note)

    def test_apply_bundle_on_update(self):
        """Test that WorkOrderUpdateSerializer applies parts when switching to routine"""
        
        # Create General WO
        work_order = WorkOrder.objects.create(
            work_order_number='WO-TEST-002',
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='draft',
            maintenance_type='general',
            customer_concerns='Noise',
            odometer_in=10000
        )
        
        self.assertEqual(work_order.parts.count(), 0)
        
        # Update to Routine
        data = {
            'maintenance_type': 'routine',
            'service_type': self.service_type.id
        }
        
        request = mock.Mock()
        request.user = self.user
        request.data = data
        request.GET = {}
        request.headers = {}
        request.META = {}
        request.session = {}
        
        serializer = WorkOrderUpdateSerializer(work_order, data=data, partial=True, context={'request': request})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated_wo = serializer.save()
        
        # Assertions
        self.assertEqual(updated_wo.parts.count(), 2)
        oil_part = updated_wo.parts.get(part_number='EO5W30')
        self.assertEqual(oil_part.quantity, Decimal('4.50'))

    def test_routine_fast_tracks_to_approved(self):
        """Routine check-in skips inspection/diagnosis and lands on approved."""
        data = {
            'work_order_number': 'WO-TEST-004',
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'branch': self.branch.id,
            'status': 'draft',
            'priority': 'normal',
            'maintenance_type': 'routine',
            'service_type': self.service_type.id,
            'service_bundle': self.bundle.id,
            'estimated_completion': timezone.now() + timezone.timedelta(days=1),
            'customer_concerns': 'Oil change service',
            'odometer_in': 10000,
        }

        request = mock.Mock()
        request.user = self.user
        request.data = data
        request.GET = {}
        request.headers = {}
        request.META = {}
        request.session = {}

        serializer = WorkOrderCreateSerializer(data=data, context={'request': request})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        work_order = serializer.save()

        work_order.refresh_from_db()
        self.assertEqual(work_order.status, 'approved')
        self.assertTrue(work_order.approved_by_customer)
        self.assertFalse(work_order.requires_approval)
        self.assertEqual(work_order.approval_method, 'routine_service')
        self.assertGreater(work_order.parts.count(), 0)
        self.assertTrue(work_order.tasks.filter(is_workflow_task=False).exists())

    def test_no_bundle_application_if_general(self):
        """Test that parts are NOT applied if maintenance_type is general"""
        
        data = {
            'work_order_number': 'WO-TEST-003',
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'branch': self.branch.id,
            'status': 'draft',
            'maintenance_type': 'general', 
            # Even if service type is somehow provided (though usually UI filters it, API might send it)
            'service_type': self.service_type.id,
            'customer_concerns': 'Broken mirror',
            'odometer_in': 10000
        }
        
        request = mock.Mock()
        request.user = self.user
        request.data = data
        request.GET = {}
        request.headers = {}
        request.META = {}
        request.session = {}
        
        serializer = WorkOrderCreateSerializer(data=data, context={'request': request})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        work_order = serializer.save()
        
        self.assertEqual(work_order.parts.count(), 0)
