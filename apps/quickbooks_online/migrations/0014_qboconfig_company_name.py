from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('quickbooks_online', '0013_qboaccountmapping_quickbooks__qbo_cla_58a195_idx'),
    ]

    operations = [
        migrations.AddField(
            model_name='qboconfig',
            name='company_name',
            field=models.CharField(
                blank=True,
                help_text='Connected QBO company display name (filled after auth)',
                max_length=255,
            ),
        ),
    ]
