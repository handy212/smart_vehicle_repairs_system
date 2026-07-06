from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0001_initial'),
        ('quickbooks_online', '0016_rename_quickbooks__expires_0a8f2d_idx_quickbooks__expires_acb9f1_idx'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='qboaccountmapping',
            unique_together=set(),
        ),
        migrations.AddField(
            model_name='qboaccountmapping',
            name='branch',
            field=models.ForeignKey(
                blank=True,
                help_text='When set, this mapping overrides the company default for the branch.',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='qbo_account_mappings',
                to='branches.branch',
            ),
        ),
        migrations.AddIndex(
            model_name='qboaccountmapping',
            index=models.Index(
                fields=['mapping_kind', 'mapping_key', 'branch'],
                name='quickbooks__mapping_branch_idx',
            ),
        ),
        migrations.AddConstraint(
            model_name='qboaccountmapping',
            constraint=models.UniqueConstraint(
                condition=models.Q(('branch__isnull', True)),
                fields=('mapping_kind', 'mapping_key'),
                name='qbo_mapping_unique_company_default',
            ),
        ),
        migrations.AddConstraint(
            model_name='qboaccountmapping',
            constraint=models.UniqueConstraint(
                condition=models.Q(('branch__isnull', False)),
                fields=('mapping_kind', 'mapping_key', 'branch'),
                name='qbo_mapping_unique_per_branch',
            ),
        ),
    ]
