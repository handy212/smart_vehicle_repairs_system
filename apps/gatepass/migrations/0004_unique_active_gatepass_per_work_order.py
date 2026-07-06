from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('gatepass', '0003_remove_gatepass_gatepass_ga_gate_pa_0a1c0b_idx_and_more'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='gatepass',
            constraint=models.UniqueConstraint(
                condition=~models.Q(('status', 'cancelled')),
                fields=('work_order',),
                name='unique_active_gatepass_per_work_order',
            ),
        ),
    ]
