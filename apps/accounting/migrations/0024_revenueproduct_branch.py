# Branch-scoped revenue products (branch_id may already exist on some deployments)

from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0001_initial'),
        ('accounting', '0023_revenueproduct_default_unit_price'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='revenueproduct',
                    name='branch',
                    field=models.ForeignKey(
                        blank=True,
                        help_text='Branch-specific income category; null = company-wide default.',
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='revenue_products',
                        to='branches.branch',
                    ),
                ),
            ],
            database_operations=[],
        ),
        migrations.AlterField(
            model_name='revenueproduct',
            name='code',
            field=models.SlugField(max_length=64),
        ),
        migrations.AlterField(
            model_name='revenueproduct',
            name='roadside_service_type',
            field=models.CharField(
                blank=True,
                help_text='Matches roadside.RoadsideRequest.service_type when set.',
                max_length=50,
                null=True,
            ),
        ),
        migrations.AddIndex(
            model_name='revenueproduct',
            index=models.Index(fields=['branch', 'code'], name='accounting__branch__rp_code_idx'),
        ),
        migrations.AddIndex(
            model_name='revenueproduct',
            index=models.Index(fields=['branch', 'is_active'], name='accounting__branch__rp_act_idx'),
        ),
        migrations.AddConstraint(
            model_name='revenueproduct',
            constraint=models.UniqueConstraint(
                condition=Q(branch__isnull=True),
                fields=('code',),
                name='accounting_revenueproduct_code_company_unique',
            ),
        ),
        migrations.AddConstraint(
            model_name='revenueproduct',
            constraint=models.UniqueConstraint(
                condition=Q(branch__isnull=False),
                fields=('code', 'branch'),
                name='accounting_revenueproduct_code_branch_unique',
            ),
        ),
        migrations.AddConstraint(
            model_name='revenueproduct',
            constraint=models.UniqueConstraint(
                condition=Q(branch__isnull=True, roadside_service_type__isnull=False),
                fields=('roadside_service_type',),
                name='accounting_revenueproduct_roadside_company_unique',
            ),
        ),
        migrations.AddConstraint(
            model_name='revenueproduct',
            constraint=models.UniqueConstraint(
                condition=Q(branch__isnull=False, roadside_service_type__isnull=False),
                fields=('roadside_service_type', 'branch'),
                name='accounting_revenueproduct_roadside_branch_unique',
            ),
        ),
    ]
