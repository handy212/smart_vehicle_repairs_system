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
    """
    try:
        from auditlog.registry import auditlog
        
        # Aggressive approach: Clear all registered models temporarily
        if hasattr(auditlog, '_models'):
            original_models = auditlog._models.copy()
            auditlog._models.clear()
            try:
                yield
            finally:
                auditlog._models.update(original_models)
        else:
            # Fallback for different versions: Try to use disable_signals if it exists
            if hasattr(auditlog, 'disable_signals'):
                with auditlog.disable_signals():
                    yield
            else:
                # If all else fails, run without disabling
                yield
    except ImportError:
        # Auditlog not installed — run without disabling
        yield
    except Exception:
        # Catch any other errors to ensure seeding completes
        yield
