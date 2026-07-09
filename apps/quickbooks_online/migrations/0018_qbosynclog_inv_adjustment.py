# Generated manually for QBO inventory adjustment sync logs

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('quickbooks_online', '0017_qboaccountmapping_branch'),
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
                    ('inv_adjustment', 'Inventory Adjustments'),
                    ('all', 'Full Inbound Sync'),
                ],
                max_length=20,
            ),
        ),
    ]
