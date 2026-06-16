from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from apps.billing.models import Bill, BillLineItem
from apps.inventory.models import Supplier
from apps.branches.models import Branch
from apps.accounts.permission_models import Permission, Role
from django.utils import timezone
from decimal import Decimal

User = get_user_model()

class BillTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(
            username='testuser',
            password='password123',
            email='test@example.com',
            role='super-admin'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        self.branch = Branch.objects.create(name="Main Branch", code="MAIN", is_active=True, created_by=self.user)
        self.supplier = Supplier.objects.create(name="Test Vendor", supplier_code="TEST001")

        from apps.accounting.models import AccountingControl
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
        controls.inventory_asset_account = AccountingService.get_or_create_account(
            '1500', 'Inventory Asset', 'asset', 'debit'
        )
        controls.save()
        
        # Add user to branch (if applicable, or assume superuser for simplicity)
        # self.user.branches.add(self.branch) 

    def _create_bill(self, **kwargs):
        defaults = {
            "vendor": self.supplier,
            "branch": self.branch,
            "bill_date": timezone.now().date(),
            "due_date": timezone.now().date(),
            "created_by": self.user,
            "total": Decimal("100.00"),
            "amount_due": Decimal("100.00"),
        }
        defaults.update(kwargs)
        bill = Bill.objects.create(**defaults)
        BillLineItem.objects.create(
            bill=bill,
            description="Test bill line",
            quantity=1,
            unit_price=defaults["total"],
            is_taxable=False,
        )
        bill.refresh_from_db()
        return bill

    def _staff_user_with_permissions(self, email, role_code, permission_codes):
        role, _ = Role.objects.update_or_create(
            code=role_code,
            defaults={"name": role_code.title(), "is_active": True},
        )
        for code in permission_codes:
            permission, _ = Permission.objects.update_or_create(
                code=code,
                defaults={"name": code.replace("_", " ").title(), "category": "billing", "is_active": True},
            )
            role.permissions.add(permission)

        return User.objects.create_user(
            username=email,
            email=email,
            password="password123",
            role=role_code,
            branch=self.branch,
        )

    def test_create_bill(self):
        url = reverse('api_billing:bill-list')
        data = {
            "vendor": self.supplier.id,
            "branch": self.branch.id,
            "bill_date": timezone.now().date(),
            "due_date": timezone.now().date(),
            "terms": "Net 30",
            "notes": "Test Bill",
            "line_items": [
                {
                    "description": "Test Item 1",
                    "quantity": 2,
                    "unit_price": "100.00",
                    "expense_category": "Office Supplies",
                    "is_taxable": False,
                },
                 {
                    "description": "Test Item 2",
                    "quantity": 1,
                    "unit_price": "50.00",
                    "is_taxable": False,
                }
            ]
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Bill.objects.count(), 1)
        self.assertEqual(BillLineItem.objects.count(), 2)
        
        bill = Bill.objects.first()
        self.assertEqual(bill.total, Decimal('250.00'))
        self.assertEqual(bill.vendor, self.supplier)
        self.assertEqual(bill.status, 'draft')
        
        # Check generated bill number
        self.assertTrue(bill.bill_number.startswith('BILL'))

    def test_create_bill_validation(self):
        url = reverse('api_billing:bill-list')
        data = {
            "vendor": self.supplier.id,
            "branch": self.branch.id,
            # Missing line items
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
    def test_get_bills(self):
        self._create_bill()
        
        url = reverse('api_billing:bill-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)

    def test_assigned_bill_approver_can_approve_without_manage_billing(self):
        approver = self._staff_user_with_permissions(
            "approver@example.com",
            "accountant",
            ["edit_bills", "view_bills"],
        )
        bill = self._create_bill(
            status="pending_approval",
            submitted_by=self.user,
            submitted_at=timezone.now(),
            assigned_approver=approver,
        )

        self.client.force_authenticate(user=approver)
        response = self.client.post(reverse('api_billing:bill-approve', args=[bill.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        bill.refresh_from_db()
        self.assertEqual(bill.status, "open")
        self.assertEqual(bill.approved_by, approver)

    def test_unassigned_edit_bill_user_cannot_approve_pending_bill(self):
        assigned = self._staff_user_with_permissions(
            "assigned@example.com",
            "accountant",
            ["edit_bills", "view_bills"],
        )
        other = self._staff_user_with_permissions(
            "other@example.com",
            "service_coordinator",
            ["edit_bills", "view_bills"],
        )
        bill = self._create_bill(
            status="pending_approval",
            submitted_by=self.user,
            submitted_at=timezone.now(),
            assigned_approver=assigned,
        )

        self.client.force_authenticate(user=other)
        response = self.client.post(reverse('api_billing:bill-approve', args=[bill.id]))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        bill.refresh_from_db()
        self.assertEqual(bill.status, "pending_approval")

    def test_pending_bill_cannot_be_edited_or_opened_by_update(self):
        bill = self._create_bill(
            status="pending_approval",
            submitted_by=self.user,
            submitted_at=timezone.now(),
            assigned_approver=self.user,
        )
        url = reverse('api_billing:bill-detail', args=[bill.id])
        data = {
            "vendor": self.supplier.id,
            "branch": self.branch.id,
            "bill_date": str(bill.bill_date),
            "due_date": str(bill.due_date),
            "status": "open",
            "line_items": [
                {
                    "description": "Changed",
                    "quantity": 1,
                    "unit_price": "100.00",
                }
            ],
        }

        response = self.client.put(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        bill.refresh_from_db()
        self.assertEqual(bill.status, "pending_approval")

    # def test_ledger_integration_trigger(self):
    #     # mocking AccountingService to avoid actual DB ledger creation during basic tests
    #     # or we verify that ledger_bill is None if setup is not complete, but no crash
        
    #     from unittest.mock import patch
        
    #     with patch('apps.billing.accounting_service.AccountingService.create_dl_bill_from_bill') as mock_create_dl:
    #         mock_create_dl.return_value = None # Simulate success or no-op
            
    #         url = reverse('api_billing:bill-list')
    #         data = {
    #             "vendor": self.supplier.id,
    #             "branch": self.branch.id,
    #             "bill_date": timezone.now().date(),
    #             "due_date": timezone.now().date(),
    #             "line_items": [
    #                 {
    #                     "description": "Test Item 1",
    #                     "quantity": 1,
    #                     "unit_price": "10.00"
    #                 }
    #             ]
    #         }
    #         self.client.post(url, data, format='json')
            
    #         # Verify signal called the service
    #         self.assertTrue(mock_create_dl.called)
    #         # mock_create_dl.assert_called_once() # Called multiple times due to line item saves triggering parent save
