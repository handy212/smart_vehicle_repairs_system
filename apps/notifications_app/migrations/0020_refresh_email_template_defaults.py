# Refresh built-in default email templates (currency + layout)

from django.db import migrations


def refresh_default_email_templates(apps, schema_editor):
    NotificationTemplate = apps.get_model('notifications_app', 'NotificationTemplate')
    from apps.notifications_app.email_template_defaults import (
        DEFAULT_TEMPLATE_NAMES,
        TEMPLATE_VARIABLES_DOC,
        get_all_email_template_definitions,
        get_invoice_email_templates,
    )

    all_defs = get_all_email_template_definitions()
    invoice_defs = {t['name']: t for t in get_invoice_email_templates()}

    for template_type, template_def in all_defs.items():
        name = template_def['name']
        if name not in DEFAULT_TEMPLATE_NAMES:
            continue
        qs = NotificationTemplate.objects.filter(
            template_type=template_type,
            channel='email',
            name=name,
        )
        if not qs.exists():
            continue
        qs.update(
            subject=template_def['subject'],
            body=template_def['body'],
            html_body=template_def.get('html_body', ''),
            variables=TEMPLATE_VARIABLES_DOC,
        )

    for template_data in get_invoice_email_templates():
        name = template_data['name']
        if name not in DEFAULT_TEMPLATE_NAMES:
            continue
        qs = NotificationTemplate.objects.filter(
            template_type=template_data['template_type'],
            channel='email',
            name=name,
        )
        if qs.exists():
            qs.update(
                subject=template_data.get('subject', ''),
                body=template_data['body'],
                html_body=template_data.get('html_body', ''),
                variables=TEMPLATE_VARIABLES_DOC,
            )


class Migration(migrations.Migration):

    dependencies = [
        ('notifications_app', '0019_asset_acquisition_template_type'),
    ]

    operations = [
        migrations.RunPython(refresh_default_email_templates, migrations.RunPython.noop),
    ]
