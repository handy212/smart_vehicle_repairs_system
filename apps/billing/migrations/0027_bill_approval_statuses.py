from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0026_sync_work_order_estimates_from_linked_estimates"),
    ]

    operations = [
        migrations.AlterField(
            model_name="bill",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("pending_approval", "Pending Approval"),
                    ("rejected", "Rejected"),
                    ("open", "Open"),
                    ("partially_paid", "Partially Paid"),
                    ("paid", "Paid"),
                    ("overdue", "Overdue"),
                    ("void", "Void"),
                ],
                default="draft",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="bill",
            name="submitted_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="bills_submitted", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="bill",
            name="submitted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="bill",
            name="assigned_approver",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="bills_assigned_for_approval", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="bill",
            name="approved_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="bills_approved", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="bill",
            name="approved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="bill",
            name="rejected_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="bills_rejected", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="bill",
            name="rejected_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="bill",
            name="rejection_reason",
            field=models.TextField(blank=True),
        ),
    ]
