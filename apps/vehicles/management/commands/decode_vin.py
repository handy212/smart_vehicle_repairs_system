"""
Test VIN Decoder
Decodes a VIN and displays vehicle information
"""
from django.core.management.base import BaseCommand
from apps.vehicles.vin_decoder import VehicleVINDecoder


class Command(BaseCommand):
    help = 'Test VIN decoder by decoding a VIN number'

    def add_arguments(self, parser):
        parser.add_argument(
            'vin',
            type=str,
            help='17-character VIN to decode'
        )
        parser.add_argument(
            '--detailed',
            action='store_true',
            help='Show all available information'
        )

    def handle(self, *args, **options):
        vin = options['vin'].upper()
        detailed = options.get('detailed', False)
        
        self.stdout.write('\n' + '=' * 70)
        self.stdout.write(self.style.SUCCESS('VIN DECODER TEST'))
        self.stdout.write('=' * 70 + '\n')
        
        # Validate VIN length
        if len(vin) != 17:
            self.stdout.write(self.style.ERROR(f'✗ Invalid VIN length: {len(vin)} (must be 17 characters)'))
            return
        
        self.stdout.write(f'VIN: {vin}\n')
        
        # Decode VIN
        decoder = VehicleVINDecoder()
        
        self.stdout.write(self.style.NOTICE('Decoding VIN using NHTSA API...'))
        success, data = decoder.decode_vin(vin)
        
        if not success:
            self.stdout.write(self.style.ERROR(f'\n✗ Decode failed: {data}'))
            return
        
        # Check for errors
        if data.get('has_errors'):
            self.stdout.write(self.style.WARNING(f'\n⚠ Warning: {data.get("error_message")}'))
        
        # Display basic information
        self.stdout.write(self.style.SUCCESS('\n✓ VIN decoded successfully!\n'))
        
        self.stdout.write(self.style.SUCCESS('BASIC INFORMATION'))
        self.stdout.write('-' * 70)
        self._print_field('Year', data.get('year'))
        self._print_field('Make', data.get('make'))
        self._print_field('Model', data.get('model'))
        self._print_field('Trim', data.get('trim'))
        self._print_field('Body Class', data.get('body_class'))
        self._print_field('Vehicle Type', data.get('vehicle_type'))
        self._print_field('Doors', data.get('doors'))
        
        self.stdout.write(f'\n{self.style.SUCCESS("ENGINE & POWERTRAIN")}')
        self.stdout.write('-' * 70)
        self._print_field('Engine Type', data.get('engine_type', '').replace('_', ' ').title())
        self._print_field('Engine Size', data.get('engine_size'))
        self._print_field('Cylinders', data.get('engine_cylinders'))
        self._print_field('Horsepower', f"{data.get('engine_hp')} HP" if data.get('engine_hp') else None)
        self._print_field('Kilowatts', f"{data.get('engine_kw')} kW" if data.get('engine_kw') else None)
        self._print_field('Transmission', data.get('transmission_type', '').replace('_', ' ').title())
        self._print_field('Transmission Speeds', data.get('transmission_speeds'))
        self._print_field('Drive Type', data.get('drive_type'))
        
        self.stdout.write(f'\n{self.style.SUCCESS("MANUFACTURER")}')
        self.stdout.write('-' * 70)
        self._print_field('Manufacturer', data.get('manufacturer'))
        self._print_field('Plant Country', data.get('plant_country'))
        self._print_field('Plant City', data.get('plant_city'))
        self._print_field('Series', data.get('series'))
        
        # Detailed information
        if detailed:
            self.stdout.write(f'\n{self.style.SUCCESS("SPECIFICATIONS")}')
            self.stdout.write('-' * 70)
            self._print_field('GVWR', data.get('gvwr'))
            self._print_field('Curb Weight', f"{data.get('curb_weight')} lbs" if data.get('curb_weight') else None)
            self._print_field('Wheelbase', data.get('wheelbase'))
            self._print_field('Track Width', data.get('track_width'))
            
            self.stdout.write(f'\n{self.style.SUCCESS("SAFETY FEATURES")}')
            self.stdout.write('-' * 70)
            self._print_field('Airbag Locations', data.get('airbag_locations'))
            self._print_field('ABS', data.get('abs'))
            self._print_field('ESC (Stability Control)', data.get('esc'))
            self._print_field('TPMS (Tire Pressure)', data.get('tpms'))
        
        # Vehicle summary
        self.stdout.write(f'\n{self.style.SUCCESS("VEHICLE SUMMARY")}')
        self.stdout.write('-' * 70)
        summary = decoder.get_vehicle_summary(vin, data=data)
        self.stdout.write(summary)
        
        self.stdout.write('\n' + '=' * 70)
        self.stdout.write(self.style.SUCCESS('✓ VIN decode test completed'))
        self.stdout.write('=' * 70 + '\n')
        
        if not detailed:
            self.stdout.write(self.style.NOTICE('Tip: Use --detailed flag to see all available information'))
    
    def _print_field(self, label, value):
        """Print a field with formatting"""
        if value:
            self.stdout.write(f'  {label:<25} {value}')
