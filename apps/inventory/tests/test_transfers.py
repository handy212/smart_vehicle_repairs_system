from django.test import TestCase
from django.contrib.auth import get_user_model
from apps.inventory.models import Part, PartCategory, StockItem, Transfer, InventoryTransaction
from apps.branches.models import Branch
from apps.inventory.services import InventoryService

User = get_user_model()

class TransferServiceTests(TestCase):
    def setUp(self):
        # Create User
        self.user = User.objects.create_user(username='testuser', email='testuser@example.com', password='password')
        self.approver = User.objects.create_user(username='approver', email='approver@example.com', password='password', role='manager')
        
        # Create Branches
        self.branch_a = Branch.objects.create(name='Branch A', code='BRA', address='123 Main St', created_by=self.user)
        self.branch_b = Branch.objects.create(name='Branch B', code='BRB', address='456 Second St', created_by=self.user)
        
        # Create Category and Part
        self.category = PartCategory.objects.create(name='Test Category')
        self.part = Part.objects.create(
            part_number='TEST-PART-001',
            name='Test Part',
            category=self.category,
            cost_price=10.00,
            selling_price=20.00
        )
        
        # Add initial stock to Branch A
        InventoryService.record_transaction(
            part=self.part,
            quantity=100,
            transaction_type='adjustment',
            branch=self.branch_a,
            user=self.user,
            reason='Initial Stock'
        )
        
        # Verify initial stock
        self.stock_a = StockItem.objects.get(part=self.part, branch=self.branch_a)
        self.assertEqual(self.stock_a.quantity_in_stock, 100)

    def test_full_transfer_lifecycle(self):
        """Test the full lifecycle of a transfer: Draft -> Submit -> Approve -> Ship -> Receive"""
        
        # 1. Initiate Transfer (Branch A -> Branch B, 10 units)
        items = [{'part_id': self.part.id, 'quantity': 10}]
        transfer = InventoryService.initiate_transfer(
            source_branch=self.branch_a,
            destination_branch=self.branch_b,
            items=items,
            user=self.user,
            notes='Test Transfer'
        )
        
        self.assertEqual(transfer.status, 'draft')
        self.assertEqual(transfer.items.count(), 1)
        self.assertEqual(transfer.items.first().quantity_requested, 10)
        
        # 2. Submit for Approval
        InventoryService.submit_transfer_for_approval(transfer, approver=self.approver, user=self.user)
        self.assertEqual(transfer.status, 'pending_approval')
        self.assertEqual(transfer.assigned_approver, self.approver)
        self.assertTrue(transfer.submitted_at is not None)
        
        # 3. Approve Transfer
        # Should reserve stock at Branch A
        InventoryService.approve_transfer(transfer, user=self.approver)
        
        self.stock_a.refresh_from_db()
        self.assertEqual(self.stock_a.quantity_reserved, 10)
        self.assertEqual(self.stock_a.available_quantity, 90) # 100 - 10
        self.assertEqual(transfer.status, 'approved')
        self.assertTrue(transfer.approved_date is not None)
        
        # 3. Ship Transfer
        # Should release reservation and deduct stock at Branch A
        InventoryService.ship_transfer(transfer, user=self.user)
        
        self.stock_a.refresh_from_db()
        self.assertEqual(self.stock_a.quantity_reserved, 0)
        self.assertEqual(self.stock_a.quantity_in_stock, 90) # 100 - 10 removed
        self.assertEqual(transfer.status, 'in_transit')
        
        # Verify Transfer Item status
        transfer_item = transfer.items.first()
        self.assertEqual(transfer_item.quantity_sent, 10)
        
        # 4. Receive Transfer
        # Should add stock at Branch B
        items_received = {self.part.id: 10}
        InventoryService.receive_transfer(transfer, items_received, user=self.user)
        
        self.stock_b = StockItem.objects.get(part=self.part, branch=self.branch_b)
        self.assertEqual(self.stock_b.quantity_in_stock, 10)
        self.assertEqual(transfer.status, 'received')
        
        # Verify transactions exist
        # 1 adjustment + 1 reserve + 1 release + 1 transfer (out) + 1 transfer (in)
        transactions = InventoryTransaction.objects.filter(part=self.part)
        self.assertEqual(transactions.count(), 5)

    def test_transfer_rejection(self):
        """Test rejecting a transfer"""
        items = [{'part_id': self.part.id, 'quantity': 5}]
        transfer = InventoryService.initiate_transfer(
            source_branch=self.branch_a,
            destination_branch=self.branch_b,
            items=items,
            user=self.user
        )
        
        InventoryService.submit_transfer_for_approval(transfer, approver=self.approver, user=self.user)
        self.assertEqual(transfer.status, 'pending_approval')
        
        reason = 'Not needed right now'
        InventoryService.reject_transfer(transfer, reason=reason, user=self.approver)
        
        self.assertEqual(transfer.status, 'rejected')
        self.assertEqual(transfer.rejection_reason, reason)
        self.assertEqual(transfer.rejected_by, self.approver)
        self.assertTrue(transfer.rejected_at is not None)
        
        # Verify no stock was reserved
        self.stock_a.refresh_from_db()
        self.assertEqual(self.stock_a.quantity_reserved, 0)
