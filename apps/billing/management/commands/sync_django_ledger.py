"""
Management command to sync existing data to Django Ledger
"""
from django.core.management.base import BaseCommand
from apps.billing.accounting_service import AccountingService
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inventory.models import Supplier, Part
from apps.billing.models import Invoice
from apps.inventory.models import PurchaseOrder


class Command(BaseCommand):
    help = 'Sync existing data to Django Ledger models'
    
    def handle(self, *args, **options):
        try:
            from django_ledger.models import EntityModel
        except ImportError:
            self.stdout.write(self.style.ERROR('Django Ledger is not installed.'))
            return
        
        self.stdout.write('Syncing data to Django Ledger...\n')
        
        # Sync customers and vendors to ALL entities (they should be available in all branches)
        all_customers = Customer.objects.all()
        all_suppliers = Supplier.objects.all()
        all_parts = Part.objects.all()
        
        # Sync for each branch/entity
        for branch in Branch.objects.filter(is_active=True):
            self.stdout.write(f'\nSyncing for branch: {branch.name}')
            entity = branch.get_or_create_ledger_entity()
            if not entity:
                self.stdout.write(self.style.WARNING(f'  Could not get entity for {branch.name}'))
                continue
            
            # Sync ALL customers to THIS entity (customers available in all entities)
            count = 0
            for customer in all_customers:
                try:
                    dl_customer = AccountingService.get_or_create_customer(customer, entity)
                    if dl_customer:
                        count += 1
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f'  Error syncing customer {customer.customer_number}: {e}'))
            if count > 0:
                self.stdout.write(self.style.SUCCESS(f'  ✓ Synced {count} customers'))
            
            # Sync ALL suppliers to THIS entity (vendors available in all entities)
            count = 0
            for supplier in all_suppliers:
                try:
                    dl_vendor = AccountingService.get_or_create_vendor(supplier, entity)
                    if dl_vendor:
                        count += 1
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f'  Error syncing supplier {supplier.supplier_code}: {e}'))
            if count > 0:
                self.stdout.write(self.style.SUCCESS(f'  ✓ Synced {count} suppliers'))
            
            # Sync parts to items (for this entity)
            parts = Part.objects.filter(ledger_item__isnull=True)
            count = 0
            for part in parts:
                try:
                    dl_item = AccountingService.get_or_create_item(part, entity)
                    if dl_item:
                        count += 1
                except Exception as e:
                    pass  # Skip errors silently for items
            if count > 0:
                self.stdout.write(self.style.SUCCESS(f'  ✓ Synced {count} parts to items'))
            
            # Sync invoices
            invoices = Invoice.objects.filter(
                ledger_invoice__isnull=True,
                branch=branch
            )
            count = 0
            for invoice in invoices:
                try:
                    dl_invoice = AccountingService.create_dl_invoice(invoice)
                    if dl_invoice:
                        count += 1
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f'  Error syncing invoice {invoice.invoice_number}: {e}'))
            if count > 0:
                self.stdout.write(self.style.SUCCESS(f'  ✓ Synced {count} invoices'))
            
            # Sync purchase orders (received ones)
            pos = PurchaseOrder.objects.filter(
                ledger_bill__isnull=True,
                branch=branch,
                status='received'
            )
            count = 0
            for po in pos:
                try:
                    dl_bill = AccountingService.create_dl_bill(po)
                    if dl_bill:
                        count += 1
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f'  Error syncing PO {po.po_number}: {e}'))
            if count > 0:
                self.stdout.write(self.style.SUCCESS(f'  ✓ Synced {count} purchase orders'))
        
        self.stdout.write(self.style.SUCCESS('\n✓ Sync completed!'))

