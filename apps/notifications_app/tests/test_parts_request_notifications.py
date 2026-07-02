from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.notifications_app.models import Notification
from apps.notifications_app.triggers import NotificationTriggers
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder, WorkOrderPart

User = get_user_model()


class PartsRequestNotificationTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username='stores_manager',
            email='stores.manager@example.com',
            password='password123',
            role='manager',
        )
        self.parts_manager = User.objects.create_user(
            username='parts_mgr',
            email='parts.mgr@example.com',
            password='password123',
            role='parts_manager',
        )
        self.technician = User.objects.create_user(
            username='tech_parts',
            email='tech.parts@example.com',
            password='password123',
            role='technician',
        )
        self.branch = Branch.objects.create(
            name='Parts Branch',
            code='PB',
            created_by=self.manager,
        )
        self.manager.branch = self.branch
        self.manager.save(update_fields=['branch'])
        self.parts_manager.branch = self.branch
        self.parts_manager.save(update_fields=['branch'])
        self.technician.branch = self.branch
        self.technician.save(update_fields=['branch'])

        self.customer_user = User.objects.create_user(
            username='parts_customer',
            email='parts.customer@example.com',
            password='password123',
            role='customer',
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Honda',
            model='Civic',
            year=2021,
            vin='1HGCM82633A123456',
            license_plate='PRT-001',
            current_mileage=12000,
            engine_type='gasoline',
            transmission_type='automatic',
        )
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            created_by=self.manager,
            odometer_in=12000,
            customer_concerns='Brake pads',
            status='diagnosis',
            work_order_number='WO-PARTS-001',
        )
        Notification.objects.all().delete()
        self.triggers = NotificationTriggers()

    def test_draft_part_request_does_not_notify_stores(self):
        WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name='Brake pad',
            quantity=Decimal('2'),
            status='draft',
            requested_by=self.technician,
        )
        self.assertFalse(
            Notification.objects.filter(
                recipient=self.parts_manager,
                notification_type='inventory',
            ).exists()
        )

    def test_pending_part_request_notifies_stores(self):
        self.triggers.part_requisition_created(
            WorkOrderPart.objects.create(
                work_order=self.work_order,
                part_name='Brake pad',
                quantity=Decimal('2'),
                status='pending',
                requested_by=self.technician,
            )
        )
        notifications = Notification.objects.filter(recipient=self.parts_manager)
        self.assertGreaterEqual(notifications.count(), 2)
        self.assertTrue(notifications.filter(channel='in_app').exists())
        self.assertTrue(notifications.filter(channel='email').exists())
        sample = notifications.first()
        self.assertIn('parts-requests', sample.data.get('url', ''))

    def test_batch_parts_submission_notifies_stores(self):
        count = self.triggers.parts_requests_submitted_to_stores(
            self.work_order,
            requested_by=self.technician,
            parts_count=3,
            diagnosis_id=99,
            source='recommendations_quote',
        )
        self.assertGreater(count, 0)
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.parts_manager,
                title__icontains='Parts requested',
            ).exists()
        )

    def test_part_ready_notifies_technician(self):
        part = WorkOrderPart.objects.create(
            work_order=self.work_order,
            part_name='Brake pad',
            quantity=Decimal('2'),
            status='ready',
            requested_by=self.technician,
        )
        Notification.objects.all().delete()
        self.triggers.part_requisition_ready(part, fulfillment='allocated')
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.technician,
                title__icontains='Part ready',
            ).exists()
        )
