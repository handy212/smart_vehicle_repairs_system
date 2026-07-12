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

    def test_create_branch_override_accepts_branch_account_suffix(self):
        other_branch = Branch.objects.create(name='Tamale', code='TAM', created_by=self.user)
        response = self.client.post(
            '/api/accounting/revenue-products/',
            {
                'code': 'labor_mechanical',
                'name': 'Mechanical Labour (Tamale)',
                'branch': other_branch.id,
                'owner_account_code': '658K',
                'owner_account_label': 'Mechanical Labour Sales',
                'revenue_class': 'labor',
                'default_billing_line_type': 'labor',
                'is_active': True,
                'sort_order': 30,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['owner_account_code'], '658K')
        self.assertEqual(response.data['branch'], other_branch.id)
