from django.db import migrations


def sync_work_order_estimate_totals(apps, schema_editor):
    Estimate = apps.get_model("billing", "Estimate")

    for estimate in Estimate.objects.filter(work_order__isnull=False):
        work_order = estimate.work_order
        if work_order is None:
            continue

        work_order.estimated_parts_cost = estimate.parts_subtotal
        work_order.estimated_labor_cost = estimate.labor_subtotal
        work_order.estimated_total = estimate.total
        work_order.save(update_fields=[
            "estimated_parts_cost",
            "estimated_labor_cost",
            "estimated_total",
            "updated_at",
        ])


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0025_backfill_estimate_work_order_reference"),
    ]

    operations = [
        migrations.RunPython(sync_work_order_estimate_totals, migrations.RunPython.noop),
    ]
