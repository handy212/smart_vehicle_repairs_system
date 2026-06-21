"""Tests for QBO duplicate-prevention helpers."""

from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.test import TestCase, override_settings

from apps.accounts.models import User
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inventory.models import Part, PartCategory
from apps.quickbooks_online.entity_resolver import resolve_qbo_entity
from apps.quickbooks_online.models import QBOMapping
from apps.quickbooks_online.sync_guard import outbound_sync_lock, should_debounce_part_sync


class EntityResolverTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='resolver-admin@test.com',
            username='resolver_admin',
            password='password',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN-R', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='resolver-cust',
            email='resolver-cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-RES')
        self.category = PartCategory.objects.create(name='Filters')
        self.part = Part.objects.create(
            part_number='RES-001',
            name='Filter',
            category=self.category,
            branch=self.branch,
            cost_price=Decimal('10.00'),
            selling_price=Decimal('15.00'),
            created_by=self.admin,
        )

    def test_resolve_existing_mapping_by_get(self):
        client = MagicMock()
        qb_invoice = MagicMock()
        qb_invoice.Id = '1001'
        qb_invoice.SyncToken = '0'
        mock_cls = MagicMock()
        mock_cls.get.return_value = qb_invoice
        mock_cls.__name__ = 'Invoice'

        mapping = QBOMapping.objects.create(
            content_type=ContentType.objects.get_for_model(self.customer),
            object_id=self.customer.id,
            qbo_id='1001',
            status='synced',
        )

        entity, error = resolve_qbo_entity(
            client=client,
            qb_class=mock_cls,
            local_obj=self.customer,
            mapping=mapping,
            doc_number='INV-1001',
        )
        self.assertIsNone(error)
        self.assertEqual(entity, qb_invoice)

    def test_mapped_id_missing_aborts_instead_of_creating(self):
        client = MagicMock()
        mock_cls = MagicMock()
        mock_cls.get.side_effect = Exception('not found')
        mock_cls.query.return_value = []
        mock_cls.__name__ = 'Invoice'

        mapping = QBOMapping.objects.create(
            content_type=ContentType.objects.get_for_model(self.customer),
            object_id=self.customer.id,
            qbo_id='999',
            status='synced',
        )

        entity, error = resolve_qbo_entity(
            client=client,
            qb_class=mock_cls,
            local_obj=self.customer,
            mapping=mapping,
            doc_number='INV-404',
        )
        self.assertIsNone(entity)
        self.assertIn('not found', error.lower())

    def test_query_by_doc_number_relinks_lost_mapping(self):
        client = MagicMock()
        qb_invoice = MagicMock()
        qb_invoice.Id = 'INV-55'
        qb_invoice.SyncToken = '1'

        mock_cls = MagicMock()
        mock_cls.get.side_effect = Exception('gone')
        mock_cls.query.return_value = [qb_invoice]
        mock_cls.__name__ = 'Invoice'

        entity, error = resolve_qbo_entity(
            client=client,
            qb_class=mock_cls,
            local_obj=self.customer,
            mapping=None,
            doc_number='INV-1001',
        )
        self.assertIsNone(error)
        self.assertEqual(entity, qb_invoice)
        mapping = QBOMapping.objects.get(
            content_type=ContentType.objects.get_for_model(self.customer),
            object_id=self.customer.id,
        )
        self.assertEqual(mapping.qbo_id, 'INV-55')

    def test_item_lookup_skips_display_name_query(self):
        client = MagicMock()
        mock_cls = MagicMock()
        mock_cls.query.return_value = []
        mock_cls.__name__ = 'Item'

        from apps.quickbooks_online.entity_resolver import find_by_display_name, find_by_name

        find_by_display_name(mock_cls, client, 'CD-PART-0021 — Oil Filter')
        find_by_name(mock_cls, client, 'CD-PART-0021 — Oil Filter')

        self.assertEqual(mock_cls.query.call_count, 1)
        sql = mock_cls.query.call_args[0][0]
        self.assertIn("Name = 'CD-PART-0021", sql)
        self.assertNotIn('DisplayName', sql)


@override_settings(CACHES={
    'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'},
})
class SyncGuardTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_outbound_sync_lock_blocks_concurrent_attempt(self):
        with outbound_sync_lock('invoice', 42) as first:
            self.assertTrue(first)
            with outbound_sync_lock('invoice', 42) as second:
                self.assertFalse(second)

    def test_part_debounce_coalesces_rapid_schedules(self):
        self.assertFalse(should_debounce_part_sync(7))
        self.assertTrue(should_debounce_part_sync(7))
