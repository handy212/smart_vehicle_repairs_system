from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0029_revenue_products'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchaseorderitem',
            name='qbo_line_id',
            field=models.CharField(
                blank=True,
                default='',
                help_text='QuickBooks PurchaseOrder line Id for Bill LinkedTxn',
                max_length=32,
            ),
        ),
    ]
