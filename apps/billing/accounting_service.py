"""
Accounting service for posting entries to Django Ledger
This module bridges our Invoice/Payment system with Django Ledger's double-entry accounting
"""
from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from datetime import timedelta
from apps.billing.models import Invoice, Payment
from apps.workorders.models import WorkOrder
from apps.customers.models import Customer
from apps.inventory.models import Supplier, Part


class AccountingService:
    """
    Service class for posting accounting entries to Django Ledger
    
    This service handles posting journal entries when:
    - Invoices are created (AR and Revenue)
    - Payments are received (Cash and AR)
    - Parts are used (COGS and Inventory)
    - Labor is completed (COGS and Cash/Payroll)
    """
    
    @staticmethod
    def get_entity(branch):
        """Get or create Django Ledger Entity for a branch"""
        if not branch:
            return None
        
        # Import here to avoid circular dependencies
        try:
            from django_ledger.models import EntityModel
            
            # Check if branch already has an entity
            if hasattr(branch, 'ledger_entity') and branch.ledger_entity:
                return branch.ledger_entity
            
            # Get admin user for entity
            from apps.accounts.models import User
            
            admin_user = branch.created_by if hasattr(branch, 'created_by') and branch.created_by else None
            if not admin_user or not (admin_user.is_superuser or admin_user.role == 'admin'):
                admin_user = User.objects.filter(
                    Q(is_superuser=True) | Q(role='admin')
                ).first()
            
            if not admin_user:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"No admin user found to assign to entity for branch {branch.name}")
                return None
            
            # Create entity if it doesn't exist
            entity, created = EntityModel.objects.get_or_create(
                name=branch.name,
                defaults={
                    'address_1': branch.address or '',
                    'city': branch.city or '',
                    'state': branch.state or '',
                    'zip_code': branch.zip_code or '',
                    'country': branch.country or 'USA',
                    'email': branch.email or '',
                    'phone': branch.phone or '',
                    'depth': 0,  # Top-level entity
                    'admin': admin_user,  # admin field (Django maps to admin_id column)
                }
            )
            
            # Link entity to branch (if Branch model has ledger_entity field)
            if hasattr(branch, 'ledger_entity'):
                branch.ledger_entity = entity
                branch.save(update_fields=['ledger_entity'])
            
            return entity
        except ImportError:
            # Django Ledger not installed or not available
            return None
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error getting entity for branch {branch}: {e}")
            return None
    
    @staticmethod
    def get_account(entity, account_code):
        """Get account by code for an entity"""
        if not entity:
            return None
        
        try:
            from django_ledger.models import ChartOfAccountModel, AccountModel
            
            coa = ChartOfAccountModel.objects.filter(entity=entity).first()
            if not coa:
                # Chart of accounts might not be set up yet
                return None
            
            account = AccountModel.objects.filter(
                coa_model=coa,
                code=account_code,
                active=True,
                _entity_slug=entity.slug
            ).first()
            
            return account
        except ImportError:
            return None
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error getting account {account_code} for entity {entity}: {e}")
            return None
    
    @classmethod
    def post_invoice_created(cls, invoice: Invoice):
        """
        Post journal entry when invoice is created.
        
        Debit: Accounts Receivable (1120)
        Credit: Service Revenue (4100), Parts Revenue (4110), Labor Revenue (4120)
        """
        if not invoice.work_order or not invoice.branch:
            return None  # Skip if no work order or branch
        
        entity = cls.get_entity(invoice.branch)
        if not entity:
            return None
        
        try:
            from django_ledger.models import JournalEntryModel, TransactionModel
            
            # Get accounts
            ar_account = cls.get_account(entity, '1120')
            service_revenue = cls.get_account(entity, '4100')
            parts_revenue = cls.get_account(entity, '4110')
            labor_revenue = cls.get_account(entity, '4120')
            
            # Skip if accounts not set up yet
            if not ar_account:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Accounts not set up for entity {entity.name}. Run setup_chart_of_accounts command.")
                return None
            
            # Get or create ledger for invoice
            from django_ledger.models import LedgerModel
            ledger_name = f'{entity.name} - Invoice {invoice.invoice_number}'
            ledger, _ = LedgerModel.objects.get_or_create(
                entity=entity,
                name=ledger_name,
                defaults={'name': ledger_name}
            )
            
            with transaction.atomic():
                # Create journal entry (must be created unposted, then posted)
                je = JournalEntryModel.objects.create(
                    ledger=ledger,
                    description=f"Invoice {invoice.invoice_number} - {invoice.customer}",
                    posted=False,  # Create unposted first
                    locked=False,  # Create unlocked first
                    timestamp=timezone.now(),
                    origin='INVOICE',
                    activity='OP',
                )
                
                # Debit: Accounts Receivable
                TransactionModel.objects.create(
                    journal_entry=je,
                    account=ar_account,
                    tx_type='debit',
                    amount=invoice.total,
                    description=f"Invoice {invoice.invoice_number}"
                )
                
                # Credit: Revenue accounts based on invoice breakdown
                if invoice.labor_subtotal > 0 and labor_revenue:
                    TransactionModel.objects.create(
                        journal_entry=je,
                        account=labor_revenue,
                        tx_type='credit',
                        amount=invoice.labor_subtotal,
                        description=f"Labor revenue - Invoice {invoice.invoice_number}"
                    )
                
                if invoice.parts_subtotal > 0 and parts_revenue:
                    TransactionModel.objects.create(
                        journal_entry=je,
                        account=parts_revenue,
                        tx_type='credit',
                        amount=invoice.parts_subtotal,
                        description=f"Parts revenue - Invoice {invoice.invoice_number}"
                    )
                
                # Service revenue (catch-all for fees, etc.)
                service_amount = invoice.total - invoice.labor_subtotal - invoice.parts_subtotal
                if service_amount > 0 and service_revenue:
                    TransactionModel.objects.create(
                        journal_entry=je,
                        account=service_revenue,
                        tx_type='credit',
                        amount=service_amount,
                        description=f"Service revenue - Invoice {invoice.invoice_number}"
                    )
                
                # Post and lock the journal entry
                je.posted = True
                je.locked = True
                je.save()
                
                return je
        except ImportError:
            # Django Ledger not installed
            return None
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to post invoice accounting entry for {invoice.invoice_number}: {e}")
            return None
    
    @classmethod
    def post_payment_received(cls, payment: Payment):
        """
        Post journal entry when payment is received.
        
        Debit: Cash (1110)
        Credit: Accounts Receivable (1120)
        """
        if not payment.invoice or not payment.invoice.branch:
            return None
        
        entity = cls.get_entity(payment.invoice.branch)
        if not entity:
            return None
        
        try:
            from django_ledger.models import JournalEntryModel, TransactionModel
            
            # Get accounts
            cash_account = cls.get_account(entity, '1110')
            ar_account = cls.get_account(entity, '1120')
            
            if not cash_account or not ar_account:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Accounts not set up for entity {entity.name}. Run setup_chart_of_accounts command.")
                return None
            
            # Get or create ledger for payment
            from django_ledger.models import LedgerModel
            ledger_name = f'{entity.name} - Payment {payment.payment_number}'
            ledger, _ = LedgerModel.objects.get_or_create(
                entity=entity,
                name=ledger_name,
                defaults={'name': ledger_name}
            )
            
            with transaction.atomic():
                # Get payment date
                payment_date = payment.payment_date
                if hasattr(payment_date, 'date'):
                    payment_date = payment_date.date()
                elif not hasattr(payment_date, 'year'):
                    payment_date = timezone.now().date()
                
                # Create journal entry (must be created unposted, then posted)
                je = JournalEntryModel.objects.create(
                    ledger=ledger,
                    description=f"Payment {payment.payment_number} for Invoice {payment.invoice.invoice_number}",
                    posted=False,  # Create unposted first
                    locked=False,  # Create unlocked first
                    timestamp=timezone.now(),
                    origin='PAYMENT',
                    activity='OP',
                )
                
                # Debit: Cash
                TransactionModel.objects.create(
                    journal_entry=je,
                    account=cash_account,
                    tx_type='debit',
                    amount=payment.amount,
                    description=f"Payment {payment.payment_number} - {payment.get_payment_method_display()}"
                )
                
                # Credit: Accounts Receivable
                TransactionModel.objects.create(
                    journal_entry=je,
                    account=ar_account,
                    tx_type='credit',
                    amount=payment.amount,
                    description=f"Payment received - Invoice {payment.invoice.invoice_number}"
                )
                
                # Post and lock the journal entry
                je.posted = True
                je.locked = True
                je.save()
                
                return je
        except ImportError:
            return None
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to post payment accounting entry for {payment.payment_number}: {e}")
            return None
    
    @classmethod
    def post_parts_cost(cls, work_order: WorkOrder):
        """
        Post journal entry when parts are used/installed.
        
        Debit: Cost of Goods Sold - Parts (5110)
        Credit: Inventory - Parts (1130)
        """
        if not work_order.branch:
            return None
        
        entity = cls.get_entity(work_order.branch)
        if not entity:
            return None
        
        # Calculate total parts cost (COGS)
        # Note: actual_parts_cost on WorkOrder is the selling price/revenue. 
        # For COGS, we need the sum of (quantity * unit_cost) from parts.
        from django.db.models import Sum
        parts_cost = work_order.parts.aggregate(total=Sum('total_cost'))['total'] or Decimal('0')
        
        if parts_cost <= 0:
            return None  # No parts cost to post
        
        try:
            from django_ledger.models import JournalEntryModel, TransactionModel, LedgerModel
            
            # Get accounts
            cogs_parts = cls.get_account(entity, '5110')
            inventory_parts = cls.get_account(entity, '1130')
            
            if not cogs_parts or not inventory_parts:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Accounts not set up for entity {entity.name}. Run setup_chart_of_accounts command.")
                return None
            
            # Check if journal entry already exists for this work order
            existing_je = JournalEntryModel.objects.filter(
                Q(description__contains=f"Work Order {work_order.work_order_number}") &
                Q(description__contains="Parts cost"),
                ledger__entity=entity,
                origin='WORK_ORDER'
            ).first()
            
            if existing_je:
                import logging
                logger = logging.getLogger(__name__)
                logger.info(f"Parts cost journal entry already exists for WO {work_order.work_order_number}")
                return existing_je
            
            # Get or create ledger for work order
            ledger_name = f'{entity.name} - Work Order {work_order.work_order_number}'
            ledger, _ = LedgerModel.objects.get_or_create(
                entity=entity,
                name=ledger_name,
                defaults={'name': ledger_name}
            )
            
            with transaction.atomic():
                # Create journal entry (must be created unposted, then posted)
                je = JournalEntryModel.objects.create(
                    ledger=ledger,
                    description=f"Parts cost for Work Order {work_order.work_order_number}",
                    posted=False,  # Create unposted first
                    locked=False,  # Create unlocked first
                    timestamp=timezone.now(),
                    origin='WORK_ORDER',
                    activity='OP',
                )
                
                # Debit: COGS - Parts
                TransactionModel.objects.create(
                    journal_entry=je,
                    account=cogs_parts,
                    tx_type='debit',
                    amount=parts_cost,
                    description=f"Parts cost - WO {work_order.work_order_number}"
                )
                
                # Credit: Inventory - Parts
                TransactionModel.objects.create(
                    journal_entry=je,
                    account=inventory_parts,
                    tx_type='credit',
                    amount=parts_cost,
                    description=f"Parts issued - WO {work_order.work_order_number}"
                )
                
                # Post and lock the journal entry
                je.posted = True
                je.locked = True
                je.save()
                
                return je
        except ImportError:
            return None
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to post parts cost accounting entry for WO {work_order.work_order_number}: {e}")
            return None
    
    @classmethod
    def post_labor_cost(cls, work_order: WorkOrder):
        """
        Post journal entry when labor is completed.
        
        Debit: Cost of Goods Sold - Labor (5120)
        Credit: Cash (1110) or Payroll Payable (if labor paid later)
        
        Note: Adjust credit account based on your payroll setup
        """
        if not work_order.branch:
            return None
        
        entity = cls.get_entity(work_order.branch)
        if not entity:
            return None
        
        # Calculate total labor cost
        labor_cost = work_order.actual_labor_cost or Decimal('0')
        if labor_cost <= 0:
            return None
        
        try:
            from django_ledger.models import JournalEntryModel, TransactionModel
            
            # Get accounts
            cogs_labor = cls.get_account(entity, '5120')
            # Assuming labor is paid immediately (adjust based on your payroll)
            cash_account = cls.get_account(entity, '1110')
            
            if not cogs_labor or not cash_account:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Accounts not set up for entity {entity.name}. Run setup_chart_of_accounts command.")
                return None
            
            # Check if journal entry already exists for this work order
            existing_je = JournalEntryModel.objects.filter(
                Q(description__contains=f"Work Order {work_order.work_order_number}") &
                Q(description__contains="Labor cost"),
                ledger__entity=entity,
                origin='WORK_ORDER'
            ).first()
            
            if existing_je:
                import logging
                logger = logging.getLogger(__name__)
                logger.info(f"Labor cost journal entry already exists for WO {work_order.work_order_number}")
                return existing_je
            
            # Get or create ledger for work order
            from django_ledger.models import LedgerModel
            ledger_name = f'{entity.name} - Work Order {work_order.work_order_number}'
            ledger, _ = LedgerModel.objects.get_or_create(
                entity=entity,
                name=ledger_name,
                defaults={'name': ledger_name}
            )
            
            with transaction.atomic():
                # Create journal entry (must be created unposted, then posted)
                je = JournalEntryModel.objects.create(
                    ledger=ledger,
                    description=f"Labor cost for Work Order {work_order.work_order_number}",
                    posted=False,  # Create unposted first
                    locked=False,  # Create unlocked first
                    timestamp=timezone.now(),
                    origin='WORK_ORDER',
                    activity='OP',
                )
                
                # Debit: COGS - Labor
                TransactionModel.objects.create(
                    journal_entry=je,
                    account=cogs_labor,
                    tx_type='debit',
                    amount=labor_cost,
                    description=f"Labor cost - WO {work_order.work_order_number}"
                )
                
                # Credit: Cash (or Payroll Payable if labor is paid later)
                TransactionModel.objects.create(
                    journal_entry=je,
                    account=cash_account,
                    tx_type='credit',
                    amount=labor_cost,
                    description=f"Labor payment - WO {work_order.work_order_number}"
                )
                
                # Post and lock the journal entry
                je.posted = True
                je.locked = True
                je.save()
                
                return je
        except ImportError:
            return None
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to post labor cost accounting entry for WO {work_order.work_order_number}: {e}")
            return None
    
    @staticmethod
    def get_or_create_customer(our_customer: Customer, entity):
        """
        Get or create Django Ledger CustomerModel from our Customer model for a specific entity
        
        Customers should be available in ALL entities, so we create them per entity.
        This enables AR tracking per customer and customer aging reports per branch.
        """
        if not our_customer or not entity:
            return None
        
        try:
            from django_ledger.models import CustomerModel
            
            # Get customer name
            customer_name = our_customer.user.get_full_name() or our_customer.company_name or our_customer.user.email
            
            # Find or create customer for THIS entity (customer exists per entity)
            dl_customer, created = CustomerModel.objects.get_or_create(
                entity_model=entity,
                customer_number=our_customer.customer_number,
                defaults={
                    'customer_name': customer_name,
                    'address_1': our_customer.service_address or our_customer.billing_address or '',
                    'city': our_customer.service_city or our_customer.billing_city or '',
                    'state': our_customer.service_state or our_customer.billing_state or '',
                    'zip_code': our_customer.service_zip_code or our_customer.billing_zip_code or '',
                    'phone': our_customer.user.phone or '',
                    'email': our_customer.user.email or '',
                }
            )
            
            # Note: We don't link back to our_customer.ledger_customer because
            # a customer exists per entity. The link is one-to-one but customers
            # should be available in all entities.
            
            return dl_customer
        except ImportError:
            return None
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to get/create DL Customer for {our_customer}: {e}")
            return None
    
    @staticmethod
    def get_or_create_vendor(our_supplier: Supplier, entity):
        """
        Get or create Django Ledger VendorModel from our Supplier model for a specific entity
        
        Vendors should be available in ALL entities, so we create them per entity.
        This enables AP tracking per vendor and vendor aging reports per branch.
        """
        if not our_supplier or not entity:
            return None
        
        try:
            from django_ledger.models import VendorModel
            
            # Find or create vendor for THIS entity (vendor exists per entity)
            dl_vendor, created = VendorModel.objects.get_or_create(
                entity_model=entity,
                vendor_number=our_supplier.supplier_code,
                defaults={
                    'vendor_name': our_supplier.name,
                    'address_1': our_supplier.address_line1 or '',
                    'address_2': our_supplier.address_line2 or '',
                    'city': our_supplier.city or '',
                    'state': our_supplier.state or '',
                    'zip_code': our_supplier.postal_code or '',
                    'country': our_supplier.country or 'USA',
                    'phone': our_supplier.phone or '',
                    'email': our_supplier.email or '',
                }
            )
            
            # Note: We don't link back to our_supplier.ledger_vendor because
            # a vendor exists per entity. The link is one-to-one but vendors
            # should be available in all entities.
            
            return dl_vendor
        except ImportError:
            return None
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to get/create DL Vendor for {our_supplier}: {e}")
            return None
    
    @staticmethod
    def get_or_create_item(our_part: Part, entity):
        """
        Get or create Django Ledger ItemModel from our Part model for a specific entity
        
        Items should be available in ALL entities, so we create them per entity.
        This enables better inventory accounting and COGS tracking per branch.
        """
        if not our_part or not entity:
            return None
        
        try:
            from django_ledger.models import ItemModel, UnitOfMeasureModel
            
            # Find or create item for THIS entity (item exists per entity)
            # Try to find existing item by part number for this entity
            dl_item = ItemModel.objects.filter(
                entity=entity,
                item_number=our_part.part_number
            ).first()
            
            if not dl_item:
                # Get or create UOM (unit_abbr must be 1 char)
                # Map common units to 1-char abbreviations
                unit_map = {
                    'piece': 'P', 'set': 'S', 'pair': 'P', 'gallon': 'G',
                    'quart': 'Q', 'liter': 'L', 'bottle': 'B', 'can': 'C',
                    'box': 'B', 'package': 'P', 'roll': 'R', 'foot': 'F',
                    'meter': 'M', 'hour': 'H'
                }
                unit = (our_part.unit or 'piece').lower()
                unit_abbr = unit_map.get(unit, unit[0].upper() if unit else 'P')
                # Ensure exactly 1 character
                if len(unit_abbr) > 1:
                    unit_abbr = unit_abbr[0]
                
                uom, _ = UnitOfMeasureModel.objects.get_or_create(
                    entity=entity,
                    unit_abbr=unit_abbr,
                    defaults={
                        'name': our_part.unit.title() if our_part.unit else 'Piece',
                        'is_active': True,
                    }
                )
                
                # Determine item role based on part type
                # For vehicle repair, parts are typically inventory items
                # Create new Django Ledger item
                dl_item = ItemModel.objects.create(
                    entity=entity,
                    item_number=our_part.part_number,
                    name=our_part.name,
                    uom=uom,
                    item_role=ItemModel.ITEM_ROLE_INVENTORY,
                    item_type=ItemModel.ITEM_TYPE_MATERIAL,
                    sku=our_part.part_number,
                    for_inventory=True,  # Required field
                    is_product_or_service=True,
                    # Cost information
                    # Note: Cost/price is typically managed via transactions
                )
            
            # Note: We don't link back to our_part.ledger_item because
            # an item exists per entity. Parts should be available in all entities.
            
            return dl_item
        except ImportError:
            return None
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to get/create DL Item for {our_part}: {e}")
            return None
    
    @classmethod
    def create_dl_invoice(cls, invoice: Invoice):
        """
        Create Django Ledger InvoiceModel from our Invoice
        
        This provides automatic AR posting and better invoice tracking
        """
        # Require branch, work_order is optional (invoice can be standalone)
        if not invoice.branch:
            return None
        
        entity = cls.get_entity(invoice.branch)
        if not entity:
            return None
        
        try:
            from django_ledger.models import InvoiceModel, ItemModel, LedgerModel
            from django.utils import timezone
            
            # If invoice already linked, ensure line items exist and return it
            existing_dl_invoice = getattr(invoice, 'ledger_invoice', None)
            if existing_dl_invoice:
                cls._populate_invoice_line_items(invoice, existing_dl_invoice, entity)
                cls._finalize_dl_invoice(invoice, existing_dl_invoice)
                return existing_dl_invoice
            
            # Get or create ledger for entity - one ledger per entity for invoices
            # Note: Django Ledger allows one invoice per ledger (unique constraint)
            # Create unique ledger per invoice
            ledger_name = f'{entity.name} - Invoice {invoice.invoice_number}'
            ledger, _ = LedgerModel.objects.get_or_create(
                entity=entity,
                name=ledger_name,
                defaults={'name': ledger_name}
            )
            
            # Get or create customer
            dl_customer = cls.get_or_create_customer(invoice.customer, entity)
            if not dl_customer:
                # Fall back to manual journal entry
                return cls.post_invoice_created(invoice)
            
            # Get accounts for invoice (required by Django Ledger)
            from django_ledger.models import ChartOfAccountModel, AccountModel
            coa = ChartOfAccountModel.objects.filter(entity=entity).first()
            cash_account = None
            prepaid_account = None
            unearned_account = None
            
            if coa:
                cash_account = AccountModel.objects.filter(coa_model=coa, code='1110').first()
                # Prepaid and unearned are optional but helpful
                prepaid_account = AccountModel.objects.filter(coa_model=coa, code='1130').first()
                unearned_account = AccountModel.objects.filter(coa_model=coa, code='2110').first()
            
            # Create Django Ledger invoice
            invoice_date = invoice.invoice_date or timezone.now().date()
            due_date = invoice.due_date or (invoice_date + timedelta(days=30))
            # Django Ledger fields are limited to 10 characters
            dl_invoice_number = (invoice.invoice_number or '').strip()[:10] or None
            dl_terms = (invoice.terms or 'Due on Receipt').strip()[:10] or 'Net 30'
            dl_invoice = InvoiceModel.objects.create(
                entity_model=entity,
                customer=dl_customer,
                ledger=ledger,
                invoice_number=dl_invoice_number,
                invoice_status=InvoiceModel.INVOICE_STATUS_APPROVED,
                date_draft=invoice_date,
                date_approved=invoice_date,
                terms=dl_terms,
                date_due=due_date,
                markdown_notes=(invoice.customer_notes or '')[:500] if invoice.customer_notes else '',  # Limit notes length
                cash_account=cash_account,
                prepaid_account=prepaid_account,
                unearned_account=unearned_account,
            )
            
            # Add line items using ItemTransactionModel
            cls._populate_invoice_line_items(invoice, dl_invoice, entity)
            cls._finalize_dl_invoice(invoice, dl_invoice)
            
            # Link back to our invoice
            invoice.ledger_invoice = dl_invoice
            invoice.save(update_fields=['ledger_invoice'])
            
            # Django Ledger InvoiceModel automatically posts AR entry!
            # No need for manual journal entry posting (but keep as fallback)
            
            return dl_invoice
        except ImportError:
            # Fall back to manual journal entry
            return cls.post_invoice_created(invoice)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create DL Invoice for {invoice.invoice_number}: {e}")
            # Fall back to manual journal entry
            return cls.post_invoice_created(invoice)
    
    @classmethod
    def _populate_invoice_line_items(cls, invoice, dl_invoice, entity):
        """Ensure Django Ledger invoice has line items that match our invoice totals."""
        try:
            from django_ledger.models import (
                ItemTransactionModel,
                UnitOfMeasureModel,
                ItemModel,
            )
        except ImportError:
            return
        
        if ItemTransactionModel.objects.filter(invoice_model=dl_invoice).exists():
            return
        
        # Check if invoice has explicit line items (from estimate conversion or manual entry)
        # These should take precedence over work order parts
        invoice_line_items = getattr(invoice, 'line_items', None)
        has_explicit_line_items = invoice_line_items is not None and invoice_line_items.exists()
        
        # If invoice has explicit line items, use those instead of work order parts
        if has_explicit_line_items:
            # Process invoice line items (this will be handled below)
            pass
        elif invoice.work_order:
            # Work order-based invoice: add labor + installed parts (only if no explicit line items)
            if invoice.labor_subtotal > 0:
                hour_uom, _ = UnitOfMeasureModel.objects.get_or_create(
                    entity=entity,
                    unit_abbr='H',
                    defaults={'name': 'Hour', 'is_active': True},
                )
                labor_item, _ = ItemModel.objects.get_or_create(
                    entity=entity,
                    item_number='LABOR',
                    defaults={
                        'name': 'Labor Service',
                        'item_role': ItemModel.ITEM_ROLE_SERVICE,
                        'item_type': ItemModel.ITEM_TYPE_LABOR,
                        'uom': hour_uom,
                        'for_inventory': False,
                        'is_product_or_service': True,
                    },
                )
                ItemTransactionModel.objects.create(
                    invoice_model=dl_invoice,
                    item_model=labor_item,
                    quantity=1,
                    unit_cost=invoice.labor_subtotal,
                    total_amount=invoice.labor_subtotal,
                )
            
            try:
                work_order_parts = invoice.work_order.parts.filter(status='installed')
            except Exception:
                work_order_parts = []
            
            for work_part in work_order_parts:
                if work_part.selling_price > 0:
                    part = None
                    try:
                        from apps.inventory.models import Part
                        part = Part.objects.filter(part_number=work_part.part_number).first()
                    except Exception:
                        part = None
                    
                    if part:
                        part_item = cls.get_or_create_item(part, entity)
                    else:
                        part_item = cls._get_or_create_item_from_work_part(work_part, entity)
                    
                    if part_item:
                        try:
                            unit_cost = (
                                work_part.selling_price / float(work_part.quantity)
                                if work_part.quantity > 0
                                else work_part.selling_price
                            )
                            ItemTransactionModel.objects.create(
                                invoice_model=dl_invoice,
                                item_model=part_item,
                                quantity=float(work_part.quantity or 0) or 1,
                                unit_cost=unit_cost,
                                total_amount=work_part.selling_price,
                            )
                        except Exception as exc:
                            import logging
                            logger = logging.getLogger(__name__)
                            logger.error(f"Failed to add part item to DL invoice: {exc}")
            return
        
        # Process invoice line items if available (from estimate conversion or manual entry)
        if has_explicit_line_items:
            service_uom, _ = UnitOfMeasureModel.objects.get_or_create(
                entity=entity,
                unit_abbr='P',
                defaults={'name': 'Piece', 'is_active': True},
            )
            hour_uom, _ = UnitOfMeasureModel.objects.get_or_create(
                entity=entity,
                unit_abbr='H',
                defaults={'name': 'Hour', 'is_active': True},
            )
            labor_item, _ = ItemModel.objects.get_or_create(
                entity=entity,
                item_number='LABOR',
                defaults={
                    'name': 'Labor Service',
                    'item_role': ItemModel.ITEM_ROLE_SERVICE,
                    'item_type': ItemModel.ITEM_TYPE_LABOR,
                    'uom': hour_uom,
                    'for_inventory': False,
                    'is_product_or_service': True,
                },
            )
            parts_item, _ = ItemModel.objects.get_or_create(
                entity=entity,
                item_number='PARTS',
                defaults={
                    'name': 'Parts',
                    'item_role': ItemModel.ITEM_ROLE_INVENTORY,
                    'item_type': ItemModel.ITEM_TYPE_MATERIAL,
                    'uom': service_uom,
                    'for_inventory': True,
                    'is_product_or_service': True,
                },
            )
            service_item, _ = ItemModel.objects.get_or_create(
                entity=entity,
                item_number='SERVICE',
                defaults={
                    'name': 'Service',
                    'item_role': ItemModel.ITEM_ROLE_SERVICE,
                    'item_type': ItemModel.ITEM_TYPE_OTHER,
                    'uom': service_uom,
                    'for_inventory': False,
                    'is_product_or_service': True,
                },
            )
            for line_item in invoice_line_items.order_by('order', 'id'):
                total_amount = line_item.total or Decimal('0')
                if total_amount == 0 and line_item.unit_price and line_item.quantity:
                    total_amount = line_item.unit_price * line_item.quantity
                if total_amount == 0:
                    continue
                
                quantity = Decimal('1')
                unit_cost = line_item.unit_price or total_amount
                
                if line_item.item_type == 'labor':
                    quantity = line_item.labor_hours or line_item.quantity or Decimal('1')
                    if quantity <= 0:
                        quantity = Decimal('1')
                    unit_cost = line_item.labor_rate or line_item.unit_price or (total_amount / quantity)
                    item_model = labor_item
                elif line_item.item_type == 'part':
                    quantity = line_item.quantity or Decimal('1')
                    if quantity <= 0:
                        quantity = Decimal('1')
                    unit_cost = line_item.unit_price or (total_amount / quantity)
                    if line_item.part:
                        item_model = cls.get_or_create_item(line_item.part, entity)
                    else:
                        item_model = parts_item
                else:
                    quantity = line_item.quantity or Decimal('1')
                    if quantity <= 0:
                        quantity = Decimal('1')
                    unit_cost = line_item.unit_price or (total_amount / quantity)
                    item_model = service_item
                    if line_item.item_type == 'discount':
                        total_amount = -abs(total_amount)
                        unit_cost = -abs(unit_cost) if unit_cost else total_amount
                
                try:
                    ItemTransactionModel.objects.create(
                        invoice_model=dl_invoice,
                        item_model=item_model,
                        quantity=float(quantity),
                        unit_cost=unit_cost,
                        total_amount=total_amount,
                    )
                except Exception as exc:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(f"Failed to add invoice line item to DL invoice: {exc}")
            return
        
        # Standalone invoice fallback: add aggregated totals
        if invoice.total > 0:
            service_uom, _ = UnitOfMeasureModel.objects.get_or_create(
                entity=entity,
                unit_abbr='P',
                defaults={'name': 'Piece', 'is_active': True},
            )
            
            if invoice.labor_subtotal > 0:
                labor_item, _ = ItemModel.objects.get_or_create(
                    entity=entity,
                    item_number='LABOR',
                    defaults={
                        'name': 'Labor Service',
                        'item_role': ItemModel.ITEM_ROLE_SERVICE,
                        'item_type': ItemModel.ITEM_TYPE_LABOR,
                        'uom': service_uom,
                        'for_inventory': False,
                        'is_product_or_service': True,
                    },
                )
                ItemTransactionModel.objects.create(
                    invoice_model=dl_invoice,
                    item_model=labor_item,
                    quantity=1,
                    unit_cost=invoice.labor_subtotal,
                    total_amount=invoice.labor_subtotal,
                )
            
            if invoice.parts_subtotal > 0:
                parts_item, _ = ItemModel.objects.get_or_create(
                    entity=entity,
                    item_number='PARTS',
                    defaults={
                        'name': 'Parts',
                        'item_role': ItemModel.ITEM_ROLE_INVENTORY,
                        'item_type': ItemModel.ITEM_TYPE_MATERIAL,
                        'uom': service_uom,
                        'for_inventory': True,
                        'is_product_or_service': True,
                    },
                )
                ItemTransactionModel.objects.create(
                    invoice_model=dl_invoice,
                    item_model=parts_item,
                    quantity=1,
                    unit_cost=invoice.parts_subtotal,
                    total_amount=invoice.parts_subtotal,
                )
            
            other_total = (
                invoice.total
                - invoice.labor_subtotal
                - invoice.parts_subtotal
                - invoice.sublet_subtotal
            )
            if other_total > 0:
                service_item, _ = ItemModel.objects.get_or_create(
                    entity=entity,
                    item_number='SERVICE',
                    defaults={
                        'name': 'Service',
                        'item_role': ItemModel.ITEM_ROLE_SERVICE,
                        'item_type': ItemModel.ITEM_TYPE_OTHER,
                        'uom': service_uom,
                        'for_inventory': False,
                        'is_product_or_service': True,
                    },
                )
                ItemTransactionModel.objects.create(
                    invoice_model=dl_invoice,
                    item_model=service_item,
                    quantity=1,
                    unit_cost=other_total,
                    total_amount=other_total,
                )
    
    @classmethod
    def _finalize_dl_invoice(cls, invoice, dl_invoice):
        """Update Django Ledger invoice amounts/status after adding line items."""
        try:
            from django_ledger.models import InvoiceModel
            item_qs = dl_invoice.itemtransactionmodel_set.all()
            dl_invoice.update_amount_due(itemtxs_qs=item_qs)
            paid_amount = invoice.amount_paid or Decimal('0')
            dl_invoice.amount_paid = paid_amount
            dl_invoice.amount_receivable = max(dl_invoice.amount_due - paid_amount, Decimal('0'))
            dl_invoice.amount_earned = dl_invoice.amount_due
            dl_invoice.amount_unearned = Decimal('0')
            if invoice.status == 'paid':
                dl_invoice.amount_receivable = Decimal('0')
                dl_invoice.amount_paid = dl_invoice.amount_due
            if not dl_invoice.invoice_number and invoice.invoice_number:
                dl_invoice.invoice_number = invoice.invoice_number[:20]
            status_map = {
                'draft': InvoiceModel.INVOICE_STATUS_DRAFT,
                'sent': InvoiceModel.INVOICE_STATUS_APPROVED,
                'viewed': InvoiceModel.INVOICE_STATUS_APPROVED,
                'partial': InvoiceModel.INVOICE_STATUS_APPROVED,
                'overdue': InvoiceModel.INVOICE_STATUS_APPROVED,
                'paid': InvoiceModel.INVOICE_STATUS_PAID,
                'void': InvoiceModel.INVOICE_STATUS_VOID,
                'refunded': InvoiceModel.INVOICE_STATUS_CANCELED,
            }
            dl_invoice.invoice_status = status_map.get(
                invoice.status,
                InvoiceModel.INVOICE_STATUS_APPROVED
            )
            invoice_date = invoice.invoice_date or timezone.now().date()
            if not dl_invoice.date_draft:
                dl_invoice.date_draft = invoice_date
            if dl_invoice.invoice_status in [InvoiceModel.INVOICE_STATUS_APPROVED, InvoiceModel.INVOICE_STATUS_PAID] \
                    and not dl_invoice.date_approved:
                dl_invoice.date_approved = invoice_date
            dl_invoice.save(update_fields=[
                'amount_due',
                'amount_receivable',
                'amount_earned',
                'amount_unearned',
                'amount_paid',
                'invoice_number',
                'invoice_status',
                'date_draft',
                'date_approved',
                'updated'
            ])
        except Exception as exc:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to finalize DL invoice {dl_invoice.uuid}: {exc}")
    
    @staticmethod
    def _get_or_create_item_from_work_part(work_part, entity):
        """Create Django Ledger Item from WorkOrderPart if Part doesn't exist"""
        try:
            from django_ledger.models import ItemModel, UnitOfMeasureModel
            
            # Try to find by part_number
            dl_item = ItemModel.objects.filter(
                entity=entity,
                item_number=work_part.part_number
            ).first()
            
            if not dl_item:
                # Get or create UOM (default to Piece, unit_abbr must be 1 char)
                uom, _ = UnitOfMeasureModel.objects.get_or_create(
                    entity=entity,
                    unit_abbr='P',
                    defaults={
                        'name': 'Piece',
                        'is_active': True,
                    }
                )
                
                # Create Item from work part data
                dl_item = ItemModel.objects.create(
                    entity=entity,
                    item_number=work_part.part_number,
                    name=work_part.part_name or work_part.part_number,
                    uom=uom,
                    item_role=ItemModel.ITEM_ROLE_INVENTORY,
                    item_type=ItemModel.ITEM_TYPE_MATERIAL,
                    sku=work_part.part_number,
                    for_inventory=True,
                    is_product_or_service=True,
                )
            
            return dl_item
        except ImportError:
            return None
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create DL Item from work part: {e}")
            return None
    
    @classmethod
    def create_dl_bill(cls, purchase_order):
        """
        Create Django Ledger BillModel from PurchaseOrder when PO is received
        
        This provides automatic AP posting and vendor payment tracking
        """
        if not purchase_order.branch or purchase_order.status != 'received':
            return None
        
        # Check if already created
        if hasattr(purchase_order, 'ledger_bill') and purchase_order.ledger_bill:
            return purchase_order.ledger_bill
        
        entity = cls.get_entity(purchase_order.branch)
        if not entity:
            return None
        
        try:
            from django_ledger.models import BillModel, LedgerModel
            
            # Get or create ledger for entity - one ledger per bill
            ledger_name = f'{entity.name} - PO {purchase_order.po_number}'
            ledger, _ = LedgerModel.objects.get_or_create(
                entity=entity,
                name=ledger_name,
                defaults={'name': ledger_name}
            )
            
            # Get or create vendor
            dl_vendor = cls.get_or_create_vendor(purchase_order.supplier, entity)
            if not dl_vendor:
                return None
            
            # Get accounts for bill (required by Django Ledger)
            from django_ledger.models import ChartOfAccountModel, AccountModel
            coa = ChartOfAccountModel.objects.filter(entity=entity).first()
            cash_account = None
            prepaid_account = None
            unearned_account = None
            
            if coa:
                cash_account = AccountModel.objects.filter(coa_model=coa, code='1110').first()
                prepaid_account = AccountModel.objects.filter(coa_model=coa, code='1130').first()
                unearned_account = AccountModel.objects.filter(coa_model=coa, code='2110').first()
            
            # Calculate due date from payment terms
            due_date = purchase_order.received_date or purchase_order.order_date or timezone.now().date()
            if purchase_order.supplier.payment_terms:
                # Parse payment terms (e.g., "Net 30")
                if '30' in purchase_order.supplier.payment_terms:
                    due_date += timedelta(days=30)
                elif '15' in purchase_order.supplier.payment_terms:
                    due_date += timedelta(days=15)
                elif '60' in purchase_order.supplier.payment_terms:
                    due_date += timedelta(days=60)
                else:
                    due_date += timedelta(days=30)  # Default
            else:
                due_date += timedelta(days=30)
            
            # Create Django Ledger bill
            dl_bill = BillModel.objects.create(
                entity_model=entity,
                vendor=dl_vendor,
                ledger=ledger,
                terms=purchase_order.supplier.payment_terms or 'Net 30',
                date_due=due_date,
                markdown_notes=purchase_order.notes or '',
                cash_account=cash_account,
                prepaid_account=prepaid_account,
                unearned_account=unearned_account,
            )
            
            # Add line items using ItemTransactionModel
            from django_ledger.models import ItemTransactionModel
            for po_item in purchase_order.items.all():
                if po_item.quantity_received > 0:
                    part_item = cls.get_or_create_item(po_item.part, entity)
                    if part_item:
                        try:
                            total = po_item.quantity_received * po_item.unit_cost
                            ItemTransactionModel.objects.create(
                                bill_model=dl_bill,
                                item_model=part_item,
                                quantity=po_item.quantity_received,
                                unit_cost=po_item.unit_cost,
                                total_amount=total,
                            )
                        except Exception as e:
                            import logging
                            logger = logging.getLogger(__name__)
                            logger.error(f"Failed to add part item to DL bill: {e}")
            
            # Link back to purchase order
            purchase_order.ledger_bill = dl_bill
            purchase_order.save(update_fields=['ledger_bill'])
            
            # Django Ledger BillModel automatically posts AP entry!
            
            return dl_bill
        except ImportError:
            return None
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create DL Bill for PO {purchase_order.po_number}: {e}")
            return None
    
    @classmethod
    def post_inventory_transaction(cls, inventory_transaction):
        """
        Post accounting entry for inventory transactions
        
        Transaction types:
        - purchase: Debit Inventory (1130), Credit AP (if no PO/bill) or Cash
        - sale: Debit COGS (5110), Credit Inventory (1130)
        - damage: Debit Expense (5200), Credit Inventory (1130)
        - return: Reverse purchase entry
        - adjustment: Inventory value change
        """
        if not inventory_transaction.part:
            return None
        
        # Get branch - try from PO, WorkOrder, or Part's default branch
        branch = None
        if inventory_transaction.purchase_order and inventory_transaction.purchase_order.branch:
            branch = inventory_transaction.purchase_order.branch
        elif inventory_transaction.work_order and inventory_transaction.work_order.branch:
            branch = inventory_transaction.work_order.branch
        # If no branch found, skip (inventory transactions need branch for accounting)
        if not branch:
            return None
        
        entity = cls.get_entity(branch)
        if not entity:
            return None
        
        if not inventory_transaction.total_cost or inventory_transaction.total_cost <= 0:
            return None  # No cost to post
        
        try:
            from django_ledger.models import JournalEntryModel, TransactionModel
            
            # Get accounts
            inventory_account = cls.get_account(entity, '1130')
            if not inventory_account:
                return None
            
            cost_amount = abs(inventory_transaction.total_cost)
            
            if inventory_transaction.transaction_type == 'purchase':
                # Purchase/Receive: Debit Inventory, Credit AP (if bill exists) or Cash
                # Check if PO has bill (AP already posted)
                if inventory_transaction.purchase_order and hasattr(inventory_transaction.purchase_order, 'ledger_bill') and inventory_transaction.purchase_order.ledger_bill:
                    # AP already posted via BillModel, just post inventory
                    # This is a separate entry: Debit Inventory, Credit (AP already debited via bill)
                    # Actually, if bill exists, inventory posting is already handled
                    return None  # Skip - handled by BillModel
                else:
                    # No bill, assume cash purchase
                    cash_account = cls.get_account(entity, '1110')
                    if not cash_account:
                        return None
                    
                    # Get or create ledger for inventory transaction
                    from django_ledger.models import LedgerModel
                    ledger_name = f'{entity.name} - Inventory Transaction {inventory_transaction.id}'
                    ledger, _ = LedgerModel.objects.get_or_create(
                        entity=entity,
                        name=ledger_name,
                        defaults={'name': ledger_name}
                    )
                    
                    with transaction.atomic():
                        je = JournalEntryModel.objects.create(
                            ledger=ledger,
                            description=f"Purchase {inventory_transaction.part.part_number} - {inventory_transaction.part.name}",
                            posted=False,  # Create unposted first
                            locked=False,  # Create unlocked first
                            timestamp=inventory_transaction.transaction_date if hasattr(inventory_transaction.transaction_date, 'date') else timezone.now(),
                            origin='INVENTORY',
                            activity='OP',
                        )
                        
                        # Debit Inventory
                        TransactionModel.objects.create(
                            journal_entry=je,
                            account=inventory_account,
                            tx_type='debit',
                            amount=cost_amount,
                            description=f"Purchase {inventory_transaction.part.part_number}"
                        )
                        
                        # Credit Cash
                        TransactionModel.objects.create(
                            journal_entry=je,
                            account=cash_account,
                            tx_type='credit',
                            amount=cost_amount,
                            description=f"Payment for {inventory_transaction.part.part_number}"
                        )
                        
                        # Post and lock the journal entry
                        je.posted = True
                        je.locked = True
                        je.save()
                        
                        return je
            
            elif inventory_transaction.transaction_type == 'sale':
                # Sale/Usage: Debit COGS, Credit Inventory
                # Skip if linked to work order (COGS already posted via work order completion)
                if inventory_transaction.work_order:
                    return None  # COGS already posted from WorkOrder
                
                cogs_account = cls.get_account(entity, '5110')
                if not cogs_account:
                    return None
                
                # Get or create ledger for inventory transaction
                from django_ledger.models import LedgerModel
                ledger_name = f'{entity.name} - Inventory Transaction {inventory_transaction.id}'
                ledger, _ = LedgerModel.objects.get_or_create(
                    entity=entity,
                    name=ledger_name,
                    defaults={'name': ledger_name}
                )
                
                with transaction.atomic():
                    je = JournalEntryModel.objects.create(
                        ledger=ledger,
                        description=f"Sale/Usage {inventory_transaction.part.part_number} - {inventory_transaction.part.name}",
                        posted=False,  # Create unposted first
                        locked=False,  # Create unlocked first
                        timestamp=inventory_transaction.transaction_date if hasattr(inventory_transaction.transaction_date, 'date') else timezone.now(),
                        origin='INVENTORY',
                        activity='OP',
                    )
                    
                    # Debit COGS
                    TransactionModel.objects.create(
                        journal_entry=je,
                        account=cogs_account,
                        tx_type='debit',
                        amount=cost_amount,
                        description=f"COGS {inventory_transaction.part.part_number}"
                    )
                    
                    # Credit Inventory
                    TransactionModel.objects.create(
                        journal_entry=je,
                        account=inventory_account,
                        tx_type='credit',
                        amount=cost_amount,
                        description=f"Sale {inventory_transaction.part.part_number}"
                    )
                    
                    # Post and lock the journal entry
                    je.posted = True
                    je.locked = True
                    je.save()
                    
                    return je
            
            elif inventory_transaction.transaction_type == 'damage':
                # Damage/Loss: Debit Expense, Credit Inventory
                expense_account = cls.get_account(entity, '5200')
                if not expense_account:
                    return None
                
                # Get or create ledger for inventory transaction
                from django_ledger.models import LedgerModel
                ledger_name = f'{entity.name} - Inventory Transaction {inventory_transaction.id}'
                ledger, _ = LedgerModel.objects.get_or_create(
                    entity=entity,
                    name=ledger_name,
                    defaults={'name': ledger_name}
                )
                
                with transaction.atomic():
                    je = JournalEntryModel.objects.create(
                        ledger=ledger,
                        description=f"Damage/Loss {inventory_transaction.part.part_number} - {inventory_transaction.part.name}",
                        posted=False,  # Create unposted first
                        locked=False,  # Create unlocked first
                        timestamp=inventory_transaction.transaction_date if hasattr(inventory_transaction.transaction_date, 'date') else timezone.now(),
                        origin='INVENTORY',
                        activity='OP',
                    )
                    
                    # Debit Expense
                    TransactionModel.objects.create(
                        journal_entry=je,
                        account=expense_account,
                        tx_type='debit',
                        amount=cost_amount,
                        description=f"Damage {inventory_transaction.part.part_number}"
                    )
                    
                    # Credit Inventory
                    TransactionModel.objects.create(
                        journal_entry=je,
                        account=inventory_account,
                        tx_type='credit',
                        amount=cost_amount,
                        description=f"Damage {inventory_transaction.part.part_number}"
                    )
                    
                    # Post and lock the journal entry
                    je.posted = True
                    je.locked = True
                    je.save()
                    
                    return je
            
            # Other types (adjustment, return, transfer, count) may not need accounting entries
            # or handled differently
            
            return None
        except ImportError:
            return None
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to post inventory transaction accounting entry: {e}")
            return None

