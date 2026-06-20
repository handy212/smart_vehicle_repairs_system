# Generated manually for QBOAccountMapping

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0017_gra_ssnit_statement_pdf'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('quickbooks_online', '0004_add_qbosynclog'),
    ]

    operations = [
        migrations.CreateModel(
            name='QBOAccountMapping',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mapping_kind', models.CharField(
                    choices=[
                        ('control_account', 'Control Account'),
                        ('invoice_line_type', 'Invoice Line Type'),
                        ('payment_method', 'Customer Payment Method'),
                        ('vendor_payment_method', 'Vendor Payment Method'),
                        ('bill_line_kind', 'Bill Line Kind'),
                        ('svr_account', 'SVR GL Account'),
                    ],
                    max_length=32,
                )),
                ('mapping_key', models.CharField(help_text='Role key, e.g. sales_revenue_account or cash', max_length=64)),
                ('qbo_account_id', models.CharField(blank=True, max_length=50)),
                ('qbo_account_name', models.CharField(blank=True, max_length=255)),
                ('qbo_account_type', models.CharField(blank=True, max_length=64)),
                ('qbo_item_id', models.CharField(blank=True, max_length=50)),
                ('qbo_item_name', models.CharField(blank=True, max_length=255)),
                ('status', models.CharField(
                    choices=[('synced', 'Mapped'), ('failed', 'Failed'), ('pending', 'Pending')],
                    default='synced',
                    max_length=20,
                )),
                ('error_message', models.TextField(blank=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('svr_account', models.ForeignKey(
                    blank=True,
                    help_text='Optional SVR GL account this row mirrors (bank/cash accounts).',
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='qbo_account_mappings',
                    to='accounting.account',
                )),
                ('updated_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='qbo_account_mappings_updated',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'QBO Account Mapping',
                'verbose_name_plural': 'QBO Account Mappings',
            },
        ),
        migrations.AddIndex(
            model_name='qboaccountmapping',
            index=models.Index(fields=['mapping_kind', 'mapping_key'], name='quickbooks__mapping_0d0f0d_idx'),
        ),
        migrations.AddIndex(
            model_name='qboaccountmapping',
            index=models.Index(fields=['qbo_account_id'], name='quickbooks__qbo_acc_6d2f0a_idx'),
        ),
        migrations.AddIndex(
            model_name='qboaccountmapping',
            index=models.Index(fields=['qbo_item_id'], name='quickbooks__qbo_ite_4bb0d1_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='qboaccountmapping',
            unique_together={('mapping_kind', 'mapping_key')},
        ),
    ]
