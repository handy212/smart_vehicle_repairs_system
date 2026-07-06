"""
Management command to create pre-defined inspection templates
"""
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.inspections.models import InspectionTemplate, InspectionCategory, InspectionItem
from apps.accounts.management.commands._auditlog_utils import disable_auditlog

User = get_user_model()


class Command(BaseCommand):
    help = 'Creates pre-defined inspection checklist templates'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Creating vehicle inspection templates...'))
        
        with disable_auditlog():
            self._do_create()

    def _do_create(self):
        # Get or create a system user for templates
        system_user, created = User.objects.get_or_create(
            username='system',
            defaults={
                'email': 'system@example.com',
                'first_name': 'System',
                'last_name': 'Admin',
                'is_active': False,  # System user should not be able to log in
            }
        )
        
        if created:
            self.stdout.write(self.style.SUCCESS('  Created system user for templates'))
        
        self.system_user = system_user
        templates_created = 0
        
        # 1. Basic Safety Inspection
        templates_created += self.create_basic_safety_inspection()
        
        # 2. Comprehensive Multi-Point Inspection
        templates_created += self.create_comprehensive_inspection()
        
        # 3. Pre-Purchase Inspection
        templates_created += self.create_pre_purchase_inspection()
        
        # 4. Oil Change Service Inspection
        templates_created += self.create_oil_change_inspection()
        
        # 5. Brake System Inspection
        templates_created += self.create_brake_inspection()
        
        # 6. Emission/Smog Test Inspection
        templates_created += self.create_emission_inspection()
        
        self.stdout.write(
            self.style.SUCCESS(f'Successfully created {templates_created} inspection templates!')
        )

    def create_basic_safety_inspection(self):
        """Basic Safety Inspection - Quick 15-point check"""
        template, created = InspectionTemplate.objects.get_or_create(
            name="Basic Safety Inspection",
            defaults={
                'description': 'Quick 15-point safety check covering essential vehicle safety systems. Ideal for routine checkups and safety verifications.',
                'is_active': True,
                'requires_technician_signature': True,
                'requires_customer_signature': False,
                'allows_photos': True,
                'allows_video': False,
                'created_by': self.system_user,
            }
        )
        
        if not created:
            self.stdout.write(self.style.WARNING('  - Basic Safety Inspection already exists, skipping...'))
            return 0
        
        # Lights & Signals
        cat1 = InspectionCategory.objects.create(
            template=template,
            name="Lights & Signals",
            description="All lighting and signaling systems",
            order=1
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat1, name="Headlights (High/Low Beam)", item_type='pass_fail', is_critical=True, order=1),
            InspectionItem(category=cat1, name="Tail Lights", item_type='pass_fail', is_critical=True, order=2),
            InspectionItem(category=cat1, name="Brake Lights", item_type='pass_fail', is_critical=True, order=3),
            InspectionItem(category=cat1, name="Turn Signals", item_type='pass_fail', is_critical=True, order=4),
        ])
        
        # Tires & Wheels
        cat2 = InspectionCategory.objects.create(
            template=template,
            name="Tires & Wheels",
            description="Tire condition and wheel integrity",
            order=2
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat2, name="Tire Tread Depth", item_type='measurement', measurement_unit='mm', is_critical=True, order=1),
            InspectionItem(category=cat2, name="Tire Pressure", item_type='measurement', measurement_unit='PSI', order=2),
            InspectionItem(category=cat2, name="Wheel Condition", item_type='rating', order=3),
        ])
        
        # Brakes
        cat3 = InspectionCategory.objects.create(
            template=template,
            name="Brakes",
            description="Brake system check",
            order=3
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat3, name="Brake Pedal Operation", item_type='pass_fail', is_critical=True, order=1),
            InspectionItem(category=cat3, name="Brake Fluid Level", item_type='pass_fail', is_critical=True, order=2),
            InspectionItem(category=cat3, name="Parking Brake", item_type='pass_fail', order=3),
        ])
        
        # Fluids
        cat4 = InspectionCategory.objects.create(
            template=template,
            name="Fluid Levels",
            description="Essential fluid checks",
            order=4
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat4, name="Engine Oil Level", item_type='pass_fail', order=1),
            InspectionItem(category=cat4, name="Coolant Level", item_type='pass_fail', order=2),
            InspectionItem(category=cat4, name="Windshield Washer Fluid", item_type='pass_fail', order=3),
        ])
        
        # Safety Equipment
        cat5 = InspectionCategory.objects.create(
            template=template,
            name="Safety Equipment",
            description="Required safety items",
            order=5
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat5, name="Windshield Wipers", item_type='pass_fail', order=1),
            InspectionItem(category=cat5, name="Horn", item_type='pass_fail', order=2),
        ])
        
        self.stdout.write(self.style.SUCCESS('  ✓ Created Basic Safety Inspection (15 items)'))
        return 1

    def create_comprehensive_inspection(self):
        """Comprehensive Multi-Point Inspection - Detailed 50+ point check"""
        template, created = InspectionTemplate.objects.get_or_create(
            name="Comprehensive Multi-Point Inspection",
            defaults={
                'description': 'Thorough 50+ point inspection covering all major vehicle systems. Recommended for annual service or vehicle health assessment.',
                'is_active': True,
                'requires_technician_signature': True,
                'requires_customer_signature': True,
                'allows_photos': True,
                'allows_video': True,
                'created_by': self.system_user,
            }
        )
        
        if not created:
            self.stdout.write(self.style.WARNING('  - Comprehensive Multi-Point Inspection already exists, skipping...'))
            return 0
        
        # Engine
        cat1 = InspectionCategory.objects.create(
            template=template,
            name="Engine System",
            description="Engine performance and components",
            order=1
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat1, name="Engine Oil Condition", item_type='rating', order=1),
            InspectionItem(category=cat1, name="Oil Filter", item_type='rating', order=2),
            InspectionItem(category=cat1, name="Air Filter", item_type='rating', order=3),
            InspectionItem(category=cat1, name="Belts Condition", item_type='rating', order=4),
            InspectionItem(category=cat1, name="Hoses Condition", item_type='rating', order=5),
            InspectionItem(category=cat1, name="Engine Mounts", item_type='pass_fail', order=6),
            InspectionItem(category=cat1, name="Engine Noise/Vibration", item_type='text', order=7),
        ])
        
        # Cooling System
        cat2 = InspectionCategory.objects.create(
            template=template,
            name="Cooling System",
            description="Cooling system integrity",
            order=2
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat2, name="Coolant Level", item_type='pass_fail', is_critical=True, order=1),
            InspectionItem(category=cat2, name="Coolant Condition", item_type='rating', order=2),
            InspectionItem(category=cat2, name="Radiator Condition", item_type='rating', order=3),
            InspectionItem(category=cat2, name="Radiator Cap", item_type='pass_fail', order=4),
            InspectionItem(category=cat2, name="Cooling Fan Operation", item_type='pass_fail', order=5),
        ])
        
        # Brake System
        cat3 = InspectionCategory.objects.create(
            template=template,
            name="Brake System",
            description="Complete brake system inspection",
            order=3
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat3, name="Front Brake Pads", item_type='measurement', measurement_unit='mm', min_acceptable=Decimal('3.00'), is_critical=True, order=1),
            InspectionItem(category=cat3, name="Rear Brake Pads/Shoes", item_type='measurement', measurement_unit='mm', min_acceptable=Decimal('3.00'), is_critical=True, order=2),
            InspectionItem(category=cat3, name="Brake Rotors/Drums", item_type='rating', is_critical=True, order=3),
            InspectionItem(category=cat3, name="Brake Fluid Level", item_type='pass_fail', is_critical=True, order=4),
            InspectionItem(category=cat3, name="Brake Fluid Condition", item_type='rating', order=5),
            InspectionItem(category=cat3, name="Brake Lines/Hoses", item_type='rating', is_critical=True, order=6),
            InspectionItem(category=cat3, name="Parking Brake", item_type='pass_fail', order=7),
        ])
        
        # Suspension & Steering
        cat4 = InspectionCategory.objects.create(
            template=template,
            name="Suspension & Steering",
            description="Suspension and steering components",
            order=4
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat4, name="Shock Absorbers", item_type='rating', order=1),
            InspectionItem(category=cat4, name="Struts", item_type='rating', order=2),
            InspectionItem(category=cat4, name="Ball Joints", item_type='pass_fail', is_critical=True, order=3),
            InspectionItem(category=cat4, name="Tie Rod Ends", item_type='pass_fail', is_critical=True, order=4),
            InspectionItem(category=cat4, name="Steering Linkage", item_type='pass_fail', order=5),
            InspectionItem(category=cat4, name="Power Steering Fluid", item_type='pass_fail', order=6),
            InspectionItem(category=cat4, name="Wheel Alignment", item_type='text', order=7),
        ])
        
        # Tires & Wheels
        cat5 = InspectionCategory.objects.create(
            template=template,
            name="Tires & Wheels",
            description="Complete tire and wheel inspection",
            order=5
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat5, name="Front Left Tire Tread", item_type='measurement', measurement_unit='mm', is_critical=True, order=1),
            InspectionItem(category=cat5, name="Front Right Tire Tread", item_type='measurement', measurement_unit='mm', is_critical=True, order=2),
            InspectionItem(category=cat5, name="Rear Left Tire Tread", item_type='measurement', measurement_unit='mm', is_critical=True, order=3),
            InspectionItem(category=cat5, name="Rear Right Tire Tread", item_type='measurement', measurement_unit='mm', is_critical=True, order=4),
            InspectionItem(category=cat5, name="Tire Pressure (All)", item_type='pass_fail', order=5),
            InspectionItem(category=cat5, name="Wheel Balance", item_type='text', order=6),
            InspectionItem(category=cat5, name="Spare Tire Condition", item_type='rating', order=7),
        ])
        
        # Exhaust System
        cat6 = InspectionCategory.objects.create(
            template=template,
            name="Exhaust System",
            description="Exhaust system components",
            order=6
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat6, name="Exhaust Manifold", item_type='pass_fail', order=1),
            InspectionItem(category=cat6, name="Catalytic Converter", item_type='pass_fail', is_critical=True, order=2),
            InspectionItem(category=cat6, name="Muffler", item_type='rating', order=3),
            InspectionItem(category=cat6, name="Exhaust Pipes", item_type='rating', order=4),
            InspectionItem(category=cat6, name="Exhaust Hangers", item_type='pass_fail', order=5),
        ])
        
        # Electrical System
        cat7 = InspectionCategory.objects.create(
            template=template,
            name="Electrical System",
            description="Electrical components and battery",
            order=7
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat7, name="Battery Condition", item_type='rating', order=1),
            InspectionItem(category=cat7, name="Battery Terminals", item_type='pass_fail', order=2),
            InspectionItem(category=cat7, name="Alternator Output", item_type='measurement', measurement_unit='V', order=3),
            InspectionItem(category=cat7, name="Starter Operation", item_type='pass_fail', order=4),
            InspectionItem(category=cat7, name="All Lights Functioning", item_type='pass_fail', is_critical=True, order=5),
        ])
        
        # Interior
        cat8 = InspectionCategory.objects.create(
            template=template,
            name="Interior Components",
            description="Interior safety and comfort items",
            order=8
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat8, name="Seat Belts", item_type='pass_fail', is_critical=True, order=1),
            InspectionItem(category=cat8, name="Airbag Warning Light", item_type='pass_fail', is_critical=True, order=2),
            InspectionItem(category=cat8, name="Dashboard Warning Lights", item_type='text', order=3),
            InspectionItem(category=cat8, name="Horn", item_type='pass_fail', order=4),
            InspectionItem(category=cat8, name="Windshield Wipers", item_type='rating', order=5),
            InspectionItem(category=cat8, name="HVAC System", item_type='pass_fail', order=6),
        ])
        
        # Underbody
        cat9 = InspectionCategory.objects.create(
            template=template,
            name="Underbody Inspection",
            description="Frame and underbody components",
            order=9
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat9, name="Frame/Subframe", item_type='pass_fail', is_critical=True, order=1),
            InspectionItem(category=cat9, name="Transmission/Transaxle", item_type='pass_fail', order=2),
            InspectionItem(category=cat9, name="Drive Shafts/CV Joints", item_type='rating', order=3),
            InspectionItem(category=cat9, name="Differential", item_type='pass_fail', order=4),
            InspectionItem(category=cat9, name="Visible Leaks", item_type='text', order=5),
        ])
        
        self.stdout.write(self.style.SUCCESS('  ✓ Created Comprehensive Multi-Point Inspection (50+ items)'))
        return 1

    def create_pre_purchase_inspection(self):
        """Pre-Purchase Inspection - For buying used vehicles"""
        template, created = InspectionTemplate.objects.get_or_create(
            name="Pre-Purchase Vehicle Inspection",
            defaults={
                'description': 'Comprehensive inspection for evaluating used vehicles before purchase. Includes detailed assessment of all systems and potential issues.',
                'is_active': True,
                'requires_technician_signature': True,
                'requires_customer_signature': True,
                'allows_photos': True,
                'allows_video': True,
                'created_by': self.system_user,
            }
        )
        
        if not created:
            self.stdout.write(self.style.WARNING('  - Pre-Purchase Vehicle Inspection already exists, skipping...'))
            return 0
        
        # Exterior Condition
        cat1 = InspectionCategory.objects.create(
            template=template,
            name="Exterior Condition",
            description="Body, paint, and exterior components",
            order=1
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat1, name="Body Condition", item_type='rating', order=1),
            InspectionItem(category=cat1, name="Paint Condition", item_type='rating', order=2),
            InspectionItem(category=cat1, name="Rust/Corrosion", item_type='text', order=3),
            InspectionItem(category=cat1, name="Accident Damage", item_type='text', is_critical=True, order=4),
            InspectionItem(category=cat1, name="Panel Alignment", item_type='rating', order=5),
            InspectionItem(category=cat1, name="Glass Condition", item_type='rating', order=6),
        ])
        
        # Mechanical Assessment
        cat2 = InspectionCategory.objects.create(
            template=template,
            name="Mechanical Assessment",
            description="Engine and drivetrain evaluation",
            order=2
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat2, name="Engine Starts Easily", item_type='pass_fail', is_critical=True, order=1),
            InspectionItem(category=cat2, name="Engine Idle Quality", item_type='rating', order=2),
            InspectionItem(category=cat2, name="Engine Noise", item_type='text', is_critical=True, order=3),
            InspectionItem(category=cat2, name="Smoke from Exhaust", item_type='text', is_critical=True, order=4),
            InspectionItem(category=cat2, name="Transmission Shifts Smoothly", item_type='pass_fail', is_critical=True, order=5),
            InspectionItem(category=cat2, name="Clutch Operation (Manual)", item_type='rating', order=6),
            InspectionItem(category=cat2, name="Oil Leaks", item_type='text', order=7),
            InspectionItem(category=cat2, name="Fluid Leaks", item_type='text', order=8),
        ])
        
        # Test Drive Evaluation
        cat3 = InspectionCategory.objects.create(
            template=template,
            name="Test Drive Evaluation",
            description="Performance during test drive",
            order=3
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat3, name="Acceleration", item_type='rating', order=1),
            InspectionItem(category=cat3, name="Braking Performance", item_type='rating', is_critical=True, order=2),
            InspectionItem(category=cat3, name="Steering Response", item_type='rating', order=3),
            InspectionItem(category=cat3, name="Suspension Comfort", item_type='rating', order=4),
            InspectionItem(category=cat3, name="Unusual Noises", item_type='text', order=5),
            InspectionItem(category=cat3, name="Vibrations", item_type='text', order=6),
        ])
        
        # Electronics & Features
        cat4 = InspectionCategory.objects.create(
            template=template,
            name="Electronics & Features",
            description="All electronic systems and features",
            order=4
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat4, name="All Lights Working", item_type='pass_fail', order=1),
            InspectionItem(category=cat4, name="Power Windows", item_type='pass_fail', order=2),
            InspectionItem(category=cat4, name="Power Locks", item_type='pass_fail', order=3),
            InspectionItem(category=cat4, name="Air Conditioning", item_type='rating', order=4),
            InspectionItem(category=cat4, name="Heating", item_type='rating', order=5),
            InspectionItem(category=cat4, name="Audio System", item_type='pass_fail', order=6),
            InspectionItem(category=cat4, name="Warning Lights", item_type='text', is_critical=True, order=7),
        ])
        
        # Maintenance History
        cat5 = InspectionCategory.objects.create(
            template=template,
            name="Maintenance & History",
            description="Service history and documentation",
            order=5
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat5, name="Service Records Available", item_type='pass_fail', order=1),
            InspectionItem(category=cat5, name="Recent Oil Change", item_type='text', order=2),
            InspectionItem(category=cat5, name="Title Status", item_type='text', is_critical=True, order=3),
            InspectionItem(category=cat5, name="Accident History", item_type='text', is_critical=True, order=4),
            InspectionItem(category=cat5, name="Odometer Reading Verified", item_type='pass_fail', order=5),
        ])
        
        # Overall Recommendation
        cat6 = InspectionCategory.objects.create(
            template=template,
            name="Overall Assessment",
            description="Final evaluation and recommendations",
            order=6
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat6, name="Overall Condition Rating", item_type='rating', order=1),
            InspectionItem(category=cat6, name="Immediate Repairs Needed", item_type='text', order=2),
            InspectionItem(category=cat6, name="Future Maintenance Items", item_type='text', order=3),
            InspectionItem(category=cat6, name="Purchase Recommendation", item_type='text', order=4),
            InspectionItem(category=cat6, name="Estimated Repair Costs", item_type='text', order=5),
        ])
        
        self.stdout.write(self.style.SUCCESS('  ✓ Created Pre-Purchase Vehicle Inspection (35+ items)'))
        return 1

    def create_oil_change_inspection(self):
        """Oil Change Service Inspection - Quick service check"""
        template, created = InspectionTemplate.objects.get_or_create(
            name="Oil Change Service Inspection",
            defaults={
                'description': 'Standard inspection performed during oil change service. Quick check of essential fluids, lights, and safety items.',
                'is_active': True,
                'requires_technician_signature': True,
                'requires_customer_signature': False,
                'allows_photos': False,
                'allows_video': False,
                'created_by': self.system_user,
            }
        )
        
        if not created:
            self.stdout.write(self.style.WARNING('  - Oil Change Service Inspection already exists, skipping...'))
            return 0
        
        # Oil Change Service
        cat1 = InspectionCategory.objects.create(
            template=template,
            name="Oil Change Service",
            description="Oil and filter replacement",
            order=1
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat1, name="Engine Oil Drained", item_type='pass_fail', order=1),
            InspectionItem(category=cat1, name="Oil Filter Replaced", item_type='pass_fail', order=2),
            InspectionItem(category=cat1, name="New Oil Added", item_type='measurement', measurement_unit='quarts', order=3),
            InspectionItem(category=cat1, name="Oil Type Used", item_type='text', order=4),
            InspectionItem(category=cat1, name="Drain Plug Torqued", item_type='pass_fail', order=5),
        ])
        
        # Fluid Level Check
        cat2 = InspectionCategory.objects.create(
            template=template,
            name="Fluid Levels",
            description="Check all fluid levels",
            order=2
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat2, name="Coolant Level", item_type='pass_fail', order=1),
            InspectionItem(category=cat2, name="Brake Fluid Level", item_type='pass_fail', order=2),
            InspectionItem(category=cat2, name="Power Steering Fluid", item_type='pass_fail', order=3),
            InspectionItem(category=cat2, name="Transmission Fluid", item_type='pass_fail', order=4),
            InspectionItem(category=cat2, name="Windshield Washer Fluid", item_type='pass_fail', order=5),
        ])
        
        # Quick Visual Inspection
        cat3 = InspectionCategory.objects.create(
            template=template,
            name="Visual Inspection",
            description="Quick visual checks",
            order=3
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat3, name="Air Filter Condition", item_type='rating', order=1),
            InspectionItem(category=cat3, name="Battery Terminals", item_type='pass_fail', order=2),
            InspectionItem(category=cat3, name="Belt Condition", item_type='rating', order=3),
            InspectionItem(category=cat3, name="Visible Leaks", item_type='text', order=4),
            InspectionItem(category=cat3, name="Tire Pressure", item_type='pass_fail', order=5),
        ])
        
        # Lights Check
        cat4 = InspectionCategory.objects.create(
            template=template,
            name="Lights Check",
            description="All exterior lights",
            order=4
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat4, name="Headlights", item_type='pass_fail', order=1),
            InspectionItem(category=cat4, name="Brake Lights", item_type='pass_fail', order=2),
            InspectionItem(category=cat4, name="Turn Signals", item_type='pass_fail', order=3),
        ])
        
        self.stdout.write(self.style.SUCCESS('  ✓ Created Oil Change Service Inspection (17 items)'))
        return 1

    def create_brake_inspection(self):
        """Brake System Inspection - Detailed brake check"""
        template, created = InspectionTemplate.objects.get_or_create(
            name="Brake System Inspection",
            defaults={
                'description': 'Detailed brake system inspection covering all brake components, pads, rotors, fluid, and performance.',
                'is_active': True,
                'requires_technician_signature': True,
                'requires_customer_signature': False,
                'allows_photos': True,
                'allows_video': False,
                'created_by': self.system_user,
            }
        )
        
        if not created:
            self.stdout.write(self.style.WARNING('  - Brake System Inspection already exists, skipping...'))
            return 0
        
        # Front Brakes
        cat1 = InspectionCategory.objects.create(
            template=template,
            name="Front Brake System",
            description="Front brake components",
            order=1
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat1, name="Left Front Brake Pad Thickness", item_type='measurement', measurement_unit='mm', min_acceptable=Decimal('3.00'), is_critical=True, order=1),
            InspectionItem(category=cat1, name="Right Front Brake Pad Thickness", item_type='measurement', measurement_unit='mm', min_acceptable=Decimal('3.00'), is_critical=True, order=2),
            InspectionItem(category=cat1, name="Left Front Rotor Thickness", item_type='measurement', measurement_unit='mm', is_critical=True, order=3),
            InspectionItem(category=cat1, name="Right Front Rotor Thickness", item_type='measurement', measurement_unit='mm', is_critical=True, order=4),
            InspectionItem(category=cat1, name="Front Rotor Surface Condition", item_type='rating', order=5),
            InspectionItem(category=cat1, name="Front Caliper Condition", item_type='rating', order=6),
            InspectionItem(category=cat1, name="Front Brake Hoses", item_type='pass_fail', is_critical=True, order=7),
        ])
        
        # Rear Brakes
        cat2 = InspectionCategory.objects.create(
            template=template,
            name="Rear Brake System",
            description="Rear brake components",
            order=2
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat2, name="Left Rear Brake Pad/Shoe Thickness", item_type='measurement', measurement_unit='mm', min_acceptable=Decimal('3.00'), is_critical=True, order=1),
            InspectionItem(category=cat2, name="Right Rear Brake Pad/Shoe Thickness", item_type='measurement', measurement_unit='mm', min_acceptable=Decimal('3.00'), is_critical=True, order=2),
            InspectionItem(category=cat2, name="Rear Rotor/Drum Condition", item_type='rating', is_critical=True, order=3),
            InspectionItem(category=cat2, name="Rear Caliper/Cylinder Condition", item_type='rating', order=4),
            InspectionItem(category=cat2, name="Rear Brake Hoses", item_type='pass_fail', is_critical=True, order=5),
        ])
        
        # Brake Fluid
        cat3 = InspectionCategory.objects.create(
            template=template,
            name="Brake Fluid System",
            description="Hydraulic system check",
            order=3
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat3, name="Brake Fluid Level", item_type='pass_fail', is_critical=True, order=1),
            InspectionItem(category=cat3, name="Brake Fluid Condition", item_type='rating', order=2),
            InspectionItem(category=cat3, name="Brake Fluid Color", item_type='text', order=3),
            InspectionItem(category=cat3, name="Master Cylinder Condition", item_type='pass_fail', is_critical=True, order=4),
            InspectionItem(category=cat3, name="Brake Lines Condition", item_type='pass_fail', is_critical=True, order=5),
            InspectionItem(category=cat3, name="Visible Fluid Leaks", item_type='text', is_critical=True, order=6),
        ])
        
        # Brake Performance
        cat4 = InspectionCategory.objects.create(
            template=template,
            name="Brake Performance",
            description="Operational testing",
            order=4
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat4, name="Brake Pedal Feel", item_type='rating', is_critical=True, order=1),
            InspectionItem(category=cat4, name="Brake Pedal Travel", item_type='text', order=2),
            InspectionItem(category=cat4, name="Parking Brake Operation", item_type='pass_fail', order=3),
            InspectionItem(category=cat4, name="Brake Noise", item_type='text', order=4),
            InspectionItem(category=cat4, name="Brake Pulling", item_type='text', order=5),
            InspectionItem(category=cat4, name="ABS Warning Light", item_type='pass_fail', is_critical=True, order=6),
        ])
        
        self.stdout.write(self.style.SUCCESS('  ✓ Created Brake System Inspection (24 items)'))
        return 1

    def create_emission_inspection(self):
        """Emission/Smog Test Inspection"""
        template, created = InspectionTemplate.objects.get_or_create(
            name="Emission/Smog Test Inspection",
            defaults={
                'description': 'Emission system inspection for smog test compliance. Checks emission control systems and pollutant levels.',
                'is_active': True,
                'requires_technician_signature': True,
                'requires_customer_signature': True,
                'allows_photos': False,
                'allows_video': False,
                'created_by': self.system_user,
            }
        )
        
        if not created:
            self.stdout.write(self.style.WARNING('  - Emission/Smog Test Inspection already exists, skipping...'))
            return 0
        
        # Visual Inspection
        cat1 = InspectionCategory.objects.create(
            template=template,
            name="Visual Inspection",
            description="Emission system components",
            order=1
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat1, name="Check Engine Light Status", item_type='pass_fail', is_critical=True, order=1),
            InspectionItem(category=cat1, name="Catalytic Converter Present", item_type='pass_fail', is_critical=True, order=2),
            InspectionItem(category=cat1, name="Oxygen Sensors", item_type='pass_fail', is_critical=True, order=3),
            InspectionItem(category=cat1, name="EGR Valve", item_type='pass_fail', order=4),
            InspectionItem(category=cat1, name="PCV Valve", item_type='pass_fail', order=5),
            InspectionItem(category=cat1, name="Evaporative System", item_type='pass_fail', order=6),
            InspectionItem(category=cat1, name="Exhaust System Leaks", item_type='text', is_critical=True, order=7),
        ])
        
        # OBD-II Scan
        cat2 = InspectionCategory.objects.create(
            template=template,
            name="OBD-II Diagnostic",
            description="Computer system check",
            order=2
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat2, name="Diagnostic Trouble Codes", item_type='text', is_critical=True, order=1),
            InspectionItem(category=cat2, name="Readiness Monitors Status", item_type='text', is_critical=True, order=2),
            InspectionItem(category=cat2, name="Catalyst Monitor", item_type='pass_fail', is_critical=True, order=3),
            InspectionItem(category=cat2, name="Oxygen Sensor Monitor", item_type='pass_fail', is_critical=True, order=4),
            InspectionItem(category=cat2, name="EVAP Monitor", item_type='pass_fail', order=5),
        ])
        
        # Emission Test Results
        cat3 = InspectionCategory.objects.create(
            template=template,
            name="Emission Test Results",
            description="Measured emission levels",
            order=3
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat3, name="HC (Hydrocarbons)", item_type='measurement', measurement_unit='ppm', is_critical=True, order=1),
            InspectionItem(category=cat3, name="CO (Carbon Monoxide)", item_type='measurement', measurement_unit='%', is_critical=True, order=2),
            InspectionItem(category=cat3, name="CO2 (Carbon Dioxide)", item_type='measurement', measurement_unit='%', order=3),
            InspectionItem(category=cat3, name="NOx (Nitrogen Oxides)", item_type='measurement', measurement_unit='ppm', is_critical=True, order=4),
            InspectionItem(category=cat3, name="O2 (Oxygen)", item_type='measurement', measurement_unit='%', order=5),
        ])
        
        # Test Conclusion
        cat4 = InspectionCategory.objects.create(
            template=template,
            name="Test Conclusion",
            description="Final result",
            order=4
        )
        InspectionItem.objects.bulk_create([
            InspectionItem(category=cat4, name="Overall Test Result", item_type='text', is_critical=True, order=1),
            InspectionItem(category=cat4, name="Pass/Fail Status", item_type='pass_fail', is_critical=True, order=2),
            InspectionItem(category=cat4, name="Required Repairs", item_type='text', order=3),
            InspectionItem(category=cat4, name="Retest Required", item_type='pass_fail', order=4),
        ])
        
        self.stdout.write(self.style.SUCCESS('  ✓ Created Emission/Smog Test Inspection (21 items)'))
        return 1
