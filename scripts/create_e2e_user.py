#!/usr/bin/env python
"""Create or update the Playwright E2E staff user."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', os.environ.get('DJANGO_SETTINGS_MODULE', 'config.settings.development'))
django.setup()

from django.contrib.auth import get_user_model  # noqa: E402

USERNAME = os.environ.get('E2E_USERNAME', 'e2e_admin')
PASSWORD = os.environ.get('E2E_PASSWORD', 'e2e_test_pass_123')
EMAIL = os.environ.get('E2E_EMAIL', 'e2e_admin@example.com')


def main() -> int:
    User = get_user_model()
    user, created = User.objects.get_or_create(
        username=USERNAME,
        defaults={
            'email': EMAIL,
            'role': 'admin',
            'is_staff': True,
            'is_superuser': True,
            'is_active': True,
        },
    )
    user.email = EMAIL
    user.role = 'admin'
    user.is_staff = True
    user.is_superuser = True
    user.is_active = True
    user.set_password(PASSWORD)
    user.save()

    verb = 'Created' if created else 'Updated'
    print(f'{verb} E2E user {USERNAME}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
