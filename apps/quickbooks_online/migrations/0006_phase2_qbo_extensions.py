# Generated manually for Phase 2 QBO extensions

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('quickbooks_online', '0005_qboaccountmapping'),
    ]

    operations = [
        migrations.AddField(
            model_name='qbosynclog',
            name='direction',
            field=models.CharField(
                choices=[('inbound', 'Inbound (QBO → SVR)'), ('outbound', 'Outbound (SVR → QBO)')],
                default='inbound',
                max_length=10,
            ),
        ),
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
                    ('payment', 'Payments'),
                    ('customer', 'Customers'),
                    ('all', 'Full Inbound Sync'),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='qboaccountmapping',
            name='mapping_kind',
            field=models.CharField(
                choices=[
                    ('control_account', 'Control Account'),
                    ('invoice_line_type', 'Invoice Line Type'),
                    ('payment_method', 'Customer Payment Method'),
                    ('vendor_payment_method', 'Vendor Payment Method'),
                    ('bill_line_kind', 'Bill Line Kind'),
                    ('svr_account', 'SVR GL Account'),
                    ('tax_code', 'Tax Code'),
                ],
                max_length=32,
            ),
        ),
    ]
