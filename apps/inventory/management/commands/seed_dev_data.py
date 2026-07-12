"""
Management command to seed development data:
- Suppliers
- Inventory Parts (with categories)
- Purchase Orders
- Customers (with User accounts)
- Vehicles
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
import random

from apps.inventory.models import PartCategory, Supplier, Part, PurchaseOrder, PurchaseOrderItem
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.branches.models import Branch

User = get_user_model()


class Command(BaseCommand):
    help = 'Seed development data: suppliers, parts, purchase orders, customers, and vehicles'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing data before seeding (use with caution!)',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('='*60))
        self.stdout.write(self.style.SUCCESS('Starting Development Data Seeding...'))
        self.stdout.write(self.style.SUCCESS('='*60))
        
        # Get or create admin user for created_by fields
        admin_user = User.objects.filter(role='admin').first()
        if not admin_user:
            admin_user = User.objects.filter(is_superuser=True).first()
        if not admin_user:
            self.stdout.write(self.style.ERROR('No admin user found. Please create an admin user first.'))
            return
        
        # Get or create a branch
        branch = Branch.objects.filter(is_active=True).first()
        if not branch:
            branch = Branch.objects.create(
                name='Main Branch',
                code='MAIN',
                phone='555-0100',
                address='123 Main Street',
                city='New York',
                region='NY',
                zip_code='10001',
                country='USA',
                is_headquarters=True,
                created_by=admin_user
            )
            self.stdout.write(f'  ✓ Created branch: {branch.name}')
        
        # Clear existing data if requested
        if options['clear']:
            self.stdout.write(self.style.WARNING('Clearing existing data...'))
            
            # Delete in order to respect foreign key constraints
            # Start with models that reference others (leaf nodes first)
            try:
                from apps.billing.models import Invoice, InvoiceLineItem, Payment, Estimate, EstimateLineItem
                from apps.workorders.models import WorkOrder, WorkOrderPart, ServiceTask, TechnicianTimeLog, WorkOrderNote, WorkOrderPhoto
                from apps.inspections.models import VehicleInspection
                from apps.inventory.models import InventoryTransaction
                
                # Delete billing-related items first (they reference vehicles, customers, work orders)
                self.stdout.write('  Deleting payments...')
                Payment.objects.all().delete()
                
                self.stdout.write('  Deleting invoice line items...')
                InvoiceLineItem.objects.all().delete()
                
                self.stdout.write('  Deleting invoices...')
                Invoice.objects.all().delete()
                
                self.stdout.write('  Deleting estimate line items...')
                EstimateLineItem.objects.all().delete()
                
                self.stdout.write('  Deleting estimates...')
                Estimate.objects.all().delete()
                
                # Delete work order related items
                self.stdout.write('  Deleting work order parts...')
                WorkOrderPart.objects.all().delete()
                
                self.stdout.write('  Deleting work order notes...')
                WorkOrderNote.objects.all().delete()
                
                self.stdout.write('  Deleting work order photos...')
                WorkOrderPhoto.objects.all().delete()
                
                self.stdout.write('  Deleting technician time logs...')
                TechnicianTimeLog.objects.all().delete()
                
                self.stdout.write('  Deleting service tasks...')
                ServiceTask.objects.all().delete()
                
                self.stdout.write('  Deleting work orders...')
                WorkOrder.objects.all().delete()
                
                # Delete inspections
                self.stdout.write('  Deleting vehicle inspections...')
                VehicleInspection.objects.all().delete()
                
                # Delete inventory transactions
                self.stdout.write('  Deleting inventory transactions...')
                InventoryTransaction.objects.all().delete()
                
            except ImportError as e:
                self.stdout.write(self.style.WARNING(f'  Warning: Could not import some models: {e}'))
            
            # Now delete vehicles and customers
            self.stdout.write('  Deleting vehicles...')
            Vehicle.objects.all().delete()
            
            self.stdout.write('  Deleting customers...')
            # Get customer user IDs before deleting customers
            customer_user_ids = list(Customer.objects.values_list('user_id', flat=True))
            Customer.objects.all().delete()
            # Delete the customer user accounts
            if customer_user_ids:
                User.objects.filter(id__in=customer_user_ids, role='customer').delete()
            
            # Delete inventory items
            self.stdout.write('  Deleting purchase order items...')
            PurchaseOrderItem.objects.all().delete()
            
            self.stdout.write('  Deleting purchase orders...')
            PurchaseOrder.objects.all().delete()
            
            self.stdout.write('  Deleting parts...')
            Part.objects.all().delete()
            
            self.stdout.write('  Deleting suppliers...')
            Supplier.objects.all().delete()
            
            self.stdout.write('  Deleting part categories...')
            PartCategory.objects.all().delete()
            
            # Don't delete users (except customer users above) or branches
            self.stdout.write(self.style.SUCCESS('  ✓ Data cleared successfully'))
        
        # 1. Create Categories
        self.stdout.write('\n1. Creating Part Categories...')
        categories = self.create_categories()
        
        # 2. Create Suppliers
        self.stdout.write('\n2. Creating Suppliers...')
        suppliers = self.create_suppliers(admin_user)
        
        # 3. Create Parts
        self.stdout.write('\n3. Creating Inventory Parts...')
        parts = self.create_parts(categories, suppliers, branch, admin_user)
        
        # 4. Create Purchase Orders
        self.stdout.write('\n4. Creating Purchase Orders...')
        purchase_orders = self.create_purchase_orders(suppliers, parts, branch, admin_user)
        
        # 5. Create Customers
        self.stdout.write('\n5. Creating Customers...')
        customers = self.create_customers(admin_user)
        
        # 6. Create Vehicles
        self.stdout.write('\n6. Creating Vehicles...')
        vehicles = self.create_vehicles(customers)
        
        # Summary
        self.stdout.write(self.style.SUCCESS('\n' + '='*60))
        self.stdout.write(self.style.SUCCESS('Development Data Seeding Complete!'))
        self.stdout.write(self.style.SUCCESS('='*60))
        self.stdout.write(f'\nSummary:')
        self.stdout.write(f'  - Categories: {PartCategory.objects.count()}')
        self.stdout.write(f'  - Suppliers: {Supplier.objects.count()}')
        self.stdout.write(f'  - Parts: {Part.objects.count()}')
        self.stdout.write(f'  - Purchase Orders: {PurchaseOrder.objects.count()}')
        self.stdout.write(f'  - Customers: {Customer.objects.count()}')
        self.stdout.write(f'  - Vehicles: {Vehicle.objects.count()}')
        self.stdout.write(self.style.SUCCESS('\nHappy developing! 🎉'))

    def create_categories(self):
        """Create part categories"""
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
        
        return categories

    def create_suppliers(self, admin_user):
        """Create suppliers"""
        suppliers_data = [
            {
                'name': 'AutoZone Parts',
                'supplier_code': 'AZ001',
                'supplier_type': 'retailer',
                'contact_person': 'John Smith',
                'email': 'orders@autozone.com',
                'phone': '555-0100',
                'address_line1': '123 Commerce St',
                'city': 'Memphis',
                'region': 'TN',
                'postal_code': '38103',
                'country': 'USA',
                'payment_terms': 'Net 30',
                'credit_limit': Decimal('50000.00'),
                'is_preferred': False,
            },
            {
                'name': 'NAPA Auto Parts',
                'supplier_code': 'NAPA01',
                'supplier_type': 'wholesaler',
                'contact_person': 'Sarah Johnson',
                'email': 'sales@napaparts.com',
                'phone': '555-0200',
                'address_line1': '456 Industrial Blvd',
                'city': 'Atlanta',
                'region': 'GA',
                'postal_code': '30309',
                'country': 'USA',
                'payment_terms': 'Net 30',
                'credit_limit': Decimal('100000.00'),
                'is_preferred': True,
            },
            {
                'name': 'OEM Direct',
                'supplier_code': 'OEM01',
                'supplier_type': 'manufacturer',
                'contact_person': 'Mike Chen',
                'email': 'wholesale@oemdirect.com',
                'phone': '555-0300',
                'address_line1': '789 Factory Way',
                'city': 'Detroit',
                'region': 'MI',
                'postal_code': '48201',
                'country': 'USA',
                'payment_terms': 'Net 45',
                'credit_limit': Decimal('75000.00'),
                'is_preferred': False,
            },
            {
                'name': 'Budget Auto Supply',
                'supplier_code': 'BAS01',
                'supplier_type': 'distributor',
                'contact_person': 'Lisa Brown',
                'email': 'orders@budgetauto.com',
                'phone': '555-0400',
                'address_line1': '321 Warehouse Ave',
                'city': 'Chicago',
                'region': 'IL',
                'postal_code': '60601',
                'country': 'USA',
                'payment_terms': 'Net 15',
                'credit_limit': Decimal('30000.00'),
                'is_preferred': False,
            },
            {
                'name': 'Premium Parts Co',
                'supplier_code': 'PPC01',
                'supplier_type': 'wholesaler',
                'contact_person': 'Robert Williams',
                'email': 'sales@premiumparts.com',
                'phone': '555-0500',
                'address_line1': '654 Quality Drive',
                'city': 'Los Angeles',
                'region': 'CA',
                'postal_code': '90001',
                'country': 'USA',
                'payment_terms': 'Net 30',
                'credit_limit': Decimal('80000.00'),
                'is_preferred': True,
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
                self.stdout.write(f'  ✓ Created supplier: {supplier.name} ({supplier.supplier_code})')
        
        return suppliers

    def create_parts(self, categories, suppliers, branch, admin_user):
        """Create inventory parts"""
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
                'reorder_quantity': 40,
                'unit': 'piece',
                'markup_percentage': Decimal('88.12'),
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
                'reorder_quantity': 30,
                'unit': 'piece',
                'markup_percentage': Decimal('108.25'),
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
                'reorder_quantity': 20,
                'unit': 'set',
                'markup_percentage': Decimal('71.40'),
            },
            {
                'part_number': 'ENG-004',
                'name': 'PCV Valve',
                'description': 'Positive crankcase ventilation valve',
                'category': 'Engine',
                'manufacturer': 'Standard',
                'cost_price': Decimal('8.00'),
                'selling_price': Decimal('16.99'),
                'quantity_in_stock': 15,
                'reorder_point': 12,
                'reorder_quantity': 24,
                'unit': 'piece',
                'markup_percentage': Decimal('112.38'),
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
                'reorder_quantity': 16,
                'unit': 'set',
                'markup_percentage': Decimal('99.98'),
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
                'reorder_quantity': 16,
                'unit': 'set',
                'markup_percentage': Decimal('99.98'),
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
                'reorder_quantity': 12,
                'unit': 'piece',
                'markup_percentage': Decimal('99.98'),
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
                'reorder_quantity': 40,
                'unit': 'bottle',
                'markup_percentage': Decimal('99.85'),
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
                'reorder_quantity': 8,
                'unit': 'piece',
                'markup_percentage': Decimal('108.33'),
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
                'reorder_quantity': 12,
                'unit': 'piece',
                'markup_percentage': Decimal('99.97'),
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
                'reorder_quantity': 50,
                'unit': 'gallon',
                'markup_percentage': Decimal('99.96'),
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
                'reorder_quantity': 40,
                'unit': 'gallon',
                'markup_percentage': Decimal('91.58'),
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
                'reorder_quantity': 36,
                'unit': 'quart',
                'markup_percentage': Decimal('99.88'),
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
                'reorder_quantity': 24,
                'unit': 'piece',
                'markup_percentage': Decimal('94.39'),
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
                'reorder_quantity': 10,
                'unit': 'set',
                'markup_percentage': Decimal('99.99'),
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
                'reorder_quantity': 16,
                'unit': 'piece',
                'markup_percentage': Decimal('89.46'),
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
                'reorder_quantity': 6,
                'unit': 'piece',
                'markup_percentage': Decimal('99.99'),
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
                'reorder_quantity': 6,
                'unit': 'piece',
                'markup_percentage': Decimal('99.99'),
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
                'reorder_quantity': 30,
                'unit': 'pair',
                'markup_percentage': Decimal('108.25'),
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
                'reorder_quantity': 12,
                'unit': 'set',
                'markup_percentage': Decimal('99.98'),
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
                'reorder_quantity': 20,
                'unit': 'piece',
                'markup_percentage': Decimal('99.93'),
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
                'reorder_quantity': 16,
                'unit': 'piece',
                'markup_percentage': Decimal('99.93'),
            },
        ]
        
        parts = {}
        supplier_list = list(suppliers.values())
        
        for part_data in parts_data:
            category_name = part_data.pop('category')
            part_data['category'] = categories[category_name]
            part_data['branch'] = branch
            part_data['created_by'] = admin_user
            
            part, created = Part.objects.get_or_create(
                part_number=part_data['part_number'],
                defaults=part_data
            )
            
            if created:
                # Add random suppliers to parts
                num_suppliers = random.randint(1, min(3, len(supplier_list)))
                random_suppliers = random.sample(supplier_list, k=num_suppliers)
                part.suppliers.set(random_suppliers)
                part.preferred_supplier = random_suppliers[0]
                part.save()
                
                self.stdout.write(f'  ✓ Created part: {part.part_number} - {part.name}')
            
            parts[part_data['part_number']] = part
        
        return parts

    def create_purchase_orders(self, suppliers, parts, branch, admin_user):
        """Create purchase orders"""
        supplier_list = list(suppliers.values())
        parts_list = list(parts.values())
        
        if not supplier_list or not parts_list:
            self.stdout.write(self.style.WARNING('  ⚠ Skipping purchase orders - need suppliers and parts'))
            return []
        
        purchase_orders = []
        statuses = ['draft', 'submitted', 'confirmed', 'received', 'partially_received']
        
        # Create 5-8 purchase orders
        for i in range(random.randint(5, 8)):
            supplier = random.choice(supplier_list)
            status = random.choice(statuses)
            
            # Create PO
            po = PurchaseOrder.objects.create(
                supplier=supplier,
                branch=branch,
                status=status,
                order_date=timezone.now().date() - timedelta(days=random.randint(0, 30)),
                expected_delivery_date=timezone.now().date() + timedelta(days=random.randint(1, 14)),
                tax_amount=Decimal('0.00'),
                shipping_cost=Decimal(str(random.uniform(10.00, 50.00))).quantize(Decimal('0.01')),
                notes=f'Purchase order #{i+1} for {supplier.name}',
                created_by=admin_user,
            )
            
            # Add 2-5 items to each PO
            num_items = random.randint(2, 5)
            selected_parts = random.sample(parts_list, k=min(num_items, len(parts_list)))
            
            for part in selected_parts:
                quantity = random.randint(5, 25)
                unit_cost = part.cost_price * Decimal(str(random.uniform(0.9, 1.1)))  # ±10% variation
                unit_cost = unit_cost.quantize(Decimal('0.01'))
                
                quantity_received = 0
                if status == 'received':
                    quantity_received = quantity
                elif status == 'partially_received':
                    quantity_received = random.randint(1, quantity - 1)
                
                PurchaseOrderItem.objects.create(
                    purchase_order=po,
                    part=part,
                    quantity=quantity,
                    quantity_received=quantity_received,
                    unit_cost=unit_cost,
                    received_date=po.received_date if quantity_received > 0 else None,
                )
            
            # Recalculate totals
            po.calculate_totals()
            
            if status == 'received' and not po.received_date:
                po.received_date = po.expected_delivery_date
                po.save()
            
            purchase_orders.append(po)
            self.stdout.write(f'  ✓ Created PO: {po.po_number} - {supplier.name} ({status})')
        
        return purchase_orders

    def create_customers(self, admin_user):
        """Create customers with user accounts"""
        customers_data = [
            {
                'user': {
                    'first_name': 'John',
                    'last_name': 'Doe',
                    'email': 'john.doe@example.com',
                    'phone': '555-1001',
                    'username': 'johndoe',
                },
                'customer': {
                    'customer_type': 'individual',
                    'service_address': '123 Main Street',
                    'service_city': 'New York',
                    'service_state': 'NY',
                    'service_zip_code': '10001',
                    'payment_terms': 'due_on_receipt',
                    'credit_limit': Decimal('1000.00'),
                }
            },
            {
                'user': {
                    'first_name': 'Jane',
                    'last_name': 'Smith',
                    'email': 'jane.smith@example.com',
                    'phone': '555-1002',
                    'username': 'janesmith',
                },
                'customer': {
                    'customer_type': 'individual',
                    'service_address': '456 Oak Avenue',
                    'service_city': 'Brooklyn',
                    'service_state': 'NY',
                    'service_zip_code': '11201',
                    'payment_terms': 'net_15',
                    'credit_limit': Decimal('2000.00'),
                }
            },
            {
                'user': {
                    'first_name': 'Robert',
                    'last_name': 'Johnson',
                    'email': 'robert.johnson@example.com',
                    'phone': '555-1003',
                    'username': 'robertjohnson',
                },
                'customer': {
                    'customer_type': 'individual',
                    'service_address': '789 Pine Road',
                    'service_city': 'Queens',
                    'service_state': 'NY',
                    'service_zip_code': '11101',
                    'payment_terms': 'due_on_receipt',
                    'credit_limit': Decimal('1500.00'),
                }
            },
            {
                'user': {
                    'first_name': 'Maria',
                    'last_name': 'Garcia',
                    'email': 'maria.garcia@example.com',
                    'phone': '555-1004',
                    'username': 'mariagarcia',
                },
                'customer': {
                    'customer_type': 'individual',
                    'service_address': '321 Elm Street',
                    'service_city': 'Bronx',
                    'service_state': 'NY',
                    'service_zip_code': '10451',
                    'payment_terms': 'net_30',
                    'credit_limit': Decimal('2500.00'),
                }
            },
            {
                'user': {
                    'first_name': 'David',
                    'last_name': 'Williams',
                    'email': 'david.williams@example.com',
                    'phone': '555-1005',
                    'username': 'davidwilliams',
                },
                'customer': {
                    'customer_type': 'business',
                    'company_name': 'Williams Delivery Services',
                    'business_type': 'Delivery',
                    'tax_id': '12-3456789',
                    'service_address': '555 Business Park',
                    'service_city': 'Newark',
                    'service_state': 'NJ',
                    'service_zip_code': '07102',
                    'payment_terms': 'net_30',
                    'credit_limit': Decimal('10000.00'),
                }
            },
            {
                'user': {
                    'first_name': 'Sarah',
                    'last_name': 'Brown',
                    'email': 'sarah.brown@example.com',
                    'phone': '555-1006',
                    'username': 'sarahbrown',
                },
                'customer': {
                    'customer_type': 'fleet',
                    'company_name': 'Brown Construction Co',
                    'business_type': 'Construction',
                    'tax_id': '98-7654321',
                    'service_address': '888 Industrial Way',
                    'service_city': 'Jersey City',
                    'service_state': 'NJ',
                    'service_zip_code': '07302',
                    'payment_terms': 'net_60',
                    'credit_limit': Decimal('50000.00'),
                }
            },
            {
                'user': {
                    'first_name': 'Michael',
                    'last_name': 'Davis',
                    'email': 'michael.davis@example.com',
                    'phone': '555-1007',
                    'username': 'michaeldavis',
                },
                'customer': {
                    'customer_type': 'individual',
                    'service_address': '999 Maple Drive',
                    'service_city': 'Staten Island',
                    'service_state': 'NY',
                    'service_zip_code': '10301',
                    'payment_terms': 'due_on_receipt',
                    'credit_limit': Decimal('2000.00'),
                }
            },
            {
                'user': {
                    'first_name': 'Emily',
                    'last_name': 'Miller',
                    'email': 'emily.miller@example.com',
                    'phone': '555-1008',
                    'username': 'emilymiller',
                },
                'customer': {
                    'customer_type': 'individual',
                    'service_address': '777 Cedar Lane',
                    'service_city': 'Yonkers',
                    'service_state': 'NY',
                    'service_zip_code': '10701',
                    'payment_terms': 'net_15',
                    'credit_limit': Decimal('1500.00'),
                }
            },
        ]
        
        customers = []
        for data in customers_data:
            user_data = data['user']
            customer_data = data['customer']
            
            # Create or get user
            user, user_created = User.objects.get_or_create(
                email=user_data['email'],
                defaults={
                    **user_data,
                    'role': 'customer',
                    'is_active': True,
                }
            )
            
            if user_created:
                user.set_password('password123')  # Default password for dev
                user.save()
            
            # Create customer profile
            customer, customer_created = Customer.objects.get_or_create(
                user=user,
                defaults=customer_data
            )
            
            if customer_created or user_created:
                customers.append(customer)
                self.stdout.write(f'  ✓ Created customer: {customer.full_name} ({customer.customer_number})')
        
        return customers

    def create_vehicles(self, customers):
        """Create vehicles for customers"""
        if not customers:
            self.stdout.write(self.style.WARNING('  ⚠ Skipping vehicles - no customers found'))
            return []
        
        vehicles_data = [
            {
                'year': 2020,
                'make': 'Toyota',
                'model': 'Camry',
                'trim': 'LE',
                'vin': '4T1B11HK5KU123456',
                'license_plate': 'ABC1234',
                'license_plate_state': 'NY',
                'exterior_color': 'Silver',
                'interior_color': 'Black',
                'engine_type': 'gasoline',
                'engine_size': '2.5L I4',
                'transmission_type': 'automatic',
                'current_mileage': 45000,
                'condition_rating': 4,
            },
            {
                'year': 2018,
                'make': 'Honda',
                'model': 'Civic',
                'trim': 'EX',
                'vin': '19XFC2F59KE234567',
                'license_plate': 'XYZ5678',
                'license_plate_state': 'NY',
                'exterior_color': 'Blue',
                'interior_color': 'Gray',
                'engine_type': 'gasoline',
                'engine_size': '1.5L Turbo',
                'transmission_type': 'cvt',
                'current_mileage': 62000,
                'condition_rating': 3,
            },
            {
                'year': 2021,
                'make': 'Ford',
                'model': 'F-150',
                'trim': 'XLT',
                'vin': '1FTFW1E58MFC34567',
                'license_plate': 'TRK9012',
                'license_plate_state': 'NY',
                'exterior_color': 'Black',
                'interior_color': 'Black',
                'engine_type': 'gasoline',
                'engine_size': '3.5L V6 EcoBoost',
                'transmission_type': 'automatic',
                'current_mileage': 28000,
                'condition_rating': 5,
            },
            {
                'year': 2019,
                'make': 'Chevrolet',
                'model': 'Silverado',
                'trim': 'LT',
                'vin': '1GCVKREC5KZ456789',
                'license_plate': 'TRK3456',
                'license_plate_state': 'NJ',
                'exterior_color': 'White',
                'interior_color': 'Tan',
                'engine_type': 'gasoline',
                'engine_size': '5.3L V8',
                'transmission_type': 'automatic',
                'current_mileage': 55000,
                'condition_rating': 4,
            },
            {
                'year': 2022,
                'make': 'Tesla',
                'model': 'Model 3',
                'trim': 'Long Range',
                'vin': '5YJ3E1EB8NF567890',
                'license_plate': 'ELC7890',
                'license_plate_state': 'NY',
                'exterior_color': 'Red',
                'interior_color': 'White',
                'engine_type': 'electric',
                'engine_size': 'Electric Motor',
                'transmission_type': 'automatic',
                'current_mileage': 15000,
                'condition_rating': 5,
            },
            {
                'year': 2017,
                'make': 'BMW',
                'model': '3 Series',
                'trim': '330i',
                'vin': 'WBA8A9C58HG678901',
                'license_plate': 'BMW1234',
                'license_plate_state': 'NY',
                'exterior_color': 'Black',
                'interior_color': 'Black',
                'engine_type': 'gasoline',
                'engine_size': '2.0L Turbo',
                'transmission_type': 'automatic',
                'current_mileage': 75000,
                'condition_rating': 3,
            },
            {
                'year': 2020,
                'make': 'Mercedes-Benz',
                'model': 'C-Class',
                'trim': 'C300',
                'vin': 'WDDWF4KB5LA789012',
                'license_plate': 'MBZ5678',
                'license_plate_state': 'NY',
                'exterior_color': 'Silver',
                'interior_color': 'Black',
                'engine_type': 'gasoline',
                'engine_size': '2.0L Turbo',
                'transmission_type': 'automatic',
                'current_mileage': 42000,
                'condition_rating': 4,
            },
            {
                'year': 2019,
                'make': 'Nissan',
                'model': 'Altima',
                'trim': 'SV',
                'vin': '1N4AL3AP8KC890123',
                'license_plate': 'NSN9012',
                'license_plate_state': 'NY',
                'exterior_color': 'Gray',
                'interior_color': 'Black',
                'engine_type': 'gasoline',
                'engine_size': '2.5L I4',
                'transmission_type': 'cvt',
                'current_mileage': 58000,
                'condition_rating': 3,
            },
            {
                'year': 2021,
                'make': 'Hyundai',
                'model': 'Elantra',
                'trim': 'Limited',
                'vin': '5NPE34AF2MH901234',
                'license_plate': 'HYD3456',
                'license_plate_state': 'NY',
                'exterior_color': 'Blue',
                'interior_color': 'Gray',
                'engine_type': 'gasoline',
                'engine_size': '2.0L I4',
                'transmission_type': 'cvt',
                'current_mileage': 35000,
                'condition_rating': 4,
            },
            {
                'year': 2018,
                'make': 'Jeep',
                'model': 'Wrangler',
                'trim': 'Sport',
                'vin': '1C4HJXEG8JW012345',
                'license_plate': 'JEP7890',
                'license_plate_state': 'NY',
                'exterior_color': 'Green',
                'interior_color': 'Black',
                'engine_type': 'gasoline',
                'engine_size': '3.6L V6',
                'transmission_type': 'automatic',
                'current_mileage': 68000,
                'condition_rating': 3,
            },
        ]
        
        vehicles = []
        for i, vehicle_data in enumerate(vehicles_data):
            # Assign vehicle to customer (some customers may have multiple vehicles)
            owner = customers[i % len(customers)]
            
            vehicle, created = Vehicle.objects.get_or_create(
                vin=vehicle_data['vin'],
                defaults={
                    **vehicle_data,
                    'owner': owner,
                    'status': 'active',
                }
            )
            
            if created:
                vehicles.append(vehicle)
                self.stdout.write(f'  ✓ Created vehicle: {vehicle.display_name} ({vehicle.license_plate})')
        
        return vehicles

