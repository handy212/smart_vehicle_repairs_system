from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError

from apps.accounting.models import Account
from apps.accounting.settlement_accounts import (
    assign_settlement_account_to_branch,
    bank_account_queryset,
    branch_settlement_overview,
    deactivate_branch_settlement_accounts,
    settlement_accounts_for_branch,
    unassign_settlement_account_from_branch,
    update_branch_settlement_accounts,
    validate_settlement_account_for_branch,
)
from apps.branches.models import Branch

User = get_user_model()


class SettlementAccountHelpersTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            email='settlement-admin@test.com',
            username='settlement-admin',
            password='testpass123',
            role='admin',
        )
        cls.branch_a = Branch.objects.create(
            name='Kumasi HQ',
            code='KUM',
            phone='000',
            address='1 Main',
            city='Kumasi',
            state='Ashanti',
            zip_code='00000',
            created_by=cls.admin,
        )
        cls.branch_b = Branch.objects.create(
            name='Accra Branch',
            code='ACC',
            phone='000',
            address='2 Main',
            city='Accra',
            state='Greater Accra',
            zip_code='00001',
            created_by=cls.admin,
        )
        cls.shared_bank = Account.objects.create(
            code='1100',
            name='Shared Operating Bank',
            account_type='asset',
            balance_type='debit',
            account_subtype='bank',
            is_active=True,
        )
        cls.kumasi_bank = Account.objects.create(
            code='1111',
            name='Kumasi Absa',
            account_type='asset',
            balance_type='debit',
            account_subtype='bank',
            branch=cls.branch_a,
            is_active=True,
        )
        cls.accra_bank = Account.objects.create(
            code='1114',
            name='Accra Absa',
            account_type='asset',
            balance_type='debit',
            account_subtype='bank',
            branch=cls.branch_b,
            is_active=True,
        )

    @override_settings(SETTLEMENT_ACCOUNT_BRANCH_ENFORCEMENT=True)
    def test_branch_specific_accounts_filter_other_branches(self):
        allowed = settlement_accounts_for_branch(self.branch_a)
        codes = set(allowed.values_list('code', flat=True))
        self.assertIn('1111', codes)
        self.assertIn('1100', codes)
        self.assertNotIn('1114', codes)

    @override_settings(SETTLEMENT_ACCOUNT_BRANCH_ENFORCEMENT=True)
    def test_validate_rejects_cross_branch_bank(self):
        with self.assertRaises(ValidationError):
            validate_settlement_account_for_branch(
                self.accra_bank,
                self.branch_a,
                field_name='bank_account',
            )

    @override_settings(SETTLEMENT_ACCOUNT_BRANCH_ENFORCEMENT=True)
    def test_bank_account_queryset_scoped_to_branch(self):
        qs = bank_account_queryset(branch=self.branch_b)
        codes = set(qs.values_list('code', flat=True))
        self.assertTrue({'1114', '1100'}.issubset(codes))
        self.assertNotIn('1111', codes)

    @override_settings(SETTLEMENT_ACCOUNT_BRANCH_ENFORCEMENT=False)
    def test_enforcement_disabled_allows_any_account(self):
        validate_settlement_account_for_branch(
            self.accra_bank,
            self.branch_a,
            field_name='bank_account',
        )

    def test_deactivate_branch_settlement_accounts(self):
        count = deactivate_branch_settlement_accounts(self.branch_a)
        self.assertEqual(count, 1)
        self.kumasi_bank.refresh_from_db()
        self.assertFalse(self.kumasi_bank.is_active)
        self.shared_bank.refresh_from_db()
        self.assertTrue(self.shared_bank.is_active)

    def test_assign_and_unassign_settlement_account(self):
        assign_settlement_account_to_branch(self.shared_bank, self.branch_a)
        self.shared_bank.refresh_from_db()
        self.assertEqual(self.shared_bank.branch_id, self.branch_a.id)

        overview = branch_settlement_overview(self.branch_a)
        assigned_codes = {row['code'] for row in overview['assigned']}
        self.assertIn('1100', assigned_codes)

        unassign_settlement_account_from_branch(self.shared_bank, self.branch_a)
        self.shared_bank.refresh_from_db()
        self.assertIsNone(self.shared_bank.branch_id)

    def test_update_branch_settlement_accounts_bulk(self):
        result = update_branch_settlement_accounts(
            self.branch_b,
            assign_ids=[self.shared_bank.id],
        )
        self.assertEqual(len(result['assigned']), 1)
        self.assertEqual(result['errors'], [])
        self.shared_bank.refresh_from_db()
        self.assertEqual(self.shared_bank.branch_id, self.branch_b.id)
