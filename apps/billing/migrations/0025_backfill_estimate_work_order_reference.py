from django.db import migrations


def backfill_estimate_work_order(apps, schema_editor):
    Estimate = apps.get_model("billing", "Estimate")
    WorkOrder = apps.get_model("workorders", "WorkOrder")

    for estimate in Estimate.objects.filter(work_order__isnull=True).exclude(reference_number=""):
        reference = (estimate.reference_number or "").strip()
        if not reference.startswith("WO:"):
            continue

        try:
            work_order_id = int(reference.split("WO:", 1)[1])
        except (TypeError, ValueError):
            continue

        work_order = WorkOrder.objects.filter(pk=work_order_id).first()
        if work_order is None:
            continue

        existing = Estimate.objects.filter(work_order=work_order).exclude(pk=estimate.pk).first()
        if existing is not None:
            continue

        estimate.work_order = work_order
        estimate.save(update_fields=["work_order", "updated_at"])


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0024_bill_purchase_order"),
    ]

    operations = [
        migrations.RunPython(backfill_estimate_work_order, migrations.RunPython.noop),
    ]
