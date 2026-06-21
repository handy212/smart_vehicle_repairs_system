"""Tests for QBO tax sync helpers."""
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import TestCase

from apps.quickbooks_online.tax_sync_helpers import (
    _rate_name_matches_levy,
    apply_transaction_tax,
    build_override_tax_lines,
    stamp_sales_line_tax_codes,
)


class TaxSyncHelperTests(TestCase):
    def test_rate_name_matches_ghana_levies(self):
        self.assertTrue(_rate_name_matches_levy('VAT (Standard)', 'vat'))
        self.assertTrue(_rate_name_matches_levy('NHIL 2.5%', 'nhil'))
        self.assertTrue(_rate_name_matches_levy('GETFund Levy', 'getfund'))

    def test_build_override_tax_lines_from_levy_amounts(self):
        local_obj = MagicMock()
        local_obj.tax_vat_amount = Decimal('10.00')
        local_obj.tax_nhil_amount = Decimal('5.00')
        local_obj.tax_getfund_amount = Decimal('0')
        local_obj.tax_hrl_amount = Decimal('0')
        local_obj.taxable_subtotal = Decimal('100.00')

        mapping_service = MagicMock()
        mapping_service.resolve_tax_code_id.side_effect = lambda key: {
            'vat': 'VAT-CODE',
            'nhil': 'NHIL-CODE',
        }.get(key)

        service = MagicMock()
        composite_code = MagicMock()
        vat_rate = MagicMock()
        vat_rate.value = 'RATE-VAT'
        nhil_rate = MagicMock()
        nhil_rate.value = 'RATE-NHIL'
        composite_code.SalesTaxRateList.TaxRateDetail = [
            MagicMock(TaxRateRef=vat_rate),
            MagicMock(TaxRateRef=nhil_rate),
        ]

        vat_code = MagicMock()
        vat_code.SalesTaxRateList.TaxRateDetail = [MagicMock(TaxRateRef=vat_rate)]
        nhil_code = MagicMock()
        nhil_code.SalesTaxRateList.TaxRateDetail = [MagicMock(TaxRateRef=nhil_rate)]

        with patch(
            'apps.quickbooks_online.tax_sync_helpers.fetch_qbo_tax_code',
            side_effect=lambda _svc, code_id: composite_code if code_id == 'COMPOSITE' else (
                vat_code if code_id == 'VAT-CODE' else nhil_code
            ),
        ):
            lines = build_override_tax_lines(service, local_obj, 'COMPOSITE', mapping_service)

        self.assertEqual(len(lines), 2)
        amounts = sorted(line.Amount for line in lines)
        self.assertEqual(amounts, [5.0, 10.0])

    @patch('apps.quickbooks_online.tax_sync_helpers.fetch_qbo_tax_code')
    def test_build_override_returns_none_when_levy_rate_not_in_composite(self, mock_fetch):
        local_obj = MagicMock()
        local_obj.tax_vat_amount = Decimal('10.00')
        local_obj.tax_nhil_amount = Decimal('0')
        local_obj.tax_getfund_amount = Decimal('0')
        local_obj.tax_hrl_amount = Decimal('0')
        local_obj.taxable_subtotal = Decimal('0')

        mapping_service = MagicMock()
        mapping_service.resolve_tax_code_id.return_value = 'VAT-CODE'

        composite_code = MagicMock()
        composite_rate = MagicMock()
        composite_rate.value = 'COMPOSITE-RATE'
        composite_code.SalesTaxRateList.TaxRateDetail = [MagicMock(TaxRateRef=composite_rate)]

        vat_code = MagicMock()
        vat_rate = MagicMock()
        vat_rate.value = 'STANDALONE-VAT-RATE'
        vat_code.SalesTaxRateList.TaxRateDetail = [MagicMock(TaxRateRef=vat_rate)]

        mock_fetch.side_effect = lambda _svc, code_id: composite_code if code_id == 'COMPOSITE' else vat_code

        with patch(
            'apps.quickbooks_online.tax_sync_helpers.fetch_qbo_tax_rate_name',
            return_value='Unrelated',
        ):
            lines = build_override_tax_lines(MagicMock(), local_obj, 'COMPOSITE', mapping_service)

        self.assertIsNone(lines)

    @patch('apps.quickbooks_online.tax_sync_helpers.uses_us_line_tax_codes', return_value=False)
    @patch('apps.quickbooks_online.tax_sync_helpers.TxnTaxDetail')
    @patch('apps.quickbooks_online.tax_sync_helpers.Ref')
    def test_apply_transaction_tax_uses_auto_calc_when_no_override(
        self, mock_ref, mock_txn_detail, _mock_us,
    ):
        local_obj = MagicMock()
        local_obj.tax_amount = Decimal('15.00')
        local_obj.tax_vat_amount = Decimal('15.00')
        local_obj.tax_nhil_amount = Decimal('0')
        local_obj.tax_getfund_amount = Decimal('0')
        local_obj.tax_hrl_amount = Decimal('0')
        local_obj.invoice_number = 'INV-1'

        mapping_service = MagicMock()
        mapping_service.resolve_tax_code_id.side_effect = lambda key: {
            'composite': 'COMP-1',
            'exempt': None,
        }.get(key)

        qb_txn = MagicMock()
        txn_detail = type('FakeTxnTaxDetail', (), {
            'TxnTaxCodeRef': None,
            'TaxLine': None,
            'TotalTax': None,
        })()
        mock_txn_detail.return_value = txn_detail
        mock_ref.return_value = MagicMock()

        service = MagicMock()
        qb_line = MagicMock()
        qb_line.SalesItemLineDetail = MagicMock()
        local_line = MagicMock(is_taxable=True)

        with patch(
            'apps.quickbooks_online.tax_sync_helpers.build_override_tax_lines',
            return_value=None,
        ):
            apply_transaction_tax(
                service,
                qb_txn,
                local_obj,
                mapping_service=mapping_service,
                sales_lines=[qb_line],
                line_items=[local_line],
            )

        self.assertEqual(qb_txn.TxnTaxDetail, txn_detail)
        self.assertIsNone(txn_detail.TotalTax)
        self.assertEqual(qb_txn.GlobalTaxCalculation, 'TaxExcluded')
        self.assertIsNotNone(qb_line.SalesItemLineDetail.TaxCodeRef)

    @patch('apps.quickbooks_online.tax_sync_helpers.Ref')
    def test_stamp_sales_line_tax_codes_skips_non_taxable_without_exempt(self, mock_ref):
        mock_ref.return_value = MagicMock()

        class LineDetail:
            TaxCodeRef = None

        qb_line = MagicMock()
        qb_line.SalesItemLineDetail = LineDetail()
        local_line = MagicMock(is_taxable=False)

        stamp_sales_line_tax_codes([qb_line], [local_line], tax_code_id='TAX-1', exempt_tax_code_id=None)

        self.assertIsNone(qb_line.SalesItemLineDetail.TaxCodeRef)

    @patch('apps.quickbooks_online.tax_sync_helpers.uses_us_line_tax_codes', return_value=True)
    @patch('apps.quickbooks_online.tax_sync_helpers.TxnTaxDetail')
    @patch('apps.quickbooks_online.tax_sync_helpers.Ref')
    def test_apply_transaction_tax_us_company_uses_tax_non_and_total_override(
        self, mock_ref, mock_txn_detail, _mock_us,
    ):
        local_obj = MagicMock()
        local_obj.tax_amount = Decimal('254.00')
        local_obj.invoice_number = 'INV-680'

        mapping_service = MagicMock()
        mapping_service.resolve_tax_code_id.side_effect = lambda key: {
            'composite': '8',
            'exempt': None,
        }.get(key)

        qb_txn = MagicMock()
        txn_detail = type('FakeTxnTaxDetail', (), {
            'TxnTaxCodeRef': None,
            'TaxLine': None,
            'TotalTax': None,
        })()
        mock_txn_detail.return_value = txn_detail
        mock_ref.side_effect = lambda: MagicMock()

        qb_line = MagicMock()
        qb_line.SalesItemLineDetail = MagicMock()
        local_line = MagicMock(is_taxable=True)

        apply_transaction_tax(
            MagicMock(),
            qb_txn,
            local_obj,
            mapping_service=mapping_service,
            sales_lines=[qb_line],
            line_items=[local_line],
        )

        self.assertEqual(qb_line.SalesItemLineDetail.TaxCodeRef.value, 'TAX')
        self.assertEqual(txn_detail.TotalTax, 254.0)
        self.assertEqual(txn_detail.TxnTaxCodeRef.value, '8')

    @patch('apps.quickbooks_online.tax_sync_helpers.uses_us_line_tax_codes', return_value=True)
    def test_finalize_clears_unsupported_us_fields(self, _mock_us):
        from quickbooks.objects.invoice import Invoice as QBInvoice
        from quickbooks.objects.detailline import DetailLine, SalesItemLineDetail
        from quickbooks.objects.base import Ref, EmailAddress

        from apps.quickbooks_online.tax_sync_helpers import finalize_sales_transaction_for_qbo

        qb_invoice = QBInvoice()
        qb_invoice.EmailStatus = 'EmailSent'
        qb_invoice.BillEmail = EmailAddress()
        qb_invoice.DueDate = ''
        line = DetailLine()
        detail = SalesItemLineDetail()
        detail.TaxInclusiveAmt = 0
        detail.ServiceDate = ''
        detail.TaxCodeRef = Ref()
        detail.TaxCodeRef.value = 'TAX'
        detail.TaxCodeRef.name = ''
        line.SalesItemLineDetail = detail
        qb_invoice.Line = [line]

        finalize_sales_transaction_for_qbo(MagicMock(), qb_invoice)

        payload = qb_invoice.to_json()
        self.assertNotIn('GlobalTaxCalculation', payload)
        self.assertNotIn('EmailStatus', payload)
        self.assertNotIn('BillEmail', payload)
        self.assertNotIn('TaxInclusiveAmt', payload)
        self.assertNotIn('ServiceDate', payload)
