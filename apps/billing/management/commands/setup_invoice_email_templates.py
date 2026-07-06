"""
Management command to create/update invoice email templates.
"""
from django.core.management.base import BaseCommand

from apps.notifications_app.models import NotificationTemplate
from apps.notifications_app.email_template_defaults import (
    DEFAULT_TEMPLATE_NAMES,
    TEMPLATE_VARIABLES_DOC,
    get_invoice_email_templates,
)
from apps.accounts.management.commands._auditlog_utils import disable_auditlog


class Command(BaseCommand):
    help = 'Create default invoice email templates'

    def add_arguments(self, parser):
        parser.add_argument(
            '--refresh-defaults',
            action='store_true',
            help='Update built-in invoice template content',
        )

    def handle(self, *args, **options):
        refresh_defaults = options['refresh_defaults']
        templates = get_invoice_email_templates()
        created_count = 0
        updated_count = 0
        skipped_count = 0

        with disable_auditlog():
            for template_data in templates:
                existing = NotificationTemplate.objects.filter(
                    name=template_data['name'],
                    template_type=template_data['template_type'],
                    channel=template_data['channel'],
                ).first()

                defaults = {
                    'subject': template_data.get('subject', ''),
                    'body': template_data['body'],
                    'html_body': template_data.get('html_body', ''),
                    'is_active': True,
                    'variables': TEMPLATE_VARIABLES_DOC,
                }

                if existing is None:
                    NotificationTemplate.objects.create(
                        name=template_data['name'],
                        template_type=template_data['template_type'],
                        channel=template_data['channel'],
                        **defaults,
                    )
                    created_count += 1
                    self.stdout.write(self.style.SUCCESS(f'Created template: {template_data["name"]}'))
                elif refresh_defaults and template_data['name'] in DEFAULT_TEMPLATE_NAMES:
                    for key, value in defaults.items():
                        setattr(existing, key, value)
                    existing.save()
                    updated_count += 1
                    self.stdout.write(self.style.SUCCESS(f'Refreshed template: {template_data["name"]}'))
                else:
                    skipped_count += 1
                    self.stdout.write(self.style.NOTICE(f'Skipped existing: {template_data["name"]}'))

        self.stdout.write(self.style.SUCCESS(
            f'\nCompleted! Created {created_count}, refreshed {updated_count}, skipped {skipped_count}.'
        ))
