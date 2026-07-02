from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.notifications_app.models import Notification, NotificationPreference
from apps.notifications_app.services import NotificationService
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder

User = get_user_model()


class WorkOrderWorkflowNotificationTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username='wf_manager',
            email='wf.manager@example.com',
            password='password123',
            role='manager',
        )
        self.branch = Branch.objects.create(
            name='Workflow Branch',
            code='WFB',
            created_by=self.manager,
        )
        self.customer_user = User.objects.create_user(
            username='wf_customer',
            email='wf.customer@example.com',
            password='password123',
            role='customer',
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='WF-001',
            current_mileage=10000,
            engine_type='gasoline',
            transmission_type='automatic',
        )
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            created_by=self.manager,
            odometer_in=10000,
            customer_concerns='Brake noise',
            status='draft',
            work_order_number='WO-WF-001',
        )
        Notification.objects.all().delete()

    def test_inspection_status_creates_staff_notification(self):
        self.work_order.status = 'inspection'
        self.work_order.save(update_fields=['status'])

        self.assertTrue(
            Notification.objects.filter(
                notification_type='work_order',
                related_object_id=self.work_order.id,
                title__icontains='Inspection Started',
            ).exists()
        )

    def test_quality_check_status_creates_notification(self):
        self.work_order.status = 'quality_check'
        self.work_order.save(update_fields=['status'])

        self.assertTrue(
            Notification.objects.filter(
                notification_type='work_order',
                related_object_id=self.work_order.id,
                title__icontains='Quality Check Requested',
            ).exists()
        )

    @patch('apps.notifications_app.services.NotificationService._send_web_push')
    def test_in_app_delivery_mirrors_web_push_when_enabled(self, mock_web_push):
        user = User.objects.create_user(
            username='wf_tech',
            email='wf.tech@example.com',
            password='password123',
            role='technician',
        )
        NotificationPreference.objects.create(user=user, push_enabled=True, in_app_enabled=True)
        notification = Notification.objects.create(
            recipient=user,
            notification_type='work_order',
            channel='in_app',
            priority='normal',
            title='Test',
            message='Body',
            data={'work_order_id': self.work_order.id},
            related_object_type='work_order',
            related_object_id=self.work_order.id,
        )

        service = NotificationService()
        self.assertTrue(service.send_notification(notification, force_sync=True))
        mock_web_push.assert_called_once()
