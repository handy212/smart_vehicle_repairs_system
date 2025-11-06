"""
Data migration helper script for multi-branch feature
Run this after applying migrations to assign existing data to branches
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.branches.models import Branch
from apps.workorders.models import WorkOrder
from apps.billing.models import Estimate, Invoice
from apps.inspections.models import VehicleInspection
from apps.accounts.models import User


class Command(BaseCommand):
    help = 'Migrate existing data to use branches'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--branch-id',
            type=int,
            help='Branch ID to assign to existing records (default: headquarters or first branch)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview changes without applying them'
        )
    
    def handle(self, *args, **options):
        dry_run = options['dry_run']
        branch_id = options.get('branch_id')
        
        # Get target branch
        if branch_id:
            try:
                branch = Branch.objects.get(id=branch_id)
            except Branch.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'Branch with ID {branch_id} not found'))
                return
        else:
            # Try headquarters first, then any branch
            branch = Branch.objects.filter(is_headquarters=True).first()
            if not branch:
                branch = Branch.objects.first()
        
        if not branch:
            self.stdout.write(self.style.ERROR('No branches found. Please create at least one branch first.'))
            return
        
        self.stdout.write(f'Using branch: {branch.name} ({branch.code})')
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be saved'))
        
        # Count records to update
        wo_count = WorkOrder.objects.filter(branch__isnull=True).count()
        est_count = Estimate.objects.filter(branch__isnull=True).count()
        inv_count = Invoice.objects.filter(branch__isnull=True).count()
        insp_count = VehicleInspection.objects.filter(branch__isnull=True).count()
        staff_count = User.objects.filter(
            branch__isnull=True,
            role__in=['receptionist', 'technician', 'parts_manager']
        ).count()
        
        self.stdout.write('\nRecords to update:')
        self.stdout.write(f'  Work Orders: {wo_count}')
        self.stdout.write(f'  Estimates: {est_count}')
        self.stdout.write(f'  Invoices: {inv_count}')
        self.stdout.write(f'  Inspections: {insp_count}')
        self.stdout.write(f'  Staff without branch: {staff_count}')
        
        if not dry_run:
            proceed = input('\nProceed with migration? (yes/no): ')
            if proceed.lower() != 'yes':
                self.stdout.write('Migration cancelled.')
                return
        
        # Perform migration
        with transaction.atomic():
            if not dry_run:
                # Update work orders
                wo_updated = WorkOrder.objects.filter(branch__isnull=True).update(branch=branch)
                self.stdout.write(self.style.SUCCESS(f'✓ Updated {wo_updated} work orders'))
                
                # Update estimates
                est_updated = Estimate.objects.filter(branch__isnull=True).update(branch=branch)
                self.stdout.write(self.style.SUCCESS(f'✓ Updated {est_updated} estimates'))
                
                # Update invoices
                inv_updated = Invoice.objects.filter(branch__isnull=True).update(branch=branch)
                self.stdout.write(self.style.SUCCESS(f'✓ Updated {inv_updated} invoices'))
                
                # Update inspections
                insp_updated = VehicleInspection.objects.filter(branch__isnull=True).update(branch=branch)
                self.stdout.write(self.style.SUCCESS(f'✓ Updated {insp_updated} inspections'))
                
                # Update staff
                staff_updated = User.objects.filter(
                    branch__isnull=True,
                    role__in=['receptionist', 'technician', 'parts_manager']
                ).update(branch=branch)
                self.stdout.write(self.style.SUCCESS(f'✓ Updated {staff_updated} staff members'))
                
                self.stdout.write(self.style.SUCCESS('\n✓ Migration completed successfully!'))
            else:
                self.stdout.write(self.style.WARNING('\nDRY RUN: No changes applied'))
        
        # Show branch sequence status
        self.stdout.write('\nBranch sequence numbers:')
        self.stdout.write(f'  Next WO: {branch.next_workorder_number}')
        self.stdout.write(f'  Next EST: {branch.next_estimate_number}')
        self.stdout.write(f'  Next INV: {branch.next_invoice_number}')
        self.stdout.write(f'  Next DGN: {branch.next_diagnosis_number}')
        self.stdout.write(f'  Next INS: {branch.next_inspection_number}')
        
        self.stdout.write('\nNote: Consider adjusting sequence numbers based on existing documents.')
