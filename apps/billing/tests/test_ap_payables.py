"""Integration tests for Accounts Payable: Bills, Pay Bills, Vendor Expenses, Vendor Credits."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounting.models import AccountingControl, JournalEntry
from apps.billing.models import (
    Bill,
    BillLineItem,
    BillPayment,
    VendorCredit,
    VendorExpense,
)
from apps.branches.models import Branch
from apps.inventory.models import Supplier

User = get_user_model()


class APPayablesBase(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(
            username='ap_tester',
            password='password123',
            email='ap@test.example.com',
            role='super-admin',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.branch = Branch.objects.create(
            name='AP Test Branch',
            code='APTB',
            is_active=True,
            created_by=self.user,
        )
        self.client.defaults['HTTP_X_BRANCH_ID'] = str(self.branch.id)
        self.supplier = Supplier.objects.create(name='AP Vendor', supplier_code='APV001')
        self._wire_accounting()

    def _wire_accounting(self):
        from apps.accounting.services import AccountingService

        controls = AccountingControl.get_settings()
        controls.accounts_payable_account = AccountingService.get_or_create_account(
            '2000', 'Accounts Payable', 'liability', 'credit'
        )
        controls.default_expense_account = AccountingService.get_or_create_account(
            '5000', 'Operating Expense', 'expense', 'debit'
        )
        controls.input_tax_account = AccountingService.get_or_create_account(
            '2200', 'Input Tax', 'asset', 'debit'
        )
        controls.purchase_returns_account = AccountingService.get_or_create_account(
            '5100', 'Purchase Returns', 'expense', 'credit'
        )
        bank = AccountingService.get_or_create_account('1100', 'Operating Bank', 'asset', 'debit')
        bank.account_subtype = 'bank'
        bank.save(update_fields=['account_subtype'])
        controls.default_bank_account = bank
        controls.save()
        self.bank = bank
        self.expense_account = controls.default_expense_account

    def _open_bill(self, total=Decimal('100.00')):
        bill = Bill.objects.create(
            vendor=self.supplier,
            branch=self.branch,
            bill_date=timezone.now().date(),
            due_date=timezone.now().date(),
            status='open',
            created_by=self.user,
        )
        BillLineItem.objects.create(
            bill=bill,
            description='Test line',
            quantity=1,
            unit_price=total,
            is_taxable=False,
        )
        bill.refresh_from_db()
        return bill


class BillWorkflowTests(APPayablesBase):
    def test_submit_approve_bill_workflow(self):
        create_url = reverse('api_billing:bill-list')
        response = self.client.post(
            create_url,
            {
                'vendor': self.supplier.id,
                'branch': self.branch.id,
                'bill_date': timezone.now().date().isoformat(),
                'due_date': timezone.now().date().isoformat(),
                'line_items': [
                    {
                        'description': 'Parts',
                        'quantity': 1,
                        'unit_price': '150.00',
                        'is_taxable': False,
                    }
                ],
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        bill_id = response.data['id']

        approver = User.objects.create_user(
            username='bill_approver',
            email='approver@test.example.com',
            password='password123',
            role='accountant',
            branch=self.branch,
        )

        submit_url = reverse('api_billing:bill-submit-for-approval', args=[bill_id])
        submit_response = self.client.post(
            submit_url,
            {'approver_id': approver.id},
            format='json',
        )
        self.assertEqual(submit_response.status_code, status.HTTP_200_OK, submit_response.data)
        bill = Bill.objects.get(pk=bill_id)
        self.assertEqual(bill.status, 'pending_approval')

        self.client.force_authenticate(user=approver)
        approve_url = reverse('api_billing:bill-approve', args=[bill_id])
        approve_response = self.client.post(approve_url, format='json')
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK, approve_response.data)
        bill.refresh_from_db()
        self.assertEqual(bill.status, 'open')

    def test_void_draft_bill(self):
        create = self.client.post(
            reverse('api_billing:bill-list'),
            {
                'vendor': self.supplier.id,
                'branch': self.branch.id,
                'bill_date': timezone.now().date().isoformat(),
                'due_date': timezone.now().date().isoformat(),
                'line_items': [
                    {
                        'description': 'Draft to void',
                        'quantity': 1,
                        'unit_price': '50.00',
                        'is_taxable': False,
                    }
                ],
            },
            format='json',
        )
        bill_id = create.data['id']
        url = reverse('api_billing:bill-void', args=[bill_id])
        response = self.client.post(url, {'reason': 'Duplicate entry'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        bill = Bill.objects.get(pk=bill_id)
        self.assertEqual(bill.status, 'void')

    def test_record_single_bill_payment(self):
        bill = self._open_bill(total=Decimal('80.00'))
        url = reverse('api_billing:bill-record-payment', args=[bill.id])
        response = self.client.post(
            url,
            {
                'amount': '80.00',
                'payment_date': timezone.now().date().isoformat(),
                'payment_method': 'bank_transfer',
                'bank_account': self.bank.id,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        bill.refresh_from_db()
        self.assertEqual(bill.amount_paid, Decimal('80.00'))
        self.assertEqual(bill.amount_due, Decimal('0.00'))
        self.assertEqual(bill.status, 'paid')
        self.assertEqual(bill.amount_due, Decimal('0.00'))


class PayBillsTests(APPayablesBase):
    def test_pay_bills_batch_partial_then_full(self):
        bill1 = self._open_bill(total=Decimal('100.00'))
        bill2 = self._open_bill(total=Decimal('50.00'))

        partial = self.client.post(
            reverse('api_billing:pay-bills-batch'),
            {
                'vendor': self.supplier.id,
                'payment_date': timezone.now().date().isoformat(),
                'payment_method': 'bank_transfer',
                'bank_account': self.bank.id,
                'lines': [{'bill_id': bill1.id, 'amount': '40.00'}],
            },
            format='json',
        )
        self.assertEqual(partial.status_code, status.HTTP_201_CREATED, partial.data)
        bill1.refresh_from_db()
        self.assertEqual(bill1.status, 'partially_paid')
        self.assertEqual(bill1.amount_due, Decimal('60.00'))

        full = self.client.post(
            reverse('api_billing:pay-bills-batch'),
            {
                'vendor': self.supplier.id,
                'payment_date': timezone.now().date().isoformat(),
                'payment_method': 'bank_transfer',
                'bank_account': self.bank.id,
                'lines': [
                    {'bill_id': bill1.id, 'amount': '60.00'},
                    {'bill_id': bill2.id, 'amount': '50.00'},
                ],
            },
            format='json',
        )
        self.assertEqual(full.status_code, status.HTTP_201_CREATED, full.data)
        bill1.refresh_from_db()
        bill2.refresh_from_db()
        self.assertEqual(bill1.status, 'paid')
        self.assertEqual(bill2.status, 'paid')
        self.assertEqual(BillPayment.objects.filter(bill__vendor=self.supplier).count(), 3)

    def test_pay_bills_rejects_draft_bill(self):
        bill = Bill.objects.create(
            vendor=self.supplier,
            branch=self.branch,
            bill_date=timezone.now().date(),
            due_date=timezone.now().date(),
            status='draft',
            created_by=self.user,
        )
        BillLineItem.objects.create(
            bill=bill,
            description='Draft line',
            quantity=1,
            unit_price=Decimal('25.00'),
            is_taxable=False,
        )
        response = self.client.post(
            reverse('api_billing:pay-bills-batch'),
            {
                'vendor': self.supplier.id,
                'payment_date': timezone.now().date().isoformat(),
                'payment_method': 'bank_transfer',
                'bank_account': self.bank.id,
                'lines': [{'bill_id': bill.id, 'amount': '25.00'}],
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class VendorExpenseTests(APPayablesBase):
    def test_create_list_vendor_expense(self):
        create_url = reverse('api_billing:vendor-expense-list')
        response = self.client.post(
            create_url,
            {
                'vendor': self.supplier.id,
                'branch': self.branch.id,
                'expense_date': timezone.now().date().isoformat(),
                'payment_method': 'bank_transfer',
                'bank_account': self.bank.id,
                'line_items': [
                    {
                        'description': 'Shop supplies',
                        'expense_account': self.expense_account.id,
                        'quantity': 2,
                        'unit_price': '25.00',
                    }
                ],
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['status'], 'posted')
        self.assertEqual(Decimal(str(response.data['total'])), Decimal('50.00'))
        self.assertTrue(response.data['expense_number'].startswith('VEXP'))

        list_response = self.client.get(create_url, {'vendor': self.supplier.id})
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(list_response.data.get('count', len(list_response.data)), 1)

        expense = VendorExpense.objects.get(pk=response.data['id'])
        je = JournalEntry.objects.filter(
            content_type__model='vendorexpense',
            object_id=expense.id,
        ).first()
        self.assertIsNotNone(je)

    def test_update_vendor_expense(self):
        create = self.client.post(
            reverse('api_billing:vendor-expense-list'),
            {
                'vendor': self.supplier.id,
                'branch': self.branch.id,
                'expense_date': timezone.now().date().isoformat(),
                'payment_method': 'bank_transfer',
                'bank_account': self.bank.id,
                'line_items': [
                    {
                        'description': 'Fuel',
                        'expense_account': self.expense_account.id,
                        'quantity': 1,
                        'unit_price': '30.00',
                    }
                ],
            },
            format='json',
        )
        expense_id = create.data['id']
        update_url = reverse('api_billing:vendor-expense-detail', args=[expense_id])
        update = self.client.patch(
            update_url,
            {
                'vendor': self.supplier.id,
                'branch': self.branch.id,
                'expense_date': timezone.now().date().isoformat(),
                'payment_method': 'bank_transfer',
                'bank_account': self.bank.id,
                'line_items': [
                    {
                        'description': 'Fuel (updated)',
                        'expense_account': self.expense_account.id,
                        'quantity': 1,
                        'unit_price': '45.00',
                    }
                ],
            },
            format='json',
        )
        self.assertEqual(update.status_code, status.HTTP_200_OK, update.data)
        expense = VendorExpense.objects.get(pk=expense_id)
        self.assertEqual(expense.total, Decimal('45.00'))

    def test_void_vendor_expense(self):
        create = self.client.post(
            reverse('api_billing:vendor-expense-list'),
            {
                'vendor': self.supplier.id,
                'branch': self.branch.id,
                'expense_date': timezone.now().date().isoformat(),
                'payment_method': 'bank_transfer',
                'bank_account': self.bank.id,
                'line_items': [
                    {
                        'description': 'To void',
                        'expense_account': self.expense_account.id,
                        'quantity': 1,
                        'unit_price': '10.00',
                    }
                ],
            },
            format='json',
        )
        expense_id = create.data['id']
        void_url = reverse('api_billing:vendor-expense-void', args=[expense_id])
        void = self.client.post(void_url, {'reason': 'Entered in error'}, format='json')
        self.assertEqual(void.status_code, status.HTTP_200_OK, void.data)
        expense = VendorExpense.objects.get(pk=expense_id)
        self.assertEqual(expense.status, 'void')

    def test_vendor_expense_requires_line_items(self):
        response = self.client.post(
            reverse('api_billing:vendor-expense-list'),
            {
                'vendor': self.supplier.id,
                'branch': self.branch.id,
                'expense_date': timezone.now().date().isoformat(),
                'payment_method': 'bank_transfer',
                'bank_account': self.bank.id,
                'line_items': [],
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class VendorCreditTests(APPayablesBase):
    def test_create_issue_apply_vendor_credit(self):
        bill = self._open_bill(total=Decimal('200.00'))

        create_url = reverse('api_billing:vendor-credit-list')
        create = self.client.post(
            create_url,
            {
                'vendor': self.supplier.id,
                'credit_date': timezone.now().date().isoformat(),
                'reason': 'Returned goods',
                'line_items': [
                    {
                        'description': 'Return credit',
                        'quantity': 1,
                        'unit_price': '75.00',
                        'is_taxable': False,
                    }
                ],
            },
            format='json',
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED, create.data)
        credit_id = create.data['id']
        credit = VendorCredit.objects.get(pk=credit_id)
        self.assertEqual(credit.status, 'draft')

        issue_url = reverse('api_billing:vendor-credit-issue', args=[credit_id])
        issue = self.client.post(issue_url, format='json')
        self.assertEqual(issue.status_code, status.HTTP_200_OK, issue.data)
        self.assertEqual(issue.data['status'], 'issued')

        apply_url = reverse('api_billing:vendor-credit-apply', args=[credit_id])
        apply = self.client.post(apply_url, {'bill': bill.id, 'amount': '75.00'}, format='json')
        self.assertEqual(apply.status_code, status.HTTP_200_OK, apply.data)

        bill.refresh_from_db()
        credit = VendorCredit.objects.get(pk=credit_id)
        self.assertEqual(bill.amount_paid, Decimal('75.00'))
        self.assertEqual(bill.amount_due, Decimal('125.00'))
        self.assertEqual(credit.unused_amount, Decimal('0.00'))

    def test_vendor_credit_apply_rejects_wrong_vendor(self):
        other_supplier = Supplier.objects.create(name='Other Vendor', supplier_code='OTH001')
        bill = Bill.objects.create(
            vendor=other_supplier,
            branch=self.branch,
            bill_date=timezone.now().date(),
            due_date=timezone.now().date(),
            status='open',
            created_by=self.user,
        )
        BillLineItem.objects.create(
            bill=bill,
            description='Other vendor bill',
            quantity=1,
            unit_price=Decimal('100.00'),
            is_taxable=False,
        )

        create = self.client.post(
            reverse('api_billing:vendor-credit-list'),
            {
                'vendor': self.supplier.id,
                'credit_date': timezone.now().date().isoformat(),
                'line_items': [
                    {
                        'description': 'Credit',
                        'quantity': 1,
                        'unit_price': '50.00',
                        'is_taxable': False,
                    }
                ],
            },
            format='json',
        )
        credit_id = create.data['id']
        self.client.post(reverse('api_billing:vendor-credit-issue', args=[credit_id]), format='json')

        apply = self.client.post(
            reverse('api_billing:vendor-credit-apply', args=[credit_id]),
            {'bill': bill.id},
            format='json',
        )
        self.assertEqual(apply.status_code, status.HTTP_400_BAD_REQUEST)

    def test_vendor_credit_cannot_apply_draft(self):
        bill = self._open_bill()
        create = self.client.post(
            reverse('api_billing:vendor-credit-list'),
            {
                'vendor': self.supplier.id,
                'credit_date': timezone.now().date().isoformat(),
                'line_items': [
                    {
                        'description': 'Draft credit',
                        'quantity': 1,
                        'unit_price': '20.00',
                        'is_taxable': False,
                    }
                ],
            },
            format='json',
        )
        credit_id = create.data['id']
        apply = self.client.post(
            reverse('api_billing:vendor-credit-apply', args=[credit_id]),
            {'bill': bill.id},
            format='json',
        )
        self.assertEqual(apply.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_vendor_credits_filtered_by_bill(self):
        bill = self._open_bill()
        self.client.post(
            reverse('api_billing:vendor-credit-list'),
            {
                'vendor': self.supplier.id,
                'credit_date': timezone.now().date().isoformat(),
                'line_items': [
                    {
                        'description': 'Credit A',
                        'quantity': 1,
                        'unit_price': '10.00',
                        'is_taxable': False,
                    }
                ],
            },
            format='json',
        )
        list_url = reverse('api_billing:vendor-credit-list')
        response = self.client.get(list_url, {'bill': bill.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
