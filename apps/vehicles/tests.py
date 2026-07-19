"""
Tests for vehicles app.
"""
import pytest
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APITestCase
from model_bakery import baker

from apps.accounts.admin_models import SystemModule
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle, VehicleDocument, VehicleMileageHistory

User = get_user_model()


class VehicleModelTest(TestCase):
    """Test cases for Vehicle model."""

    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            email='customer@test.com',
            username='customer',
            password='test123',
            first_name='John',
            last_name='Doe',
            phone='1234567890',
            role='customer'
        )
        self.branch = Branch.objects.create(
            name='Vehicle Model Test Branch',
            code='VMOD',
            created_by=self.user,
        )
        self.customer = Customer(user=self.user)
        self.customer._numbering_branch = self.branch
        self.customer.save()

    def test_create_vehicle(self):
        """Test creating a vehicle."""
        vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='ABC123',
            exterior_color='Blue',
            current_mileage=50000,
            engine_type='gasoline',
            transmission_type='automatic'
        )
        self.assertEqual(vehicle.make, 'Toyota')
        self.assertEqual(vehicle.model, 'Camry')
        self.assertEqual(vehicle.year, 2020)
        self.assertEqual(vehicle.owner, self.customer)

    def test_vehicle_string_representation(self):
        """Test vehicle string representation."""
        vehicle = baker.make(
            Vehicle,
            owner=self.customer,
            make='Honda',
            model='Civic',
            year=2019,
            license_plate='ABC123'
        )
        expected = "2019 Honda Civic (ABC123)"
        self.assertEqual(str(vehicle), expected)

    def test_vehicle_vin_validation(self):
        """Test VIN validation."""
        # Valid VIN (17 characters)
        vehicle = Vehicle(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='TEST123',
            current_mileage=50000
        )
        vehicle.full_clean()  # Should not raise

        # Invalid VIN (too short)
        vehicle.vin = 'INVALID'
        with self.assertRaises(ValidationError):
            vehicle.full_clean()

    def test_vehicle_year_validation(self):
        """Test vehicle year validation."""
        # Valid year
        vehicle = Vehicle(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='TEST123',
            current_mileage=50000
        )
        vehicle.full_clean()

        # Invalid year (too old)
        vehicle_invalid = Vehicle(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=1800,
            vin='1HGBH41JXMN109187',  # Different VIN
            license_plate='TEST124',
            current_mileage=50000
        )
        with self.assertRaises(ValidationError):
            vehicle_invalid.full_clean()

        # Invalid year (future)
        vehicle_future = Vehicle(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2150,
            vin='1HGBH41JXMN109188',  # Different VIN
            license_plate='TEST125',
            current_mileage=50000
        )
        with self.assertRaises(ValidationError):
            vehicle_future.full_clean()

    def test_vehicle_status_choices(self):
        """Test vehicle status choices."""
        valid_statuses = ['active', 'sold', 'totaled', 'in_service', 'inactive']
        for status in valid_statuses:
            vehicle = baker.make(Vehicle, owner=self.customer, status=status)
            self.assertEqual(vehicle.status, status)

    def test_vehicle_engine_type_choices(self):
        """Test vehicle engine type choices."""
        valid_types = ['gasoline', 'diesel', 'electric', 'hybrid', 'plug_in_hybrid']
        for engine_type in valid_types:
            vehicle = baker.make(Vehicle, owner=self.customer, engine_type=engine_type)
            self.assertEqual(vehicle.engine_type, engine_type)

    def test_vin_uniqueness(self):
        """Test that VIN must be unique."""
        # Create first vehicle
        Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='ABC123',
            current_mileage=50000
        )
        
        # Try to create another vehicle with same VIN
        with self.assertRaises(Exception):  # Should raise IntegrityError or ValidationError
            Vehicle.objects.create(
                owner=self.customer,
                make='Honda',
                model='Civic',
                year=2021,
                vin='1HGBH41JXMN109186',  # Duplicate VIN
                license_plate='XYZ789',
                current_mileage=30000
            )

    def test_license_plate_uniqueness(self):
        """Test that license plate must be unique."""
        # Create first vehicle
        Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='ABC123',
            current_mileage=50000
        )
        
        # Try to create another vehicle with same license plate
        with self.assertRaises(Exception):  # Should raise IntegrityError or ValidationError
            Vehicle.objects.create(
                owner=self.customer,
                make='Honda',
                model='Civic',
                year=2021,
                vin='2HGFC2F59JH123456',  # Different VIN
                license_plate='ABC123',  # Duplicate license plate
                current_mileage=30000
            )

    def test_vin_uniqueness_in_form(self):
        """Test VIN uniqueness validation in form."""
        from apps.vehicles.forms import VehicleForm
        
        # Create first vehicle
        Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='ABC123',
            current_mileage=50000
        )
        
        # Try to create form with duplicate VIN
        form_data = {
            'owner': self.customer.id,
            'vin': '1HGBH41JXMN109186',  # Duplicate
            'year': 2021,
            'make': 'Honda',
            'model': 'Civic',
            'license_plate': 'XYZ789',
            'current_mileage': 30000
        }
        form = VehicleForm(data=form_data)
        self.assertFalse(form.is_valid())
        self.assertIn('vin', form.errors)

    def test_license_plate_uniqueness_in_form(self):
        """Test license plate uniqueness validation in form."""
        from apps.vehicles.forms import VehicleForm
        
        # Create first vehicle
        Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='ABC123',
            current_mileage=50000
        )
        
        # Try to create form with duplicate license plate
        form_data = {
            'owner': self.customer.id,
            'vin': '2HGFC2F59JH123456',  # Different VIN
            'year': 2021,
            'make': 'Honda',
            'model': 'Civic',
            'license_plate': 'ABC123',  # Duplicate
            'current_mileage': 30000
        }
        form = VehicleForm(data=form_data)
        self.assertFalse(form.is_valid())
        self.assertIn('license_plate', form.errors)


class VehicleAPITest(APITestCase):
    """Test cases for Vehicle API."""

    def setUp(self):
        """Set up test data."""
        SystemModule.objects.update_or_create(
            slug='vehicles',
            defaults={'name': 'Vehicles', 'is_enabled': True},
        )
        self.admin_user = User.objects.create_user(
            email='admin@test.com',
            username='admin',
            password='admin123',
            role='admin',
            is_staff=True,
            is_superuser=True,
        )
        self.customer_user = User.objects.create_user(
            email='customer@test.com',
            username='customer',
            first_name='John',
            last_name='Doe',
            phone='1234567890',
            password='customer123',
            role='customer'
        )
        self.branch = Branch.objects.create(
            name='Vehicle API Branch',
            code='VAPI',
            created_by=self.admin_user,
        )
        self.customer = Customer.objects.create(
            user=self.customer_user
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='ABC123',
            current_mileage=50000
        )

    def test_list_vehicles_authenticated(self):
        """Test listing vehicles as authenticated user."""
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/vehicles/vehicles/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)

    def test_list_vehicles_unauthenticated(self):
        """Test listing vehicles as unauthenticated user."""
        response = self.client.get('/api/vehicles/vehicles/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_vehicle(self):
        """Test creating a vehicle via API."""
        self.client.force_authenticate(user=self.admin_user)
        data = {
            'owner': self.customer.id,
            'make': 'Honda',
            'model': 'Civic',
            'year': 2021,
            'vin': '2HGFC2F59JH123456',
            'license_plate': 'XYZ789',
                'exterior_color': 'Red',
                'current_mileage': 50000,
            'engine_type': 'gasoline',
            'transmission_type': 'manual'
        }
        response = self.client.post('/api/vehicles/vehicles/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Vehicle.objects.count(), 2)

    def test_create_vehicle_duplicate_vin(self):
        """Test creating a vehicle with duplicate VIN via API."""
        self.client.force_authenticate(user=self.admin_user)
        data = {
            'owner': self.customer.id,
            'make': 'Honda',
            'model': 'Civic',
            'year': 2021,
            'vin': '1HGBH41JXMN109186',  # Duplicate VIN
            'license_plate': 'XYZ789',
            'current_mileage': 50000,
            'engine_type': 'gasoline',
            'transmission_type': 'manual'
        }
        response = self.client.post('/api/vehicles/vehicles/', data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('vin', response.data)

    def test_create_vehicle_duplicate_license_plate(self):
        """Test creating a vehicle with duplicate license plate via API."""
        self.client.force_authenticate(user=self.admin_user)
        data = {
            'owner': self.customer.id,
            'make': 'Honda',
            'model': 'Civic',
            'year': 2021,
            'vin': '2HGFC2F59JH123456',  # Different VIN
            'license_plate': 'ABC123',  # Duplicate license plate
            'current_mileage': 50000,
            'engine_type': 'gasoline',
            'transmission_type': 'manual'
        }
        response = self.client.post('/api/vehicles/vehicles/', data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('license_plate', response.data)

    def test_retrieve_vehicle(self):
        """Test retrieving a specific vehicle."""
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(f'/api/vehicles/vehicles/{self.vehicle.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['make'], 'Toyota')

    def test_advanced_filters_support_ranges_and_case_insensitive_names(self):
        older = Vehicle.objects.create(
            owner=self.customer,
            make='Honda',
            model='Civic',
            year=2010,
            vin='2HGFC2F59JH123456',
            license_plate='OLD123',
            current_mileage=0,
        )
        Vehicle.objects.filter(pk=older.pk).update(
            created_at=timezone.now() - timedelta(days=30)
        )
        self.client.force_authenticate(user=self.admin_user)
        today = timezone.localdate()

        response = self.client.get('/api/vehicles/vehicles/', {
            'make': 'toyota',
            'model': 'camry',
            'year__gte': 2015,
            'year__lte': 2025,
            'created_at__gte': today,
            'created_at__lte': today,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [row['id'] for row in response.data['results']],
            [self.vehicle.id],
        )

    def test_update_vehicle(self):
        """Test updating a vehicle."""
        self.client.force_authenticate(user=self.admin_user)
        data = {
            'owner': self.customer.id,
            'make': 'Toyota',
            'model': 'Camry',
            'year': 2020,
            'vin': '1HGBH41JXMN109186',
              'exterior_color': 'Silver',  # Changed color
              'license_plate': 'ABC123',
              'current_mileage': 60000
        }
        response = self.client.put(f'/api/vehicles/vehicles/{self.vehicle.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.exterior_color, 'Silver')

    def test_delete_vehicle(self):
        """Test deleting a vehicle."""
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.delete(f'/api/vehicles/vehicles/{self.vehicle.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Vehicle.objects.count(), 0)


@pytest.mark.django_db
class TestVehicleModel:
    """Pytest-style tests for Vehicle model."""

    def test_vehicle_creation_with_baker(self):
        """Test vehicle creation using model_bakery."""
        customer = baker.make(Customer)
        vehicle = baker.make(Vehicle, owner=customer)
        assert vehicle.owner == customer
        assert vehicle.pk is not None

    def test_vehicle_mileage_tracking(self):
        """Test vehicle mileage tracking."""
        vehicle = baker.make(Vehicle, current_mileage=50000)
        assert vehicle.current_mileage == 50000

    def test_vehicle_condition_rating(self):
        """Test vehicle condition rating."""
        for rating in range(1, 6):  # 1-5 rating scale
            vehicle = baker.make(Vehicle, condition_rating=rating)
            assert vehicle.condition_rating == rating

    @pytest.mark.parametrize('engine_type', [
        'gasoline', 'diesel', 'electric', 'hybrid', 'plug_in_hybrid'
    ])
    def test_vehicle_engine_types(self, engine_type):
        """Test all valid engine types."""
        vehicle = baker.make(Vehicle, engine_type=engine_type)
        assert vehicle.engine_type == engine_type

    @pytest.mark.parametrize('transmission_type', [
        'automatic', 'manual', 'cvt', 'dual_clutch'
    ])
    def test_vehicle_transmission_types(self, transmission_type):
        """Test all valid transmission types."""
        vehicle = baker.make(Vehicle, transmission_type=transmission_type)
        assert vehicle.transmission_type == transmission_type


@pytest.mark.django_db
class TestVehicleDocuments:
    """Test vehicle document functionality."""

    def test_vehicle_document_creation(self):
        """Test creating a vehicle document."""
        vehicle = baker.make(Vehicle)
        document = baker.make(
            VehicleDocument,
            vehicle=vehicle,
            document_type='registration',
            title='Vehicle Registration'
        )
        assert document.vehicle == vehicle
        assert document.document_type == 'registration'

    def test_vehicle_multiple_documents(self):
        """Test vehicle can have multiple documents."""
        vehicle = baker.make(Vehicle)
        docs = baker.make(VehicleDocument, vehicle=vehicle, _quantity=3)
        assert vehicle.documents.count() == 3


@pytest.mark.django_db  
class TestServiceHistory:
    """Test service history functionality."""

    def test_service_history_creation(self):
        """Test creating service history."""
        vehicle = baker.make(Vehicle)
        service = baker.make(
            VehicleMileageHistory,
            vehicle=vehicle,
            notes='Regular oil change',
            mileage=25000
        )
        assert service.vehicle == vehicle
        assert service.notes == 'Regular oil change'
        assert service.mileage == 25000

    def test_service_history_ordering(self):
        """Test service history ordering by date."""
        vehicle = baker.make(Vehicle)
        # Create services with different dates
        service1 = baker.make(VehicleMileageHistory, vehicle=vehicle)
        service2 = baker.make(VehicleMileageHistory, vehicle=vehicle)
        
        services = VehicleMileageHistory.objects.filter(vehicle=vehicle).order_by('-recorded_date')
        assert len(services) == 2
