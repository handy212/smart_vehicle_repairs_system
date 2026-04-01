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
from apps.diagnosis.services.baseline_test_procedures import (
    BASELINE_TEST_PROCEDURES,
    seed_baseline_test_procedures,
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
        self.assertEqual(diagnosis.status, 'not_started')
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

    def test_setting_decision_updates_approval_and_quotation_state(self):
        """Approval decisions should drive compatibility and quotation flags."""
        recommendation = RepairRecommendation.objects.create(
            diagnosis=self.diagnosis,
            recommendation_type='repair',
            description='Replace leaking water pump',
            priority='necessary',
        )

        recommendation.set_decision('approved', acted_by=self.technician_user, method='phone', notes='Customer approved by phone.')
        recommendation.request_quotation(requested_by=self.technician_user)
        recommendation.mark_quoted(quoted_by=self.technician_user)

        recommendation.set_decision('deferred', acted_by=self.technician_user, method='phone', notes='Customer wants to do this later.')
        recommendation.refresh_from_db()

        self.assertFalse(recommendation.customer_approved)
        self.assertEqual(recommendation.approval_status, 'deferred')
        self.assertEqual(recommendation.quotation_status, 'not_requested')
        self.assertIsNone(recommendation.quotation_requested_at)
        self.assertIsNone(recommendation.quoted_at)

    def test_recommendation_can_link_supporting_findings(self):
        """Recommendations should be able to reference supporting findings."""
        code = baker.make(DiagnosticCode, diagnosis=self.diagnosis, code_number='P0301', code_type='obd_ii')
        finding = baker.make(
            DiagnosisFinding,
            diagnosis=self.diagnosis,
            finding_title='Cylinder 1 misfire confirmed',
            category='engine',
            severity='major',
        )
        finding.diagnostic_codes.add(code)

        recommendation = RepairRecommendation.objects.create(
            diagnosis=self.diagnosis,
            recommendation_type='repair',
            description='Replace spark plug and inspect ignition coil',
            priority='necessary',
        )
        recommendation.findings.add(finding)

        self.assertEqual(recommendation.findings.count(), 1)
        self.assertEqual(recommendation.findings.first(), finding)


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

    def test_seed_baseline_test_procedures_is_idempotent(self):
        """Baseline test procedures should seed once and remain stable on rerun."""
        first_result = seed_baseline_test_procedures(created_by=self.technician_user)
        self.assertEqual(first_result['created'], len(BASELINE_TEST_PROCEDURES))
        self.assertEqual(first_result['existing'], 0)
        self.assertEqual(TestProcedureLibrary.objects.count(), len(BASELINE_TEST_PROCEDURES))

        second_result = seed_baseline_test_procedures(created_by=self.technician_user)
        self.assertEqual(second_result['created'], 0)
        self.assertEqual(second_result['existing'], len(BASELINE_TEST_PROCEDURES))
        self.assertEqual(TestProcedureLibrary.objects.count(), len(BASELINE_TEST_PROCEDURES))


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

    def test_patch_cannot_change_workflow_state(self, api_client, admin_user):
        """Diagnosis status must only change through lifecycle actions."""
        diagnosis = baker.make(Diagnosis, status='not_started', is_completed=False)
        api_client.force_authenticate(user=admin_user)

        response = api_client.patch(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/',
            {'status': 'completed'},
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        diagnosis.refresh_from_db()
        assert diagnosis.status == 'not_started'
        assert diagnosis.is_completed is False

    def test_sync_obd_codes_normalizes_code_type(self, api_client, admin_user):
        """OBD sync should store normalized code values."""
        diagnosis = baker.make(Diagnosis)
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/sync_obd_codes/',
            {
                'codes': [
                    {
                        'code': 'p0301',
                        'description': 'Cylinder 1 Misfire Detected',
                        'status': 'ACTIVE',
                    }
                ]
            },
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        code = DiagnosticCode.objects.get(diagnosis=diagnosis, code_number='P0301')
        assert code.code_type == 'obd_ii'
        assert code.status == 'active'

    def test_create_code_infers_type_from_code_number(self, api_client, admin_user):
        """Diagnostic code creation should infer type when code_type is omitted."""
        diagnosis = baker.make(Diagnosis)
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            '/api/diagnosis/codes/',
            {
                'diagnosis': diagnosis.id,
                'code_number': 'C0031',
                'description': 'Left Front Wheel Speed Sensor Circuit',
                'severity': 'warning',
                'status': 'active',
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        code = DiagnosticCode.objects.get(diagnosis=diagnosis, code_number='C0031')
        assert code.code_type == 'chassis'

    def test_add_recommendation_cannot_set_customer_approved(self, api_client, admin_user):
        """Recommendation approval state must not be writable through create/update payloads."""
        diagnosis = baker.make(Diagnosis)
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/add_recommendation/',
            {
                'recommendation_type': 'repair',
                'description': 'Replace worn serpentine belt',
                'priority': 'necessary',
                'customer_approved': True,
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not diagnosis.repair_recommendations.exists()

    def test_add_recommendation_cannot_set_cost_fields(self, api_client, admin_user):
        """Diagnosis recommendation entry should not accept pricing fields."""
        diagnosis = baker.make(Diagnosis)
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/add_recommendation/',
            {
                'recommendation_type': 'repair',
                'description': 'Replace battery',
                'priority': 'necessary',
                'estimated_parts_cost': '150.00',
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not diagnosis.repair_recommendations.exists()

    def test_add_recommendation_cannot_set_labor_hours(self, api_client, admin_user):
        """Diagnosis recommendation entry should not accept labor planning fields."""
        diagnosis = baker.make(Diagnosis)
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/add_recommendation/',
            {
                'recommendation_type': 'repair',
                'description': 'Remove and inspect front caliper',
                'priority': 'necessary',
                'estimated_labor_hours': '1.50',
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not diagnosis.repair_recommendations.exists()

    def test_add_recommendation_can_link_findings_from_same_diagnosis(self, api_client, admin_user):
        """Recommendations should link to findings from the same diagnosis only."""
        diagnosis = baker.make(Diagnosis)
        finding = baker.make(
            DiagnosisFinding,
            diagnosis=diagnosis,
            finding_title='Ignition primary circuit fault',
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/add_recommendation/',
            {
                'recommendation_type': 'repair',
                'description': 'Repair ignition wiring and replace damaged connector',
                'priority': 'necessary',
                'findings': [finding.id],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        recommendation = diagnosis.repair_recommendations.get()
        assert list(recommendation.findings.values_list('id', flat=True)) == [finding.id]

    def test_add_recommendation_rejects_findings_from_another_diagnosis(self, api_client, admin_user):
        """Recommendations must not link to findings from a different diagnosis."""
        diagnosis = baker.make(Diagnosis)
        other_diagnosis = baker.make(Diagnosis)
        foreign_finding = baker.make(
            DiagnosisFinding,
            diagnosis=other_diagnosis,
            finding_title='Foreign finding',
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/add_recommendation/',
            {
                'recommendation_type': 'repair',
                'description': 'This should fail',
                'priority': 'necessary',
                'findings': [foreign_finding.id],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not diagnosis.repair_recommendations.exists()

    def test_approve_recommendations_uses_decision_workflow(self, api_client, admin_user):
        """Approval endpoint should store the richer recommendation workflow state."""
        diagnosis = baker.make(Diagnosis)
        recommendation = baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='pending_approval',
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/approve_recommendations/',
            {
                'recommendation_ids': [recommendation.id],
                'decision': 'approved',
                'decision_method': 'supervisor_instruction',
                'decision_notes': 'Approved after call with customer.',
            },
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        recommendation.refresh_from_db()
        assert recommendation.approval_status == 'approved'
        assert recommendation.customer_approved is True
        assert recommendation.decision_method == 'supervisor_instruction'
        assert recommendation.decision_notes == 'Approved after call with customer.'
        assert recommendation.decision_by == admin_user

    def test_submit_recommendations_for_quote_requires_approved_status(self, api_client, admin_user):
        """Only approved recommendations can move to stores quotation."""
        diagnosis = baker.make(Diagnosis)
        approved = baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='approved',
            quotation_status='not_requested',
        )
        pending = baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='pending_approval',
            quotation_status='not_requested',
        )
        api_client.force_authenticate(user=admin_user)

        error_response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/submit_recommendations_for_quote/',
            {
                'recommendation_ids': [approved.id, pending.id],
            },
            format='json',
        )

        assert error_response.status_code == status.HTTP_400_BAD_REQUEST

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/submit_recommendations_for_quote/',
            {
                'recommendation_ids': [approved.id],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        approved.refresh_from_db()
        assert approved.quotation_status == 'requested'
        assert approved.quotation_requested_by == admin_user

    def test_convert_selected_recommendations_requires_quotation_ready(self, api_client, admin_user):
        """Selected recommendations must be quoted before conversion to tasks."""
        diagnosis = baker.make(Diagnosis)
        recommendation = baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='approved',
            quotation_status='requested',
            converted_to_task=None,
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/convert_recommendations_to_tasks/',
            {
                'recommendation_ids': [recommendation.id],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        recommendation.refresh_from_db()
        assert recommendation.converted_to_task_id is None

    def test_mark_recommendations_quoted_enables_task_conversion(self, api_client, admin_user):
        """Quotation-ready recommendations should be eligible for task creation."""
        diagnosis = baker.make(Diagnosis)
        recommendation = baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='approved',
            quotation_status='requested',
            converted_to_task=None,
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/mark_recommendations_quoted/',
            {
                'recommendation_ids': [recommendation.id],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        recommendation.refresh_from_db()
        assert recommendation.quotation_status == 'quoted'
        assert recommendation.quoted_by == admin_user

    def test_quotation_queue_lists_requested_recommendations(self, api_client, admin_user):
        """Stores queue should list approved recommendations awaiting quotation."""
        diagnosis = baker.make(Diagnosis)
        queued = baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='approved',
            quotation_status='requested',
        )
        baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='approved',
            quotation_status='quoted',
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.get('/api/diagnosis/recommendations/quotation_queue/')

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get('results', response.data)
        assert len(results) == 1
        assert results[0]['id'] == queued.id

    def test_test_procedure_search_auto_seeds_baseline_library(self, api_client, admin_user):
        """Searching the procedure library should bootstrap baseline templates when empty."""
        TestProcedureLibrary.objects.all().delete()
        api_client.force_authenticate(user=admin_user)

        response = api_client.get(
            '/api/diagnosis/test-procedures/',
            {'search': 'battery'},
        )

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get('results', response.data)
        assert any(item['name'] == 'Battery Voltage Test' for item in results)
        assert TestProcedureLibrary.objects.filter(name='Battery Voltage Test').exists()
