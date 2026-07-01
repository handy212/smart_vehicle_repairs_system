from decimal import Decimal

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0022_rename_accounting__branch__a1b2c3_idx_accounting__branch__67d23e_idx'),
    ]

    operations = [
        migrations.AddField(
            model_name='revenueproduct',
            name='default_unit_price',
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal('0.00'),
                help_text='Default charge when this service is billed as a flat fee (e.g. inspection, spraying quote).',
                max_digits=10,
                validators=[django.core.validators.MinValueValidator(Decimal('0'))],
            ),
        ),
    ]
