"""Tests for QBO field length normalization."""
from django.test import SimpleTestCase

from apps.quickbooks_online.qbo_field_limits import QBO_DOC_NUMBER_MAX_LENGTH, qbo_doc_number


class QboDocNumberTests(SimpleTestCase):
    def test_structured_numbers_preserve_sequence_when_compacted(self):
        first = 'BILL-MAINBRANCH-000001'
        second = 'BILL-MAINBRANCH-000002'
        self.assertEqual(len(first), 22)

        first_result = qbo_doc_number(first)
        second_result = qbo_doc_number(second)

        self.assertEqual(len(first_result), QBO_DOC_NUMBER_MAX_LENGTH)
        self.assertEqual(len(second_result), QBO_DOC_NUMBER_MAX_LENGTH)
        self.assertTrue(first_result.endswith('-000001'))
        self.assertTrue(second_result.endswith('-000002'))
        self.assertNotEqual(first_result, second_result)

    def test_legacy_structured_numbers_preserve_sequence_when_compacted(self):
        value = 'BILL-2026-ACCRA-000001'
        self.assertEqual(len(value), 22)
        result = qbo_doc_number(value)
        self.assertTrue(result.endswith('-000001'))
        self.assertEqual(len(result), 21)

    def test_short_values_unchanged(self):
        self.assertEqual(qbo_doc_number('PO000042'), 'PO000042')

    def test_empty_returns_none(self):
        self.assertIsNone(qbo_doc_number(''))
        self.assertIsNone(qbo_doc_number(None))

    def test_batch_reference_truncated(self):
        batch = f'batch-{"a" * 16}'
        self.assertEqual(len(batch), 22)
        self.assertEqual(len(qbo_doc_number(batch)), 21)
