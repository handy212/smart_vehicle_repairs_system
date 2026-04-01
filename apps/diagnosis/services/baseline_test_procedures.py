from apps.diagnosis.models import TestProcedureLibrary


BASELINE_TEST_PROCEDURES = [
    {
        'name': 'Compression Test',
        'category': 'mechanical',
        'description': 'Measure engine cylinder compression to check for internal engine problems',
        'test_procedure': '1. Remove spark plugs\n2. Install compression gauge\n3. Crank engine 4-5 times\n4. Record pressure for each cylinder\n5. Compare readings',
        'expected_result': 'All cylinders should read within 10% of each other and within manufacturer specs (typically 125-175 PSI)',
        'tools_needed': 'Compression gauge, socket set, spark plug socket',
        'measurement_fields': [
            {'name': 'Cylinder 1 Pressure', 'unit': 'PSI', 'min': 125, 'max': 175},
            {'name': 'Cylinder 2 Pressure', 'unit': 'PSI', 'min': 125, 'max': 175},
            {'name': 'Cylinder 3 Pressure', 'unit': 'PSI', 'min': 125, 'max': 175},
            {'name': 'Cylinder 4 Pressure', 'unit': 'PSI', 'min': 125, 'max': 175},
        ],
    },
    {
        'name': 'Battery Voltage Test',
        'category': 'electrical',
        'description': 'Check battery voltage and charging system',
        'test_procedure': '1. Turn off engine\n2. Measure battery voltage with multimeter\n3. Start engine\n4. Measure voltage with engine running\n5. Check alternator output',
        'expected_result': 'Battery should read 12.6V (off), 13.5-14.5V (running). Alternator output should be 13.5-14.5V',
        'tools_needed': 'Digital multimeter',
        'measurement_fields': [
            {'name': 'Battery Voltage (Off)', 'unit': 'V', 'min': 12.0, 'max': 12.8},
            {'name': 'Battery Voltage (Running)', 'unit': 'V', 'min': 13.5, 'max': 14.5},
            {'name': 'Alternator Output', 'unit': 'V', 'min': 13.5, 'max': 14.5},
        ],
    },
    {
        'name': 'Fuel Pressure Test',
        'category': 'pressure',
        'description': 'Check fuel system pressure to diagnose fuel delivery issues',
        'test_procedure': '1. Locate fuel pressure test port\n2. Connect fuel pressure gauge\n3. Turn key to ON (engine off)\n4. Check pressure reading\n5. Start engine and check running pressure',
        'expected_result': 'Pressure should match manufacturer specifications (typically 35-65 PSI for fuel injection)',
        'tools_needed': 'Fuel pressure gauge, safety equipment',
        'measurement_fields': [
            {'name': 'Fuel Pressure (Key On)', 'unit': 'PSI', 'min': 35, 'max': 65},
            {'name': 'Fuel Pressure (Running)', 'unit': 'PSI', 'min': 35, 'max': 65},
        ],
    },
    {
        'name': 'Ignition Coil Test',
        'category': 'electrical',
        'description': 'Test ignition coil primary and secondary resistance',
        'test_procedure': '1. Disconnect ignition coil\n2. Measure primary resistance with multimeter\n3. Measure secondary resistance\n4. Compare to specifications',
        'expected_result': 'Resistance should be within manufacturer specifications (typically 0.5-2.0 ohms primary, 5000-15000 ohms secondary)',
        'tools_needed': 'Digital multimeter, service manual',
        'measurement_fields': [
            {'name': 'Primary Resistance', 'unit': 'Ohms', 'min': 0.5, 'max': 2.0},
            {'name': 'Secondary Resistance', 'unit': 'Ohms', 'min': 5000, 'max': 15000},
        ],
    },
]


def seed_baseline_test_procedures(created_by=None):
    """Seed a minimal baseline test procedure library in an idempotent way."""
    created_count = 0
    existing_count = 0

    for procedure_data in BASELINE_TEST_PROCEDURES:
        defaults = {
            **procedure_data,
            'created_by': created_by,
        }
        _, created = TestProcedureLibrary.objects.get_or_create(
            name=procedure_data['name'],
            defaults=defaults,
        )
        if created:
            created_count += 1
        else:
            existing_count += 1

    return {
        'created': created_count,
        'existing': existing_count,
        'total': len(BASELINE_TEST_PROCEDURES),
    }
