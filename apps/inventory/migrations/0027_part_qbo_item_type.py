from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0026_normalize_blank_part_barcodes'),
    ]

    operations = [
        migrations.AddField(
            model_name='part',
            name='item_type',
            field=models.CharField(
                choices=[
                    ('inventory', 'Inventory (track qty, QBO Inventory item)'),
                    ('non_inventory', 'Non-inventory (QBO NonInventory item)'),
                    ('service', 'Service (QBO Service item)'),
                ],
                db_index=True,
                default='inventory',
                help_text='How this part syncs to QuickBooks Online (Inventory, NonInventory, or Service).',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='part',
            name='inventory_start_date',
            field=models.DateField(
                blank=True,
                help_text='Opening inventory date sent to QBO when first synced as an Inventory item.',
                null=True,
            ),
        ),
    ]
