from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient
from apps.inventory.models import Part, PartCategory, StockItem, Transfer, TransferApproval, InventoryTransaction
from apps.branches.models import Branch
from apps.inventory.services import InventoryService

User = get_user_model()

class TransferServiceTests(TestCase):
    def setUp(self):
        # Create User
        self.user = User.objects.create_user(username='testuser', email='testuser@example.com', password='password', role='admin')
        self.approver = User.objects.create_user(username='approver', email='approver@example.com', password='password', role='manager')
        self.second_approver = User.objects.create_user(username='approver2', email='approver2@example.com', password='password', role='manager')
        
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
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

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

    def test_submit_transfer_requires_valid_distinct_approver(self):
        transfer = InventoryService.initiate_transfer(
            source_branch=self.branch_a,
            destination_branch=self.branch_b,
            items=[{'part_id': self.part.id, 'quantity': 5}],
            user=self.user
        )

        with self.assertRaisesMessage(ValueError, "Select an approver before submitting this transfer"):
            InventoryService.submit_transfer_for_approval(transfer, approver=None, user=self.user)

        with self.assertRaisesMessage(ValueError, "Transfers must be approved by someone other than the submitter"):
            InventoryService.submit_transfer_for_approval(transfer, approver=self.user, user=self.user)

        self.user.role = 'technician'
        with self.assertRaisesMessage(ValueError, "Selected approver must be a manager, admin, or parts manager"):
            InventoryService.submit_transfer_for_approval(transfer, approver=self.user, user=self.approver)

    def test_transfer_requires_all_selected_approvers_before_reserving_stock(self):
        transfer = InventoryService.initiate_transfer(
            source_branch=self.branch_a,
            destination_branch=self.branch_b,
            items=[{'part_id': self.part.id, 'quantity': 7}],
            user=self.user
        )

        InventoryService.submit_transfer_for_approval(
            transfer,
            approvers=[self.approver, self.second_approver],
            user=self.user,
        )
        transfer.refresh_from_db()
        self.assertEqual(transfer.status, 'pending_approval')
        self.assertEqual(transfer.assigned_approver, self.approver)
        self.assertEqual(TransferApproval.objects.filter(transfer=transfer).count(), 2)

        InventoryService.approve_transfer(transfer, user=self.approver)
        transfer.refresh_from_db()
        self.stock_a.refresh_from_db()
        self.assertEqual(transfer.status, 'pending_approval')
        self.assertEqual(self.stock_a.quantity_reserved, 0)
        self.assertEqual(transfer.approvals.get(approver=self.approver).status, 'approved')

        InventoryService.approve_transfer(transfer, user=self.second_approver)
        transfer.refresh_from_db()
        self.stock_a.refresh_from_db()
        self.assertEqual(transfer.status, 'approved')
        self.assertEqual(self.stock_a.quantity_reserved, 7)
        self.assertEqual(transfer.approvals.filter(status='approved').count(), 2)

    def test_transfer_api_crud_for_draft_transfer(self):
        response = self.client.post(reverse('api_inventory:transfer-list'), {
            'source_branch': self.branch_a.id,
            'destination_branch': self.branch_b.id,
            'notes': 'Move fasteners',
            'items': [{'part_id': self.part.id, 'quantity': 3}],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        transfer_id = response.data['id']

        response = self.client.get(reverse('api_inventory:transfer-detail', kwargs={'pk': transfer_id}))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['notes'], 'Move fasteners')
        self.assertEqual(len(response.data['items']), 1)

        response = self.client.patch(
            reverse('api_inventory:transfer-detail', kwargs={'pk': transfer_id}),
            {'notes': 'Move fasteners urgently'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['notes'], 'Move fasteners urgently')

        response = self.client.delete(reverse('api_inventory:transfer-detail', kwargs={'pk': transfer_id}))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Transfer.objects.filter(id=transfer_id).exists())

    def test_transfer_delete_rejects_inventory_impacting_statuses(self):
        transfer = InventoryService.initiate_transfer(
            source_branch=self.branch_a,
            destination_branch=self.branch_b,
            items=[{'part_id': self.part.id, 'quantity': 3}],
            user=self.user
        )
        InventoryService.submit_transfer_for_approval(transfer, approver=self.approver, user=self.user)
        InventoryService.approve_transfer(transfer, user=self.approver)

        response = self.client.delete(reverse('api_inventory:transfer-detail', kwargs={'pk': transfer.id}))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Transfer.objects.filter(id=transfer.id).exists())
