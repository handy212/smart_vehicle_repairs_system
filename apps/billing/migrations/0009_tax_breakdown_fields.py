from django.db import migrations, models
from decimal import Decimal


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0008_add_django_ledger_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='estimate',
            name='tax_getfund_amount',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10),
        ),
        migrations.AddField(
            model_name='estimate',
            name='tax_hrl_amount',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10),
        ),
        migrations.AddField(
            model_name='estimate',
            name='tax_nhil_amount',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10),
        ),
        migrations.AddField(
            model_name='estimate',
            name='tax_regime',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='estimate',
            name='tax_vat_amount',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10),
        ),
        migrations.AddField(
            model_name='estimate',
            name='taxable_subtotal',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10),
        ),
        migrations.AddField(
            model_name='invoice',
            name='tax_getfund_amount',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10),
        ),
        migrations.AddField(
            model_name='invoice',
            name='tax_hrl_amount',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10),
        ),
        migrations.AddField(
            model_name='invoice',
            name='tax_nhil_amount',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10),
        ),
        migrations.AddField(
            model_name='invoice',
            name='tax_regime',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='invoice',
            name='tax_vat_amount',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10),
        ),
        migrations.AddField(
            model_name='invoice',
            name='taxable_subtotal',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10),
        ),
    ]

