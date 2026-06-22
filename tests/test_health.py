"""Production hardening tests."""
import os
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest
from django.test import Client, override_settings


ROOT = Path(__file__).resolve().parent.parent


@pytest.mark.django_db
def test_health_ready():
    client = Client()
    response = client.get('/api/health/ready/')
    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'ok'
    assert payload['checks']['database'] == 'ok'


@pytest.mark.django_db
@override_settings(
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'health-redis-test',
        }
    }
)
def test_health_ready_checks_redis_when_not_dummy_cache():
    client = Client()
    response = client.get('/api/health/ready/')
    assert response.status_code == 200
    payload = response.json()
    assert payload['checks']['redis'] == 'ok'


@pytest.mark.django_db
def test_health_live():
    client = Client()
    response = client.get('/api/health/live/')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


@pytest.mark.django_db
def test_health_legacy_alias():
    client = Client()
    response = client.get('/api/health/')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


def test_validate_env_script_passes_for_minimal_production_env(tmp_path):
    env_file = tmp_path / '.env'
    env_file.write_text(
        '\n'.join([
            'DJANGO_ENVIRONMENT=production',
            'DEBUG=False',
            'SECRET_KEY=super-secret-production-key',
            'ALLOWED_HOSTS=example.com',
            'DB_PASSWORD=secure-db-password',
            'REDIS_PASSWORD=secure-redis-password',
            'DB_NAME=svr_db',
        ])
    )
    result = subprocess.run(
        ['bash', str(ROOT / 'scripts' / 'validate-env.sh'), str(env_file)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout


def test_validate_env_script_fails_when_required_vars_missing(tmp_path):
    env_file = tmp_path / '.env'
    env_file.write_text('DJANGO_ENVIRONMENT=production\n')
    result = subprocess.run(
        ['bash', str(ROOT / 'scripts' / 'validate-env.sh'), str(env_file)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0


@pytest.mark.django_db
def test_notification_dispatch_queues_when_async_enabled(settings):
    from apps.notifications_app.dispatch import dispatch_notification
    from apps.notifications_app.models import Notification
    from django.contrib.auth import get_user_model

    User = get_user_model()
    user = User.objects.create_user(
        username='async_notify',
        email='async@example.com',
        password='password123',
        role='customer',
    )
    notification = Notification.objects.create(
        recipient=user,
        notification_type='system',
        channel='in_app',
        priority='normal',
        title='Async test',
        message='Hello',
    )

    with patch.dict(os.environ, {}, clear=False):
        with patch('apps.notifications_app.dispatch._in_test_context', return_value=False):
            with patch('apps.notifications_app.tasks.deliver_notification.delay') as mock_delay:
                settings.NOTIFICATIONS_ASYNC = True
                settings.CELERY_TASK_ALWAYS_EAGER = False
                assert dispatch_notification(notification.id) is True
                mock_delay.assert_called_once_with(notification.id)
