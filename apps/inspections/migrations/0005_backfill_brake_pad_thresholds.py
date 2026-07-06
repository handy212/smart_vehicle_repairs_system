from decimal import Decimal

from django.db import migrations


BRAKE_PAD_ITEM_NAMES = [
    "Front Brake Pads",
    "Rear Brake Pads/Shoes",
    "Left Front Brake Pad Thickness",
    "Right Front Brake Pad Thickness",
    "Left Rear Brake Pad/Shoe Thickness",
    "Right Rear Brake Pad/Shoe Thickness",
]

BRAKE_PAD_MIN_THRESHOLD = Decimal("3.00")


def add_brake_pad_thresholds(apps, schema_editor):
    InspectionItem = apps.get_model("inspections", "InspectionItem")
    InspectionResult = apps.get_model("inspections", "InspectionResult")
    VehicleInspection = apps.get_model("inspections", "VehicleInspection")

    items = list(
        InspectionItem.objects.filter(
            name__in=BRAKE_PAD_ITEM_NAMES,
            item_type="measurement",
            measurement_unit="mm",
        )
    )

    if not items:
        return

    item_ids = [item.id for item in items]
    InspectionItem.objects.filter(id__in=item_ids).update(min_acceptable=BRAKE_PAD_MIN_THRESHOLD)

    affected_inspection_ids = set()
    for result in InspectionResult.objects.select_related("inspection_item").filter(inspection_item_id__in=item_ids):
        affected_inspection_ids.add(result.inspection_id)
        if result.measurement_value is None:
            continue
        if result.measurement_value < BRAKE_PAD_MIN_THRESHOLD:
            result.result = "fail"
        else:
            result.result = "pass"
        result.save(update_fields=["result", "updated_at"])

    for inspection in VehicleInspection.objects.filter(id__in=affected_inspection_ids):
        checked_results = InspectionResult.objects.filter(inspection_id=inspection.id).exclude(
            result__in=["not_checked", "not_applicable"]
        )
        if checked_results.filter(result="fail").exists():
            inspection.overall_result = "fail"
        elif checked_results.filter(result="advisory").exists():
            inspection.overall_result = "pass_with_advisory"
        elif checked_results.filter(result="pass").exists():
            inspection.overall_result = "pass"
        else:
            inspection.overall_result = None
        inspection.save(update_fields=["overall_result", "updated_at"])


def remove_brake_pad_thresholds(apps, schema_editor):
    InspectionItem = apps.get_model("inspections", "InspectionItem")

    InspectionItem.objects.filter(
        name__in=BRAKE_PAD_ITEM_NAMES,
        item_type="measurement",
        measurement_unit="mm",
        min_acceptable=BRAKE_PAD_MIN_THRESHOLD,
    ).update(min_acceptable=None)


class Migration(migrations.Migration):

    dependencies = [
        ("inspections", "0004_vehicleinspection_branch"),
    ]

    operations = [
        migrations.RunPython(add_brake_pad_thresholds, remove_brake_pad_thresholds),
    ]
