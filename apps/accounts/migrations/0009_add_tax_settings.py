from django.db import migrations


def add_tax_settings(apps, schema_editor):
    SystemSettings = apps.get_model('accounts', 'SystemSettings')
    settings_to_create = [
        ('tax_enabled', 'true', 'Enable Ghana tax computation for invoices and estimates'),
        ('tax_regime', 'ghana_standard', 'Tax regime identifier (e.g., ghana_standard)'),
        ('tax_vat_rate', '15.0', 'Value Added Tax percentage applied on taxable supply plus levies'),
        ('tax_nhil_rate', '2.5', 'National Health Insurance Levy percentage applied on taxable supply'),
        ('tax_getfund_rate', '2.5', 'GETFund levy percentage applied on taxable supply'),
        ('tax_covid_rate', '1.0', 'COVID-19 Health Recovery Levy percentage applied on taxable supply'),
    ]

    for key, value, description in settings_to_create:
        SystemSettings.objects.get_or_create(
            key=key,
            defaults={
                'category': 'tax',
                'value': value,
                'description': description,
                'is_secret': False,
                'is_active': True,
            },
        )


def remove_tax_settings(apps, schema_editor):
    SystemSettings = apps.get_model('accounts', 'SystemSettings')
    SystemSettings.objects.filter(key__in=[
        'tax_enabled',
        'tax_regime',
        'tax_vat_rate',
        'tax_nhil_rate',
        'tax_getfund_rate',
        'tax_covid_rate',
    ]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0008_add_service_coordinator_role'),
    ]

    operations = [
        migrations.RunPython(add_tax_settings, remove_tax_settings),
    ]

