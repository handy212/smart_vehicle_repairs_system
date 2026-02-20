from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from apps.accounts.models import User
from apps.inventory.models import PurchaseOrder, PurchaseOrderItem, Part, Supplier, PartCategory
from apps.notifications_app.models import Notification
from apps.branches.models import Branch

class PurchaseOrderFlowTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # Create users
        self.creator = User.objects.create_superuser(
            username='creator', email='creator@example.com', password='password123', role='admin'
        )
        self.approver = User.objects.create_superuser(
            username='approver', email='approver@example.com', password='password123', role='admin'
        )
        
        # Create branch
        self.branch = Branch.objects.create(name="Main Branch", code="MAIN", created_by=self.creator)
        
        # Create supplier and parts
        self.supplier = Supplier.objects.create(name="Test Supplier", supplier_code="SUP001")
        self.category = PartCategory.objects.create(name="Test Category")
        self.part = Part.objects.create(
            part_number="PART001",
            name="Test Part",
            category=self.category,
            quantity_in_stock=0,
            reorder_point=10,
            minimum_stock=5,
            unit="pcs",
            cost_price="10.00",
            selling_price="20.00"
        )
        
        # Helper to authenticate
        self.client.force_authenticate(user=self.creator)

    def test_purchase_order_full_flow_with_notification(self):
        """
        Test the complete PO lifecycle: Draft -> Pending (w/ Notification) -> Approved -> Confirmed -> Received
        """
        
        # 1. Create Draft PO
        po_data = {
            'supplier': self.supplier.id,
            'branch': self.branch.id,
            'order_date': timezone.now().date(),
            'notes': 'Test Order'
        }
        response = self.client.post(reverse('api_inventory:purchaseorder-list'), po_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        po_id = response.data['id']
        
        # Add Item to PO
        item_data = {
            'part': self.part.id,
            'quantity': 10,
            'unit_cost': '10.00'
        }
        
        response = self.client.post(reverse('api_inventory:purchaseorder-add-item', kwargs={'pk': po_id}), item_data)
        if response.status_code != 201:
            print(f"FAILED on add_item. URL: {reverse('api_inventory:purchaseorder-add-item', kwargs={'pk': po_id})}")
            print(f"Response: {response.content}")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        item_id = response.data['id']
        
        # Refresh PO and verify Draft state
        po = PurchaseOrder.objects.get(id=po_id)
        if po.items.exists():
            pass
        self.assertEqual(po.status, 'draft')
        self.assertEqual(po.total_items, 1)
        self.assertEqual(po.total, 100.00) # 10 * 10.00

        # 2. Submit for Approval with Approver Selection
        # Verify no notifications exist yet for approver
        self.assertEqual(Notification.objects.filter(recipient=self.approver).count(), 0)
        
        submit_data = {'approver_id': self.approver.id}
        response = self.client.post(reverse('api_inventory:purchaseorder-submit-for-approval', kwargs={'pk': po_id}), submit_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        po.refresh_from_db()
        self.assertEqual(po.status, 'pending_approval')
        self.assertEqual(po.assigned_approver, self.approver)
        
        # VERIFY NOTIFICATION
        notifications = Notification.objects.filter(recipient=self.approver, channel='in_app')
        self.assertEqual(notifications.count(), 1)
        notification = notifications.first()
        self.assertEqual(notification.notification_type, 'inventory')
        self.assertEqual(notification.title, f'Approval Required: PO {po.po_number}')
        self.assertIn(po.po_number, notification.message)
        self.assertIn("Test Supplier", notification.message)
        
        # 3. Approve PO
        self.client.force_authenticate(user=self.approver)
        
        response = self.client.post(reverse('api_inventory:purchaseorder-approve', kwargs={'pk': po_id}))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        po.refresh_from_db()
        self.assertEqual(po.status, 'approved')
        
        # 4. Confirm PO (Send to Supplier)
        response = self.client.post(reverse('api_inventory:purchaseorder-confirm', kwargs={'pk': po_id}))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        po.refresh_from_db()
        self.assertEqual(po.status, 'confirmed')
        
        # 5. Receive Items
        # NOTE: The view_file output showed `receive` as an action on PurchaseOrderViewSet, but typically receive is done on items?
        # Let's re-verify line 2166 of apps/inventory/views.py.
        # It was under PurchaseOrderItemViewSet (which I assumed based on context earlier but need to double check).
        # Wait, earlier grep showed line 2166. 
        # In `apps/inventory/urls.py`, PurchaseOrderItemViewSet is registered as 'po-items'.
        # So the URL name would be 'api_inventory:purchaseorderitem-receive' with detail=True implies pk of item.
        
        receive_data = {
            'quantity_received': 5,
            'notes': 'Partial Receipt'
        }
        
        response = self.client.post(reverse('api_inventory:purchaseorderitem-receive', kwargs={'pk': item_id}), receive_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        item = PurchaseOrderItem.objects.get(id=item_id)
        self.assertEqual(item.quantity_received, 5)
        self.assertEqual(item.remaining_quantity, 5)
        
        po.refresh_from_db()
        self.assertEqual(po.status, 'partially_received')
        
        # Receive remaining
        receive_data = {'quantity_received': 5}
        response = self.client.post(reverse('api_inventory:purchaseorderitem-receive', kwargs={'pk': item_id}), receive_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        po.refresh_from_db()
        self.assertEqual(po.status, 'received')
        
        print(f"\nSUCCESS: Verified Flow Draft -> Pending (Notified {self.approver.username}) -> Approved -> Confirmed -> Received")

