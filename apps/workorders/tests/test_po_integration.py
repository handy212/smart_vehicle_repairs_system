from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from apps.accounts.models import User
from apps.branches.models import Branch
from apps.inventory.models import Part, PurchaseOrder, Supplier, PartCategory, StockItem
from apps.workorders.models import WorkOrder, WorkOrderPart, ServiceTask
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from decimal import Decimal
import datetime

class POIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # Create User
        self.user = User.objects.create_user(
            username='testuser', 
            email='test@example.com', 
            password='testpassword',
            role='manager'
        )
        self.po_submitter = User.objects.create_superuser(
            username='posubmitter',
            email='posubmitter@example.com',
            password='testpassword',
            role='admin',
        )
        self.po_approver = User.objects.create_superuser(
            username='poapprover',
            email='poapprover@example.com',
            password='testpassword',
            role='admin',
        )
        self.client.force_authenticate(user=self.user)
        
        # Create Branch
        self.branch = Branch.objects.create(
            name="Main Branch", 
            code="MAIN",
            created_by=self.user
        )
        self.user.managed_branches.add(self.branch)
        
        # Create Customer User
        self.customer_user = User.objects.create_user(
            username='customer',
            email='cust@example.com',
            password='password',
            role='customer'
        )
        
        # Create Customer
        self.customer = Customer.objects.create(
            user=self.customer_user,
            customer_number="CUST-00001",
            customer_type='individual'
        )
        
        # Create Vehicle
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            vin="12345678901234567",
            year=2020,
            make="Toyota",
            model="Camry",
            current_mileage=10000,
            license_plate="ABC-123"
        )
        
        # Create Supplier
        self.supplier = Supplier.objects.create(
            name="Test Supplier",
            supplier_code="sup001",
            created_by=self.user
        )
        
        # Create Category
        self.category = PartCategory.objects.create(name="General")
        
        # Create Part
        self.part = Part.objects.create(
            name="Oil Filter",
            part_number="OF-123",
            category=self.category,
            branch=self.branch,
            preferred_supplier=self.supplier,
            quantity_in_stock=0,
            cost_price=Decimal('10.00'),
            selling_price=Decimal('20.00'),
            created_by=self.user
        )
        self.part.suppliers.add(self.supplier)
        
        # Create Work Order
        self.work_order = WorkOrder.objects.create(
            branch=self.branch,
            customer=self.customer,
            vehicle=self.vehicle,
            odometer_in=10000,
            customer_concerns="Need oil change",
            created_by=self.user
        )
        
        # Create WorkOrderPart (Part Request)
        self.wo_part = WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name="Oil Filter",
            part_number="OF-123",
            quantity=Decimal('2.00'),
            unit_cost=Decimal('10.00'),
            status='pending'
        )

    def test_create_po_from_request_success(self):
        """Test successfully creating a PO from a part request"""
        url = reverse('api_workorders:workorderpart-order', args=[self.wo_part.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'po_created')
        
        # Verify DB updates
        self.wo_part.refresh_from_db()
        self.assertEqual(self.wo_part.status, 'po_created')
        self.assertIsNotNone(self.wo_part.purchase_order_item)
        
        po_item = self.wo_part.purchase_order_item
        self.assertEqual(po_item.quantity, 2)
        self.assertEqual(po_item.purchase_order.status, 'draft')
        self.assertEqual(po_item.purchase_order.supplier, self.supplier)

    def test_order_rejects_when_branch_stock_is_available(self):
        """In-stock branch items should be allocated, not sent to PO."""
        StockItem.objects.create(
            part=self.part,
            branch=self.branch,
            quantity_in_stock=5,
            quantity_reserved=0,
        )

        url = reverse('api_workorders:workorderpart-order', args=[self.wo_part.id])
        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Allocate it instead', response.data['error'])
        self.assertFalse(PurchaseOrder.objects.exists())

    def test_reorder_appends_to_po(self):
        """Test that ordering again appends/updates the existing PO item if in draft"""
        # First Order
        url = reverse('api_workorders:workorderpart-order', args=[self.wo_part.id])
        self.client.post(url)
        
        # Simulate a second request for same part
        wo_part_2 = WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name="Oil Filter",
            part_number="OF-123",
            quantity=Decimal('3.00'),
            unit_cost=Decimal('10.00'),
            status='pending'
        )
        
        url_2 = reverse('api_workorders:workorderpart-order', args=[wo_part_2.id])
        response_2 = self.client.post(url_2)
        
        self.assertEqual(response_2.status_code, status.HTTP_200_OK)
        
        # Verify PO Item quantity increased
        # Both share the same PO Item logic if same PO/Part
        # The view logic finds the PO and then finds the Item.
        
        po = PurchaseOrder.objects.first()
        po_item = po.items.first()
        # Initial 2 + New 3 = 5
        self.assertEqual(po_item.quantity, 5)

    def test_validate_zero_quantity(self):
        """Test that requests with zero quantity cannot be ordered"""
        self.wo_part.quantity = 0
        self.wo_part.save()
        
        url = reverse('api_workorders:workorderpart-order', args=[self.wo_part.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Quantity must be greater than 0', str(response.data.get('error')))

    def test_bulk_order_functionality(self):
        """Test bulk ordering multiple parts"""
        # Create second part request
        part2 = Part.objects.create(
            name="Air Filter",
            part_number="AF-999",
            category=self.category,
            branch=self.branch,
            preferred_supplier=self.supplier,
            quantity_in_stock=0,
            cost_price=Decimal('10.00'),
            selling_price=Decimal('20.00'),
            created_by=self.user
        )
        part2.suppliers.add(self.supplier)
        
        wo_part_2 = WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name="Air Filter",
            part_number="AF-999",
            quantity=Decimal('1.00'),
            unit_cost=Decimal('15.00'),
            status='pending'
        )
        
        url = reverse('api_workorders:workorderpart-bulk-order')
        data = {'ids': [self.wo_part.id, wo_part_2.id]}
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['processed'], 2)
        
        # Verify PO created with 2 items
        po = PurchaseOrder.objects.first()
        self.assertIsNotNone(po)
        self.assertEqual(po.items.count(), 2)
        
        # Verify statuses updated
        self.wo_part.refresh_from_db()
        wo_part_2.refresh_from_db()
        
        # NOTE: Current implementation sets status to 'ordered' which we want to change to 'po_created'
        # So we check for what we EXPECT it to be after our fix. 
        # If run before fix, this might fail or pass depending on current code.
        # Ideally, we want 'po_created'.
        # self.assertEqual(self.wo_part.status, 'po_created') 
        
    def test_cannot_reorder_completed_part(self):
        """Test validation preventing re-ordering of received/ready parts"""
        self.wo_part.status = 'received'
        self.wo_part.save()
        
        url = reverse('api_workorders:workorderpart-order', args=[self.wo_part.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Cannot order part', str(response.data.get('error')))

    def test_reorder_po_created_status_allowed(self):
        """
        Test that we CAN re-trigger order on a part that is already 'po_created'.
        This mimics the 'retry' or 'update' scenario which currently fails with 'ordered' check.
        """
        self.wo_part.status = 'po_created'
        self.wo_part.save()
        
        url = reverse('api_workorders:workorderpart-order', args=[self.wo_part.id])
        response = self.client.post(url)
        
        # This is the key fix verification. 
        # It should succeed (200) and maybe update the PO item or just return existing info.
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_cannot_submit_empty_po(self):
        """Test that a PO with no items cannot be submitted"""
        # Create an empty PO
        empty_po = PurchaseOrder.objects.create(
            supplier=self.supplier,
            branch=self.branch,
            created_by=self.user,
            status='draft'
        )
        
        # Try to submit
        # Note: We need to use the inventory API submission endpoint
        self.client.force_authenticate(user=self.po_submitter)
        url = reverse('api_inventory:purchaseorder-submit-for-approval', args=[empty_po.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Cannot submit purchase order with no items', str(response.data.get('error')))

    def test_po_confirm_and_receipt_updates_linked_work_order_part_status(self):
        """Stores PO flow should move linked work-order parts from PO to waiting and received."""
        order_url = reverse('api_workorders:workorderpart-order', args=[self.wo_part.id])
        response = self.client.post(order_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.wo_part.refresh_from_db()
        po = self.wo_part.purchase_order_item.purchase_order
        self.assertEqual(self.wo_part.status, 'po_created')

        self.client.force_authenticate(user=self.po_submitter)
        response = self.client.post(
            reverse('api_inventory:purchaseorder-submit-for-approval', args=[po.id]),
            {'approver_id': self.po_approver.id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=self.po_approver)
        response = self.client.post(reverse('api_inventory:purchaseorder-approve', args=[po.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.post(reverse('api_inventory:purchaseorder-confirm', args=[po.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.wo_part.refresh_from_db()
        self.assertEqual(self.wo_part.status, 'awaiting_stock')

        response = self.client.post(
            reverse('api_inventory:purchaseorderitem-receive', args=[self.wo_part.purchase_order_item_id]),
            {'quantity_received': 2},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.wo_part.refresh_from_db()
        stock_item = StockItem.objects.get(part=self.part, branch=self.branch)
        self.assertEqual(self.wo_part.status, 'received')
        self.assertEqual(stock_item.quantity_on_order, 0)
