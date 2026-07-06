from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0024_grant_customer_view_notifications'),
    ]

    operations = [
        migrations.CreateModel(
            name='SystemUpdateRun',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(
                    choices=[
                        ('pending', 'Pending'),
                        ('in_progress', 'In Progress'),
                        ('completed', 'Completed'),
                        ('failed', 'Failed'),
                    ],
                    default='pending',
                    max_length=20,
                    verbose_name='status',
                )),
                ('git_ref', models.CharField(default='main', max_length=120, verbose_name='git ref')),
                ('from_commit', models.CharField(blank=True, max_length=64, verbose_name='from commit')),
                ('to_commit', models.CharField(blank=True, max_length=64, verbose_name='to commit')),
                ('log_output', models.TextField(blank=True, verbose_name='log output')),
                ('error_message', models.TextField(blank=True, verbose_name='error message')),
                ('started_at', models.DateTimeField(auto_now_add=True, verbose_name='started at')),
                ('completed_at', models.DateTimeField(blank=True, null=True, verbose_name='completed at')),
                ('created_by', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='system_update_runs',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'system update run',
                'verbose_name_plural': 'system update runs',
                'ordering': ['-started_at'],
            },
        ),
    ]
