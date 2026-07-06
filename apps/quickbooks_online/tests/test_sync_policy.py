"""Tests for QuickBooks outbound sync eligibility rules."""
from unittest.mock import MagicMock

from django.test import SimpleTestCase

from apps.quickbooks_online.sync_policy import (
    ESTIMATE_QBO_TXN_STATUS,
    PO_QBO_SYNC_STATUSES,
    is_outbound_eligible,
    outbound_eligibility_reason,
)


class PurchaseOrderSyncPolicyTests(SimpleTestCase):
    def test_confirmed_po_is_eligible(self):
        po = MagicMock()
        po.status = 'confirmed'
        self.assertTrue(is_outbound_eligible('purchase_order', po))

    def test_draft_po_is_not_eligible(self):
        po = MagicMock()
        po.status = 'draft'
        eligible, reason = outbound_eligibility_reason('purchase_order', po)
        self.assertFalse(eligible)
        self.assertIn('Confirm', reason)

    def test_received_po_is_eligible(self):
        po = MagicMock()
        po.status = 'received'
        self.assertIn(po.status, PO_QBO_SYNC_STATUSES)


class BillPaymentSyncPolicyTests(SimpleTestCase):
    def test_bill_payment_is_eligible(self):
        payment = MagicMock()
        payment.payment_method = 'bank_transfer'
        payment.bill = MagicMock(status='open')
        self.assertTrue(is_outbound_eligible('bill_payment', payment))


class VendorExpenseSyncPolicyTests(SimpleTestCase):
    def test_posted_vendor_expense_is_eligible(self):
        expense = MagicMock()
        expense.status = 'posted'
        self.assertTrue(is_outbound_eligible('vendor_expense', expense))

    def test_draft_vendor_expense_is_not_eligible(self):
        expense = MagicMock()
        expense.status = 'draft'
        self.assertFalse(is_outbound_eligible('vendor_expense', expense))


class EstimateSyncPolicyTests(SimpleTestCase):
    def test_converted_estimate_is_eligible_for_outbound_sync(self):
        estimate = MagicMock()
        estimate.status = 'converted'
        self.assertTrue(is_outbound_eligible('estimate', estimate))

    def test_converted_estimate_maps_to_qbo_closed(self):
        self.assertEqual(ESTIMATE_QBO_TXN_STATUS.get('converted'), 'Closed')

    def test_draft_estimate_is_not_eligible(self):
        estimate = MagicMock()
        estimate.status = 'draft'
        eligible, reason = outbound_eligibility_reason('estimate', estimate)
        self.assertFalse(eligible)
        self.assertIn('converted', reason)
