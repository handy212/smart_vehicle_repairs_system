import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0001_initial'),
        ('fixed_assets', '0003_asset_acquisition_request'),
    ]

    operations = [
        migrations.AddField(
            model_name='document',
            name='asset_acquisition_request',
            field=models.ForeignKey(
                blank=True,
                help_text='Fixed asset acquisition request this file supports (e.g. invoice/receipt at receipt time)',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='supporting_documents',
                to='fixed_assets.assetacquisitionrequest',
            ),
        ),
        migrations.AddField(
            model_name='document',
            name='acquisition_document_kind',
            field=models.CharField(
                blank=True,
                choices=[('invoice', 'Invoice'), ('receipt', 'Receipt')],
                help_text='When linked to an acquisition request, must be invoice or receipt',
                max_length=32,
            ),
        ),
    ]
