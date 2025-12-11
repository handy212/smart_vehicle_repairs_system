"""
Management command to populate dummy data for testing the diagnosis flow.
This creates work orders, diagnosis records, code libraries, test procedures,
and sample diagnostic data.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from decimal import Decimal
from datetime import timedelta
import random

from apps.accounts.models import User
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder
from apps.branches.models import Branch
from apps.diagnosis.models import (
    Diagnosis, DiagnosticCode, DiagnosticTest, DiagnosisFinding,
    DiagnosisPhoto, DiagnosticCodeLibrary, TestProcedureLibrary
)


class Command(BaseCommand):
    help = 'Populate dummy data for testing the diagnosis flow'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing test data before creating new data',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting to populate diagnosis test data...'))
        
        if options['clear']:
            self.stdout.write(self.style.WARNING('Clearing existing test data...'))
            self.clear_test_data()

        with transaction.atomic():
            # Get or create users first (for branch creation if needed)
            technician = self.get_or_create_technician()
            
            # Get or create branch (try existing first)
            branch = self.get_or_create_branch()
            
            # Create customers and vehicles
            customers_vehicles = self.create_customers_and_vehicles()
            
            # Populate code library
            self.populate_code_library()
            
            # Populate test procedure library
            self.populate_test_procedure_library()
            
            # Create work orders in diagnosis status
            work_orders = self.create_work_orders(customers_vehicles, technician, branch)
            
            # Create diagnosis records with sample data
            self.create_diagnosis_with_data(work_orders, technician)
            
        self.stdout.write(self.style.SUCCESS('\n✓ Successfully populated diagnosis test data!'))
        self.stdout.write(self.style.SUCCESS(f'Created {len(work_orders)} work orders with diagnosis records'))

    def clear_test_data(self):
        """Clear existing test data"""
        # Find test work orders (those with "TEST" in concerns)
        test_work_orders = WorkOrder.objects.filter(
            customer_concerns__icontains='TEST'
        )
        count = test_work_orders.count()
        test_work_orders.delete()
        self.stdout.write(self.style.WARNING(f'Deleted {count} test work orders'))

    def get_or_create_branch(self):
        """Get or create a test branch"""
        # Try to get an existing branch first
        branch = Branch.objects.first()
        if branch:
            self.stdout.write(self.style.SUCCESS(f'Using existing branch: {branch.name}'))
            return branch
        
        # Get or create an admin user for created_by
        admin_user, _ = User.objects.get_or_create(
            email='admin@test.com',
            defaults={
                'username': 'admin',
                'first_name': 'Admin',
                'last_name': 'User',
                'phone': '555-0000',
                'role': 'admin',
                'is_superuser': True,
                'is_staff': True,
            }
        )
        if not admin_user.check_password('test123'):
            admin_user.set_password('test123')
            admin_user.save()
        
        # Create a new branch with all required fields
        branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            address='123 Test St',
            city='Test City',
            state='TS',
            zip_code='12345',
            phone='555-0100',
            is_active=True,
            created_by=admin_user,
        )
        self.stdout.write(self.style.SUCCESS(f'Created branch: {branch.name}'))
        return branch

    def get_or_create_technician(self):
        """Get or create a test technician"""
        user, created = User.objects.get_or_create(
            email='tech@test.com',
            defaults={
                'username': 'test_technician',
                'first_name': 'Test',
                'last_name': 'Technician',
                'phone': '555-0101',
                'role': 'technician',
            }
        )
        if created:
            user.set_password('test123')
            user.save()
            self.stdout.write(self.style.SUCCESS(f'Created technician: {user.get_full_name()}'))
        return user

    def create_customers_and_vehicles(self):
        """Create test customers and vehicles"""
        customers_data = [
            {
                'customer': {
                    'first_name': 'John',
                    'last_name': 'Doe',
                    'email': 'john.doe@test.com',
                    'phone': '555-1001',
                },
                'vehicle': {
                    'make': 'Toyota',
                    'model': 'Camry',
                    'year': 2020,
                    'vin': '1HGBH41JXMN109186',
                    'license_plate': 'TEST001',
                    'current_mileage': 45000,
                }
            },
            {
                'customer': {
                    'first_name': 'Jane',
                    'last_name': 'Smith',
                    'email': 'jane.smith@test.com',
                    'phone': '555-1002',
                },
                'vehicle': {
                    'make': 'Honda',
                    'model': 'Civic',
                    'year': 2019,
                    'vin': '19XFC2F59KE123456',
                    'license_plate': 'TEST002',
                    'current_mileage': 62000,
                }
            },
            {
                'customer': {
                    'first_name': 'Bob',
                    'last_name': 'Johnson',
                    'email': 'bob.johnson@test.com',
                    'phone': '555-1003',
                },
                'vehicle': {
                    'make': 'Ford',
                    'model': 'F-150',
                    'year': 2021,
                    'vin': '1FTFW1E58MFA12345',
                    'license_plate': 'TEST003',
                    'current_mileage': 28000,
                }
            },
        ]
        
        customers_vehicles = []
        for data in customers_data:
            # Create customer user
            user, _ = User.objects.get_or_create(
                email=data['customer']['email'],
                defaults={
                    'username': data['customer']['email'].split('@')[0],
                    'first_name': data['customer']['first_name'],
                    'last_name': data['customer']['last_name'],
                    'phone': data['customer']['phone'],
                    'role': 'customer',
                }
            )
            if not hasattr(user, 'customer'):
                user.set_password('test123')
                user.save()
            
            # Create customer
            customer, _ = Customer.objects.get_or_create(
                user=user,
                defaults={}
            )
            
            # Create vehicle
            vehicle, _ = Vehicle.objects.get_or_create(
                vin=data['vehicle']['vin'],
                defaults={
                    'owner': customer,
                    'make': data['vehicle']['make'],
                    'model': data['vehicle']['model'],
                    'year': data['vehicle']['year'],
                    'license_plate': data['vehicle']['license_plate'],
                    'current_mileage': data['vehicle']['current_mileage'],
                }
            )
            
            customers_vehicles.append({
                'customer': customer,
                'vehicle': vehicle,
            })
        
        self.stdout.write(self.style.SUCCESS(f'Created {len(customers_vehicles)} customers and vehicles'))
        return customers_vehicles

    def populate_code_library(self):
        """Populate diagnostic code library with common OBD-II codes"""
        codes = [
            {
                'code_number': 'P0301',
                'code_type': 'obd_ii',
                'title': 'Cylinder 1 Misfire Detected',
                'description': 'The powertrain control module (PCM) has detected that cylinder 1 is misfiring. This can cause rough idle, loss of power, and increased emissions.',
                'severity': 'warning',
                'common_causes': ['Faulty spark plug', 'Bad ignition coil', 'Fuel injector issue', 'Compression problem'],
                'common_fixes': ['Replace spark plug', 'Test ignition coil', 'Check fuel injector', 'Perform compression test'],
            },
            {
                'code_number': 'P0420',
                'code_type': 'obd_ii',
                'title': 'Catalyst System Efficiency Below Threshold (Bank 1)',
                'description': 'The oxygen sensor downstream of the catalytic converter is detecting that the converter is not working efficiently enough.',
                'severity': 'warning',
                'common_causes': ['Failed catalytic converter', 'Oxygen sensor malfunction', 'Exhaust leak'],
                'common_fixes': ['Replace catalytic converter', 'Check oxygen sensors', 'Inspect exhaust system'],
            },
            {
                'code_number': 'P0171',
                'code_type': 'obd_ii',
                'title': 'System Too Lean (Bank 1)',
                'description': 'The engine control module (ECM) has detected that the air/fuel mixture is too lean (too much air, not enough fuel).',
                'severity': 'warning',
                'common_causes': ['Vacuum leak', 'Faulty MAF sensor', 'Fuel pressure low', 'Clogged fuel injector'],
                'common_fixes': ['Check for vacuum leaks', 'Clean/replace MAF sensor', 'Test fuel pressure', 'Clean fuel injectors'],
            },
            {
                'code_number': 'P0442',
                'code_type': 'obd_ii',
                'title': 'Evaporative Emission Control System Leak Detected (Small Leak)',
                'description': 'A small leak has been detected in the evaporative emission control system (EVAP).',
                'severity': 'info',
                'common_causes': ['Loose gas cap', 'Leaking EVAP hose', 'Faulty purge valve', 'Leaking fuel tank'],
                'common_fixes': ['Tighten/replace gas cap', 'Inspect EVAP hoses', 'Test purge valve', 'Check fuel tank'],
            },
            {
                'code_number': 'P0128',
                'code_type': 'obd_ii',
                'title': 'Coolant Thermostat (Coolant Temperature Below Thermostat Regulating Temperature)',
                'description': 'The engine is not reaching the proper operating temperature, indicating a stuck-open thermostat or cooling system issue.',
                'severity': 'warning',
                'common_causes': ['Stuck-open thermostat', 'Low coolant level', 'Faulty temperature sensor'],
                'common_fixes': ['Replace thermostat', 'Check coolant level', 'Test temperature sensor'],
            },
            {
                'code_number': 'P3005',
                'code_type': 'obd_ii',
                'title': 'Random/Multiple Cylinder Misfire Detected',
                'description': 'The powertrain control module (PCM) has detected random or multiple cylinder misfires. This can cause rough idle, loss of power, hesitation, and increased emissions.',
                'severity': 'warning',
                'common_causes': ['Faulty spark plugs', 'Bad ignition coils', 'Fuel system issues', 'Vacuum leaks', 'Low compression'],
                'common_fixes': ['Inspect/replace spark plugs', 'Test ignition coils', 'Check fuel pressure', 'Perform compression test', 'Inspect for vacuum leaks'],
            },
            {
                'code_number': 'P0300',
                'code_type': 'obd_ii',
                'title': 'Random/Multiple Cylinder Misfire Detected',
                'description': 'The PCM has detected random or multiple cylinder misfires occurring.',
                'severity': 'warning',
                'common_causes': ['Faulty spark plugs', 'Bad ignition coils', 'Fuel delivery issues', 'Vacuum leaks'],
                'common_fixes': ['Replace spark plugs', 'Test ignition system', 'Check fuel pressure', 'Inspect for vacuum leaks'],
            },
            {
                'code_number': 'P0445',
                'code_type': 'obd_ii',
                'title': 'Evaporative Emission Control System Purge Control Valve Circuit Shorted',
                'description': 'The PCM has detected an electrical problem with the EVAP purge control valve circuit.',
                'severity': 'warning',
                'common_causes': ['Faulty purge valve', 'Wiring issue', 'PCM problem'],
                'common_fixes': ['Test purge valve', 'Inspect wiring', 'Check PCM'],
            },
            {
                'code_number': 'B1234',
                'code_type': 'body',
                'title': 'Body Control Module Communication Error',
                'description': 'A communication error has been detected with the Body Control Module.',
                'severity': 'info',
                'common_causes': ['Wiring issue', 'Faulty BCM', 'Communication bus problem'],
                'common_fixes': ['Check wiring harness', 'Test BCM', 'Inspect communication bus'],
            },
            {
                'code_number': 'U0100',
                'code_type': 'manufacturer',
                'title': 'Lost Communication with ECM/PCM',
                'description': 'The body control module has lost communication with the engine control module.',
                'severity': 'critical',
                'common_causes': ['Wiring problem', 'Faulty ECM/PCM', 'Communication bus failure'],
                'common_fixes': ['Check CAN bus wiring', 'Test ECM/PCM', 'Inspect communication network'],
            },
        ]
        
        created_count = 0
        for code_data in codes:
            code, created = DiagnosticCodeLibrary.objects.get_or_create(
                code_number=code_data['code_number'],
                defaults=code_data
            )
            if created:
                created_count += 1
        
        self.stdout.write(self.style.SUCCESS(f'Populated {created_count} new diagnostic codes in library'))

    def populate_test_procedure_library(self):
        """Populate test procedure library with common diagnostic tests"""
        procedures = [
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
                ]
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
                ]
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
                ]
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
                ]
            },
        ]
        
        technician = User.objects.filter(role__in=['technician', 'manager']).first()
        
        created_count = 0
        for proc_data in procedures:
            procedure, created = TestProcedureLibrary.objects.get_or_create(
                name=proc_data['name'],
                defaults={
                    **proc_data,
                    'created_by': technician,
                }
            )
            if created:
                created_count += 1
        
        self.stdout.write(self.style.SUCCESS(f'Populated {created_count} new test procedures in library'))

    def create_work_orders(self, customers_vehicles, technician, branch):
        """Create work orders in diagnosis status"""
        concerns = [
            'TEST: Car is making a knocking sound and check engine light is on. Vehicle seems to lose power when accelerating.',
            'TEST: Engine is running rough and idling poorly. Customer reports the vehicle shakes at stop lights.',
            'TEST: Check engine light came on yesterday. Vehicle is having trouble starting, especially in the morning.',
        ]
        
        work_orders = []
        for i, cv in enumerate(customers_vehicles):
            concern = concerns[i % len(concerns)]
            
            work_order = WorkOrder.objects.create(
                branch=branch,
                customer=cv['customer'],
                vehicle=cv['vehicle'],
                status='diagnosis',
                priority=random.choice(['normal', 'high']),
                primary_technician=technician,
                customer_concerns=concern,
                odometer_in=cv['vehicle'].current_mileage,
                started_at=timezone.now() - timedelta(hours=random.randint(1, 6)),
            )
            work_order.assigned_technicians.add(technician)
            work_orders.append(work_order)
        
        self.stdout.write(self.style.SUCCESS(f'Created {len(work_orders)} work orders in diagnosis status'))
        return work_orders

    def create_diagnosis_with_data(self, work_orders, technician):
        """Create diagnosis records with sample codes, tests, and findings"""
        code_library = list(DiagnosticCodeLibrary.objects.all()[:5])
        procedure_library = list(TestProcedureLibrary.objects.all()[:4])
        
        if not code_library:
            self.stdout.write(self.style.WARNING('No codes in library, skipping diagnosis data'))
            return
        
        if not procedure_library:
            self.stdout.write(self.style.WARNING('No procedures in library, skipping test data'))
            return
        
        for i, work_order in enumerate(work_orders):
            # Create diagnosis
            diagnosis = Diagnosis.objects.create(
                work_order=work_order,
                technician=technician,
                customer_complaint=work_order.customer_concerns,
                initial_observations='Vehicle arrived as described. Visual inspection shows no obvious external damage.',
                diagnostic_notes=f'Initial diagnosis in progress. Connecting scan tool to read codes.',
                status='in_progress',
                started_at=work_order.started_at,
            )
            
            # Add 1-2 diagnostic codes
            num_codes = random.randint(1, 2)
            selected_codes = random.sample(code_library, min(num_codes, len(code_library)))
            
            for lib_code in selected_codes:
                DiagnosticCode.objects.create(
                    diagnosis=diagnosis,
                    code_number=lib_code.code_number,
                    code_type=lib_code.code_type,
                    description=lib_code.title,
                    severity=lib_code.severity,
                    status='active',
                    recorded_at=timezone.now() - timedelta(minutes=random.randint(10, 60)),
                )
            
            # Add 1-2 diagnostic tests
            num_tests = random.randint(1, 2)
            selected_procedures = random.sample(procedure_library, min(num_tests, len(procedure_library)))
            
            for lib_procedure in selected_procedures:
                test = DiagnosticTest.objects.create(
                    diagnosis=diagnosis,
                    test_name=lib_procedure.name,
                    category=lib_procedure.category,
                    test_procedure=lib_procedure.test_procedure,
                    expected_result=lib_procedure.expected_result,
                    tools_used=lib_procedure.tools_needed,
                    performed_by=technician,
                    status=random.choice(['pass', 'fail', 'inconclusive']),
                    performed_at=timezone.now() - timedelta(minutes=random.randint(10, 60)),
                )
                
                # Add sample measurements
                if lib_procedure.measurement_fields:
                    measurements = {}
                    for field in lib_procedure.measurement_fields[:2]:  # Use first 2 fields
                        if 'Pressure' in field['name'] or 'PSI' in field.get('unit', ''):
                            measurements[field['name']] = {
                                'value': random.randint(field['min'], field['max']),
                                'unit': field['unit']
                            }
                        elif 'Voltage' in field['name'] or 'V' in field.get('unit', ''):
                            measurements[field['name']] = {
                                'value': round(random.uniform(field['min'], field['max']), 2),
                                'unit': field['unit']
                            }
                    
                    if measurements:
                        test.measurements = measurements
                        test.save()
            
            # Add 1 finding
            codes_list = list(diagnosis.diagnostic_codes.all())
            tests_list = list(diagnosis.diagnostic_tests.all())
            
            if codes_list:
                finding = DiagnosisFinding.objects.create(
                    diagnosis=diagnosis,
                    finding_title=f"Diagnosed: {codes_list[0].description}",
                    category=random.choice(['engine', 'electrical', 'fuel', 'exhaust']),
                    description=f"Scan tool revealed {codes_list[0].code_number}. Additional testing confirmed the issue. Root cause appears to be related to {random.choice(['ignition system', 'fuel delivery', 'emissions system', 'engine mechanical'])}.",
                    severity=random.choice(['critical', 'major', 'minor']),
                    status='confirmed',
                )
                
                # Link codes and tests to finding
                if codes_list:
                    finding.diagnostic_codes.set(codes_list[:1])
                if tests_list:
                    finding.diagnostic_tests.set(tests_list[:1])
            
            self.stdout.write(self.style.SUCCESS(
                f'  Created diagnosis for WO {work_order.work_order_number} '
                f'({len(codes_list)} codes, {len(tests_list)} tests, {diagnosis.findings.count()} findings)'
            ))

