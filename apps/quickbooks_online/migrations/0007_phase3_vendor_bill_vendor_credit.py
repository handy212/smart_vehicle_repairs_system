from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('quickbooks_online', '0006_phase2_qbo_extensions'),
    ]

    operations = [
        migrations.AlterField(
            model_name='qbosynclog',
            name='entity_type',
            field=models.CharField(
                choices=[
                    ('vendor', 'Vendors (Suppliers)'),
                    ('invoice', 'Invoices'),
                    ('bill', 'Bills (Purchase Orders)'),
                    ('estimate', 'Estimates'),
                    ('credit_memo', 'Credit Memos'),
                    ('vendor_credit', 'Vendor Credits'),
                    ('vendor_bill', 'Vendor Bills (AP)'),
                    ('payment', 'Payments'),
                    ('customer', 'Customers'),
                    ('all', 'Full Inbound Sync'),
                ],
                max_length=20,
            ),
        ),
    ]
