"""
Backfill payroll journal entries for already-paid periods.

Usage:
    python manage.py backfill_payroll_journal_entries
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create journal entries for payroll periods that were marked as paid before the accounting integration was added."

    def handle(self, *args, **options):
        from apps.hr.models import PayrollPeriod
        from apps.accounting.services import AccountingService

        paid_periods = PayrollPeriod.objects.filter(status='paid')
        self.stdout.write(f"Found {paid_periods.count()} paid payroll period(s).")

        created = 0
        skipped = 0
        failed = 0

        for period in paid_periods:
            try:
                je = AccountingService.post_payroll(period)
                if je:
                    self.stdout.write(self.style.SUCCESS(
                        f"  ✅ Created JE #{je.id} for '{period.name}' "
                        f"(debits/credits balanced)"
                    ))
                    created += 1
                else:
                    self.stdout.write(self.style.WARNING(
                        f"  ⏭  Skipped '{period.name}' (already posted or no payslips)"
                    ))
                    skipped += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(
                    f"  ❌ Failed for '{period.name}': {e}"
                ))
                failed += 1

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Done: {created} created, {skipped} skipped, {failed} failed."))
