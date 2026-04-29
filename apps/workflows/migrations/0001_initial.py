import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='WorkflowDefinition',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120)),
                ('code', models.SlugField(max_length=80, unique=True)),
                ('description', models.TextField(blank=True)),
                ('model_path', models.CharField(choices=[('workorders.WorkOrder', 'Work Order'), ('diagnosis.RepairRecommendation', 'Diagnosis Recommendation'), ('workorders.WorkOrderPart', 'Work Order Part'), ('inspections.VehicleInspection', 'Vehicle Inspection'), ('billing.Invoice', 'Invoice')], max_length=120)),
                ('version', models.PositiveIntegerField(default=1)),
                ('is_active', models.BooleanField(default=True)),
                ('is_default', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='workflow_definitions_created', to=settings.AUTH_USER_MODEL)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='workflow_definitions_updated', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['model_path', '-is_default', 'name', '-version'],
            },
        ),
        migrations.CreateModel(
            name='WorkflowState',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.SlugField(max_length=80)),
                ('label', models.CharField(max_length=120)),
                ('description', models.TextField(blank=True)),
                ('color', models.CharField(blank=True, max_length=30)),
                ('icon', models.CharField(blank=True, max_length=60)),
                ('order', models.PositiveIntegerField(default=0)),
                ('is_initial', models.BooleanField(default=False)),
                ('is_terminal', models.BooleanField(default=False)),
                ('is_active', models.BooleanField(default=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('workflow', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='states', to='workflows.workflowdefinition')),
            ],
            options={
                'ordering': ['workflow', 'order', 'label'],
                'unique_together': {('workflow', 'key')},
            },
        ),
        migrations.CreateModel(
            name='WorkflowTransition',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('label', models.CharField(max_length=120)),
                ('button_label', models.CharField(blank=True, max_length=120)),
                ('description', models.TextField(blank=True)),
                ('order', models.PositiveIntegerField(default=0)),
                ('allowed_roles', models.JSONField(blank=True, default=list)),
                ('required_permission', models.CharField(blank=True, max_length=120)),
                ('is_active', models.BooleanField(default=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('from_state', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='outgoing_transitions', to='workflows.workflowstate')),
                ('to_state', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='incoming_transitions', to='workflows.workflowstate')),
                ('workflow', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transitions', to='workflows.workflowdefinition')),
            ],
            options={
                'ordering': ['workflow', 'from_state__order', 'order', 'label'],
                'unique_together': {('workflow', 'from_state', 'to_state')},
            },
        ),
        migrations.CreateModel(
            name='WorkflowGuard',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('guard_type', models.CharField(choices=[('required_field', 'Required Field'), ('required_relation', 'Required Relation'), ('min_count', 'Minimum Related Count'), ('custom', 'Custom Validator')], max_length=30)),
                ('field_path', models.CharField(blank=True, max_length=160)),
                ('expected_value', models.JSONField(blank=True, null=True)),
                ('message', models.CharField(max_length=255)),
                ('config', models.JSONField(blank=True, default=dict)),
                ('order', models.PositiveIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('transition', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='guards', to='workflows.workflowtransition')),
            ],
            options={
                'ordering': ['transition', 'order', 'id'],
            },
        ),
        migrations.CreateModel(
            name='WorkflowAction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action_type', models.CharField(choices=[('create_note', 'Create Note'), ('create_task', 'Create Task'), ('send_notification', 'Send Notification'), ('approve_recommendations', 'Approve Recommendations'), ('convert_recommendations', 'Convert Recommendations'), ('reserve_parts', 'Reserve Parts'), ('custom', 'Custom Action')], max_length=40)),
                ('timing', models.CharField(choices=[('before', 'Before Transition'), ('after', 'After Transition')], default='after', max_length=10)),
                ('label', models.CharField(max_length=120)),
                ('config', models.JSONField(blank=True, default=dict)),
                ('order', models.PositiveIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('transition', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='actions', to='workflows.workflowtransition')),
            ],
            options={
                'ordering': ['transition', 'timing', 'order', 'id'],
            },
        ),
        migrations.AddIndex(
            model_name='workflowdefinition',
            index=models.Index(fields=['model_path', 'is_active'], name='workflows_w_model_p_de9d06_idx'),
        ),
        migrations.AddIndex(
            model_name='workflowdefinition',
            index=models.Index(fields=['code'], name='workflows_w_code_1e5617_idx'),
        ),
        migrations.AddConstraint(
            model_name='workflowdefinition',
            constraint=models.UniqueConstraint(condition=models.Q(('is_active', True), ('is_default', True)), fields=('model_path',), name='one_active_default_workflow_per_model'),
        ),
        migrations.AddIndex(
            model_name='workflowstate',
            index=models.Index(fields=['workflow', 'key'], name='workflows_w_workflo_c0fac2_idx'),
        ),
        migrations.AddIndex(
            model_name='workflowstate',
            index=models.Index(fields=['workflow', 'is_active'], name='workflows_w_workflo_dedb91_idx'),
        ),
        migrations.AddIndex(
            model_name='workflowtransition',
            index=models.Index(fields=['workflow', 'is_active'], name='workflows_w_workflo_89fb61_idx'),
        ),
        migrations.AddIndex(
            model_name='workflowtransition',
            index=models.Index(fields=['from_state', 'is_active'], name='workflows_w_from_st_427321_idx'),
        ),
    ]
