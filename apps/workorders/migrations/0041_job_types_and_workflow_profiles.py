import django.db.models.deletion
from django.db import migrations, models


def seed_profiles_and_job_types(apps, schema_editor):
    from apps.workorders.job_type_seed import (
        backfill_work_order_job_types,
        seed_workflow_profiles_and_job_types,
    )

    JobType = apps.get_model('workorders', 'JobType')
    WorkflowProfile = apps.get_model('workorders', 'WorkflowProfile')
    WorkOrder = apps.get_model('workorders', 'WorkOrder')

    seed_workflow_profiles_and_job_types(
        overwrite=True,
        JobType=JobType,
        WorkflowProfile=WorkflowProfile,
    )
    backfill_work_order_job_types(JobType=JobType, WorkOrder=WorkOrder)


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0014_servicebundle_servicebundleitem'),
        ('vehicles', '0006_servicetype_vehicleserviceschedule_and_more'),
        ('workorders', '0040_revenue_products'),
    ]

    operations = [
        migrations.CreateModel(
            name='WorkflowProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.SlugField(max_length=50, unique=True)),
                ('name', models.CharField(max_length=100)),
                ('description', models.TextField(blank=True)),
                ('is_active', models.BooleanField(default=True)),
                ('is_predefined', models.BooleanField(default=False)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('skip_inspection', models.BooleanField(default=False)),
                ('skip_diagnosis', models.BooleanField(default=False)),
                ('skip_customer_approval', models.BooleanField(default=False)),
                ('skip_quality_check', models.BooleanField(default=False)),
                ('auto_approve_on_create', models.BooleanField(default=False)),
                ('apply_service_bundle_on_create', models.BooleanField(default=False)),
                ('allows_fast_track_to_approved', models.BooleanField(default=False, help_text='Allow draft → approved when bundle/tasks are ready (routine fast-track).')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Workflow Profile',
                'verbose_name_plural': 'Workflow Profiles',
                'ordering': ['sort_order', 'name'],
            },
        ),
        migrations.CreateModel(
            name='JobType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.SlugField(max_length=50, unique=True)),
                ('name', models.CharField(max_length=100)),
                ('category', models.CharField(choices=[('repair', 'Repair'), ('maintenance', 'Maintenance'), ('diagnostic', 'Diagnostic'), ('inspection', 'Inspection'), ('body', 'Body & Paint'), ('commercial', 'Warranty / Insurance'), ('installation', 'Installation')], default='repair', max_length=20)),
                ('description', models.TextField(blank=True)),
                ('is_active', models.BooleanField(default=True)),
                ('is_predefined', models.BooleanField(default=False)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('requires_inspection', models.BooleanField(default=True)),
                ('requires_diagnosis', models.BooleanField(default=True)),
                ('requires_approval', models.BooleanField(default=True)),
                ('quality_check_required', models.BooleanField(default=True)),
                ('allows_bundle', models.BooleanField(default=False, help_text='Whether a service bundle may be selected at check-in.')),
                ('sets_warranty_flag', models.BooleanField(default=False)),
                ('sets_insurance_flag', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('default_service_bundle', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='default_job_types', to='inventory.servicebundle')),
                ('default_service_type', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='default_job_types', to='vehicles.servicetype')),
                ('workflow_profile', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='job_types', to='workorders.workflowprofile')),
            ],
            options={
                'verbose_name': 'Job Type',
                'verbose_name_plural': 'Job Types',
                'ordering': ['sort_order', 'name'],
            },
        ),
        migrations.AddField(
            model_name='workorder',
            name='is_insurance_claim',
            field=models.BooleanField(default=False, help_text='Insurance or accident-repair claim context for this work order'),
        ),
        migrations.AddField(
            model_name='workorder',
            name='job_type',
            field=models.ForeignKey(blank=True, help_text='Configurable job type (e.g. Brake Service, Routine Maintenance)', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='work_orders', to='workorders.jobtype'),
        ),
        migrations.AddIndex(
            model_name='jobtype',
            index=models.Index(fields=['is_active', 'category'], name='workorders__is_acti_6f0a2a_idx'),
        ),
        migrations.AddIndex(
            model_name='jobtype',
            index=models.Index(fields=['code'], name='workorders__code_0bb0f1_idx'),
        ),
        migrations.RunPython(seed_profiles_and_job_types, migrations.RunPython.noop),
    ]
