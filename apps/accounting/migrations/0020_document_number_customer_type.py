from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0019_payroll_control_accounts'),
    ]

    operations = [
        migrations.AlterField(
            model_name='documentnumbersequence',
            name='document_type',
            field=models.CharField(
                choices=[
                    ('invoice', 'Invoice'),
                    ('credit_note', 'Credit Note'),
                    ('payment', 'Payment'),
                    ('bill', 'Bill'),
                    ('vendor_credit', 'Vendor Credit'),
                    ('sales_order', 'Sales Order'),
                    ('customer', 'Customer'),
                ],
                max_length=20,
            ),
        ),
    ]
