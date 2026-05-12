from django.db import migrations


def normalize_blank_barcodes(apps, schema_editor):
    Part = apps.get_model('inventory', 'Part')
    Part.objects.filter(barcode='').update(barcode=None)


def restore_blank_barcodes(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0025_rename_inventory_t_transfe_ea4b0d_idx_inventory_t_transfe_a65e0c_idx_and_more'),
    ]

    operations = [
        migrations.RunPython(normalize_blank_barcodes, restore_blank_barcodes),
    ]
