# Generated manually — allow revised invoices per work order (void + re-issue)

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('workorders', '0032_workorder_customer_discontinuation'),
        ('billing', '0031_estimatelineitem_discount_amount_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='invoice',
            name='work_order',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='invoices',
                to='workorders.workorder',
            ),
        ),
    ]
