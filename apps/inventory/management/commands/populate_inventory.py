"""
Management command to populate inventory with sample data for testing
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.inventory.models import PartCategory, Supplier, Part
from decimal import Decimal
import random

User = get_user_model()


class Command(BaseCommand):
    help = 'Populate inventory with sample data for testing'

    def handle(self, *args, **kwargs):
        self.stdout.write('Starting inventory population...')
        
        # Get or create admin user for created_by fields
        try:
            admin_user = User.objects.filter(role='admin').first()
            if not admin_user:
                admin_user = User.objects.filter(is_superuser=True).first()
        except:
            admin_user = None
        
        # Create Categories
        self.stdout.write('Creating categories...')
        categories_data = [
            {'name': 'Engine', 'description': 'Engine parts and components'},
            {'name': 'Brakes', 'description': 'Brake system components'},
            {'name': 'Suspension', 'description': 'Suspension and steering parts'},
            {'name': 'Electrical', 'description': 'Electrical components and accessories'},
            {'name': 'Filters', 'description': 'Oil, air, fuel, and cabin filters'},
            {'name': 'Fluids', 'description': 'Motor oil, coolant, brake fluid, etc.'},
            {'name': 'Belts & Hoses', 'description': 'Timing belts, serpentine belts, hoses'},
            {'name': 'Lighting', 'description': 'Headlights, tail lights, bulbs'},
            {'name': 'Body Parts', 'description': 'Exterior body components'},
            {'name': 'Interior', 'description': 'Interior components and accessories'},
        ]
        
        categories = {}
        for cat_data in categories_data:
            category, created = PartCategory.objects.get_or_create(
                name=cat_data['name'],
                defaults={'description': cat_data['description']}
            )
            categories[cat_data['name']] = category
            if created:
                self.stdout.write(f'  ✓ Created category: {category.name}')
        
        # Create Suppliers
        self.stdout.write('Creating suppliers...')
        suppliers_data = [
            {
                'name': 'AutoZone Parts',
                'supplier_code': 'AZ001',
                'supplier_type': 'retailer',
                'contact_person': 'John Smith',
                'email': 'orders@autozone.com',
                'phone': '555-0100',
                'city': 'Memphis',
                'region': 'TN',
                'payment_terms': 'Net 30',
            },
            {
                'name': 'NAPA Auto Parts',
                'supplier_code': 'NAPA01',
                'supplier_type': 'wholesaler',
                'contact_person': 'Sarah Johnson',
                'email': 'sales@napaparts.com',
                'phone': '555-0200',
                'city': 'Atlanta',
                'region': 'GA',
                'payment_terms': 'Net 30',
                'is_preferred': True,
            },
            {
                'name': 'OEM Direct',
                'supplier_code': 'OEM01',
                'supplier_type': 'manufacturer',
                'contact_person': 'Mike Chen',
                'email': 'wholesale@oemdirect.com',
                'phone': '555-0300',
                'city': 'Detroit',
                'region': 'MI',
                'payment_terms': 'Net 45',
            },
            {
                'name': 'Budget Auto Supply',
                'supplier_code': 'BAS01',
                'supplier_type': 'distributor',
                'contact_person': 'Lisa Brown',
                'email': 'orders@budgetauto.com',
                'phone': '555-0400',
                'city': 'Chicago',
                'region': 'IL',
                'payment_terms': 'Net 15',
            },
        ]
        
        suppliers = {}
        for supp_data in suppliers_data:
            supplier, created = Supplier.objects.get_or_create(
                supplier_code=supp_data['supplier_code'],
                defaults={**supp_data, 'created_by': admin_user}
            )
            suppliers[supp_data['name']] = supplier
            if created:
                self.stdout.write(f'  ✓ Created supplier: {supplier.name}')
        
        # Create Parts
        self.stdout.write('Creating parts...')
        parts_data = [
            # Engine parts
            {
                'part_number': 'ENG-001',
                'name': 'Engine Oil Filter',
                'description': 'High-quality oil filter for most vehicles',
                'category': 'Filters',
                'manufacturer': 'Bosch',
                'cost_price': Decimal('8.50'),
                'selling_price': Decimal('15.99'),
                'quantity_in_stock': 50,
                'reorder_point': 20,
                'unit': 'piece',
            },
            {
                'part_number': 'ENG-002',
                'name': 'Air Filter',
                'description': 'Standard air filter element',
                'category': 'Filters',
                'manufacturer': 'K&N',
                'cost_price': Decimal('12.00'),
                'selling_price': Decimal('24.99'),
                'quantity_in_stock': 35,
                'reorder_point': 15,
                'unit': 'piece',
            },
            {
                'part_number': 'ENG-003',
                'name': 'Spark Plug Set',
                'description': 'Iridium spark plugs (set of 4)',
                'category': 'Engine',
                'manufacturer': 'NGK',
                'cost_price': Decimal('35.00'),
                'selling_price': Decimal('59.99'),
                'quantity_in_stock': 25,
                'reorder_point': 10,
                'unit': 'set',
            },
            
            # Brake parts
            {
                'part_number': 'BRK-001',
                'name': 'Front Brake Pads',
                'description': 'Ceramic brake pads for front wheels',
                'category': 'Brakes',
                'manufacturer': 'Brembo',
                'cost_price': Decimal('45.00'),
                'selling_price': Decimal('89.99'),
                'quantity_in_stock': 18,
                'reorder_point': 8,
                'unit': 'set',
            },
            {
                'part_number': 'BRK-002',
                'name': 'Rear Brake Pads',
                'description': 'Ceramic brake pads for rear wheels',
                'category': 'Brakes',
                'manufacturer': 'Brembo',
                'cost_price': Decimal('40.00'),
                'selling_price': Decimal('79.99'),
                'quantity_in_stock': 22,
                'reorder_point': 8,
                'unit': 'set',
            },
            {
                'part_number': 'BRK-003',
                'name': 'Brake Rotor (Front)',
                'description': 'Ventilated front brake rotor',
                'category': 'Brakes',
                'manufacturer': 'ACDelco',
                'cost_price': Decimal('55.00'),
                'selling_price': Decimal('109.99'),
                'quantity_in_stock': 12,
                'reorder_point': 6,
                'unit': 'piece',
            },
            {
                'part_number': 'BRK-004',
                'name': 'Brake Fluid DOT 4',
                'description': '1 quart brake fluid',
                'category': 'Fluids',
                'manufacturer': 'Castrol',
                'cost_price': Decimal('6.50'),
                'selling_price': Decimal('12.99'),
                'quantity_in_stock': 48,
                'reorder_point': 20,
                'unit': 'bottle',
            },
            
            # Suspension
            {
                'part_number': 'SUS-001',
                'name': 'Front Strut Assembly',
                'description': 'Complete strut assembly with spring',
                'category': 'Suspension',
                'manufacturer': 'Monroe',
                'cost_price': Decimal('120.00'),
                'selling_price': Decimal('249.99'),
                'quantity_in_stock': 8,
                'reorder_point': 4,
                'unit': 'piece',
            },
            {
                'part_number': 'SUS-002',
                'name': 'Ball Joint (Lower)',
                'description': 'Lower control arm ball joint',
                'category': 'Suspension',
                'manufacturer': 'Moog',
                'cost_price': Decimal('35.00'),
                'selling_price': Decimal('69.99'),
                'quantity_in_stock': 14,
                'reorder_point': 6,
                'unit': 'piece',
            },
            
            # Fluids
            {
                'part_number': 'FLD-001',
                'name': 'Synthetic Motor Oil 5W-30',
                'description': '5 quart jug full synthetic',
                'category': 'Fluids',
                'manufacturer': 'Mobil 1',
                'cost_price': Decimal('25.00'),
                'selling_price': Decimal('49.99'),
                'quantity_in_stock': 60,
                'reorder_point': 25,
                'unit': 'gallon',
            },
            {
                'part_number': 'FLD-002',
                'name': 'Engine Coolant',
                'description': '1 gallon antifreeze/coolant',
                'category': 'Fluids',
                'manufacturer': 'Prestone',
                'cost_price': Decimal('12.00'),
                'selling_price': Decimal('22.99'),
                'quantity_in_stock': 45,
                'reorder_point': 20,
                'unit': 'gallon',
            },
            {
                'part_number': 'FLD-003',
                'name': 'Transmission Fluid ATF',
                'description': 'Automatic transmission fluid',
                'category': 'Fluids',
                'manufacturer': 'Valvoline',
                'cost_price': Decimal('8.00'),
                'selling_price': Decimal('15.99'),
                'quantity_in_stock': 40,
                'reorder_point': 18,
                'unit': 'quart',
            },
            
            # Belts & Hoses
            {
                'part_number': 'BLT-001',
                'name': 'Serpentine Belt',
                'description': 'Multi-rib serpentine drive belt',
                'category': 'Belts & Hoses',
                'manufacturer': 'Gates',
                'cost_price': Decimal('18.00'),
                'selling_price': Decimal('34.99'),
                'quantity_in_stock': 28,
                'reorder_point': 12,
                'unit': 'piece',
            },
            {
                'part_number': 'BLT-002',
                'name': 'Timing Belt Kit',
                'description': 'Complete timing belt kit with tensioner',
                'category': 'Belts & Hoses',
                'manufacturer': 'Gates',
                'cost_price': Decimal('85.00'),
                'selling_price': Decimal('169.99'),
                'quantity_in_stock': 10,
                'reorder_point': 5,
                'unit': 'kit',
            },
            
            # Electrical
            {
                'part_number': 'ELC-001',
                'name': 'Battery 12V',
                'description': 'Car battery 12V 650CCA',
                'category': 'Electrical',
                'manufacturer': 'Interstate',
                'cost_price': Decimal('95.00'),
                'selling_price': Decimal('179.99'),
                'quantity_in_stock': 15,
                'reorder_point': 8,
                'unit': 'piece',
            },
            {
                'part_number': 'ELC-002',
                'name': 'Alternator',
                'description': 'Remanufactured alternator 120A',
                'category': 'Electrical',
                'manufacturer': 'Bosch',
                'cost_price': Decimal('125.00'),
                'selling_price': Decimal('249.99'),
                'quantity_in_stock': 6,
                'reorder_point': 3,
                'unit': 'piece',
            },
            {
                'part_number': 'ELC-003',
                'name': 'Starter Motor',
                'description': 'Remanufactured starter motor',
                'category': 'Electrical',
                'manufacturer': 'Bosch',
                'cost_price': Decimal('110.00'),
                'selling_price': Decimal('219.99'),
                'quantity_in_stock': 5,
                'reorder_point': 3,
                'unit': 'piece',
            },
            
            # Lighting
            {
                'part_number': 'LGT-001',
                'name': 'Headlight Bulb H11',
                'description': 'Halogen headlight bulb',
                'category': 'Lighting',
                'manufacturer': 'Sylvania',
                'cost_price': Decimal('12.00'),
                'selling_price': Decimal('24.99'),
                'quantity_in_stock': 30,
                'reorder_point': 15,
                'unit': 'pair',
            },
            {
                'part_number': 'LGT-002',
                'name': 'LED Headlight Kit',
                'description': 'LED headlight conversion kit',
                'category': 'Lighting',
                'manufacturer': 'Philips',
                'cost_price': Decimal('65.00'),
                'selling_price': Decimal('129.99'),
                'quantity_in_stock': 12,
                'reorder_point': 6,
                'unit': 'set',
            },
            
            # Low stock items (for testing alerts)
            {
                'part_number': 'LOW-001',
                'name': 'Cabin Air Filter',
                'description': 'HEPA cabin air filter',
                'category': 'Filters',
                'manufacturer': 'Mann',
                'cost_price': Decimal('15.00'),
                'selling_price': Decimal('29.99'),
                'quantity_in_stock': 3,  # Below reorder point
                'reorder_point': 10,
                'unit': 'piece',
            },
            {
                'part_number': 'LOW-002',
                'name': 'Fuel Filter',
                'description': 'Inline fuel filter',
                'category': 'Filters',
                'manufacturer': 'Wix',
                'cost_price': Decimal('14.00'),
                'selling_price': Decimal('27.99'),
                'quantity_in_stock': 2,  # Below reorder point
                'reorder_point': 8,
                'unit': 'piece',
            },
            {
                'part_number': 'OUT-001',
                'name': 'PCV Valve',
                'description': 'Positive crankcase ventilation valve',
                'category': 'Engine',
                'manufacturer': 'Standard',
                'cost_price': Decimal('8.00'),
                'selling_price': Decimal('16.99'),
                'quantity_in_stock': 0,  # Out of stock
                'reorder_point': 12,
                'unit': 'piece',
            },
        ]
        
        created_count = 0
        for part_data in parts_data:
            category_name = part_data.pop('category')
            part_data['category'] = categories[category_name]
            
            part, created = Part.objects.get_or_create(
                part_number=part_data['part_number'],
                defaults={**part_data, 'created_by': admin_user}
            )
            
            if created:
                created_count += 1
                # Add random suppliers to parts
                random_suppliers = random.sample(list(suppliers.values()), k=random.randint(1, 2))
                part.suppliers.set(random_suppliers)
                part.preferred_supplier = random_suppliers[0]
                part.save()
                
                self.stdout.write(f'  ✓ Created part: {part.part_number} - {part.name}')
        
        # Summary
        self.stdout.write(self.style.SUCCESS('\n' + '='*60))
        self.stdout.write(self.style.SUCCESS('Inventory population complete!'))
        self.stdout.write(self.style.SUCCESS('='*60))
        self.stdout.write(f'Categories created: {len(categories)}')
        self.stdout.write(f'Suppliers created: {len(suppliers)}')
        self.stdout.write(f'Parts created: {created_count}')
        self.stdout.write(f'\nInventory Statistics:')
        self.stdout.write(f'  - Total parts in system: {Part.objects.count()}')
        self.stdout.write(f'  - Low stock parts: {Part.objects.filter(quantity_in_stock__lte=10).count()}')
        self.stdout.write(f'  - Out of stock parts: {Part.objects.filter(quantity_in_stock=0).count()}')
        self.stdout.write(f'\nYou can now access:')
        self.stdout.write(f'  - Inventory Dashboard: /inventory/')
        self.stdout.write(f'  - Parts List: /inventory/parts/')
        self.stdout.write(f'  - Suppliers List: /inventory/suppliers/')
        self.stdout.write(f'  - Categories List: /inventory/categories/')
        self.stdout.write(self.style.SUCCESS('\nHappy testing! 🎉'))
