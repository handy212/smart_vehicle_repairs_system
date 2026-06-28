from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0001_initial'),
        ('accounting', '0020_document_number_customer_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='branch',
            field=models.ForeignKey(
                blank=True,
                help_text=(
                    'When set, this bank/cash settlement account is restricted to the branch '
                    'for payments, tills, and refunds. Null = shared across branches.'
                ),
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='settlement_accounts',
                to='branches.branch',
            ),
        ),
        migrations.AddIndex(
            model_name='account',
            index=models.Index(fields=['branch', 'is_active'], name='accounting__branch__a1b2c3_idx'),
        ),
    ]
