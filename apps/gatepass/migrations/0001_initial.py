# Generated manually for Gate Pass module

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('branches', '0004_add_gatepass_sequence'),
        ('workorders', '0001_initial'),
        ('vehicles', '0001_initial'),
        ('customers', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='GatePass',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('gate_pass_number', models.CharField(db_index=True, editable=False, help_text='Auto-generated gate pass number', max_length=20, unique=True)),
                ('picked_up_by_customer', models.BooleanField(default=True, help_text='True if customer is picking up, False if someone else')),
                ('pickup_person_name', models.CharField(blank=True, help_text='Name of person picking up (required if not customer)', max_length=200)),
                ('pickup_person_relationship', models.CharField(blank=True, help_text="Relationship to customer (e.g., 'Brother', 'Employee', 'Friend')", max_length=100)),
                ('pickup_person_id_type', models.CharField(blank=True, choices=[('driver_license', 'Driver License'), ('national_id', 'National ID'), ('passport', 'Passport'), ('other', 'Other')], help_text='Type of ID provided', max_length=50)),
                ('pickup_person_id_number', models.CharField(blank=True, help_text='ID number of pickup person', max_length=100)),
                ('pickup_person_phone', models.CharField(blank=True, help_text='Phone number of pickup person', max_length=20)),
                ('pickup_notes', models.TextField(blank=True, help_text='Additional notes about pickup')),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('issued', 'Issued'), ('completed', 'Completed'), ('cancelled', 'Cancelled')], db_index=True, default='pending', help_text='Current status of gate pass', max_length=20)),
                ('issued_at', models.DateTimeField(blank=True, help_text='When gate pass was issued', null=True)),
                ('completed_at', models.DateTimeField(blank=True, help_text='When vehicle was actually picked up', null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('authorized_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='gate_passes_authorized', to=settings.AUTH_USER_MODEL)),
                ('branch', models.ForeignKey(help_text='Branch where gate pass was issued', on_delete=django.db.models.deletion.PROTECT, related_name='gate_passes', to='branches.branch')),
                ('customer', models.ForeignKey(help_text='Customer who owns the vehicle', on_delete=django.db.models.deletion.PROTECT, related_name='gate_passes', to='customers.customer')),
                ('issued_by', models.ForeignKey(help_text='User who created/issued the gate pass', on_delete=django.db.models.deletion.PROTECT, related_name='gate_passes_issued', to=settings.AUTH_USER_MODEL)),
                ('vehicle', models.ForeignKey(help_text='Vehicle being picked up', on_delete=django.db.models.deletion.PROTECT, related_name='gate_passes', to='vehicles.vehicle')),
                ('work_order', models.ForeignKey(help_text='Work order this gate pass is for', on_delete=django.db.models.deletion.PROTECT, related_name='gate_passes', to='workorders.workorder')),
            ],
            options={
                'verbose_name': 'Gate Pass',
                'verbose_name_plural': 'Gate Passes',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='gatepass',
            index=models.Index(fields=['work_order', 'status'], name='gatepass_ga_work_or_idx'),
        ),
        migrations.AddIndex(
            model_name='gatepass',
            index=models.Index(fields=['status', 'created_at'], name='gatepass_ga_status_idx'),
        ),
        migrations.AddIndex(
            model_name='gatepass',
            index=models.Index(fields=['branch', 'status'], name='gatepass_ga_branch__idx'),
        ),
        migrations.AddIndex(
            model_name='gatepass',
            index=models.Index(fields=['gate_pass_number'], name='gatepass_ga_gate_pa_idx'),
        ),
    ]
