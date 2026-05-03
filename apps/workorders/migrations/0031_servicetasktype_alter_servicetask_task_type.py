from decimal import Decimal

from django.db import migrations, models
import django.core.validators


DEFAULT_TASK_TYPES = [
    ('inspection', 'Inspection', 10),
    ('maintenance', 'Maintenance', 20),
    ('repair', 'Repair', 30),
    ('diagnostic', 'Diagnostic', 40),
    ('replacement', 'Replacement', 50),
    ('adjustment', 'Adjustment', 60),
    ('cleaning', 'Cleaning', 70),
    ('coordination', 'Coordination', 80),
    ('other', 'Other', 90),
]


def seed_task_types(apps, schema_editor):
    ServiceTaskType = apps.get_model('workorders', 'ServiceTaskType')
    for code, name, sort_order in DEFAULT_TASK_TYPES:
        ServiceTaskType.objects.get_or_create(
            code=code,
            defaults={
                'name': name,
                'default_labor_rate': Decimal('0.00'),
                'is_billable': code != 'coordination',
                'is_active': True,
                'sort_order': sort_order,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ('workorders', '0030_workorderpart_resolution_notes'),
    ]

    operations = [
        migrations.CreateModel(
            name='ServiceTaskType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.SlugField(max_length=50, unique=True)),
                ('name', models.CharField(max_length=100)),
                ('description', models.TextField(blank=True)),
                ('default_labor_rate', models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=8, validators=[django.core.validators.MinValueValidator(Decimal('0'))])),
                ('is_billable', models.BooleanField(default=True)),
                ('is_active', models.BooleanField(default=True)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['sort_order', 'name'],
                'indexes': [models.Index(fields=['is_active', 'sort_order'], name='workorders__is_acti_60d334_idx')],
            },
        ),
        migrations.AlterField(
            model_name='servicetask',
            name='task_type',
            field=models.CharField(default='repair', max_length=50),
        ),
        migrations.RunPython(seed_task_types, migrations.RunPython.noop),
    ]
