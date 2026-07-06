"""
Tests for the Audit Log API (AuditLogViewSet).
Enhancement 5: Dedicated test coverage for the audit log endpoints.
"""
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from django.core.management import call_command
from auditlog.models import LogEntry
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from datetime import timedelta
from apps.accounts.permission_models import Permission, UserPermissionOverride

User = get_user_model()

AUDIT_LOGS_URL = "/api/accounts/admin/audit-logs/"


class AuditLogAPISetup(TestCase):
    """Shared setup for audit log tests."""

    def setUp(self):
        call_command("init_permissions", verbosity=0)

        # Admin user
        self.admin_user = User.objects.create_user(
            username="admin_audit_test",
            email="admin_audit@example.com",
            password="adminpass123",
            role="admin",
            is_staff=True,
        )
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin_user)

        # Regular (non-admin) user
        self.regular_user = User.objects.create_user(
            username="regular_audit_test",
            email="regular_audit@example.com",
            password="userpass123",
            role="technician",
        )
        self.regular_client = APIClient()
        self.regular_client.force_authenticate(user=self.regular_user)

        self.super_admin_user = User.objects.create_user(
            username="owner_audit_test",
            email="owner_audit@example.com",
            password="ownerpass123",
            role="super-admin",
            is_staff=True,
            is_superuser=True,
        )

        # Seed a few LogEntry records for testing
        user_ct = ContentType.objects.get_for_model(User)
        now = timezone.now()

        self.log_create = LogEntry.objects.create(
            content_type=user_ct,
            object_pk="1",
            object_repr="Test User 1",
            action=LogEntry.Action.CREATE,
            actor=self.admin_user,
            remote_addr="127.0.0.1",
        )
        LogEntry.objects.filter(id=self.log_create.id).update(timestamp=now - timedelta(days=5))

        self.log_update = LogEntry.objects.create(
            content_type=user_ct,
            object_pk="2",
            object_repr="Test User 2",
            action=LogEntry.Action.UPDATE,
            actor=self.admin_user,
            remote_addr="127.0.0.1",
        )
        LogEntry.objects.filter(id=self.log_update.id).update(timestamp=now - timedelta(days=2))

        self.log_delete = LogEntry.objects.create(
            content_type=user_ct,
            object_pk="3",
            object_repr="Test User 3",
            action=LogEntry.Action.DELETE,
            actor=self.regular_user,
            remote_addr="10.0.0.1",
        )
        LogEntry.objects.filter(id=self.log_delete.id).update(timestamp=now - timedelta(days=1))

        self.super_admin_actor_log = LogEntry.objects.create(
            content_type=user_ct,
            object_pk=str(self.admin_user.id),
            object_repr="Owner changed admin",
            action=LogEntry.Action.UPDATE,
            actor=self.super_admin_user,
            remote_addr="127.0.0.1",
        )
        self.super_admin_object_log = LogEntry.objects.create(
            content_type=user_ct,
            object_pk=str(self.super_admin_user.id),
            object_repr="owner_audit@example.com",
            action=LogEntry.Action.UPDATE,
            actor=self.admin_user,
            remote_addr="127.0.0.1",
        )


class AuditLogPermissionsTest(AuditLogAPISetup):
    """Test access control on the audit log endpoint."""

    def test_admin_can_list_audit_logs(self):
        """Admin users should be able to list audit logs (200 OK)."""
        response = self.admin_client.get(AUDIT_LOGS_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)

    def test_non_admin_cannot_list_audit_logs(self):
        """Users without view_audit_logs should be forbidden (403)."""
        response = self.regular_client.get(AUDIT_LOGS_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_with_view_audit_logs_can_list(self):
        """Non-admin user granted view_audit_logs can list audit logs."""
        perm = Permission.objects.get(code='view_audit_logs')
        UserPermissionOverride.objects.create(
            user=self.regular_user,
            permission=perm,
            granted=True,
            granted_by=self.admin_user,
        )
        response = self.regular_client.get(AUDIT_LOGS_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)

    def test_super_admin_entries_are_hidden_from_audit_api(self):
        """The database keeps owner logs, but frontend audit API never exposes them."""
        self.assertTrue(LogEntry.objects.filter(id=self.super_admin_actor_log.id).exists())
        self.assertTrue(LogEntry.objects.filter(id=self.super_admin_object_log.id).exists())

        response = self.admin_client.get(AUDIT_LOGS_URL, {"page_size": 1000})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data["results"]}
        self.assertNotIn(self.super_admin_actor_log.id, ids)
        self.assertNotIn(self.super_admin_object_log.id, ids)

    def test_view_audit_logs_user_cannot_archive(self):
        """view_audit_logs alone does not allow purging old logs."""
        perm = Permission.objects.get(code='view_audit_logs')
        UserPermissionOverride.objects.create(
            user=self.regular_user,
            permission=perm,
            granted=True,
            granted_by=self.admin_user,
        )
        response = self.regular_client.post(f"{AUDIT_LOGS_URL}archive/", {"days": 30})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_list_audit_logs(self):
        """Unauthenticated requests should be rejected (401)."""
        client = APIClient()
        response = client.get(AUDIT_LOGS_URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_audit_logs_are_read_only(self):
        """Admin should not be able to create or delete audit log entries via API."""
        response = self.admin_client.post(AUDIT_LOGS_URL, {})
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        detail_url = f"{AUDIT_LOGS_URL}{self.log_create.id}/"
        response = self.admin_client.delete(detail_url)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class AuditLogFilterTest(AuditLogAPISetup):
    """Test filtering capabilities on the audit log list endpoint."""

    def test_filter_by_action_create(self):
        """Filtering by action=create should return only create logs."""
        response = self.admin_client.get(AUDIT_LOGS_URL, {"action": "create"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        actions = [r["action"] for r in response.data["results"]]
        self.assertTrue(all(a == "create" for a in actions), f"Unexpected actions: {actions}")

    def test_filter_by_action_update(self):
        """Filtering by action=update should return only update logs."""
        response = self.admin_client.get(AUDIT_LOGS_URL, {"action": "update"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        actions = [r["action"] for r in response.data["results"]]
        self.assertTrue(all(a == "update" for a in actions))

    def test_filter_by_action_delete(self):
        """Filtering by action=delete should return only delete logs."""
        response = self.admin_client.get(AUDIT_LOGS_URL, {"action": "delete"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        actions = [r["action"] for r in response.data["results"]]
        self.assertTrue(all(a == "delete" for a in actions))

    def test_filter_by_model_name(self):
        """Filtering by model_name should return only logs for that model."""
        response = self.admin_client.get(AUDIT_LOGS_URL, {"model_name": "user"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        model_names = [r["model_name"] for r in response.data["results"]]
        self.assertTrue(all(m == "user" for m in model_names))

    def test_filter_by_date_from(self):
        """date_from filter should exclude logs before that date."""
        three_days_ago_str = (timezone.now() - timedelta(days=3)).strftime("%Y-%m-%d")
        
        # Use page_size=1000 because init_permissions creates ~230 logs which can push our seeded logs off the first page
        response = self.admin_client.get(AUDIT_LOGS_URL, {"date_from": three_days_ago_str, "page_size": 1000})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        reprs = [r["object_repr"] for r in response.data["results"]]
        
        # The 5-day-old 'Test User 1' entry should NOT appear
        self.assertNotIn("Test User 1", reprs)
        # The 2-day-old and 1-day-old entries should appear
        self.assertIn("Test User 2", reprs)
        self.assertIn("Test User 3", reprs)

    def test_filter_by_date_to(self):
        """date_to filter should exclude logs after that date."""
        four_days_ago = (timezone.now() - timedelta(days=4)).strftime("%Y-%m-%d")
        response = self.admin_client.get(AUDIT_LOGS_URL, {"date_to": four_days_ago})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should only include log_create (5 days ago)
        ids = [r["id"] for r in response.data["results"]]
        self.assertIn(self.log_create.id, ids)
        self.assertNotIn(self.log_update.id, ids)
        self.assertNotIn(self.log_delete.id, ids)

    def test_invalid_date_does_not_crash(self):
        """A malformed date_from/date_to should be gracefully ignored (not 500)."""
        response = self.admin_client.get(AUDIT_LOGS_URL, {"date_from": "not-a-date"})
        # Should return 200 with all logs (invalid date is ignored)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_filter_by_user(self):
        """Filtering by user ID should return only logs for that actor."""
        response = self.admin_client.get(AUDIT_LOGS_URL, {"user": self.regular_user.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user_ids = [r["user"] for r in response.data["results"]]
        self.assertTrue(all(uid == self.regular_user.id for uid in user_ids))


class AuditLogStatsTest(AuditLogAPISetup):
    """Test the stats endpoint."""

    def test_stats_endpoint_returns_expected_structure(self):
        """Stats endpoint should return total, by_action, top_users, top_models."""
        response = self.admin_client.get(f"{AUDIT_LOGS_URL}stats/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("total", response.data)
        self.assertIn("by_action", response.data)
        self.assertIn("top_users", response.data)
        self.assertIn("top_models", response.data)

    def test_stats_total_is_correct(self):
        """Total should match the number of seeded log entries."""
        response = self.admin_client.get(f"{AUDIT_LOGS_URL}stats/")
        # 3 log entries created in setUp; there may be more from auditlog signals
        self.assertGreaterEqual(response.data["total"], 3)

    def test_stats_by_action_uses_string_keys(self):
        """by_action should use 'create'/'update'/'delete' not integers."""
        response = self.admin_client.get(f"{AUDIT_LOGS_URL}stats/")
        valid_actions = {"create", "update", "delete"}
        for item in response.data["by_action"]:
            self.assertIn(item["action"], valid_actions)

    def test_non_admin_cannot_access_stats(self):
        """Users without view_audit_logs should be forbidden from stats."""
        response = self.regular_client.get(f"{AUDIT_LOGS_URL}stats/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_stats_top_models_use_model_name_key(self):
        """top_models entries should expose model_name and model_label."""
        response = self.admin_client.get(f"{AUDIT_LOGS_URL}stats/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for item in response.data['top_models']:
            self.assertIn('model_name', item)
            self.assertIn('model_label', item)
            self.assertIn('count', item)
            self.assertNotIn('content_type__model', item)

    def test_filter_options_endpoint(self):
        response = self.admin_client.get(f"{AUDIT_LOGS_URL}filter_options/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('models', response.data)
        self.assertIn('users', response.data)


class AuditLogArchiveTest(AuditLogAPISetup):
    """Test the archive (purge) endpoint."""

    def test_archive_removes_old_logs(self):
        """Archive should delete logs older than the specified days."""
        # log_create is 5 days old → should be deleted with days=3
        count_before = LogEntry.objects.count()
        response = self.admin_client.post(f"{AUDIT_LOGS_URL}archive/", {"days": 3})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("archived_count", response.data)
        self.assertGreaterEqual(response.data["archived_count"], 1)
        count_after = LogEntry.objects.count()
        self.assertLess(count_after, count_before)
        # Confirm log_create (5 days old) was deleted
        self.assertFalse(LogEntry.objects.filter(id=self.log_create.id).exists())
        # Confirm log_delete (1 day old) was preserved
        self.assertTrue(LogEntry.objects.filter(id=self.log_delete.id).exists())

    def test_archive_rejects_zero_days(self):
        """Archive with days=0 should return 400."""
        response = self.admin_client.post(f"{AUDIT_LOGS_URL}archive/", {"days": 0})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_archive_rejects_non_integer_days(self):
        """Archive with invalid days value should return 400."""
        response = self.admin_client.post(f"{AUDIT_LOGS_URL}archive/", {"days": "abc"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_admin_cannot_archive(self):
        """Non-admin users should be forbidden from the archive endpoint."""
        response = self.regular_client.post(f"{AUDIT_LOGS_URL}archive/", {"days": 30})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class AuditLogImportHistoryTest(AuditLogAPISetup):
    """Test the import_history endpoint."""

    def setUp(self):
        super().setUp()
        self.customer_ct = ContentType.objects.get(app_label="customers", model="customer")
        self.vehicle_ct = ContentType.objects.get(app_label="vehicles", model="vehicle")

        self.customer_import_log = LogEntry.objects.create(
            content_type=self.customer_ct,
            object_pk="customers.csv",
            object_repr="Excel Import: customers.csv",
            action=LogEntry.Action.UPDATE,
            actor=self.admin_user,
            remote_addr="127.0.0.1",
            changes={
                "filename": "customers.csv",
                "imported": 12,
                "skipped": 1,
                "total_errors": 0,
            },
        )
        self.vehicle_import_log = LogEntry.objects.create(
            content_type=self.vehicle_ct,
            object_pk="vehicles.csv",
            object_repr="Excel Import Failed: vehicles.csv",
            action=LogEntry.Action.UPDATE,
            actor=self.admin_user,
            remote_addr="127.0.0.1",
            changes={
                "filename": "vehicles.csv",
                "imported": 0,
                "skipped": 0,
                "total_errors": 1,
                "error": "Invalid Excel header",
            },
        )

    def test_import_history_returns_import_audit_logs(self):
        response = self.admin_client.get(f"{AUDIT_LOGS_URL}import_history/", {"page_size": 100})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data["results"]}
        self.assertIn(self.customer_import_log.id, ids)
        self.assertIn(self.vehicle_import_log.id, ids)
        self.assertNotIn(self.log_create.id, ids)

    def test_import_history_supports_model_filter(self):
        response = self.admin_client.get(
            f"{AUDIT_LOGS_URL}import_history/",
            {"model_name": "customer", "page_size": 100},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        model_names = {item["model_name"] for item in response.data["results"]}
        self.assertEqual(model_names, {"customer"})


class AuditLogSerializerTest(AuditLogAPISetup):
    """Test serializer field correctness."""

    def test_user_name_fallback_to_username(self):
        """If actor has no first/last name, user_name should fall back to username (Bug 4 fix)."""
        # Use a non-super-admin actor; super-admin actors are serialized as "System".
        actor = self.regular_user
        actor.first_name = ""
        actor.last_name = ""
        actor.save()
        self.log_create.actor = actor
        self.log_create.save(update_fields=["actor"])

        response = self.admin_client.get(f"{AUDIT_LOGS_URL}{self.log_create.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user_name = response.data.get("user_name")
        # Should NOT be empty and should NOT be the email address
        self.assertIsNotNone(user_name)
        self.assertNotEqual(user_name, "")
        self.assertNotEqual(user_name, actor.email, "user_name must not fall through to email")
        # Should be username when both first and last names are blank
        self.assertEqual(user_name, actor.username)

    def test_serializer_includes_model_label(self):
        response = self.admin_client.get(f"{AUDIT_LOGS_URL}{self.log_create.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('model_label'), 'User')

    def test_system_actor_shows_system_name(self):
        """Logs without an actor should show 'System' as user_name."""
        user_ct = ContentType.objects.get_for_model(User)
        system_log = LogEntry.objects.create(
            content_type=user_ct,
            object_pk="99",
            object_repr="System Action",
            action=LogEntry.Action.UPDATE,
            actor=None,
            remote_addr="",
        )
        response = self.admin_client.get(f"{AUDIT_LOGS_URL}{system_log.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user_name"], "System")

    def test_action_is_string_not_int(self):
        """action field in serializer should be a string like 'create', not an integer."""
        response = self.admin_client.get(f"{AUDIT_LOGS_URL}{self.log_create.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["action"], "create")

    def test_ip_address_mapped_from_remote_addr(self):
        """ip_address should reflect the LogEntry.remote_addr field."""
        response = self.admin_client.get(f"{AUDIT_LOGS_URL}{self.log_create.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["ip_address"], "127.0.0.1")
