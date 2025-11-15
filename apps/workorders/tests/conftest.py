"""
Pytest configuration for workorders tests.
pytest-django handles Django setup automatically.
"""
import os
import django
from django.conf import settings


def pytest_configure(config):
    """Configure Django before any test modules are imported."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.testing')
    if not settings.configured:
        django.setup()

