"""
Management command to setup Chart of Accounts for all branches
"""
from django.core.management.base import BaseCommand
from apps.branches.models import Branch


class Command(BaseCommand):
    help = 'Setup Chart of Accounts for all branches using Django Ledger'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--branch',
            type=str,
            help='Setup Chart of Accounts for a specific branch by code or name',
        )
    
    def handle(self, *args, **options):
        try:
            from django_ledger.models import ChartOfAccountModel, AccountModel
        except ImportError:
            self.stdout.write(
                self.style.ERROR('Django Ledger is not installed. Please install it first.')
            )
            return
        
        branch_filter = options.get('branch')
        
        if branch_filter:
            # Get specific branch
            try:
                branches = [Branch.objects.get(code=branch_filter)]
            except Branch.DoesNotExist:
                try:
                    branches = [Branch.objects.get(name__icontains=branch_filter)]
                except Branch.DoesNotExist:
                    self.stdout.write(
                        self.style.ERROR(f'Branch "{branch_filter}" not found.')
                    )
                    return
                except Branch.MultipleObjectsReturned:
                    self.stdout.write(
                        self.style.ERROR(f'Multiple branches found matching "{branch_filter}". Please use branch code.')
                    )
                    return
        else:
            # Get all branches
            branches = Branch.objects.filter(is_active=True)
        
        if not branches.exists():
            self.stdout.write(
                self.style.WARNING('No active branches found.')
            )
            return
        
        for branch in branches:
            self.stdout.write(f'\nSetting up Chart of Accounts for {branch.name}...')
            
            # Get or create entity
            entity = branch.get_or_create_ledger_entity()
            if not entity:
                self.stdout.write(
                    self.style.ERROR(f'  Failed to create entity for {branch.name}.')
                )
                continue
            
            # Get or create Chart of Accounts for entity
            coa, created = ChartOfAccountModel.objects.get_or_create(
                entity=entity,
                defaults={'name': f'{branch.name} Chart of Accounts'}
            )
            
            if created:
                self.stdout.write(
                    self.style.SUCCESS(f'  ✓ Created Chart of Accounts for {branch.name}')
                )
            else:
                self.stdout.write(f'  Chart of Accounts already exists for {branch.name}')
            
            # Define standard accounts for vehicle repair business
            accounts = [
                # Assets
                ('1100', 'Assets', 'ASSET', None),
                ('1110', 'Cash', 'ASSET', '1100'),
                ('1120', 'Accounts Receivable', 'ASSET', '1100'),
                ('1130', 'Inventory - Parts', 'ASSET', '1100'),
                
                # Liabilities
                ('2000', 'Liabilities', 'LIABILITY', None),
                ('2100', 'Accounts Payable', 'LIABILITY', '2000'),
                
                # Equity
                ('3000', 'Equity', 'EQUITY', None),
                ('3100', 'Owner Equity', 'EQUITY', '3000'),
                
                # Income
                ('4000', 'Revenue', 'INCOME', None),
                ('4100', 'Service Revenue', 'INCOME', '4000'),
                ('4110', 'Parts Revenue', 'INCOME', '4000'),
                ('4120', 'Labor Revenue', 'INCOME', '4000'),
                
                # Expenses
                ('5000', 'Expenses', 'EXPENSE', None),
                ('5100', 'Cost of Goods Sold', 'EXPENSE', '5000'),
                ('5110', 'Parts Cost', 'EXPENSE', '5100'),
                ('5120', 'Labor Cost', 'EXPENSE', '5100'),
                ('5200', 'Operating Expenses', 'EXPENSE', '5000'),
            ]
            
            created_count = 0
            skipped_count = 0
            account_map = {}  # Store created accounts by code for parent lookups
            
            # Process accounts in order - parents must be created before children
            for account_code, account_name, account_type, parent_code in accounts:
                # Check if account already exists
                existing_account = AccountModel.objects.filter(
                    code=account_code,
                    coa_model=coa,
                    _entity_slug=entity.slug
                ).first()
                
                if existing_account:
                    self.stdout.write(f'    - Account {account_code} - {account_name} already exists')
                    account_map[account_code] = existing_account
                    skipped_count += 1
                    continue
                
                # Get parent account if this is a child account
                parent_account = account_map.get(parent_code) if parent_code else None
                
                try:
                    if parent_account:
                        # Create child account using add_child() method
                        account = parent_account.add_child(
                            coa_model=coa,
                            code=account_code,
                            name=account_name,
                            role=account_type,
                            active=True,
                        )
                    else:
                        # Create root account (no parent)
                        account = AccountModel.add_root(
                            coa_model=coa,
                            code=account_code,
                            name=account_name,
                            role=account_type,
                            active=True,
                        )
                    
                    account_map[account_code] = account
                    self.stdout.write(
                        self.style.SUCCESS(f'    ✓ Created account: {account_code} - {account_name}')
                    )
                    created_count += 1
                    
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f'    ✗ Failed to create account {account_code} - {account_name}: {e}')
                    )
            
            self.stdout.write(
                self.style.SUCCESS(
                    f'\n✓ Completed setup for {branch.name}: '
                    f'{created_count} new accounts, {skipped_count} already existed'
                )
            )
        
        self.stdout.write(
            self.style.SUCCESS('\n✓ Chart of Accounts setup completed!')
        )

