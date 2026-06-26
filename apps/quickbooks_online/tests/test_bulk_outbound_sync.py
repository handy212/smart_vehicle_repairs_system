"""Tests for bulk outbound QuickBooks sync helpers."""
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


class QueueOutboundSyncCandidatesTests(SimpleTestCase):
    @patch('apps.quickbooks_online.task_dispatch.schedule_entity_sync')
    def test_queues_one_task_per_candidate(self, mock_schedule):
        cfg = {
            'task_name': 'task_sync_supplier_to_qbo',
        }
        queued = queue_outbound_sync_candidates([('supplier', 5, cfg)])
        self.assertEqual(queued, 1)
        mock_schedule.assert_called_once()
