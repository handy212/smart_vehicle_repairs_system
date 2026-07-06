import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0002_document_asset_acquisition_link'),
        ('fixed_assets', '0003_asset_acquisition_request'),
    ]

    operations = [
        migrations.AddField(
            model_name='document',
            name='fixed_asset',
            field=models.ForeignKey(
                blank=True,
                help_text='Fixed asset this invoice/receipt belongs to (direct register uploads)',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='invoice_receipt_documents',
                to='fixed_assets.fixedasset',
            ),
        ),
    ]
