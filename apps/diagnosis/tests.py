"""
Tests for diagnosis app.
"""
import pytest
from django.test import TestCase
from django.contrib.auth import get_user_model
from decimal import Decimal
from rest_framework import status
from rest_framework.test import APITestCase
from model_bakery import baker

from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder
from apps.diagnosis.models import (
    Diagnosis, RepairRecommendation,
    DiagnosticCode, DiagnosticTest,
    DiagnosisFinding, DiagnosisPhoto,
    TestProcedureLibrary, DiagnosticCodeLibrary,
    DiagnosisHistory
)

User = get_user_model()


class DiagnosisModelTest(TestCase):
    """Test cases for Diagnosis model."""

    def setUp(self):
        """Set up test data."""
        self.technician_user = User.objects.create_user(
            email='tech@test.com',
            username='technician',
            password='test123',
            first_name='Tech',
            last_name='User',
            role='technician'
        )
        self.customer_user = User.objects.create_user(
            email='customer@test.com',
            username='customer',
            password='test123',
            first_name='John',
            last_name='Doe',
            role='customer'
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='ABC123',
            current_mileage=50000
        )
        # WorkOrder number will be auto-generated, but we need branch or it will use timestamp
        # Let's create without specifying work_order_number and let it auto-generate
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            customer_concerns='Car won\'t start',
            odometer_in=50000,
            status='diagnosis'
        )

    def test_create_diagnosis(self):
        """Test creating a diagnosis."""
        diagnosis = Diagnosis.objects.create(
            work_order=self.work_order,
            technician=self.technician_user,
            customer_complaint='Car won\'t start',
            diagnostic_fee=Decimal('75.00')
        )
        self.assertEqual(diagnosis.work_order, self.work_order)
        self.assertEqual(diagnosis.technician, self.technician_user)
        self.assertEqual(diagnosis.status, 'in_progress')
        self.assertFalse(diagnosis.is_completed)

    def test_complete_diagnosis(self):
        """Test completing a diagnosis."""
        diagnosis = Diagnosis.objects.create(
            work_order=self.work_order,
            technician=self.technician_user,
            customer_complaint='Car won\'t start'
        )
        diagnosis.complete()
        self.assertTrue(diagnosis.is_completed)
        self.assertEqual(diagnosis.status, 'completed')
        self.assertIsNotNone(diagnosis.completed_at)

    def test_diagnostic_time_formatted(self):
        """Test diagnostic time formatting."""
        diagnosis = Diagnosis.objects.create(
            work_order=self.work_order,
            technician=self.technician_user,
            customer_complaint='Car won\'t start',
            diagnostic_time_hours=Decimal('2.5')
        )
        formatted = diagnosis.diagnostic_time_formatted
        self.assertEqual(formatted, '2h 30m')

    def test_one_diagnosis_per_work_order(self):
        """Test that only one diagnosis can exist per work order."""
        Diagnosis.objects.create(
            work_order=self.work_order,
            technician=self.technician_user,
            customer_complaint='Car won\'t start'
        )
        # Verify that work order has a diagnosis
        self.assertTrue(hasattr(self.work_order, 'diagnosis'))
        
        # OneToOneField prevents creating another diagnosis for the same work order
        # This is enforced at the database level, so creating another would raise IntegrityError
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            Diagnosis.objects.create(
                work_order=self.work_order,
                technician=self.technician_user,
                customer_complaint='Another complaint'
            )


class RepairRecommendationModelTest(TestCase):
    """Test cases for RepairRecommendation model."""

    def setUp(self):
        """Set up test data."""
        self.technician_user = User.objects.create_user(
            email='tech@test.com',
            username='technician',
            password='test123',
            role='technician'
        )
        self.customer = baker.make(Customer)
        self.vehicle = baker.make(Vehicle, owner=self.customer)
        # WorkOrder number will be auto-generated
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            customer_concerns='Test',
            odometer_in=50000
        )
        self.diagnosis = Diagnosis.objects.create(
            work_order=self.work_order,
            technician=self.technician_user,
            customer_complaint='Test complaint'
        )

    def test_create_repair_recommendation(self):
        """Test creating a repair recommendation."""
        recommendation = RepairRecommendation.objects.create(
            diagnosis=self.diagnosis,
            recommendation_type='replace',
            description='Replace battery',
            priority='necessary',
            estimated_parts_cost=Decimal('150.00'),
            estimated_labor_hours=Decimal('0.5'),
            estimated_labor_cost=Decimal('50.00')
        )
        self.assertEqual(recommendation.diagnosis, self.diagnosis)
        self.assertEqual(recommendation.estimated_total_cost, Decimal('200.00'))

    def test_auto_calculate_total_cost(self):
        """Test that total cost is auto-calculated."""
        recommendation = RepairRecommendation(
            diagnosis=self.diagnosis,
            recommendation_type='repair',
            description='Test repair',
            priority='necessary',
            estimated_parts_cost=Decimal('100.00'),
            estimated_labor_cost=Decimal('75.00')
        )
        recommendation.save()
        self.assertEqual(recommendation.estimated_total_cost, Decimal('175.00'))


class DiagnosticCodeModelTest(TestCase):
    """Test cases for DiagnosticCode model."""

    def setUp(self):
        """Set up test data."""
        self.technician_user = User.objects.create_user(
            email='tech@test.com',
            username='technician',
            password='test123',
            role='technician'
        )
        self.customer = baker.make(Customer)
        self.vehicle = baker.make(Vehicle, owner=self.customer)
        # WorkOrder number will be auto-generated
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            customer_concerns='Test',
            odometer_in=50000
        )
        self.diagnosis = Diagnosis.objects.create(
            work_order=self.work_order,
            technician=self.technician_user,
            customer_complaint='Test complaint'
        )

    def test_create_diagnostic_code(self):
        """Test creating a diagnostic code."""
        code = DiagnosticCode.objects.create(
            diagnosis=self.diagnosis,
            code_number='P0301',
            code_type='obd_ii',
            description='Cylinder 1 Misfire',
            severity='critical',
            freeze_frame_data={'rpm': 2500, 'speed': 45}
        )
        self.assertEqual(code.code_number, 'P0301')
        self.assertEqual(code.status, 'active')


class TestProcedureLibraryModelTest(TestCase):
    """Test cases for TestProcedureLibrary model."""

    def setUp(self):
        """Set up test data."""
        self.technician_user = User.objects.create_user(
            email='tech@test.com',
            username='technician',
            password='test123',
            role='technician'
        )

    def test_create_test_procedure(self):
        """Test creating a test procedure."""
        procedure = TestProcedureLibrary.objects.create(
            name='Compression Test',
            category='mechanical',
            description='Test engine compression',
            test_procedure='Remove spark plugs, test each cylinder',
            expected_result='All cylinders 120-140 PSI',
            tools_needed='Compression tester',
            created_by=self.technician_user
        )
        self.assertEqual(procedure.name, 'Compression Test')
        self.assertEqual(procedure.use_count, 0)

    def test_increment_use_count(self):
        """Test incrementing use count."""
        procedure = TestProcedureLibrary.objects.create(
            name='Voltage Test',
            category='electrical',
            description='Test battery voltage',
            created_by=self.technician_user
        )
        procedure.increment_use_count()
        self.assertEqual(procedure.use_count, 1)


class DiagnosticCodeLibraryModelTest(TestCase):
    """Test cases for DiagnosticCodeLibrary model."""

    def test_create_code_library_entry(self):
        """Test creating a code library entry."""
        code = DiagnosticCodeLibrary.objects.create(
            code_number='P0301',
            code_type='obd_ii',
            title='Cylinder 1 Misfire',
            description='Misfire detected in cylinder 1',
            severity='critical',
            common_causes=['Faulty spark plug', 'Bad ignition coil'],
            common_fixes=['Replace spark plug', 'Test ignition system']
        )
        self.assertEqual(code.code_number, 'P0301')
        self.assertEqual(len(code.common_causes), 2)

    def test_increment_use_count(self):
        """Test incrementing use count."""
        code = DiagnosticCodeLibrary.objects.create(
            code_number='P0420',
            code_type='obd_ii',
            title='Catalyst System Efficiency Below Threshold',
            description='Catalyst efficiency low',
            severity='warning'
        )
        code.increment_use_count()
        self.assertEqual(code.use_count, 1)


class DiagnosisHistoryModelTest(TestCase):
    """Test cases for DiagnosisHistory model."""

    def test_update_from_diagnosis(self):
        """Test updating history from diagnosis."""
        technician_user = User.objects.create_user(
            email='tech@test.com',
            username='technician',
            password='test123',
            role='technician'
        )
        customer = baker.make(Customer)
        vehicle = Vehicle.objects.create(
            owner=customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='ABC123',
            current_mileage=50000
        )
        # WorkOrder number will be auto-generated
        work_order = WorkOrder.objects.create(
            customer=customer,
            vehicle=vehicle,
            customer_concerns='Car won\'t start',
            odometer_in=50000
        )
        diagnosis = Diagnosis.objects.create(
            work_order=work_order,
            technician=technician_user,
            customer_complaint='Car won\'t start',
            root_cause='Dead battery',
            diagnostic_time_hours=Decimal('1.5')
        )
        
        # Add a recommendation (total cost is auto-calculated)
        RepairRecommendation.objects.create(
            diagnosis=diagnosis,
            description='Replace battery',
            estimated_parts_cost=Decimal('150.00'),
            estimated_labor_cost=Decimal('50.00')
        )
        
        # Update history
        history = DiagnosisHistory.update_from_diagnosis(diagnosis)
        self.assertEqual(history.vehicle_make, 'Toyota')
        self.assertEqual(history.vehicle_model, 'Camry')
        self.assertEqual(history.diagnosis_count, 1)
        self.assertEqual(history.avg_diagnostic_time, Decimal('1.5'))
        self.assertEqual(history.avg_repair_cost, Decimal('200.00'))


@pytest.mark.django_db
class TestDiagnosisAPI:
    """API tests for diagnosis endpoints."""

    def test_list_diagnoses(self, api_client, admin_user):
        """Test listing diagnoses."""
        api_client.force_authenticate(user=admin_user)
        response = api_client.get('/api/diagnosis/diagnoses/')
        assert response.status_code == status.HTTP_200_OK

    def test_create_diagnosis(self, api_client, admin_user):
        """Test creating a diagnosis."""
        work_order = baker.make(WorkOrder)
        api_client.force_authenticate(user=admin_user)
        response = api_client.post('/api/diagnosis/diagnoses/', {
            'work_order': work_order.id,
            'customer_complaint': 'Test complaint'
        })
        assert response.status_code == status.HTTP_201_CREATED
