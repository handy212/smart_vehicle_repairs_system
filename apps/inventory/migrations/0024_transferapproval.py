from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0023_purchaseorderapproval'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='TransferApproval',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')], db_index=True, default='pending', max_length=20)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('rejected_at', models.DateTimeField(blank=True, null=True)),
                ('rejection_reason', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('approver', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transfer_approvals', to=settings.AUTH_USER_MODEL)),
                ('transfer', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='approvals', to='inventory.transfer')),
            ],
            options={
                'ordering': ['created_at', 'id'],
                'unique_together': {('transfer', 'approver')},
            },
        ),
        migrations.AddIndex(
            model_name='transferapproval',
            index=models.Index(fields=['transfer', 'status'], name='inventory_t_transfe_ea4b0d_idx'),
        ),
        migrations.AddIndex(
            model_name='transferapproval',
            index=models.Index(fields=['approver', 'status'], name='inventory_t_approve_86423b_idx'),
        ),
    ]
