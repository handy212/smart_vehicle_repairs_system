from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings

from apps.branches.models import Branch
from apps.quickbooks_online.models import QBOMapping
from apps.quickbooks_online.services import QuickBooksService

User = get_user_model()


class ApplyDepartmentRefTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            username='dept-ref-admin',
            email='dept-ref-admin@test.com',
            password='password',
            role='admin',
        )
        cls.branch = Branch.objects.create(
            name='Kumasi HQ',
            code='KSI',
            phone='000',
            address='1 Main',
            city='Kumasi',
            region='Ashanti',
            zip_code='00000',
            created_by=cls.admin,
        )

    def test_apply_department_ref_uses_stored_mapping_without_sync(self):
        QBOMapping.objects.create(
            content_type=ContentType.objects.get_for_model(Branch),
            object_id=self.branch.id,
            qbo_id='dept-99',
            status='synced',
        )
        qb_txn = MagicMock()
        service = QuickBooksService()

        with patch.object(service, 'sync_branch') as mock_sync:
            service._apply_department_ref(qb_txn, self.branch)

        mock_sync.assert_not_called()
        self.assertEqual(qb_txn.DepartmentRef.value, 'dept-99')

    def test_apply_department_ref_skips_when_unmapped(self):
        qb_txn = MagicMock(spec=[])
        service = QuickBooksService()

        with patch.object(service, 'sync_branch') as mock_sync:
            service._apply_department_ref(qb_txn, self.branch)

        mock_sync.assert_not_called()
        self.assertFalse(hasattr(qb_txn, 'DepartmentRef'))


class SyncBranchNamePreservationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            username='dept-name-admin',
            email='dept-name-admin@test.com',
            password='password',
            role='admin',
        )
        cls.branch = Branch.objects.create(
            name='Kumasi HQ',
            code='KSI',
            phone='000',
            address='1 Main',
            city='Kumasi',
            region='Ashanti',
            zip_code='00000',
            created_by=cls.admin,
        )

    def test_is_svr_managed_department_name(self):
        self.assertTrue(
            QuickBooksService.is_svr_managed_department_name('Kumasi HQ (KSI)', 'KSI')
        )
        self.assertFalse(
            QuickBooksService.is_svr_managed_department_name('Kumasi', 'KSI')
        )

    @patch.object(QuickBooksService, '_save_qb')
    @patch.object(QuickBooksService, '_load_qbo_entity')
    @patch.object(QuickBooksService, 'get_client')
    def test_sync_branch_preserves_owner_mapped_name(
        self, mock_get_client, mock_load, mock_save,
    ):
        QBOMapping.objects.create(
            content_type=ContentType.objects.get_for_model(Branch),
            object_id=self.branch.id,
            qbo_id='dept-1',
            status='synced',
        )
        mock_get_client.return_value = MagicMock()
        qb_dept = MagicMock()
        qb_dept.Id = 'dept-1'
        qb_dept.SyncToken = '1'
        qb_dept.Name = 'Kumasi'
        mock_load.return_value = (qb_dept, False, None)
        mock_save.side_effect = lambda obj, client: obj

        service = QuickBooksService()
        result = service.sync_branch(self.branch, update_name=True)

        self.assertIs(result, qb_dept)
        self.assertEqual(qb_dept.Name, 'Kumasi')

    @patch.object(QuickBooksService, '_save_qb')
    @patch.object(QuickBooksService, '_load_qbo_entity')
    @patch.object(QuickBooksService, 'get_client')
    def test_sync_branch_renames_svr_managed_location(
        self, mock_get_client, mock_load, mock_save,
    ):
        QBOMapping.objects.create(
            content_type=ContentType.objects.get_for_model(Branch),
            object_id=self.branch.id,
            qbo_id='dept-2',
            status='synced',
        )
        mock_get_client.return_value = MagicMock()
        qb_dept = MagicMock()
        qb_dept.Id = 'dept-2'
        qb_dept.SyncToken = '1'
        qb_dept.Name = 'Old Name (KSI)'
        mock_load.return_value = (qb_dept, False, None)
        mock_save.side_effect = lambda obj, client: obj

        service = QuickBooksService()
        service.sync_branch(self.branch, update_name=True)

        self.assertEqual(qb_dept.Name, 'Kumasi HQ (KSI)')


@override_settings(QUICKBOOKS_AUTO_SYNC_ENABLED=True)
class BranchSignalGatingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            username='dept-signal-admin',
            email='dept-signal-admin@test.com',
            password='password',
            role='admin',
        )

    @patch('apps.quickbooks_online.signals.schedule_entity_sync')
    def test_phone_edit_does_not_schedule_branch_sync(self, mock_schedule):
        branch = Branch.objects.create(
            name='Takoradi Shop',
            code='TKD',
            phone='111',
            address='1 Main',
            city='Takoradi',
            region='Western',
            zip_code='00000',
            created_by=self.admin,
        )
        mock_schedule.reset_mock()

        branch.phone = '222'
        branch.save(update_fields=['phone'])

        mock_schedule.assert_not_called()

    @patch('apps.quickbooks_online.signals.schedule_entity_sync')
    def test_name_change_schedules_branch_sync(self, mock_schedule):
        branch = Branch.objects.create(
            name='Tamale Shop',
            code='TAM',
            phone='111',
            address='1 Main',
            city='Tamale',
            region='Northern',
            zip_code='00000',
            created_by=self.admin,
        )
        mock_schedule.reset_mock()

        branch.name = 'Tamale Main'
        branch.save(update_fields=['name'])

        mock_schedule.assert_called_once()
        self.assertEqual(mock_schedule.call_args[0][0], 'branch')
        self.assertEqual(mock_schedule.call_args[0][1], branch.id)
