from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('workorders', '0031_servicetasktype_alter_servicetask_task_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='workorder',
            name='customer_discontinuation_reason',
            field=models.CharField(
                blank=True,
                choices=[
                    ('declined_estimate_or_work', 'Customer declined estimate / further work'),
                    ('stopped_mid_repair', 'Customer stopped work mid-repair'),
                ],
                help_text='Why the customer discontinued; set when moving to Discontinued — Pending Invoice.',
                max_length=50,
            ),
        ),
        migrations.AddField(
            model_name='workorder',
            name='customer_discontinuation_notes',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='workorder',
            name='customer_discontinued_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='workorder',
            name='customer_discontinued_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name='work_orders_discontinued',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='workorder',
            name='status',
            field=models.CharField(
                choices=[
                    ('draft', 'Draft'),
                    ('inspection', 'Initial Inspection'),
                    ('intake', 'Intake'),
                    ('assigned', 'Assigned'),
                    ('diagnosis', 'Diagnosis'),
                    ('awaiting_approval', 'Awaiting Customer Approval'),
                    ('approved', 'Approved'),
                    ('in_progress', 'In Progress'),
                    ('additional_work_found', 'Additional Work Found'),
                    ('paused', 'Paused'),
                    ('quality_check', 'Quality Check'),
                    ('discontinued_pending_bill', 'Discontinued — Pending Invoice'),
                    ('completed', 'Completed'),
                    ('invoiced', 'Invoiced'),
                    ('closed', 'Closed'),
                ],
                db_index=True,
                default='draft',
                max_length=25,
            ),
        ),
        migrations.AlterField(
            model_name='servicetask',
            name='workflow_phase',
            field=models.CharField(
                blank=True,
                choices=[
                    ('draft', 'Draft'),
                    ('inspection', 'Initial Inspection'),
                    ('intake', 'Intake'),
                    ('assigned', 'Assigned'),
                    ('diagnosis', 'Diagnosis'),
                    ('awaiting_approval', 'Awaiting Customer Approval'),
                    ('approved', 'Approved'),
                    ('in_progress', 'In Progress'),
                    ('additional_work_found', 'Additional Work Found'),
                    ('paused', 'Paused'),
                    ('quality_check', 'Quality Check'),
                    ('completed', 'Completed'),
                    ('invoiced', 'Invoiced'),
                    ('closed', 'Closed'),
                    ('discontinued_pending_bill', 'Discontinued — Pending Invoice'),
                ],
                help_text='If set, this task is automatically created and completed based on workflow phase',
                max_length=25,
                null=True,
            ),
        ),
    ]
