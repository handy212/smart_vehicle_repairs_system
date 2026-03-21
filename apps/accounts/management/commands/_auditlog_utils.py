"""
Utility to safely disable auditlog signals during data seeding.
Compatible with multiple versions of django-auditlog.
"""
from contextlib import contextmanager


@contextmanager
def disable_auditlog():
    """
    Temporarily disconnect auditlog signals to avoid encoding errors
    (e.g. SQL_ASCII vs UTF8) on production databases during seeding.
    Works across multiple versions of django-auditlog.
    """
    try:
        from auditlog.receivers import log_create, log_update, pre_log_delete
        from django.db.models.signals import post_save, pre_delete

        # Disconnect auditlog signals
        post_save.disconnect(log_create)
        post_save.disconnect(log_update)
        pre_delete.disconnect(pre_log_delete)

        try:
            yield
        finally:
            # Reconnect after seeding
            post_save.connect(log_create)
            post_save.connect(log_update)
            pre_delete.connect(pre_log_delete)

    except (ImportError, Exception):
        # Auditlog not installed or receiver names differ — run without disabling
        yield
