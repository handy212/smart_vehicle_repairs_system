# Generated manually for quality check assignment

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('workorders', '0045_job_types_m2m_and_technician_assignment_notes'),
    ]

    operations = [
        migrations.AddField(
            model_name='workorder',
            name='quality_check_assigned_to',
            field=models.ForeignKey(
                blank=True,
                help_text='Authorized inspector assigned to perform quality check',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='assigned_quality_checks',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='workorder',
            name='quality_check_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='quality_checked_work_orders',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='workorder',
            name='quality_check_signature',
            field=models.TextField(
                blank=True,
                help_text='Base64 encoded signature of the inspector who performed the quality check',
                null=True,
            ),
        ),
    ]
