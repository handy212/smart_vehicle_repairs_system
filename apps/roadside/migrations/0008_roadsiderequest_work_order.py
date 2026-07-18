from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('workorders', '0047_workorder_intake_condition_fields'),
        ('roadside', '0007_roadsidedispatch_response_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='roadsiderequest',
            name='work_order',
            field=models.OneToOneField(
                blank=True,
                help_text='Workshop work order created from this roadside request',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='roadside_request',
                to='workorders.workorder',
            ),
        ),
    ]
