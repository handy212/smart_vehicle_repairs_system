from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("vehicles", "0002_vehicle_image"),
    ]

    operations = [
        migrations.AddField(
            model_name="vehicle",
            name="vin_decoded_data",
            field=models.JSONField(
                blank=True,
                help_text="Raw VIN-decoded data (NHTSA VPIC / internal decoder output)",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="vehicle",
            name="vin_decoded_at",
            field=models.DateTimeField(
                blank=True,
                help_text="When VIN was last decoded and stored",
                null=True,
            ),
        ),
    ]


