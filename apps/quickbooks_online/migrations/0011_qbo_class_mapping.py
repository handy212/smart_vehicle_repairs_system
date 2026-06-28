from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('quickbooks_online', '0010_qboaccountmapping_qbo_account_number'),
    ]

    operations = [
        migrations.AddField(
            model_name='qboaccountmapping',
            name='qbo_class_id',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='qboaccountmapping',
            name='qbo_class_name',
            field=models.CharField(blank=True, max_length=255),
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
                    ('income_class', 'Income Class'),
                    ('revenue_product_class', 'Revenue Product Class'),
                    ('expense_class', 'Expense Class'),
                ],
                max_length=32,
            ),
        ),
    ]
