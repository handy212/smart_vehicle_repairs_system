"""
Send reminders for compliance documents expiring soon or already expired.

Usage:
    python manage.py send_compliance_expiry_reminders [--days-before 30]
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.hr.models import ComplianceDocument


class Command(BaseCommand):
    help = 'Flag compliance documents expiring soon and record reminder dispatch'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days-before',
            type=int,
            default=30,
            help='Warn when documents expire within this many days (default: 30)',
        )
        parser.add_argument(
            '--resend',
            action='store_true',
            help='Resend reminders even if reminder_sent is already True',
        )

    def handle(self, *args, **options):
        days_before = options['days_before']
        resend = options['resend']
        today = timezone.now().date()
        threshold = today + timedelta(days=days_before)

        qs = ComplianceDocument.objects.filter(
            expiry_date__isnull=False,
            expiry_date__lte=threshold,
        ).select_related('employee__user')

        if not resend:
            qs = qs.filter(reminder_sent=False)

        sent = 0
        for doc in qs:
            doc.save()
            doc.reminder_sent = True
            doc.save(update_fields=['reminder_sent', 'updated_at'])
            sent += 1
            status_label = 'expired' if doc.expiry_date < today else 'expiring soon'
            self.stdout.write(self.style.SUCCESS(
                f'  ✓ Reminder queued for {doc.name} ({doc.employee.full_name}) — {status_label}'
            ))

        self.stdout.write(self.style.SUCCESS(f'\n✓ Processed {sent} compliance reminder(s).'))
