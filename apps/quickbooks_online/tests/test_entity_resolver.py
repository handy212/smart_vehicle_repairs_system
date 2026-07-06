"""Tests for QBO entity resolver stale-mapping recovery."""
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from apps.quickbooks_online.entity_resolver import resolve_qbo_entity


class FakeQBO:
    __name__ = 'Vendor'

    @classmethod
    def get(cls, _qbo_id, qb=None):
        raise Exception('Object Not Found')

    @classmethod
    def query(cls, sql, qb=None):
        return []

    def __init__(self):
        self.Id = None


class ResolveQboEntityTests(SimpleTestCase):
    def test_clears_stale_mapping_and_allows_create(self):
        local_obj = MagicMock()
        local_obj.id = 1
        mapping = MagicMock()
        mapping.qbo_id = '64'
        mapping.qbo_sync_token = '0'

        entity, error = resolve_qbo_entity(
            client=MagicMock(),
            qb_class=FakeQBO,
            local_obj=local_obj,
            mapping=mapping,
            display_name='ACME (SUP001)',
            company_name='ACME',
            allow_create=True,
        )

        self.assertIsNone(error)
        self.assertIsNotNone(entity)
        self.assertEqual(mapping.qbo_id, '')
        self.assertEqual(mapping.qbo_sync_token, '')

    @patch('apps.quickbooks_online.entity_resolver.find_by_company_name')
    def test_relinks_when_company_name_matches(self, mock_find):
        found = MagicMock()
        found.Id = '99'
        found.SyncToken = '1'
        mock_find.return_value = found

        local_obj = MagicMock()
        local_obj.id = 2
        mapping = MagicMock()
        mapping.qbo_id = '64'

        with patch('apps.quickbooks_online.entity_resolver.QBOMapping') as mock_mapping_model, patch(
            'apps.quickbooks_online.entity_resolver.ContentType'
        ) as mock_ct:
            mock_ct.objects.get_for_model.return_value = MagicMock()
            entity, error = resolve_qbo_entity(
                client=MagicMock(),
                qb_class=FakeQBO,
                local_obj=local_obj,
                mapping=mapping,
                company_name='ACME',
                allow_create=True,
            )

        self.assertIsNone(error)
        self.assertEqual(entity, found)
        mock_mapping_model.objects.update_or_create.assert_called_once()
