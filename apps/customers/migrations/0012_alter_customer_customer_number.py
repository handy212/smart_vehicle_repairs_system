from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0011_alter_customer_default_payment_method_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='customer',
            name='customer_number',
            field=models.CharField(
                help_text='Unique customer identification number (e.g. CUS-2026-KSI-000001)',
                max_length=32,
                unique=True,
            ),
        ),
    ]
