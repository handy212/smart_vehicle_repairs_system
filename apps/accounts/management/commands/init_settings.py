"""
Initialize System Settings with predefined values
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.accounts.admin_models import SystemSettings
from apps.accounts.settings_init import DEFAULT_SETTINGS, cleanup_deprecated_settings
from apps.accounts.management.commands._auditlog_utils import disable_auditlog


class Command(BaseCommand):
    help = 'Initialize system settings with predefined defaults'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Initializing system settings...'))
        
        with disable_auditlog():
            self._do_init()

    def _do_init(self):
        with transaction.atomic():
            settings_config = [
                (
                    setting['key'],
                    setting.get('value', ''),
                    category,
                    setting.get('description', ''),
                    setting.get('is_secret', False),
                )
                for category, settings_list in DEFAULT_SETTINGS.items()
                for setting in settings_list
            ]
            
            created_count = 0
            updated_count = 0
            
            for key, default_value, category, description, is_secret in settings_config:
                setting, created = SystemSettings.objects.get_or_create(
                    key=key,
                    defaults={
                        'value': default_value,
                        'category': category,
                        'description': description,
                        'is_secret': is_secret,
                        'is_active': True,
                    }
                )
                
                if created:
                    self.stdout.write(f'  ✅ Created: {key}')
                    created_count += 1
                else:
                    # Update description and is_secret if changed
                    if setting.description != description or setting.is_secret != is_secret:
                        setting.description = description
                        setting.is_secret = is_secret
                        setting.save()
                        self.stdout.write(f'  ♻️  Updated: {key}')
                        updated_count += 1

            deprecated_count = cleanup_deprecated_settings()
        
        self.stdout.write(self.style.SUCCESS(f'\n✅ Settings initialization complete!'))
        self.stdout.write(self.style.SUCCESS(f'   - Created: {created_count} settings'))
        self.stdout.write(self.style.SUCCESS(f'   - Updated: {updated_count} settings'))
        self.stdout.write(self.style.SUCCESS(f'   - Deprecated hidden: {deprecated_count} settings'))
        self.stdout.write(self.style.SUCCESS(f'   - Total: {len(settings_config)} settings'))
        
        # Show categories
        categories = set(cat for _, _, cat, _, _ in settings_config)
        self.stdout.write(self.style.SUCCESS(f'\n📁 Categories ({len(categories)}):'))
        for cat in sorted(categories):
            count = sum(1 for _, _, c, _, _ in settings_config if c == cat)
            self.stdout.write(f'   - {cat.title()}: {count} settings')
