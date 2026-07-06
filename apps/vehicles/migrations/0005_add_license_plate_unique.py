# Generated manually to add unique constraint to license_plate

from django.db import migrations, models


def ensure_unique_license_plates(apps, schema_editor):
    """
    Data migration to ensure all license plates are unique before adding constraint.
    Handles duplicates and empty strings by generating unique values based on VIN.
    """
    Vehicle = apps.get_model('vehicles', 'Vehicle')
    
    # Find all vehicles with duplicate or empty license plates
    from collections import Counter
    all_vehicles = Vehicle.objects.all()
    license_plate_counts = Counter(v.license_plate for v in all_vehicles if v.license_plate)
    
    # Process vehicles with duplicate or empty license plates
    for vehicle in all_vehicles:
        license_plate = vehicle.license_plate or ''
        license_plate = license_plate.strip()
        
        # If empty or duplicate, generate a unique one from VIN
        if not license_plate or license_plate_counts.get(license_plate, 0) > 1:
            if vehicle.vin and len(vehicle.vin) >= 8:
                base_plate = f"VIN-{vehicle.vin[-8:]}"
                # Ensure it's unique
                counter = 1
                new_plate = base_plate
                while Vehicle.objects.filter(license_plate=new_plate).exclude(id=vehicle.id).exists():
                    new_plate = f"{base_plate}-{counter}"
                    counter += 1
                vehicle.license_plate = new_plate
                vehicle.save(update_fields=['license_plate'])
                # Update counter for the new plate
                license_plate_counts[new_plate] = 1
            else:
                # Fallback: use vehicle ID
                vehicle.license_plate = f"VEH-{vehicle.id}"
                vehicle.save(update_fields=['license_plate'])


class Migration(migrations.Migration):

    dependencies = [
        ('vehicles', '0004_add_vehicle_type'),
    ]

    operations = [
        # First, ensure all license plates are unique
        migrations.RunPython(ensure_unique_license_plates, migrations.RunPython.noop),
        # Then add the unique constraint
        migrations.AlterField(
            model_name='vehicle',
            name='license_plate',
            field=models.CharField(db_index=True, help_text='License plate number', max_length=20, unique=True),
        ),
    ]
