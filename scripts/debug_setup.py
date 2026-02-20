
import os
import sys
import django
from django.conf import settings
import traceback

# Setup DJANGO_SETTINGS_MODULE
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.testing')

# Path the cursor to catch early DB access
from django.db.backends.utils import CursorWrapper

original_execute = CursorWrapper.execute

def patched_execute(self, sql, params=None):
    if not django.apps.apps.ready:
        print("\n" + "="*80)
        print("DATABASE ACCESS DURING INITIALIZATION DETECTED!")
        print(f"SQL: {sql}")
        traceback.print_stack()
        print("="*80 + "\n")
    return original_execute(self, sql, params)

CursorWrapper.execute = patched_execute

print("Starting django.setup()...")
try:
    django.setup()
    print("django.setup() completed.")
except Exception:
    traceback.print_exc()
