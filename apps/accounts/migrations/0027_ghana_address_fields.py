# Generated manually for Ghana address localization

from django.db import migrations, models

from apps.core.ghana import normalize_ghana_region


def normalize_user_regions(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    for user in User.objects.all().iterator():
        updates = []
        new_region = normalize_ghana_region(user.region, default='')
        if user.region and new_region != user.region:
            user.region = new_region
            updates.append('region')
        if user.country in ('USA', 'United States', 'US', ''):
            user.country = 'Ghana'
            updates.append('country')
        if updates:
            user.save(update_fields=updates)


def migrate_company_address_settings(apps, schema_editor):
    SystemSettings = apps.get_model('accounts', 'SystemSettings')
    renames = {
        'company_state': 'company_region',
        'company_zip': 'company_area',
    }
    for old_key, new_key in renames.items():
        old = SystemSettings.objects.filter(key=old_key).first()
        if not old:
            continue
        new = SystemSettings.objects.filter(key=new_key).first()
        if new:
            if not new.value and old.value:
                new.value = old.value
                new.save(update_fields=['value'])
            old.delete()
        else:
            old.key = new_key
            if old_key == 'company_state':
                old.description = 'Company region (Ghana)'
            else:
                old.description = 'Company area / locality'
            old.save(update_fields=['key', 'description'])
    for row in SystemSettings.objects.filter(key='company_country', value__in=['USA', 'United States', 'US', '']):
        row.value = 'Ghana'
        row.save(update_fields=['value'])


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0026_alter_user_role_for_custom_roles'),
    ]

    operations = [
        migrations.RenameField(
            model_name='user',
            old_name='state',
            new_name='region',
        ),
        migrations.AddField(
            model_name='user',
            name='area',
            field=models.CharField(
                blank=True,
                help_text='Neighborhood / suburb / locality',
                max_length=150,
                verbose_name='area',
            ),
        ),
        migrations.AlterField(
            model_name='user',
            name='region',
            field=models.CharField(
                blank=True,
                help_text='Ghana administrative region',
                max_length=100,
                verbose_name='region',
            ),
        ),
        migrations.AlterField(
            model_name='user',
            name='country',
            field=models.CharField(
                default='Ghana',
                max_length=100,
                verbose_name='country',
            ),
        ),
        migrations.RunPython(normalize_user_regions, migrations.RunPython.noop),
        migrations.RunPython(migrate_company_address_settings, migrations.RunPython.noop),
    ]
