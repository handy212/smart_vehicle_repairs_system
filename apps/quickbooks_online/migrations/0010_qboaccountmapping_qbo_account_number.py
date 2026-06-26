from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('quickbooks_online', '0009_alter_qbosynclog_entity_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='qboaccountmapping',
            name='qbo_account_number',
            field=models.CharField(
                blank=True,
                help_text='QuickBooks chart account number (AcctNum) when mapped.',
                max_length=64,
            ),
        ),
    ]
