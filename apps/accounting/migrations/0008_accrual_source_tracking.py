from django.db import migrations, models
import django.db.models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0007_alter_accrual_reversal_date'),
    ]

    operations = [
        migrations.AddField(
            model_name='accrual',
            name='source_id',
            field=models.PositiveIntegerField(blank=True, help_text='Source document primary key', null=True),
        ),
        migrations.AddField(
            model_name='accrual',
            name='source_model',
            field=models.CharField(blank=True, help_text='Source document model, e.g. WorkOrder or PurchaseOrder', max_length=100),
        ),
        migrations.AddField(
            model_name='accrual',
            name='source_reference',
            field=models.CharField(blank=True, help_text='Human-readable source document number', max_length=100),
        ),
        migrations.AddIndex(
            model_name='accrual',
            index=models.Index(fields=['source_model', 'source_id'], name='accounting__source__a9b975_idx'),
        ),
        migrations.AddIndex(
            model_name='accrual',
            index=models.Index(fields=['status', 'accrual_type'], name='accounting__status_e413a1_idx'),
        ),
        migrations.AddConstraint(
            model_name='accrual',
            constraint=models.UniqueConstraint(
                condition=django.db.models.Q(('source_id__isnull', False)),
                fields=('accrual_type', 'source_model', 'source_id'),
                name='unique_active_accrual_source',
            ),
        ),
    ]
