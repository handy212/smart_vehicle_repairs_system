from django.db import migrations, models


GHANA_REGIONS = {
    'ahafo': 'Ahafo',
    'ashanti': 'Ashanti',
    'bono': 'Bono',
    'bono east': 'Bono East',
    'bono-east': 'Bono East',
    'central': 'Central',
    'eastern': 'Eastern',
    'greater accra': 'Greater Accra',
    'greater-accra': 'Greater Accra',
    'accra': 'Greater Accra',
    'north east': 'North East',
    'north-east': 'North East',
    'northern': 'Northern',
    'oti': 'Oti',
    'savannah': 'Savannah',
    'upper east': 'Upper East',
    'upper-east': 'Upper East',
    'upper west': 'Upper West',
    'upper-west': 'Upper West',
    'volta': 'Volta',
    'western': 'Western',
    'western north': 'Western North',
    'western-north': 'Western North',
}


def normalize_regions(apps, schema_editor):
    Branch = apps.get_model('branches', 'Branch')
    for branch in Branch.objects.all():
        raw = (branch.region or '').strip()
        mapped = GHANA_REGIONS.get(raw.lower())
        if mapped and mapped != branch.region:
            branch.region = mapped
            branch.save(update_fields=['region'])
        elif not raw:
            branch.region = 'Greater Accra'
            branch.save(update_fields=['region'])


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0004_add_gatepass_sequence'),
    ]

    operations = [
        migrations.RenameField(
            model_name='branch',
            old_name='state',
            new_name='region',
        ),
        migrations.AddField(
            model_name='branch',
            name='area',
            field=models.CharField(
                blank=True,
                help_text='Neighborhood / suburb / locality (e.g. East Legon, Adum)',
                max_length=150,
                verbose_name='area',
            ),
        ),
        migrations.AlterField(
            model_name='branch',
            name='region',
            field=models.CharField(
                choices=[
                    ('Ahafo', 'Ahafo'),
                    ('Ashanti', 'Ashanti'),
                    ('Bono', 'Bono'),
                    ('Bono East', 'Bono East'),
                    ('Central', 'Central'),
                    ('Eastern', 'Eastern'),
                    ('Greater Accra', 'Greater Accra'),
                    ('North East', 'North East'),
                    ('Northern', 'Northern'),
                    ('Oti', 'Oti'),
                    ('Savannah', 'Savannah'),
                    ('Upper East', 'Upper East'),
                    ('Upper West', 'Upper West'),
                    ('Volta', 'Volta'),
                    ('Western', 'Western'),
                    ('Western North', 'Western North'),
                ],
                help_text='Ghana administrative region',
                max_length=100,
                verbose_name='region',
            ),
        ),
        migrations.AlterField(
            model_name='branch',
            name='zip_code',
            field=models.CharField(blank=True, default='', max_length=20, verbose_name='zip code'),
        ),
        migrations.AlterField(
            model_name='branch',
            name='country',
            field=models.CharField(default='Ghana', max_length=100, verbose_name='country'),
        ),
        migrations.AlterField(
            model_name='branch',
            name='timezone',
            field=models.CharField(default='Africa/Accra', max_length=50, verbose_name='timezone'),
        ),
        migrations.RunPython(normalize_regions, migrations.RunPython.noop),
    ]
