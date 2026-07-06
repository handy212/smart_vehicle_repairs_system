from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inspections", "0005_backfill_brake_pad_thresholds"),
    ]

    operations = [
        migrations.AddField(
            model_name="vehicleinspection",
            name="odometer_unavailable",
            field=models.BooleanField(
                default=False,
                help_text="Odometer could not be read, e.g. accident vehicle or electrical issue",
            ),
        ),
        migrations.AddField(
            model_name="vehicleinspection",
            name="odometer_unavailable_reason",
            field=models.TextField(blank=True),
        ),
    ]
