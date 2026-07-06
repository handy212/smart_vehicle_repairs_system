"""
Utility to safely disable auditlog signals during data seeding.
Compatible with multiple versions of django-auditlog.
"""
from contextlib import contextmanager


@contextmanager
def disable_auditlog():
    """
    Aggressively disable auditlog by monkeypatching its core logging function.
    This works even when signals are already connected or decorated.
    """
    original_create_log_entry = None
    auditlog_receivers = None
    
    try:
        from auditlog import receivers as auditlog_receivers
        if hasattr(auditlog_receivers, '_create_log_entry'):
            original_create_log_entry = auditlog_receivers._create_log_entry
            # Replace with a no-op
            auditlog_receivers._create_log_entry = lambda *args, **kwargs: None
            
        yield
    except Exception:
        # Catch errors but don't re-raise immediately so finally can restore
        yield
    finally:
        # Restore the original function
        if auditlog_receivers and original_create_log_entry:
            auditlog_receivers._create_log_entry = original_create_log_entry
