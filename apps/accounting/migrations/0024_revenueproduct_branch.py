# Branch-scoped revenue products (branch_id may already exist on some deployments)

from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q


LEGACY_UNIQUE_NAMES = (
    'accounting_revenueproduct_code_key',
    'unique_shared_revenueproduct_code',
    'unique_revenueproduct_code_per_branch',
    'accounting_revenueproduct_roadside_service_type_key',
)

LEGACY_INDEX_NAMES = (
    'accounting__branch__be4014_idx',
)


def _drop_legacy_uniqueness(cursor):
    for name in LEGACY_UNIQUE_NAMES:
        cursor.execute(
            f'ALTER TABLE accounting_revenueproduct DROP CONSTRAINT IF EXISTS "{name}"'
        )
        cursor.execute(f'DROP INDEX IF EXISTS "{name}"')


def _ensure_branch_column(schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'accounting_revenueproduct'
              AND column_name = 'branch_id'
            """
        )
        if cursor.fetchone():
            return

    schema_editor.execute(
        """
        ALTER TABLE accounting_revenueproduct
        ADD COLUMN branch_id bigint NULL
        REFERENCES branches_branch(id)
        DEFERRABLE INITIALLY DEFERRED
        """
    )
    schema_editor.execute(
        """
        CREATE INDEX IF NOT EXISTS accounting_revenueproduct_branch_id
        ON accounting_revenueproduct (branch_id)
        """
    )


def _ensure_branch_indexes_and_constraints(cursor):
    for name in LEGACY_INDEX_NAMES:
        cursor.execute(f'DROP INDEX IF EXISTS "{name}"')

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS accounting__branch__rp_code_idx
        ON accounting_revenueproduct (branch_id, code)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS accounting__branch__rp_act_idx
        ON accounting_revenueproduct (branch_id, is_active)
        """
    )
    cursor.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS accounting_revenueproduct_code_company_unique
        ON accounting_revenueproduct (code)
        WHERE branch_id IS NULL
        """
    )
    cursor.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS accounting_revenueproduct_code_branch_unique
        ON accounting_revenueproduct (code, branch_id)
        WHERE branch_id IS NOT NULL
        """
    )
    cursor.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS accounting_revenueproduct_roadside_company_unique
        ON accounting_revenueproduct (roadside_service_type)
        WHERE branch_id IS NULL AND roadside_service_type IS NOT NULL
        """
    )
    cursor.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS accounting_revenueproduct_roadside_branch_unique
        ON accounting_revenueproduct (roadside_service_type, branch_id)
        WHERE branch_id IS NOT NULL AND roadside_service_type IS NOT NULL
        """
    )


def _cleanup_legacy_migration_record(cursor):
    cursor.execute(
        """
        DELETE FROM django_migrations
        WHERE app = 'accounting'
          AND name = '0024_revenueproduct_branch_scope'
        """
    )


def apply_revenueproduct_branch_schema(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        raise RuntimeError('0024_revenueproduct_branch requires PostgreSQL')

    _ensure_branch_column(schema_editor)
    with schema_editor.connection.cursor() as cursor:
        _drop_legacy_uniqueness(cursor)
        _ensure_branch_indexes_and_constraints(cursor)
        _cleanup_legacy_migration_record(cursor)


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0001_initial'),
        ('accounting', '0023_revenueproduct_default_unit_price'),
    ]

    operations = [
        migrations.RunPython(
            apply_revenueproduct_branch_schema,
            migrations.RunPython.noop,
        ),
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
            ],
            database_operations=[],
        ),
    ]
