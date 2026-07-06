from decimal import Decimal

import django.core.validators
from django.db import migrations, models
import django.db.models.deletion


def seed_job_type_revenue_products(apps, schema_editor):
    from apps.workorders.job_type_seed import seed_workflow_profiles_and_job_types

    JobType = apps.get_model('workorders', 'JobType')
    WorkflowProfile = apps.get_model('workorders', 'WorkflowProfile')

    seed_workflow_profiles_and_job_types(
        overwrite=True,
        JobType=JobType,
        WorkflowProfile=WorkflowProfile,
        revenue_products_only=True,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0023_revenueproduct_default_unit_price'),
        ('workorders', '0041_job_types_and_workflow_profiles'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobtype',
            name='default_revenue_product',
            field=models.ForeignKey(
                blank=True,
                help_text='Default income category when invoicing this job type with no tasks/parts.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='default_job_types',
                to='accounting.revenueproduct',
            ),
        ),
        migrations.AddField(
            model_name='jobtype',
            name='default_service_fee',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text='Optional flat fee override for this job type (otherwise uses income category default price).',
                max_digits=10,
                null=True,
                validators=[django.core.validators.MinValueValidator(Decimal('0'))],
            ),
        ),
        migrations.RunPython(seed_job_type_revenue_products, migrations.RunPython.noop),
    ]
