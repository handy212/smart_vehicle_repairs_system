"""Tests for bulk outbound QuickBooks sync helpers."""
from datetime import date
from unittest.mock import MagicMock, patch

from django.contrib.contenttypes.models import ContentType
from django.test import SimpleTestCase, TestCase

from apps.quickbooks_online.bulk_outbound_sync import (
    collect_outbound_sync_candidates,
    queue_outbound_sync_candidates,
)
from apps.quickbooks_online.status_sync import (
    capture_status_before_save,
    status_became_eligible,
)


class StatusBecameEligibleTests(SimpleTestCase):
    def test_true_when_status_changes_into_eligible_state(self):
        instance = MagicMock()
        instance._qbo_prev_status = 'draft'
        instance.status = 'sent'

        with patch(
            'apps.quickbooks_online.status_sync.is_outbound_eligible',
            return_value=True,
        ):
            self.assertTrue(status_became_eligible('estimate', instance))

    def test_false_when_status_unchanged(self):
        instance = MagicMock()
        instance._qbo_prev_status = 'sent'
        instance.status = 'sent'

        self.assertFalse(status_became_eligible('estimate', instance))


class CollectOutboundSyncCandidatesTests(TestCase):
  @patch('apps.quickbooks_online.bulk_outbound_sync.outbound_eligibility_reason')
  def test_collects_eligible_failed_mappings(self, mock_eligibility):
    from apps.inventory.models import Supplier
    from apps.quickbooks_online.models import QBOMapping

    supplier = Supplier.objects.create(
        name='Test Vendor',
        supplier_code='TV001',
    )
    ct = ContentType.objects.get_for_model(Supplier)
    QBOMapping.objects.create(
        content_type=ct,
        object_id=supplier.id,
        status='failed',
        error_message='Previous error',
    )
    mock_eligibility.return_value = (True, '')

    candidates, skipped = collect_outbound_sync_candidates(statuses=('failed',))

    self.assertEqual(len(candidates), 1)
    self.assertEqual(candidates[0][0], 'supplier')
    self.assertEqual(candidates[0][1], supplier.id)
    self.assertEqual(skipped, [])

  @patch('apps.quickbooks_online.bulk_outbound_sync.outbound_eligibility_reason')
  def test_orders_candidates_by_dependency(self, mock_eligibility):
    from apps.billing.models import Bill
    from apps.branches.models import Branch
    from apps.inventory.models import Supplier
    from apps.quickbooks_online.models import QBOMapping
    from django.contrib.auth import get_user_model

    mock_eligibility.return_value = (True, '')
    admin = get_user_model().objects.create_user(
        username='sort_branch_admin',
        email='sort_branch_admin@test.com',
        password='password123',
        role='admin',
    )
    branch = Branch.objects.create(
        name='Sort Branch',
        code='SORTB',
        is_active=True,
        created_by=admin,
    )
    supplier = Supplier.objects.create(name='Sort Vendor', supplier_code='SORT001')
    bill = Bill.objects.create(
        vendor=supplier,
        branch=branch,
        bill_date=date(2026, 1, 1),
        due_date=date(2026, 1, 31),
        status='open',
        created_by=admin,
    )
    supplier_ct = ContentType.objects.get_for_model(Supplier)
    bill_ct = ContentType.objects.get_for_model(Bill)
    QBOMapping.objects.create(content_type=supplier_ct, object_id=supplier.id, status='failed')
    QBOMapping.objects.create(content_type=bill_ct, object_id=bill.id, status='failed')

    candidates, _ = collect_outbound_sync_candidates(statuses=('failed',))
    entity_types = [item[0] for item in candidates]
    self.assertEqual(entity_types, ['supplier', 'vendor_bill'])


class QueueOutboundSyncCandidatesTests(SimpleTestCase):
    @patch('apps.quickbooks_online.task_dispatch.schedule_entity_sync')
    def test_queues_one_task_per_candidate(self, mock_schedule):
        cfg = {
            'task_name': 'task_sync_supplier_to_qbo',
        }
        queued = queue_outbound_sync_candidates([('supplier', 5, cfg)])
        self.assertEqual(queued, 1)
        mock_schedule.assert_called_once()
