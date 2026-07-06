# Generated manually for QBO sync log entity type clarity

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('quickbooks_online', '0011_qbo_class_mapping'),
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
                    ('purchase_order', 'Purchase Orders (Outbound)'),
                    ('estimate', 'Estimates'),
                    ('credit_memo', 'Credit Memos'),
                    ('vendor_credit', 'Vendor Credits'),
                    ('vendor_bill', 'Vendor Bills (AP)'),
                    ('payment', 'Customer Payments'),
                    ('bill_payment', 'Vendor Bill Payments'),
                    ('customer', 'Customers'),
                    ('item', 'Items (Parts catalog)'),
                    ('all', 'Full Inbound Sync'),
                ],
                max_length=20,
            ),
        ),
    ]
