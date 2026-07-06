from datetime import date, timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from apps.accounts.models import User
from apps.billing.models import Invoice
from apps.customers.models import Customer


class SendInvoiceRemindersCommandTests(TestCase):
    def setUp(self):
        self.staff_user = User.objects.create_user(
            username='invoice-reminder-staff',
            email='invoice.reminder.staff@example.com',
            password='password123',
            role='manager',
        )
        self.customer_user = User.objects.create_user(
            username='invoice-reminder-customer',
            email='invoice.reminder.customer@example.com',
            password='password123',
            role='customer',
        )
        self.customer = Customer.objects.create(user=self.customer_user)

        self.due_soon_invoice = Invoice.objects.create(
            customer=self.customer,
            status='draft',
            due_date=date.today() + timedelta(days=2),
            total=Decimal('150.00'),
            amount_paid=Decimal('0.00'),
            created_by=self.staff_user,
        )
        Invoice.objects.filter(pk=self.due_soon_invoice.pk).update(status='sent')

        self.overdue_invoice = Invoice.objects.create(
            customer=self.customer,
            status='draft',
            due_date=date.today() - timedelta(days=1),
            total=Decimal('275.00'),
            amount_paid=Decimal('0.00'),
            created_by=self.staff_user,
        )
        Invoice.objects.filter(pk=self.overdue_invoice.pk).update(status='sent')

    @patch('apps.notifications_app.management.commands.send_invoice_reminders.notification_triggers.invoice_overdue')
    @patch('apps.notifications_app.management.commands.send_invoice_reminders.notification_triggers.invoice_due_soon')
    def test_command_routes_sms_channel_to_both_invoice_reminder_paths(
        self,
        mock_due_soon,
        mock_overdue,
    ):
        out = StringIO()

        call_command(
            'send_invoice_reminders',
            due_soon_days=3,
            channel='sms',
            stdout=out,
        )

        mock_due_soon.assert_called_once()
        mock_overdue.assert_called_once()

        due_soon_args, due_soon_kwargs = mock_due_soon.call_args
        self.assertEqual(due_soon_args[0].pk, self.due_soon_invoice.pk)
        self.assertEqual(due_soon_args[1], 2)
        self.assertEqual(due_soon_kwargs['channel'], 'sms')

        overdue_args, overdue_kwargs = mock_overdue.call_args
        self.assertEqual(overdue_args[0].pk, self.overdue_invoice.pk)
        self.assertEqual(overdue_kwargs['channel'], 'sms')
