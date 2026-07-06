from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('diagnosis', '0008_merge_20260401_1335'),
    ]

    operations = [
        migrations.AddField(
            model_name='repairrecommendation',
            name='quotation_estimate_id',
            field=models.PositiveIntegerField(blank=True, help_text='Billing estimate document created by stores for this recommendation', null=True),
        ),
        migrations.AddField(
            model_name='repairrecommendation',
            name='quotation_estimate_number',
            field=models.CharField(blank=True, help_text='Human-readable estimate number for the quotation document', max_length=40),
        ),
    ]
