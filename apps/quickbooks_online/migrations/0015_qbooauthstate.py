from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('quickbooks_online', '0014_qboconfig_company_name'),
    ]

    operations = [
        migrations.CreateModel(
            name='QBOOAuthState',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('state_token', models.CharField(db_index=True, max_length=128, unique=True)),
                ('redirect_uri', models.CharField(max_length=512)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('consumed_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='qbo_oauth_states', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'QBO OAuth State',
                'verbose_name_plural': 'QBO OAuth States',
                'indexes': [models.Index(fields=['expires_at'], name='quickbooks__expires_0a8f2d_idx')],
            },
        ),
    ]
