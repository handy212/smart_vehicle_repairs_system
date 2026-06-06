from datetime import date, time, timedelta
from decimal import Decimal
from unittest.mock import patch
from io import StringIO

from django.core.management import call_command

from django.test import TestCase
from django.test import override_settings
from django.contrib.auth import get_user_model
from apps.notifications_app.triggers import NotificationTriggers
from apps.notifications_app.triggers import NotificationTriggers
from apps.notifications_app.models import Notification, NotificationTemplate
from apps.inventory.models import PurchaseOrder, Transfer, Part, Supplier, PartCategory
from apps.branches.models import Branch
from apps.appointments.models import Appointment
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.vehicles.models import VehicleServiceSchedule, ServiceType
from apps.billing.models import Invoice
from apps.notifications_app.models import NotificationPreference

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


class AppointmentReminderTriggerTest(TestCase):
    def setUp(self):
        self.staff_user = User.objects.create_user(
            username='staff',
            email='staff@example.com',
            password='password123',
            role='manager',
        )
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MBR',
            created_by=self.staff_user,
        )
        self.customer_user = User.objects.create_user(
            username='customer',
            email='customer@example.com',
            password='password123',
            role='customer',
            phone='233244123456',
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Corolla',
            year=2022,
            vin='1HGBH41JXMN109187',
            license_plate='REM123',
            current_mileage=12000,
            engine_type='gasoline',
            transmission_type='automatic',
        )
        self.appointment = Appointment.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            appointment_date=date.today() + timedelta(days=2),
            appointment_time=time(10, 30),
            service_type='maintenance',
            customer_concerns='Brake inspection and oil change',
            created_by=self.staff_user,
        )
        self.triggers = NotificationTriggers()

    @patch('apps.notifications_app.services.NotificationService.send_notification')
    def test_appointment_reminder_sms_uses_customer_concerns(self, mock_send_notification):
        mock_send_notification.return_value = True

        self.triggers.appointment_reminder(self.appointment, channel='sms')

        notification = Notification.objects.get(
            related_object_type='appointment',
            related_object_id=self.appointment.id,
            channel='sms',
        )
        self.assertEqual(notification.notification_type, 'appointment')
        self.assertIn('Brake inspection', notification.message)
        mock_send_notification.assert_called_once()


class ServiceReminderTriggerTest(TestCase):
    def setUp(self):
        self.staff_user = User.objects.create_user(
            username='service_staff',
            email='service.staff@example.com',
            password='password123',
            role='manager',
        )
        self.branch = Branch.objects.create(
            name='Service Branch',
            code='SRV',
            created_by=self.staff_user,
        )
        self.customer_user = User.objects.create_user(
            username='service_customer',
            email='service.customer@example.com',
            password='password123',
            role='customer',
            phone='233244123456',
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Nissan',
            model='Altima',
            year=2021,
            vin='1N4AL3AP7JC123456',
            license_plate='SRV123',
            current_mileage=18000,
            engine_type='gasoline',
            transmission_type='automatic',
        )
        self.service_type = ServiceType.objects.create(
            name='Oil Change',
            default_interval_months=6,
            default_interval_miles=5000,
            created_by=self.staff_user,
        )
        self.schedule = VehicleServiceSchedule.objects.create(
            vehicle=self.vehicle,
            service_type=self.service_type,
            last_service_date=date.today() - timedelta(days=180),
            last_service_mileage=13000,
            next_service_due_date=date.today() + timedelta(days=3),
            next_service_due_mileage=18000,
            is_active=True,
        )
        self.triggers = NotificationTriggers()

    @patch('apps.notifications_app.services.NotificationService.send_notification')
    def test_service_due_sms(self, mock_send_notification):
        mock_send_notification.return_value = True

        self.triggers.service_due_reminder(self.schedule, channel='sms')

        notification = Notification.objects.get(
            related_object_type='service_schedule',
            related_object_id=self.schedule.id,
            channel='sms',
        )
        self.assertEqual(notification.notification_type, 'vehicle')
        self.assertIn('Service Reminder', notification.message)
        mock_send_notification.assert_called_once()


class InvoiceReminderTriggerTest(TestCase):
    def setUp(self):
        self.staff_user = User.objects.create_user(
            username='invoice_staff',
            email='invoice.staff@example.com',
            password='password123',
            role='manager',
        )
        self.customer_user = User.objects.create_user(
            username='invoice_customer',
            email='invoice.customer@example.com',
            password='password123',
            role='customer',
            phone='233244123456',
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Hyundai',
            model='Elantra',
            year=2020,
            vin='5NPD84LF8LH123456',
            license_plate='INV123',
            current_mileage=45000,
            engine_type='gasoline',
            transmission_type='automatic',
        )
        with patch('apps.billing.work_order_invoices.notify_invoice_ready_if_needed'):
            self.due_soon_invoice = Invoice.objects.create(
                customer=self.customer,
                vehicle=self.vehicle,
                status='draft',
                due_date=date.today() + timedelta(days=2),
                total=Decimal('120.00'),
                amount_paid=Decimal('0.00'),
                created_by=self.staff_user,
            )
            self.overdue_invoice = Invoice.objects.create(
                customer=self.customer,
                vehicle=self.vehicle,
                status='draft',
                due_date=date.today() - timedelta(days=1),
                total=Decimal('240.00'),
                amount_paid=Decimal('0.00'),
                created_by=self.staff_user,
            )
        self.triggers = NotificationTriggers()

    @patch('apps.notifications_app.services.NotificationService.send_notification')
    def test_invoice_due_soon_sms_creates_sms_notification(self, mock_send_notification):
        mock_send_notification.return_value = True

        self.triggers.invoice_due_soon(self.due_soon_invoice, days_until_due=2, channel='sms')

        notification = Notification.objects.get(
            related_object_type='invoice',
            related_object_id=self.due_soon_invoice.id,
            channel='sms',
        )
        self.assertEqual(notification.notification_type, 'invoice')
        self.assertIn('Invoice', notification.message)
        self.assertIn('due in 2 days', notification.message)
        mock_send_notification.assert_called_once()

    @patch('apps.notifications_app.services.NotificationService.send_notification')
    def test_invoice_overdue_sms_creates_sms_notification(self, mock_send_notification):
        mock_send_notification.return_value = True

        self.triggers.invoice_overdue(self.overdue_invoice, channel='sms')

        notification = Notification.objects.get(
            related_object_type='invoice',
            related_object_id=self.overdue_invoice.id,
            channel='sms',
        )
        self.assertEqual(notification.notification_type, 'invoice')
        self.assertIn('OVERDUE', notification.message)
        mock_send_notification.assert_called_once()
