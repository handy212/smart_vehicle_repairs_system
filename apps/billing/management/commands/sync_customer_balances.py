from django.core.management.base import BaseCommand

from apps.billing.customer_statement import CustomerStatementService


class Command(BaseCommand):
    help = 'Recalculate Customer.current_balance from open invoice amounts due.'

    def handle(self, *args, **options):
        updated = CustomerStatementService.sync_all_customer_balances()
        self.stdout.write(self.style.SUCCESS(f'Synced open balances for {updated} customer(s).'))
