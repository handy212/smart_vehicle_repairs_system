from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounting.models import RevenueProduct
from apps.accounts.models import User
from apps.branches.models import Branch


class RevenueProductListViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='rev_products',
            email='rev_products@example.com',
            password='password',
            role='admin',
        )
        self.branch = Branch.objects.create(name='Kumasi', code='KSI', created_by=self.user)
        self.company_product = RevenueProduct.objects.create(
            code='labor_mechanical',
            name='Mechanical Labour',
            owner_account_code='658',
            revenue_class='labor',
            default_billing_line_type='labor',
        )
        self.branch_product = RevenueProduct.objects.create(
            code='labor_mechanical',
            name='Mechanical Labour (Kumasi)',
            owner_account_code='658K',
            revenue_class='labor',
            default_billing_line_type='labor',
            branch=self.branch,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_list_accepts_branch_all_for_admin_catalog(self):
        response = self.client.get(
            '/api/accounting/revenue-products/',
            {'branch': 'all', 'is_active': 'true'},
        )
        self.assertEqual(response.status_code, 200)
        ids = {row['id'] for row in response.data['results']}
        self.assertEqual(ids, {self.company_product.id, self.branch_product.id})
