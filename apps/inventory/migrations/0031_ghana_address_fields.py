# Generated manually for Ghana address localization

from django.db import migrations, models

from apps.core.ghana import normalize_ghana_region


def normalize_supplier_regions(apps, schema_editor):
    Supplier = apps.get_model('inventory', 'Supplier')
    for supplier in Supplier.objects.all().iterator():
        updates = []
        new_region = normalize_ghana_region(supplier.region, default='')
        if supplier.region and new_region != supplier.region:
            supplier.region = new_region
            updates.append('region')
        if supplier.country in ('USA', 'United States', 'US', ''):
            supplier.country = 'Ghana'
            updates.append('country')
        if updates:
            supplier.save(update_fields=updates)


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0030_purchaseorderitem_qbo_line_id'),
    ]

    operations = [
        migrations.RenameField(
            model_name='supplier',
            old_name='state',
            new_name='region',
        ),
        migrations.AddField(
            model_name='supplier',
            name='area',
            field=models.CharField(
                blank=True,
                help_text='Neighborhood / suburb / locality',
                max_length=150,
            ),
        ),
        migrations.AlterField(
            model_name='supplier',
            name='region',
            field=models.CharField(
                blank=True,
                help_text='Ghana administrative region',
                max_length=100,
            ),
        ),
        migrations.AlterField(
            model_name='supplier',
            name='country',
            field=models.CharField(default='Ghana', max_length=100),
        ),
        migrations.RunPython(normalize_supplier_regions, migrations.RunPython.noop),
    ]
