from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0037_erp_remaining_gaps'),
    ]

    operations = [
        migrations.AlterField(
            model_name='estimate',
            name='estimate_number',
            field=models.CharField(editable=False, max_length=32, unique=True),
        ),
        migrations.AlterField(
            model_name='invoice',
            name='invoice_number',
            field=models.CharField(editable=False, max_length=32, unique=True),
        ),
        migrations.AlterField(
            model_name='payment',
            name='payment_number',
            field=models.CharField(editable=False, max_length=32, unique=True),
        ),
        migrations.AlterField(
            model_name='creditnote',
            name='credit_note_number',
            field=models.CharField(editable=False, max_length=32, unique=True),
        ),
        migrations.AlterField(
            model_name='salesorder',
            name='sales_order_number',
            field=models.CharField(editable=False, max_length=32, unique=True),
        ),
    ]
