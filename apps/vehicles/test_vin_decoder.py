"""Unit tests for VIN decoder helpers (no live NHTSA calls)."""
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase

from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.vehicles.vin_decoder import (
    VehicleVINDecoder,
    apply_decoded_to_vehicle,
    get_vehicle_specs,
    vehicle_model_updates_from_decoded,
)
from apps.vehicles.wmi_decoder import (
    decode_model_year,
    decode_wmi_local,
    lookup_manufacturer,
    merge_wmi_fallback,
)

User = get_user_model()


class VehicleVINDecoderTests(SimpleTestCase):
    def test_get_vehicle_summary_reuses_decoded_data_without_second_call(self):
        decoder = VehicleVINDecoder()
        data = {
            'year': 2015,
            'make': 'TOYOTA',
            'model': 'FORTUNER',
            'trim': '',
            'engine_size': '2.7L I4',
            'transmission_type': 'automatic',
            'has_errors': True,
        }
        with patch.object(decoder, 'decode_vin') as decode_mock:
            summary = decoder.get_vehicle_summary('AHTKZ3FSX00200475', data=data)
        decode_mock.assert_not_called()
        self.assertIn('TOYOTA', summary)
        self.assertIn('FORTUNER', summary)

    def test_decode_marks_useful_fields_even_with_vpic_errors(self):
        decoder = VehicleVINDecoder()
        fake_vpic = {
            'Make': 'TOYOTA',
            'Model': 'Hilux',
            'ModelYear': '2018',
            'ErrorCode': '1,7',
            'ErrorText': '1 - Check Digit (9th position) does not calculate properly',
        }
        with patch.object(decoder, '_fetch_nhtsa_vpic', return_value=fake_vpic):
            success, data = decoder.decode_vin('AHTKZ3FSX00200475', timeout_seconds=1.0)
        self.assertTrue(success)
        self.assertTrue(data['has_errors'])
        self.assertTrue(data['has_useful_fields'])
        self.assertEqual(data['make'], 'TOYOTA')
        self.assertEqual(data['model'], 'Hilux')

    def test_get_vehicle_specs_accepts_partial_with_errors(self):
        fake = (
            True,
            {
                'make': 'TOYOTA',
                'model': 'Corolla',
                'year': 2010,
                'has_errors': True,
                'has_useful_fields': True,
                'engine_type': 'gasoline',
                'transmission_type': 'automatic',
            },
        )
        with patch('apps.vehicles.vin_decoder.decode_vin', return_value=fake):
            specs = get_vehicle_specs('1HGBH41JXMN109186')
        self.assertIsNotNone(specs)
        self.assertEqual(specs['make'], 'TOYOTA')
        self.assertEqual(specs['model'], 'Corolla')

    def test_decode_vin_passes_timeout(self):
        decoder = VehicleVINDecoder()
        with patch.object(decoder, '_fetch_nhtsa_vpic', return_value={
            'Make': 'HONDA',
            'Model': 'ACCORD',
            'ModelYear': '2018',
            'ErrorCode': '0',
            'ErrorText': '',
        }) as fetch:
            success, data = decoder.decode_vin('1HGBH41JXMN109186', timeout_seconds=7)
        self.assertTrue(success)
        fetch.assert_called_once()
        self.assertEqual(fetch.call_args.kwargs.get('timeout_seconds'), 7)
        self.assertTrue(data.get('has_useful_fields'))

    def test_wmi_local_toyota_africa(self):
        # pos10 (index 9) = A → 2010; WMI AHT → Toyota Africa
        data = decode_wmi_local('AHTKZ3FSXA0200475', reference_year=2026)
        self.assertEqual(data['make'], 'Toyota')
        self.assertEqual(data['region'], 'Africa')
        self.assertEqual(data['year'], 2010)  # code A → 2010 preferred over 1980
        self.assertTrue(data['has_useful_fields'])

    def test_wmi_year_prefers_recent_cycle(self):
        self.assertEqual(decode_model_year('L', reference_year=2026), 2020)
        self.assertEqual(decode_model_year('B', reference_year=2026), 2011)

    def test_merge_wmi_fills_blank_nhtsa_make(self):
        nhtsa = {
            'make': '',
            'model': '',
            'year': None,
            'has_errors': True,
            'error_message': '1 - Check Digit...',
            'has_useful_fields': False,
        }
        local = decode_wmi_local('AHTKZ3FSXA0200475', reference_year=2026)
        merged = merge_wmi_fallback(nhtsa, local)
        self.assertEqual(merged['make'], 'Toyota')
        self.assertEqual(merged['year'], 2010)
        self.assertIn('wmi_local', merged['decode_sources'])
        self.assertTrue(merged['has_useful_fields'])

    def test_decode_vin_uses_wmi_when_nhtsa_empty(self):
        decoder = VehicleVINDecoder()
        empty_vpic = {
            'Make': '',
            'Model': '',
            'ModelYear': '',
            'ErrorCode': '1,7,400',
            'ErrorText': '1 - Check Digit; 7 - Manufacturer not registered; 400 - Invalid Characters',
        }
        with patch.object(decoder, '_fetch_nhtsa_vpic', return_value=empty_vpic):
            success, data = decoder.decode_vin('AHTKZ3FSXA0200475', timeout_seconds=1.0)
        self.assertTrue(success)
        self.assertEqual(data['make'], 'Toyota')
        self.assertEqual(data['year'], 2010)
        self.assertEqual(data.get('model') or '', '')
        self.assertIn('wmi_local', data.get('decode_sources') or [])

    def test_decode_vin_wmi_when_nhtsa_times_out(self):
        import requests

        decoder = VehicleVINDecoder()
        with patch.object(decoder, '_fetch_nhtsa_vpic', side_effect=requests.Timeout()):
            success, data = decoder.decode_vin('MAT462271D0L00142', timeout_seconds=1.0)
        self.assertTrue(success)
        self.assertEqual(lookup_manufacturer('MAT'), 'Tata')
        self.assertEqual(data['make'], 'Tata')
        self.assertEqual(data.get('decode_sources'), ['wmi_local'])

    def test_vehicle_model_updates_preserves_non_blank(self):
        decoded = {
            'make': 'HONDA',
            'model': 'ACCORD',
            'year': 2018,
            'trim': 'EX',
            'engine_size': '2.0L',
        }
        updates = vehicle_model_updates_from_decoded(
            decoded,
            current={'make': 'TOYOTA', 'model': 'COROLLA', 'year': 2010, 'trim': '', 'engine_size': ''},
            only_blank=True,
        )
        self.assertNotIn('make', updates)
        self.assertNotIn('model', updates)
        self.assertNotIn('year', updates)
        self.assertEqual(updates.get('trim'), 'EX')
        self.assertEqual(updates.get('engine_size'), '2.0L')

    def test_apply_decoded_to_vehicle_sets_json_without_save(self):
        vehicle = SimpleNamespace(
            year=2010,
            make='TOYOTA',
            model='COROLLA',
            trim='',
            engine_type='gasoline',
            engine_size='',
            transmission_type='automatic',
            vin_decoded_data=None,
            vin_decoded_at=None,
        )
        decoded = {
            'make': 'HONDA',
            'model': 'ACCORD',
            'year': 2018,
            'engine_cylinders': 4,
            'fuel_type_primary': 'Gasoline',
            'drive_type': 'FWD',
            'has_useful_fields': True,
        }
        updates = apply_decoded_to_vehicle(vehicle, decoded, only_blank=True, save=False)
        self.assertEqual(vehicle.vin_decoded_data, decoded)
        self.assertIsNotNone(vehicle.vin_decoded_at)
        self.assertEqual(vehicle.make, 'TOYOTA')  # preserved
        self.assertIn('vin_decoded_data', updates)


class ApplyDecodedVehiclePersistTests(TestCase):
    def setUp(self):
        staff = User.objects.create_user(
            username='vin-staff@example.com',
            email='vin-staff@example.com',
            password='pass12345',
            role='admin',
        )
        Branch.objects.create(
            name='HQ', code='HQ', is_active=True, is_headquarters=True, created_by=staff,
        )
        owner_user = User.objects.create_user(
            username='owner@example.com',
            email='owner@example.com',
            password='pass12345',
            role='customer',
            first_name='Own',
            last_name='Er',
        )
        self.customer = Customer.objects.create(
            user=owner_user,
            customer_type='individual',
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            vin='1HGBH41JXMN109186',
            make='HONDA',
            model='ACCORD',
            year=2018,
            license_plate='VIN-DEC-1',
            current_mileage=0,
            engine_type='gasoline',
            transmission_type='automatic',
            vehicle_type='sedan',
            status='active',
        )

    def test_apply_decoded_persists_vin_decoded_data(self):
        decoded = {
            'make': 'HONDA',
            'model': 'ACCORD',
            'year': 2018,
            'engine_cylinders': 4,
            'engine_displacement_l': '2.0',
            'transmission_style': 'Automatic',
            'fuel_type_primary': 'Gasoline',
            'drive_type': 'FWD',
            'has_useful_fields': True,
        }
        apply_decoded_to_vehicle(self.vehicle, decoded, only_blank=True, save=True)
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.vin_decoded_data.get('engine_cylinders'), 4)
        self.assertEqual(self.vehicle.vin_decoded_data.get('drive_type'), 'FWD')
        self.assertIsNotNone(self.vehicle.vin_decoded_at)
