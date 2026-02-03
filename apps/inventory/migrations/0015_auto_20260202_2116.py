from decimal import Decimal
from django.db import migrations

def seed_inventory_library(apps, schema_editor):
    try:
        Part = apps.get_model('inventory', 'Part')
        PartCategory = apps.get_model('inventory', 'PartCategory')
        ServiceBundle = apps.get_model('inventory', 'ServiceBundle')
        ServiceBundleItem = apps.get_model('inventory', 'ServiceBundleItem')
        ServiceType = apps.get_model('vehicles', 'ServiceType')
    except LookupError:
        # If models aren't available for some reason during migration, skip 
        return

    # 1. Ensure Category exists
    category, _ = PartCategory.objects.get_or_create(
        name="General Maintenance",
        defaults={"description": "Parts for routine maintenance"}
    )

    # 2. Define Bundles and Parts
    BUNDLES_DATA = {
        "Minor Service": ["Engine Oil", "Oil Filter"],
        "Medium Service": ["Engine Oil", "Oil Filter", "Air Filter", "AC Filter", "Fuel Filter"],
        "Major Service": ["Engine Oil", "Oil Filter", "Air Filter", "AC Filter", "Fuel Filter", "Spark Plugs", "Front Brake Pads", "Rear Brake Pads"]
    }

    # 3. Process each bundle
    for bundle_name, items in BUNDLES_DATA.items():
        # Get ServiceType (created in vehicles migration 0011)
        st = ServiceType.objects.filter(name=bundle_name).first()
        
        # Check if this ServiceType is already linked to ANY bundle
        sb = ServiceBundle.objects.filter(service_type=st).first() if st else None
        
        if not sb:
            # If no bundle is linked to this type, get or create by name
            sb, _ = ServiceBundle.objects.get_or_create(
                name=bundle_name,
                defaults={
                    "service_type": st if st else None,
                    "description": f"Standard {bundle_name} maintenance bundle"
                }
            )
            # Ensure the link is set if we found it by name but it was missing the type
            if st and sb.service_type != st:
                sb.service_type = st
                sb.save()
        
        # Process Parts
        for item_name in items:
            # Get or Create Part
            part = Part.objects.filter(name__iexact=item_name).first()
            if not part:
                sku = f"GEN-{item_name.upper().replace(' ', '-').replace('/', '-')}"
                part = Part.objects.create(
                    name=item_name,
                    part_number=sku,
                    category=category,
                    cost_price=Decimal("15.00"),
                    selling_price=Decimal("25.00"),
                    description=f"Generic {item_name}",
                    is_active=True
                )

            # Link to Bundle
            ServiceBundleItem.objects.get_or_create(
                bundle=sb,
                part=part,
                defaults={"quantity": 1}
            )

def rollback_inventory_library(apps, schema_editor):
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0014_servicebundle_servicebundleitem'),
        ('vehicles', '0011_auto_20260202_2111'), # Depend on ServiceType migration
    ]

    operations = [
        migrations.RunPython(seed_inventory_library, rollback_inventory_library),
    ]
