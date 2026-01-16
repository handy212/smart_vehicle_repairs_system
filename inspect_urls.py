import os
import sys
import django
from django.urls import get_resolver

# Add project root to path
sys.path.insert(0, os.getcwd())

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

resolver = get_resolver()

def print_urls(urlpatterns, prefix=''):
    for entry in urlpatterns:
        if hasattr(entry, 'url_patterns'):
            # It's an include
            new_prefix = prefix
            if hasattr(entry, 'pattern'):
                new_prefix += str(entry.pattern)
            print_urls(entry.url_patterns, new_prefix)
        elif hasattr(entry, 'pattern'):
            url = prefix + str(entry.pattern)
            # Check for audit logs related urls
            if 'audit' in url:
                print(f"Found: {url}")
                if hasattr(entry, 'callback'):
                    print(f"  Callback: {entry.callback}")

print("Searching for audit log URLs in Django resolver...")
try:
    print_urls(resolver.url_patterns)
except Exception as e:
    print(f"Error traversing URLs: {e}")
