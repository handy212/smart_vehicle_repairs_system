from django.test import TestCase
from django.contrib.auth import get_user_model
from apps.notifications_app.triggers import NotificationTriggers
from apps.notifications_app.triggers import NotificationTriggers
from apps.notifications_app.models import Notification, NotificationTemplate
from apps.inventory.models import PurchaseOrder, Transfer, Part, Supplier, PartCategory
from apps.branches.models import Branch

User = get_user_model()

class NotificationTriggersTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='password123',
            role='manager'
        )
        self.supplier = Supplier.objects.create(name='Test Supplier', created_by=self.user)
        self.branch1 = Branch.objects.create(name='Branch 1', code='BR1', created_by=self.user)
        self.branch2 = Branch.objects.create(name='Branch 2', code='BR2', created_by=self.user)
        
        self.category = PartCategory.objects.create(name='Test Category')
        
        self.part = Part.objects.create(
            part_number='PART001',
            name='Test Part',
            category=self.category,
            quantity_in_stock=5,
            reorder_point=10,
            cost_price=10.00,
            selling_price=15.00
        )
        
        self.triggers = NotificationTriggers()
        
        # Create templates
        NotificationTemplate.objects.create(
            template_type='purchase_order_approval',
            channel='email',
            name='PO Approval',
            subject='PO Approval {po_number}',
            body='Please approve PO {po_number}.'
        )
        NotificationTemplate.objects.create(
            template_type='stock_transfer_approval',
            channel='email',
            name='Transfer Approval',
            subject='Transfer Approval {transfer_number}',
            body='Please approve transfer {transfer_number}.'
        )
        NotificationTemplate.objects.create(
            template_type='low_stock_alert',
            channel='in_app',
            name='Low Stock',
            push_title='Low Stock: {part_name}',
            push_body='Part {part_name} is low.'
        )

    def test_purchase_order_approval_request(self):
        po = PurchaseOrder.objects.create(
            po_number='PO-1001',
            supplier=self.supplier,
            created_by=self.user,
            total=100.00
        )
        
        self.triggers.purchase_order_approval_request(po, self.user)
        
        # Check notifications
        notifications = Notification.objects.filter(recipient=self.user, related_object_id=po.id)
        self.assertEqual(notifications.count(), 2) # Email and In-App
        
        email_notif = notifications.filter(channel='email').first()
        self.assertIsNotNone(email_notif)
        self.assertEqual(email_notif.title, 'PO Approval PO-1001')
        self.assertIn('PO-1001', email_notif.message)
        
        in_app_notif = notifications.filter(channel='in_app').first()
        self.assertIsNotNone(in_app_notif)
        self.assertEqual(in_app_notif.title, 'PO Approval PO-1001')

    def test_stock_transfer_approval_request(self):
        transfer = Transfer.objects.create(
            transfer_number='TR-1001',
            source_branch=self.branch1,
            destination_branch=self.branch2,
            created_by=self.user
        )
        
        self.triggers.stock_transfer_approval_request(transfer, self.user)
        
        # Check notifications
        notifications = Notification.objects.filter(recipient=self.user, related_object_id=transfer.id)
        self.assertEqual(notifications.count(), 2) # Email and In-App
        
        email_notif = notifications.filter(channel='email').first()
        self.assertIsNotNone(email_notif)
        self.assertEqual(email_notif.title, 'Transfer Approval TR-1001')
        self.assertIn('TR-1001', email_notif.message)
        
    def test_low_stock_alert(self):
        self.triggers.low_stock_alert(self.part, self.user)
        
        notifications = Notification.objects.filter(recipient=self.user, related_object_id=self.part.id)
        self.assertEqual(notifications.count(), 1)
        
        notif = notifications.first()
        self.assertEqual(notif.channel, 'in_app')
        self.assertEqual(notif.title, 'Low Stock: Test Part')
        self.assertIn('Test Part', notif.message)
