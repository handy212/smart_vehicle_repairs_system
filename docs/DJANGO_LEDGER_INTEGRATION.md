# Django Ledger Integration Plan

This document outlines the integration plan for [Django Ledger](https://github.com/arrobalytics/django-ledger) into the Smart Vehicle Repairs System to provide double-entry accounting functionality.

## Overview

Django Ledger is a double-entry accounting system built on Django that provides:
- Double-entry bookkeeping
- Hierarchical Chart of Accounts
- Financial statements (Income Statement, Balance Sheet, Cash Flow)
- Invoices, Bills, Purchase Orders, Sales Orders
- Multi-tenancy support via Entities
- Journal Entries & Transactions

## Integration Strategy

We'll integrate Django Ledger to handle the accounting aspects while keeping our existing `Invoice` and `Payment` models for operational workflow. We'll create a bridge layer that posts accounting entries to Django Ledger when:

1. **Invoice Created** → Post to Accounts Receivable (AR)
2. **Parts Used** → Post to Cost of Goods Sold (COGS)
3. **Payment Received** → Post AR → Cash reconciliation
4. **Work Order Completed** → Post labor costs to COGS

---

## Step 1: Installation

### 1.1 Add Django Ledger to requirements.txt

```bash
django-ledger>=0.8.2.3
```

### 1.2 Update INSTALLED_APPS

Add to `config/settings/base.py`:

```python
INSTALLED_APPS = [
    # ... existing apps ...
    'django_ledger',  # Add after other third-party apps
    # ... local apps ...
]
```

### 1.3 Add Context Processor

Update `TEMPLATES` in `config/settings/base.py`:

```python
TEMPLATES = [
    {
        'OPTIONS': {
            'context_processors': [
                # ... existing processors ...
                'django_ledger.context.django_ledger_context',  # Add this
            ],
        },
    },
]
```

### 1.4 Run Migrations

```bash
python manage.py migrate
```

### 1.5 Add URLs

Add to `config/urls.py`:

```python
from django.urls import include, path

urlpatterns = [
    # ... existing patterns ...
    path('ledger/', include('django_ledger.urls', namespace='django_ledger')),
]
```

---

## Step 2: Entity Mapping

Django Ledger uses **Entities** for multi-tenancy. We'll map our **Branch** model to Django Ledger's **EntityModel**.

### 2.1 Create Entity-Branch Bridge

We'll create a one-to-one relationship between Branch and Entity, ensuring each branch has its own accounting entity.

**File: `apps/branches/models.py` (add to existing Branch model)**

```python
from django.db import models
from django_ledger.models import EntityModel

class Branch(models.Model):
    # ... existing fields ...
    
    # Django Ledger Entity reference
    ledger_entity = models.OneToOneField(
        EntityModel,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='branch',
        help_text="Django Ledger Entity for this branch"
    )
    
    def get_or_create_ledger_entity(self):
        """Get or create Django Ledger entity for this branch"""
        if not self.ledger_entity:
            from django_ledger.models import EntityModel
            from django_ledger.models import EntityModelManager
            
            entity, created = EntityModel.objects.get_or_create(
                name=self.name,
                defaults={
                    'address_1': self.address if hasattr(self, 'address') else '',
                    'city': self.city if hasattr(self, 'city') else '',
                    'state': self.state if hasattr(self, 'state') else '',
                    'zip_code': self.postal_code if hasattr(self, 'postal_code') else '',
                    'country': self.country if hasattr(self, 'country') else 'US',
                    'email': self.email if hasattr(self, 'email') else '',
                    'phone': self.phone if hasattr(self, 'phone') else '',
                }
            )
            self.ledger_entity = entity
            self.save(update_fields=['ledger_entity'])
        return self.ledger_entity
```

---

## Step 3: Chart of Accounts Setup

Django Ledger needs a Chart of Accounts configured for each Entity. We'll create standard accounts for vehicle repair operations.

### 3.1 Create Account Setup Management Command

**File: `apps/billing/management/commands/setup_chart_of_accounts.py`**

```python
from django.core.management.base import BaseCommand
from django_ledger.models import ChartOfAccountModel, AccountModel
from apps.branches.models import Branch


class Command(BaseCommand):
    help = 'Setup Chart of Accounts for all branches'
    
    def handle(self, *args, **options):
        branches = Branch.objects.all()
        
        for branch in branches:
            entity = branch.get_or_create_ledger_entity()
            
            # Get or create Chart of Accounts for entity
            coa, created = ChartOfAccountModel.objects.get_or_create(
                entity=entity,
                defaults={'name': f'{branch.name} Chart of Accounts'}
            )
            
            if created:
                self.stdout.write(
                    self.style.SUCCESS(f'Created Chart of Accounts for {branch.name}')
                )
            
            # Create standard accounts for vehicle repair business
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
            
            for account_code, account_name, account_type, parent_code in accounts:
                parent = None
                if parent_code:
                    parent = AccountModel.objects.filter(
                        code=parent_code,
                        coa=coa
                    ).first()
                
                account, created = AccountModel.objects.get_or_create(
                    code=account_code,
                    coa=coa,
                    defaults={
                        'name': account_name,
                        'role': account_type,
                        'parent': parent,
                        'active': True,
                    }
                )
                
                if created:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'  Created account: {account_code} - {account_name}'
                        )
                    )
            
            self.stdout.write(
                self.style.SUCCESS(f'Completed setup for {branch.name}')
            )
```

---

## Step 4: Accounting Integration Module

Create a module that handles posting accounting entries when business events occur.

### 4.1 Create Accounting Service

**File: `apps/billing/accounting_service.py`**

```python
"""
Accounting service for posting entries to Django Ledger
"""
from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django_ledger.models import (
    EntityModel,
    JournalEntryModel,
    TransactionModel,
    AccountModel,
    ChartOfAccountModel
)
from apps.billing.models import Invoice, Payment
from apps.workorders.models import WorkOrder, WorkOrderPart
from apps.inventory.models import InventoryTransaction


class AccountingService:
    """
    Service class for posting accounting entries to Django Ledger
    """
    
    @staticmethod
    def get_account(entity: EntityModel, account_code: str) -> AccountModel:
        """Get account by code for an entity"""
        coa = ChartOfAccountModel.objects.filter(entity=entity).first()
        if not coa:
            raise ValueError(f"No Chart of Accounts found for entity {entity.name}")
        
        account = AccountModel.objects.filter(
            coa=coa,
            code=account_code,
            active=True
        ).first()
        
        if not account:
            raise ValueError(f"Account {account_code} not found for entity {entity.name}")
        
        return account
    
    @classmethod
    def post_invoice_created(cls, invoice: Invoice):
        """
        Post journal entry when invoice is created.
        
        Debit: Accounts Receivable (1120)
        Credit: Service Revenue (4100), Parts Revenue (4110), Labor Revenue (4120)
        """
        if not invoice.work_order or not invoice.branch:
            return  # Skip if no work order or branch
        
        entity = invoice.branch.get_or_create_ledger_entity()
        
        with transaction.atomic():
            # Get accounts
            ar_account = cls.get_account(entity, '1120')
            service_revenue = cls.get_account(entity, '4100')
            parts_revenue = cls.get_account(entity, '4110')
            labor_revenue = cls.get_account(entity, '4120')
            
            # Create journal entry
            je = JournalEntryModel.objects.create(
                entity=entity,
                description=f"Invoice {invoice.invoice_number} - {invoice.customer}",
                posted=True,
                locked=True,
                date=invoice.invoice_date or timezone.now().date(),
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
            if invoice.labor_subtotal > 0:
                TransactionModel.objects.create(
                    journal_entry=je,
                    account=labor_revenue,
                    tx_type='credit',
                    amount=invoice.labor_subtotal,
                    description=f"Labor revenue - Invoice {invoice.invoice_number}"
                )
            
            if invoice.parts_subtotal > 0:
                TransactionModel.objects.create(
                    journal_entry=je,
                    account=parts_revenue,
                    tx_type='credit',
                    amount=invoice.parts_subtotal,
                    description=f"Parts revenue - Invoice {invoice.invoice_number}"
                )
            
            # Service revenue (catch-all for fees, etc.)
            service_amount = invoice.total - invoice.labor_subtotal - invoice.parts_subtotal
            if service_amount > 0:
                TransactionModel.objects.create(
                    journal_entry=je,
                    account=service_revenue,
                    tx_type='credit',
                    amount=service_amount,
                    description=f"Service revenue - Invoice {invoice.invoice_number}"
                )
            
            return je
    
    @classmethod
    def post_payment_received(cls, payment: Payment):
        """
        Post journal entry when payment is received.
        
        Debit: Cash (1110)
        Credit: Accounts Receivable (1120)
        """
        if not payment.invoice or not payment.invoice.branch:
            return
        
        entity = payment.invoice.branch.get_or_create_ledger_entity()
        
        with transaction.atomic():
            # Get accounts
            cash_account = cls.get_account(entity, '1110')
            ar_account = cls.get_account(entity, '1120')
            
            # Create journal entry
            je = JournalEntryModel.objects.create(
                entity=entity,
                description=f"Payment {payment.payment_number} for Invoice {payment.invoice.invoice_number}",
                posted=True,
                locked=True,
                date=payment.payment_date.date() if hasattr(payment.payment_date, 'date') else payment.payment_date,
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
            
            return je
    
    @classmethod
    def post_parts_cost(cls, work_order: WorkOrder):
        """
        Post journal entry when parts are used/installed.
        
        Debit: Cost of Goods Sold - Parts (5110)
        Credit: Inventory - Parts (1130)
        """
        if not work_order.branch:
            return
        
        entity = work_order.branch.get_or_create_ledger_entity()
        
        # Calculate total parts cost
        parts_cost = work_order.actual_parts_cost or Decimal('0')
        if parts_cost <= 0:
            return  # No parts cost to post
        
        with transaction.atomic():
            # Get accounts
            cogs_parts = cls.get_account(entity, '5110')
            inventory_parts = cls.get_account(entity, '1130')
            
            # Create journal entry
            je = JournalEntryModel.objects.create(
                entity=entity,
                description=f"Parts cost for Work Order {work_order.work_order_number}",
                posted=True,
                locked=True,
                date=timezone.now().date(),
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
            
            return je
    
    @classmethod
    def post_labor_cost(cls, work_order: WorkOrder):
        """
        Post journal entry when labor is completed.
        
        Debit: Cost of Goods Sold - Labor (5120)
        Credit: Cash or Payroll Payable (depending on payment structure)
        
        Note: Adjust credit account based on your payroll setup
        """
        if not work_order.branch:
            return
        
        entity = work_order.branch.get_or_create_ledger_entity()
        
        # Calculate total labor cost
        labor_cost = work_order.actual_labor_cost or Decimal('0')
        if labor_cost <= 0:
            return
        
        with transaction.atomic():
            # Get accounts
            cogs_labor = cls.get_account(entity, '5120')
            # Assuming labor is paid immediately (adjust based on your payroll)
            cash_account = cls.get_account(entity, '1110')
            
            # Create journal entry
            je = JournalEntryModel.objects.create(
                entity=entity,
                description=f"Labor cost for Work Order {work_order.work_order_number}",
                posted=True,
                locked=True,
                date=timezone.now().date(),
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
            
            return je
```

---

## Step 5: Integrate with Existing Models

### 5.1 Update Invoice Model Signals

**File: `apps/billing/signals.py` (create new file)**

```python
from django.db.models.signals import post_save
from django.dispatch import receiver
from apps.billing.models import Invoice
from apps.billing.accounting_service import AccountingService


@receiver(post_save, sender=Invoice)
def invoice_post_save(sender, instance, created, **kwargs):
    """
    Post accounting entries when invoice is created or updated
    """
    if created and instance.status != 'void':
        # Only post if invoice is not void and has a work order
        if instance.work_order:
            try:
                AccountingService.post_invoice_created(instance)
            except Exception as e:
                # Log error but don't fail invoice creation
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to post accounting entry for invoice {instance.invoice_number}: {e}")
```

### 5.2 Update Payment Model Signals

**File: `apps/billing/signals.py` (add to existing)**

```python
from django.db.models.signals import post_save
from django.dispatch import receiver
from apps.billing.models import Payment
from apps.billing.accounting_service import AccountingService


@receiver(post_save, sender=Payment)
def payment_post_save(sender, instance, created, **kwargs):
    """
    Post accounting entries when payment is received
    """
    if created and instance.status == 'completed':
        try:
            AccountingService.post_payment_received(instance)
        except Exception as e:
            # Log error but don't fail payment creation
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to post accounting entry for payment {instance.payment_number}: {e}")
```

### 5.3 Connect Signals in AppConfig

**File: `apps/billing/apps.py`**

```python
from django.apps import AppConfig


class BillingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.billing'
    
    def ready(self):
        import apps.billing.signals  # Import signals to connect them
```

### 5.4 Update WorkOrder Completion

**File: `apps/workorders/models.py` (add to WorkOrder.transition_to method)**

```python
def transition_to(self, new_status, user=None, notify=True):
    # ... existing code ...
    
    # Post accounting entries when work order is completed
    if new_status == 'completed':
        try:
            from apps.billing.accounting_service import AccountingService
            # Post parts cost
            AccountingService.post_parts_cost(self)
            # Post labor cost
            AccountingService.post_labor_cost(self)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to post accounting entries for WO {self.work_order_number}: {e}")
    
    # ... rest of existing code ...
```

---

## Step 6: Add Accountant Role

### 6.1 Update User Roles

**File: `apps/accounts/models.py`**

Add to `ROLE_CHOICES`:

```python
ROLE_CHOICES = (
    # ... existing roles ...
    ('accountant', 'Accountant'),
)
```

### 6.2 Update Role Permissions

**File: `config/roles.py`**

```python
class Accountant(AbstractUserRole):
    """Accountant - financial reporting and GL management"""
    available_permissions = {
        'view_ledger': True,
        'manage_ledger': True,
        'view_financial_reports': True,
        'view_billing': True,
        'view_all_reports': True,
    }
```

---

## Step 7: Testing the Integration

### 7.1 Test Script

**File: `apps/billing/tests/test_accounting_integration.py`**

```python
from django.test import TestCase
from django_ledger.models import EntityModel, JournalEntryModel
from apps.billing.models import Invoice, Payment
from apps.workorders.models import WorkOrder
from apps.branches.models import Branch


class AccountingIntegrationTest(TestCase):
    
    def setUp(self):
        # Create test branch
        self.branch = Branch.objects.create(name='Test Branch')
        entity = self.branch.get_or_create_ledger_entity()
        
        # Setup chart of accounts (run management command or create manually)
        
    def test_invoice_creates_ar_entry(self):
        """Test that invoice creation posts to AR"""
        # Create invoice
        invoice = Invoice.objects.create(...)
        
        # Check that journal entry was created
        je = JournalEntryModel.objects.filter(
            entity=self.branch.ledger_entity,
            origin='INVOICE'
        ).first()
        
        self.assertIsNotNone(je)
        
    def test_payment_creates_cash_entry(self):
        """Test that payment posts AR -> Cash"""
        # Create payment
        payment = Payment.objects.create(...)
        
        # Check journal entry
        je = JournalEntryModel.objects.filter(
            entity=self.branch.ledger_entity,
            origin='PAYMENT'
        ).first()
        
        self.assertIsNotNone(je)
```

---

## Step 8: Migration Path

For existing data, create a migration script to backfill accounting entries.

**File: `apps/billing/management/commands/backfill_accounting_entries.py`**

```python
from django.core.management.base import BaseCommand
from apps.billing.models import Invoice, Payment
from apps.workorders.models import WorkOrder
from apps.billing.accounting_service import AccountingService


class Command(BaseCommand):
    help = 'Backfill accounting entries for existing invoices and payments'
    
    def handle(self, *args, **options):
        # Process existing invoices
        invoices = Invoice.objects.filter(status__in=['sent', 'paid'])
        for invoice in invoices:
            try:
                AccountingService.post_invoice_created(invoice)
                self.stdout.write(f'Processed invoice {invoice.invoice_number}')
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'Error processing invoice {invoice.invoice_number}: {e}')
                )
        
        # Process existing payments
        payments = Payment.objects.filter(status='completed')
        for payment in payments:
            try:
                AccountingService.post_payment_received(payment)
                self.stdout.write(f'Processed payment {payment.payment_number}')
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'Error processing payment {payment.payment_number}: {e}')
                )
        
        # Process completed work orders
        work_orders = WorkOrder.objects.filter(status='completed')
        for wo in work_orders:
            try:
                AccountingService.post_parts_cost(wo)
                AccountingService.post_labor_cost(wo)
                self.stdout.write(f'Processed work order {wo.work_order_number}')
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'Error processing WO {wo.work_order_number}: {e}')
                )
```

---

## Summary

This integration plan:

1. ✅ **Installs Django Ledger** and configures it
2. ✅ **Maps Branch to Entity** for multi-tenancy
3. ✅ **Creates Chart of Accounts** with standard accounts for vehicle repair
4. ✅ **Posts AR entries** when invoices are created
5. ✅ **Posts Cash entries** when payments are received
6. ✅ **Posts COGS entries** when parts/labor are used
7. ✅ **Adds Accountant role** for financial management
8. ✅ **Provides backfill script** for existing data

The integration maintains your existing Invoice and Payment models for workflow, while Django Ledger handles the accounting behind the scenes.

