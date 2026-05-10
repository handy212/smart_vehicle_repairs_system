from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from apps.billing.models import Bill, BillLineItem
from apps.inventory.models import Supplier
from apps.branches.models import Branch
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
        
        # Add user to branch (if applicable, or assume superuser for simplicity)
        # self.user.branches.add(self.branch) 

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
                    "expense_category": "Office Supplies"
                },
                 {
                    "description": "Test Item 2",
                    "quantity": 1,
                    "unit_price": "50.00"
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
        Bill.objects.create(
            vendor=self.supplier,
            branch=self.branch,
            bill_date=timezone.now().date(),
            due_date=timezone.now().date(),
            created_by=self.user,
            total=Decimal('100.00'),
            amount_due=Decimal('100.00')
        )
        
        url = reverse('api_billing:bill-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)

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
