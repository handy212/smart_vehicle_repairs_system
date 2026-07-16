from django.test import SimpleTestCase

from apps.accounts.bank_details import parse_invoice_bank_accounts


class ParseInvoiceBankAccountsTests(SimpleTestCase):
    def test_empty_returns_empty(self):
        self.assertEqual(parse_invoice_bank_accounts(''), [])
        self.assertEqual(parse_invoice_bank_accounts(None), [])
        self.assertEqual(parse_invoice_bank_accounts('   \n  '), [])

    def test_single_account_unchanged(self):
        text = (
            'BANK NAME: ABSA | SORT CODE: 030190\n'
            'ACCOUNT NAME: AMERICAN AUTOPARTS LTD\n'
            'ACCOUNT NO.: 090/1025924'
        )
        accounts = parse_invoice_bank_accounts(text)
        self.assertEqual(len(accounts), 1)
        self.assertEqual(accounts[0]['title'], 'ABSA')
        self.assertIn('ACCOUNT NO.: 090/1025924', accounts[0]['body'])

    def test_packed_multiple_banks_and_momo(self):
        text = (
            'BANK NAME: ABSA | SORT CODE: 030190\n'
            'ACCOUNT NAME: AMERICAN AUTOPARTS LTD\n'
            'ACCOUNT NO.: 090/1025924\n'
            'BRANCH: NORTH INDUSTRIAL AREA\n'
            'BANK NAME: GCB | SORT CODE: 040116\n'
            'ACCOUNT NAME: AMERICAN AUTOPARTS LTD\n'
            'ACCOUNT NO.: 1161470000046\n'
            'BRANCH: BOUNDARY ROAD.\n'
            'MTN MOMO NO.: 0248 943 964\n'
            'NAME: AMERICAN AUTOPARTS LIMITED'
        )
        accounts = parse_invoice_bank_accounts(text)
        self.assertEqual(len(accounts), 3)
        self.assertEqual(accounts[0]['title'], 'ABSA')
        self.assertEqual(accounts[1]['title'], 'GCB')
        self.assertEqual(accounts[2]['title'], 'MTN MOMO')
        self.assertIn('NORTH INDUSTRIAL AREA', accounts[0]['body'])
        self.assertNotIn('BANK NAME: GCB', accounts[0]['body'])
        self.assertIn('1161470000046', accounts[1]['body'])
        self.assertIn('0248 943 964', accounts[2]['body'])

    def test_blank_line_separated_accounts(self):
        text = (
            'BANK NAME: ABSA\n'
            'ACCOUNT NO.: 111\n'
            '\n'
            'BANK NAME: GCB\n'
            'ACCOUNT NO.: 222'
        )
        accounts = parse_invoice_bank_accounts(text)
        self.assertEqual(len(accounts), 2)
        self.assertEqual(accounts[0]['title'], 'ABSA')
        self.assertEqual(accounts[1]['title'], 'GCB')
