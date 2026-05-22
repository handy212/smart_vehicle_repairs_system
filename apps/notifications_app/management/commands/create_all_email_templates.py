"""
Management command to create default email templates for notification types.
By default only creates missing templates; use --refresh-defaults to update built-in defaults.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from apps.notifications_app.models import NotificationTemplate
from apps.notifications_app.email_template_defaults import (
    DEFAULT_TEMPLATE_NAMES,
    TEMPLATE_VARIABLES_DOC,
    get_all_email_template_definitions,
)
from apps.accounts.management.commands._auditlog_utils import disable_auditlog

User = get_user_model()


class Command(BaseCommand):
    help = 'Create default email templates for notification types that are missing'

    def add_arguments(self, parser):
        parser.add_argument(
            '--refresh-defaults',
            action='store_true',
            help='Update templates whose name matches a built-in default (overwrites custom edits to those names)',
        )

    def handle(self, *args, **options):
        refresh_defaults = options['refresh_defaults']

        created_by_user = None
        if User.objects.filter(is_superuser=True).exists():
            created_by_user = User.objects.filter(is_superuser=True).first()
        elif User.objects.exists():
            created_by_user = User.objects.first()

        template_definitions = get_all_email_template_definitions()
        created_count = 0
        updated_count = 0
        skipped_count = 0

        with disable_auditlog():
            for template_type, template_def in template_definitions.items():
                existing = NotificationTemplate.objects.filter(
                    template_type=template_type,
                    channel='email',
                ).first()

                defaults = {
                    'name': template_def['name'],
                    'subject': template_def['subject'],
                    'body': template_def['body'],
                    'html_body': template_def['html_body'],
                    'is_active': True,
                    'variables': TEMPLATE_VARIABLES_DOC,
                    'created_by': created_by_user,
                }

                if existing is None:
                    NotificationTemplate.objects.create(
                        template_type=template_type,
                        channel='email',
                        **defaults,
                    )
                    created_count += 1
                    self.stdout.write(self.style.SUCCESS(f'✓ Created template: {template_type}'))
                elif refresh_defaults and existing.name in DEFAULT_TEMPLATE_NAMES:
                    for key, value in defaults.items():
                        if key != 'created_by':
                            setattr(existing, key, value)
                    if created_by_user and not existing.created_by_id:
                        existing.created_by = created_by_user
                    existing.save()
                    updated_count += 1
                    self.stdout.write(self.style.WARNING(f'→ Refreshed default template: {template_type}'))
                else:
                    skipped_count += 1
                    self.stdout.write(self.style.NOTICE(f'○ Skipped existing template: {template_type}'))

        self.stdout.write(self.style.SUCCESS(
            f'\nCompleted! Created {created_count}, refreshed {updated_count}, skipped {skipped_count}.'
        ))
        if not refresh_defaults and skipped_count:
            self.stdout.write(self.style.NOTICE(
                'Use --refresh-defaults to update built-in default template content.'
            ))
        self.stdout.write(self.style.NOTICE(
            'Invoice templates: run "python manage.py setup_invoice_email_templates --refresh-defaults"'
        ))
