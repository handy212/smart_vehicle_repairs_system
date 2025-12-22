from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('vehicles', '0001_initial'),
        ('subscriptions', '0002_add_subscription_metadata'),
    ]

    operations = [
        migrations.AddField(
            model_name='subscription',
            name='vehicle',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='subscriptions', to='vehicles.vehicle'),
        ),
    ]
