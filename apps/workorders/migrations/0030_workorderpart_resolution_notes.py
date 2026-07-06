from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workorders', '0029_workorder_quality_check_signature'),
    ]

    operations = [
        migrations.AddField(
            model_name='workorderpart',
            name='resolution_notes',
            field=models.TextField(
                blank=True,
                help_text='Reason when the part is returned or not used on the repair',
            ),
        ),
    ]
