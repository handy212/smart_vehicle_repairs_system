"""
Management command to send invoice reminders and overdue notices.
Run this command via cron job (e.g., daily at 8 AM) to send reminders for upcoming and overdue invoices.

Usage:
    python manage.py send_invoice_reminders [--due-soon-days 3] [--channel email|sms]
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from apps.billing.models import Invoice
from apps.notifications_app.triggers import notification_triggers


class Command(BaseCommand):
    help = 'Send invoice reminders for invoices due soon and overdue invoices'

    def add_arguments(self, parser):
        parser.add_argument(
            '--due-soon-days',
            type=int,
            default=3,
            help='Send "due soon" reminders for invoices due within this many days (default: 3)'
        )
        parser.add_argument(
            '--channel',
            type=str,
            choices=['email', 'sms'],
            default='email',
            help='Notification channel to use (default: email)'
        )

    def handle(self, *args, **options):
        due_soon_days = options['due_soon_days']
        channel = options['channel']
        today = timezone.now().date()
        due_soon_date = today + timedelta(days=due_soon_days)
        
        self.stdout.write(self.style.SUCCESS(
            f'Checking for invoices due soon (within {due_soon_days} days) and overdue...'
        ))
        
        # Get invoices that are due soon
        invoices_due_soon = Invoice.objects.filter(
            status__in=['sent', 'viewed', 'partial'],
            due_date__gte=today,
            due_date__lte=due_soon_date
        ).select_related(
            'customer',
            'vehicle',
            'work_order'
        )
        
        # Get overdue invoices
        invoices_overdue = Invoice.objects.filter(
            status__in=['sent', 'viewed', 'partial'],
            due_date__lt=today
        ).select_related(
            'customer',
            'vehicle',
            'work_order'
        )
        
        # Combine both querysets
        unpaid_invoices = list(invoices_due_soon) + list(invoices_overdue)
        
        due_soon_count = 0
        overdue_count = 0
        
        for invoice in unpaid_invoices:
            days_until_due = (invoice.due_date - today).days
            
            try:
                if days_until_due < 0:
                    # Overdue
                    if invoice.status != 'overdue':
                        invoice.status = 'overdue'
                        invoice.save()
                    
                    notification_triggers.invoice_overdue(invoice, channel=channel)
                    overdue_count += 1
                    self.stdout.write(self.style.WARNING(
                        f'  ⚠️  Sent {channel} overdue notice for invoice {invoice.invoice_number} to {invoice.customer}'
                    ))
                    
                elif 0 <= days_until_due <= due_soon_days:
                    # Due soon
                    notification_triggers.invoice_due_soon(invoice, days_until_due, channel=channel)
                    due_soon_count += 1
                    self.stdout.write(self.style.SUCCESS(
                        f'  ✓ Sent {channel} due soon reminder for invoice {invoice.invoice_number} to {invoice.customer} ({days_until_due} days)'
                    ))
                    
            except Exception as e:
                self.stdout.write(self.style.ERROR(
                    f'  ✗ Failed to send reminder for invoice {invoice.invoice_number}: {e}'
                ))
        
        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Sent {due_soon_count} "due soon" reminders and {overdue_count} overdue notices'
        ))
