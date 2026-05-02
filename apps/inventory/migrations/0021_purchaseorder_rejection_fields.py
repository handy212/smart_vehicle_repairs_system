from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0020_purchaseorder_due_date'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='purchaseorder',
            name='rejected_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='purchaseorder',
            name='rejected_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='purchase_orders_rejected',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='purchaseorder',
            name='rejection_reason',
            field=models.TextField(blank=True),
        ),
        migrations.AlterField(
            model_name='purchaseorder',
            name='status',
            field=models.CharField(
                choices=[
                    ('draft', 'Draft'),
                    ('pending_approval', 'Pending Approval'),
                    ('approved', 'Approved'),
                    ('confirmed', 'Confirmed'),
                    ('partially_received', 'Partially Received'),
                    ('received', 'Received'),
                    ('rejected', 'Rejected'),
                    ('cancelled', 'Cancelled'),
                ],
                db_index=True,
                default='draft',
                max_length=20,
            ),
        ),
    ]
