from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('workorders', '0040_revenue_products'),
    ]

    operations = [
        migrations.AddField(
            model_name='workorder',
            name='technician_assignment_note',
            field=models.TextField(
                blank=True,
                help_text='Optional acceptance note or mandatory rejection/release reason',
            ),
        ),
        migrations.AddField(
            model_name='workorder',
            name='technician_assignment_responded_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='workorder',
            name='technician_assignment_responded_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='work_order_assignment_responses',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='workorder',
            name='technician_assignment_status',
            field=models.CharField(
                blank=True,
                choices=[
                    ('pending', 'Pending Acceptance'),
                    ('accepted', 'Accepted'),
                    ('rejected', 'Rejected'),
                    ('released', 'Released to Coordinator'),
                ],
                default='',
                help_text='Technician response to work order assignment',
                max_length=20,
            ),
        ),
    ]
