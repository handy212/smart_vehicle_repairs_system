"""
Tests for diagnosis app.
"""
import pytest
from django.apps import apps as django_apps
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from decimal import Decimal
from rest_framework import status
from rest_framework.test import APIClient, APITestCase
from model_bakery import baker

from apps.accounts.admin_models import SystemModule
from apps.accounts.permission_models import Permission, Role

from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder, WorkOrderPart
from apps.branches.models import Branch
from apps.diagnosis.models import (
    Diagnosis, RepairRecommendation,
    DiagnosticCode, DiagnosticTest,
    DiagnosisFinding, DiagnosisPhoto,
    TestProcedureLibrary as ProcedureLibrary, DiagnosticCodeLibrary,
    DiagnosisHistory
)
from apps.inventory.models import Part, PartCategory
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
            customer_complaint='Car won\'t start',
            diagnostic_notes='Starter motor fails load test.',
            status='in_progress',
            started_at=timezone.now(),
        )
        diagnosis.complete(requires_approval=False)
        self.assertTrue(diagnosis.is_completed)
        self.assertEqual(diagnosis.status, 'completed')
        self.assertIsNotNone(diagnosis.completed_at)

    def test_reopen_completed_diagnosis_for_revision_before_approval(self):
        """Completed diagnoses can be revised while customer approval is still pending."""
        diagnosis = Diagnosis.objects.create(
            work_order=self.work_order,
            technician=self.technician_user,
            customer_complaint='Car won\'t start',
            diagnostic_notes='Starter motor fails load test.',
            status='in_progress',
            started_at=timezone.now(),
        )
        diagnosis.submit_for_approval(user=self.technician_user)

        diagnosis.reopen_for_revision(
            user=self.technician_user,
            reason='Customer asked for revised recommendation.',
        )

        diagnosis.refresh_from_db()
        self.work_order.refresh_from_db()
        self.assertFalse(diagnosis.is_completed)
        self.assertEqual(diagnosis.status, 'in_progress')
        self.assertIsNone(diagnosis.completed_at)
        self.assertEqual(self.work_order.status, 'diagnosis')
        self.assertIsNone(self.work_order.diagnosis_completed_at)

    def test_reopen_completed_diagnosis_blocks_after_customer_approval(self):
        """Approved work cannot silently rewrite the diagnosis the customer accepted."""
        diagnosis = Diagnosis.objects.create(
            work_order=self.work_order,
            technician=self.technician_user,
            customer_complaint='Car won\'t start',
            diagnostic_notes='Starter motor fails load test.',
            status='in_progress',
            started_at=timezone.now(),
        )
        diagnosis.submit_for_approval(user=self.technician_user)
        self.work_order.approved_by_customer = True
        self.work_order.status = 'approved'
        self.work_order.save(update_fields=['approved_by_customer', 'status'])

        with self.assertRaises(ValueError):
            diagnosis.reopen_for_revision(user=self.technician_user)

    def test_submit_for_approval_keeps_diagnosis_open_until_customer_decision(self):
        """Sending for approval should notify workflow without final completion."""
        diagnosis = Diagnosis.objects.create(
            work_order=self.work_order,
            technician=self.technician_user,
            customer_complaint='Car won\'t start',
            diagnostic_notes='Starter motor fails load test.',
            status='in_progress',
            started_at=timezone.now(),
        )

        diagnosis.submit_for_approval(user=self.technician_user)

        diagnosis.refresh_from_db()
        self.work_order.refresh_from_db()
        self.assertFalse(diagnosis.is_completed)
        self.assertEqual(diagnosis.status, 'awaiting_approval')
        self.assertIsNone(diagnosis.completed_at)
        self.assertEqual(self.work_order.status, 'awaiting_approval')
        self.assertIsNotNone(self.work_order.approval_requested_at)

    def test_complete_approval_diagnosis_requires_customer_approval_first(self):
        diagnosis = Diagnosis.objects.create(
            work_order=self.work_order,
            technician=self.technician_user,
            customer_complaint='Car won\'t start',
            diagnostic_notes='Starter motor fails load test.',
            status='in_progress',
            started_at=timezone.now(),
        )

        diagnosis.submit_for_approval(user=self.technician_user)

        with self.assertRaises(ValueError):
            diagnosis.complete(requires_approval=True)

        self.work_order.approved_by_customer = True
        self.work_order.status = 'approved'
        self.work_order.save(update_fields=['approved_by_customer', 'status'])

        diagnosis.complete(requires_approval=True)
        diagnosis.refresh_from_db()
        self.assertTrue(diagnosis.is_completed)
        self.assertEqual(diagnosis.status, 'completed')

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
        procedure = ProcedureLibrary.objects.create(
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
        procedure = ProcedureLibrary.objects.create(
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
        self.assertEqual(ProcedureLibrary.objects.count(), len(BASELINE_TEST_PROCEDURES))

        second_result = seed_baseline_test_procedures(created_by=self.technician_user)
        self.assertEqual(second_result['created'], 0)
        self.assertEqual(second_result['existing'], len(BASELINE_TEST_PROCEDURES))
        self.assertEqual(ProcedureLibrary.objects.count(), len(BASELINE_TEST_PROCEDURES))


class DiagnosticCodeLibraryModelTest(TestCase):
    """Test cases for DiagnosticCodeLibrary model."""

    def test_create_code_library_entry(self):
        """Test creating a code library entry."""
        code = DiagnosticCodeLibrary.objects.create(
            code_number='ZTEST0301',
            code_type='obd_ii',
            title='Cylinder 1 Misfire',
            description='Misfire detected in cylinder 1',
            severity='critical',
            common_causes=['Faulty spark plug', 'Bad ignition coil'],
            common_fixes=['Replace spark plug', 'Test ignition system']
        )
        self.assertEqual(code.code_number, 'ZTEST0301')
        self.assertEqual(len(code.common_causes), 2)

    def test_increment_use_count(self):
        """Test incrementing use count."""
        code = DiagnosticCodeLibrary.objects.create(
            code_number='ZTEST0420',
            code_type='obd_ii',
            title='Catalyst System Efficiency Below Threshold',
            description='Catalyst efficiency low',
            severity='warning'
        )
        code.increment_use_count()
        self.assertEqual(code.use_count, 1)


class CustomerPortalDiagnosisAPITest(APITestCase):
    """Customer portal work-order page loads diagnosis via list filter."""

    def setUp(self):
        SystemModule.objects.get_or_create(
            slug='diagnosis',
            defaults={'name': 'Diagnosis', 'is_enabled': True},
        )
        self.customer_user = User.objects.create_user(
            email='portal_customer@test.com',
            username='portal_customer',
            password='test123',
            role='customer',
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        role, _ = Role.objects.get_or_create(
            code='customer',
            defaults={'name': 'Customer', 'is_active': True, 'is_system': True},
        )
        perm, _ = Permission.objects.get_or_create(
            code='view_own_workorders',
            defaults={
                'name': 'View Own Work Orders',
                'category': 'workorders',
                'is_active': True,
                'is_system': True,
            },
        )
        role.permissions.add(perm)

        self.other_user = User.objects.create_user(
            email='other_portal@test.com',
            username='other_portal',
            password='test123',
            role='customer',
        )
        self.other_customer = Customer.objects.create(user=self.other_user)

        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109187',
            license_plate='ABC124',
            current_mileage=50000,
        )
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            customer_concerns='Noise from engine',
            odometer_in=50000,
            status='diagnosis',
        )
        self.diagnosis = Diagnosis.objects.create(
            work_order=self.work_order,
            customer_complaint='Noise from engine',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.customer_user)

    def test_customer_can_list_diagnosis_by_work_order(self):
        response = self.client.get(
            '/api/diagnosis/diagnoses/',
            {'work_order': self.work_order.id},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], self.diagnosis.id)

    def test_customer_cannot_list_other_customers_diagnosis(self):
        other_vehicle = Vehicle.objects.create(
            owner=self.other_customer,
            make='Honda',
            model='Civic',
            year=2019,
            vin='1HGBH41JXMN109188',
            license_plate='XYZ999',
            current_mileage=40000,
        )
        other_work_order = WorkOrder.objects.create(
            customer=self.other_customer,
            vehicle=other_vehicle,
            customer_concerns='Other issue',
            odometer_in=40000,
        )
        other_diagnosis = Diagnosis.objects.create(
            work_order=other_work_order,
            customer_complaint='Other issue',
        )
        response = self.client.get(
            '/api/diagnosis/diagnoses/',
            {'work_order': other_work_order.id},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 0)
        self.assertNotIn(other_diagnosis.id, [row['id'] for row in results])

    def test_customer_cannot_create_diagnosis(self):
        response = self.client.post(
            '/api/diagnosis/diagnoses/',
            {
                'work_order': self.work_order.id,
                'customer_complaint': 'New complaint',
            },
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


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

    def test_retrieve_diagnosis_with_wrong_active_branch_returns_clear_error(self, api_client, admin_user):
        """Diagnosis detail should explain branch-context mismatches instead of returning a misleading 404."""
        branch_a = baker.make(Branch, name='Branch A', code='BRA', is_active=True)
        branch_b = baker.make(Branch, name='Branch B', code='BRB', is_active=True)
        diagnosis = baker.make(Diagnosis, work_order__branch=branch_a)

        api_client.force_authenticate(user=admin_user)
        response = api_client.get(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/',
            HTTP_X_BRANCH_ID=str(branch_b.id),
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Active branch context does not match this diagnosis' in response.data['error']
        assert 'X-Branch-ID' in response.data['error']

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

    def test_reopen_completed_diagnosis_for_revision(self, api_client, admin_user):
        """Staff can reopen a completed diagnosis before customer approval is granted."""
        diagnosis = baker.make(
            Diagnosis,
            status='completed',
            is_completed=True,
            completed_at=timezone.now(),
            work_order__status='awaiting_approval',
            work_order__approved_by_customer=False,
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/reopen/',
            {'reason': 'Customer requested changes'},
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        diagnosis.refresh_from_db()
        diagnosis.work_order.refresh_from_db()
        assert diagnosis.status == 'in_progress'
        assert diagnosis.is_completed is False
        assert diagnosis.completed_at is None
        assert diagnosis.work_order.status == 'diagnosis'

    def test_reopen_completed_diagnosis_rejects_approved_work(self, api_client, admin_user):
        """The revision endpoint must not unlock a customer-approved diagnosis."""
        diagnosis = baker.make(
            Diagnosis,
            status='completed',
            is_completed=True,
            completed_at=timezone.now(),
            work_order__status='approved',
            work_order__approved_by_customer=True,
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/reopen/',
            {'reason': 'Change after approval'},
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        diagnosis.refresh_from_db()
        assert diagnosis.status == 'completed'
        assert diagnosis.is_completed is True

    def test_submit_for_approval_keeps_diagnosis_uncompleted(self, api_client, admin_user):
        """Send-for-approval should move customer approval workflow without completing diagnosis."""
        diagnosis = baker.make(
            Diagnosis,
            status='in_progress',
            is_completed=False,
            started_at=timezone.now(),
            diagnostic_notes='Alternator charging output is below spec.',
            work_order__status='diagnosis',
            work_order__approved_by_customer=False,
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/submit_for_approval/',
            {},
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        diagnosis.refresh_from_db()
        diagnosis.work_order.refresh_from_db()
        assert diagnosis.status == 'awaiting_approval'
        assert diagnosis.is_completed is False
        assert diagnosis.completed_at is None
        assert diagnosis.work_order.status == 'awaiting_approval'
        assert diagnosis.work_order.approval_requested_at is not None

    def test_submit_for_approval_blocks_approved_recommendation_without_estimate(self, api_client, admin_user):
        """Approval requests must include estimates even when a recommendation was staff-approved."""
        diagnosis = baker.make(
            Diagnosis,
            status='in_progress',
            is_completed=False,
            started_at=timezone.now(),
            work_order__status='diagnosis',
            work_order__approved_by_customer=False,
        )
        baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='approved',
            quotation_status='not_requested',
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/submit_for_approval/',
            {},
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'sent to stores for estimate' in response.data['error']

    def test_submit_for_approval_publishes_stores_draft_estimate(self, api_client, admin_user):
        """Stores draft estimates become customer-visible only when approval is submitted."""
        if not django_apps.is_installed('apps.billing'):
            pytest.skip('Billing app is not installed in this test settings module.')

        Estimate = django_apps.get_model('billing', 'Estimate')
        EstimateLineItem = django_apps.get_model('billing', 'EstimateLineItem')
        diagnosis = baker.make(
            Diagnosis,
            status='in_progress',
            is_completed=False,
            started_at=timezone.now(),
            diagnostic_notes='Brake pads below spec.',
            work_order__status='diagnosis',
            work_order__approved_by_customer=False,
        )
        recommendation = baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='pending_approval',
            quotation_status='quoted',
            converted_to_task=None,
        )
        estimate = baker.make(
            Estimate,
            branch=diagnosis.work_order.branch,
            customer=diagnosis.work_order.customer,
            vehicle=diagnosis.work_order.vehicle,
            work_order=diagnosis.work_order,
            status='draft',
            valid_until=timezone.now().date(),
            created_by=admin_user,
        )
        EstimateLineItem.objects.create(
            estimate=estimate,
            item_type='part',
            description='Brake pads',
            notes=f'[DIAG-REC:{recommendation.id}] Quoted part',
            quantity=Decimal('1.00'),
            unit_price=Decimal('125.00'),
        )
        recommendation.quotation_estimate_id = estimate.id
        recommendation.quotation_estimate_number = estimate.estimate_number
        recommendation.save(update_fields=['quotation_estimate_id', 'quotation_estimate_number', 'updated_at'])
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/submit_for_approval/',
            {},
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['published_estimate_ids'] == [estimate.id]
        estimate.refresh_from_db()
        diagnosis.work_order.refresh_from_db()
        assert estimate.status == 'sent'
        assert estimate.sent_by == admin_user
        assert estimate.sent_at is not None
        assert diagnosis.work_order.status == 'awaiting_approval'

    def test_complete_requires_customer_approval_after_submit(self, api_client, admin_user):
        """A diagnosis awaiting approval should not be finally completed before approval."""
        diagnosis = baker.make(
            Diagnosis,
            status='awaiting_approval',
            is_completed=False,
            requires_approval=True,
            diagnostic_notes='Requires customer approval.',
            work_order__status='awaiting_approval',
            work_order__approved_by_customer=False,
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/complete/',
            {'requires_approval': True},
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'wait for customer approval' in response.data['error']

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
        assert response.data['id'] == code.id

    def test_create_test_response_includes_id(self, api_client, admin_user):
        """Diagnostic test creation responses should include the created id for UI chaining."""
        diagnosis = baker.make(Diagnosis)
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            '/api/diagnosis/tests/',
            {
                'diagnosis': diagnosis.id,
                'test_name': 'Air Intake Restriction Check',
                'category': 'mechanical',
                'status': 'fail',
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        created_test = DiagnosticTest.objects.get(diagnosis=diagnosis, test_name='Air Intake Restriction Check')
        assert response.data['id'] == created_test.id

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

    def test_add_recommendation_reuses_existing_inventory_part(self, api_client, admin_user):
        """Manual recommendation parts should preserve the selected catalog part."""
        diagnosis = baker.make(Diagnosis)
        category = PartCategory.objects.create(name='Recommendation Catalog')
        part = Part.objects.create(
            part_number='REC-001',
            name='Catalog Brake Pad',
            category=category,
            branch=diagnosis.work_order.branch,
            cost_price='45.00',
            selling_price='60.00',
            created_by=admin_user,
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/add_recommendation/',
            {
                'recommendation_type': 'replace',
                'description': 'Replace worn brake pads',
                'priority': 'necessary',
                'parts_needed': [
                    {
                        'part_id': part.id,
                        'part_name': 'Catalog Brake Pad',
                        'part_number': 'REC-001',
                        'quantity': 2,
                    }
                ],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        recommendation = diagnosis.repair_recommendations.get()
        assert recommendation.parts_needed[0]['part_id'] == part.id
        assert recommendation.parts_needed[0]['part_name'] == part.name
        assert recommendation.parts_needed[0]['part_number'] == part.part_number

    def test_add_recommendation_creates_placeholder_inventory_part_for_manual_entry(self, api_client, admin_user):
        """Manual recommendation parts should create a catalog record when no match exists."""
        diagnosis = baker.make(Diagnosis)
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/add_recommendation/',
            {
                'recommendation_type': 'replace',
                'description': 'Replace custom hose clamp',
                'priority': 'necessary',
                'parts_needed': [
                    {
                        'part_name': 'Custom Hose Clamp',
                        'part_number': 'CUST-HOSE-001',
                        'quantity': 1,
                    }
                ],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        recommendation = diagnosis.repair_recommendations.get()
        created_part = Part.objects.get(part_number='CUST-HOSE-001')

        assert recommendation.parts_needed[0]['part_id'] == created_part.id
        assert created_part.name == 'Custom Hose Clamp'
        assert str(created_part.cost_price) == '0.01'
        assert str(created_part.selling_price) == '0.01'

    def test_create_diagnosis_returns_detail_payload_with_id(self, api_client, admin_user):
        """Diagnosis create should return a usable detail payload for the frontend."""
        work_order = baker.make(WorkOrder)
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            '/api/diagnosis/diagnoses/',
            {
                'work_order': work_order.id,
                'customer_complaint': 'Brake noise',
                'initial_observations': 'Initial observation text',
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['id']
        assert response.data['work_order'] == work_order.id
        assert response.data['technician'] == admin_user.id

    def test_create_finding_returns_detail_payload_with_id(self, api_client, admin_user):
        """Finding create should return the read serializer payload with its id."""
        diagnosis = baker.make(Diagnosis)
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            '/api/diagnosis/findings/',
            {
                'diagnosis': diagnosis.id,
                'finding_title': 'Brake pad wear confirmed',
                'category': 'brakes',
                'description': 'Pads below spec.',
                'severity': 'major',
                'status': 'confirmed',
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['id']
        assert response.data['finding_title'] == 'Brake pad wear confirmed'
        assert response.data['status'] == 'confirmed'

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

    def test_approve_recommendations_allowed_while_diagnosis_waits_for_customer(self, api_client, admin_user):
        """Customer approval decisions must be allowed while diagnosis content edits stay locked."""
        diagnosis = baker.make(Diagnosis, status='awaiting_approval')
        diagnosis.work_order.status = 'awaiting_approval'
        diagnosis.work_order.requires_approval = True
        diagnosis.work_order.approved_by_customer = False
        WorkOrder.objects.filter(pk=diagnosis.work_order_id).update(
            status='awaiting_approval',
            requires_approval=True,
            approved_by_customer=False,
        )
        recommendation = baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='pending_approval',
            quotation_status='quoted',
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/approve_recommendations/',
            {
                'recommendation_ids': [recommendation.id],
                'decision': 'approved',
                'decision_method': 'portal',
                'decision_notes': 'Customer approved selected recommendation.',
            },
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        recommendation.refresh_from_db()
        assert recommendation.approval_status == 'approved'
        assert recommendation.customer_approved is True
        assert recommendation.decision_method == 'portal'

    def test_submit_recommendations_for_quote_accepts_pending_customer_approval(self, api_client, admin_user):
        """Pending customer recommendations can move to stores quotation before approval."""
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

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/submit_recommendations_for_quote/',
            {
                'recommendation_ids': [approved.id, pending.id],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        approved.refresh_from_db()
        pending.refresh_from_db()
        assert approved.quotation_status == 'requested'
        assert pending.quotation_status == 'requested'
        assert approved.quotation_requested_by == admin_user
        assert pending.quotation_requested_by == admin_user

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
        if not django_apps.is_installed('apps.billing'):
            pytest.skip('Billing app is not installed in this test settings module.')
        Estimate = django_apps.get_model('billing', 'Estimate')
        EstimateLineItem = django_apps.get_model('billing', 'EstimateLineItem')
        diagnosis = baker.make(Diagnosis)
        recommendation = baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='approved',
            quotation_status='requested',
            converted_to_task=None,
        )
        estimate = baker.make(
            Estimate,
            branch=diagnosis.work_order.branch,
            customer=diagnosis.work_order.customer,
            vehicle=diagnosis.work_order.vehicle,
            work_order=diagnosis.work_order,
            valid_until=timezone.now().date(),
            created_by=admin_user,
        )
        recommendation.quotation_estimate_id = estimate.id
        recommendation.quotation_estimate_number = estimate.estimate_number
        recommendation.save(update_fields=['quotation_estimate_id', 'quotation_estimate_number', 'updated_at'])
        EstimateLineItem.objects.create(
            estimate=estimate,
            item_type='part',
            description='Quoted part',
            notes=f'[DIAG-REC:{recommendation.id}] Quoted part',
            quantity=Decimal('1.00'),
            unit_price=Decimal('125.00'),
        )
        EstimateLineItem.objects.create(
            estimate=estimate,
            item_type='labor',
            description='Quoted labor',
            notes='Quoted labor',
            quantity=Decimal('2.00'),
            unit_price=Decimal('80.00'),
            labor_hours=Decimal('2.00'),
            labor_rate=Decimal('80.00'),
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
        assert recommendation.estimated_parts_cost == Decimal('125.00')
        assert recommendation.estimated_labor_cost == Decimal('0.00')
        assert recommendation.estimated_labor_hours == Decimal('0.00')
        assert recommendation.estimated_total_cost == Decimal('125.00')

    def test_mark_recommendations_quoted_requires_priced_estimate_lines(self, api_client, admin_user):
        """Stores cannot mark a recommendation quoted while generated estimate lines still have placeholder pricing."""
        if not django_apps.is_installed('apps.billing'):
            pytest.skip('Billing app is not installed in this test settings module.')
        Estimate = django_apps.get_model('billing', 'Estimate')
        EstimateLineItem = django_apps.get_model('billing', 'EstimateLineItem')
        diagnosis = baker.make(Diagnosis)
        recommendation = baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='pending_approval',
            quotation_status='requested',
            converted_to_task=None,
        )
        estimate = baker.make(
            Estimate,
            branch=diagnosis.work_order.branch,
            customer=diagnosis.work_order.customer,
            vehicle=diagnosis.work_order.vehicle,
            work_order=diagnosis.work_order,
            valid_until=timezone.now().date(),
            created_by=admin_user,
        )
        recommendation.quotation_estimate_id = estimate.id
        recommendation.quotation_estimate_number = estimate.estimate_number
        recommendation.save(update_fields=['quotation_estimate_id', 'quotation_estimate_number', 'updated_at'])
        EstimateLineItem.objects.create(
            estimate=estimate,
            item_type='part',
            description='Placeholder part',
            notes=f'[DIAG-REC:{recommendation.id}] Placeholder part',
            quantity=Decimal('1.00'),
            unit_price=Decimal('0.01'),
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/mark_recommendations_quoted/',
            {
                'recommendation_ids': [recommendation.id],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'unpriced estimate line' in response.data['error']
        recommendation.refresh_from_db()
        assert recommendation.quotation_status == 'requested'

    def test_convert_recommendations_to_tasks_creates_work_order_parts(self, api_client, admin_user):
        """Recommendation parts should become work-order part requisitions when converted."""
        diagnosis = baker.make(Diagnosis)
        recommendation = baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='approved',
            quotation_status='quoted',
            converted_to_task=None,
            description='Replace front brake pads',
            parts_needed=[
                {
                    'part_name': 'Front Brake Pad Set',
                    'part_number': 'BP-FRONT',
                    'quantity': 1,
                }
            ],
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/convert_recommendations_to_tasks/',
            {
                'recommendation_ids': [recommendation.id],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['parts_linked'] == 1

        recommendation.refresh_from_db()
        assert recommendation.converted_to_task_id is not None
        assert recommendation.converted_to_task.is_workflow_task is False

        work_order_part = WorkOrderPart.objects.get(
            work_order=diagnosis.work_order,
            part_number='BP-FRONT',
        )
        assert work_order_part.task_id == recommendation.converted_to_task_id
        assert work_order_part.part_name == 'Front Brake Pad Set'
        assert work_order_part.status == 'pending'

    def test_submit_recommendations_for_quote_creates_store_part_requests(self, api_client, admin_user):
        """Sending recommendations to stores should create visible parts requests immediately."""
        diagnosis = baker.make(Diagnosis)
        recommendation = baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='approved',
            quotation_status='not_requested',
            converted_to_task=None,
            description='Replace front brake pads',
            parts_needed=[
                {
                    'part_name': 'Front Brake Pad Set',
                    'part_number': 'BP-STORE',
                    'quantity': 2,
                    'unit_cost': '75.00',
                }
            ],
        )
        api_client.force_authenticate(user=admin_user)

        response = api_client.post(
            f'/api/diagnosis/diagnoses/{diagnosis.id}/submit_recommendations_for_quote/',
            {
                'recommendation_ids': [recommendation.id],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['parts_synced'] == 1

        part_request = WorkOrderPart.objects.get(
            work_order=diagnosis.work_order,
            part_number='BP-STORE',
        )
        assert part_request.task_id is None
        assert part_request.status == 'pending'
        assert part_request.quantity == Decimal('2')

    def test_quotation_queue_lists_requested_recommendations(self, api_client, admin_user):
        """Stores queue should list active recommendations awaiting quotation."""
        diagnosis = baker.make(Diagnosis)
        queued = baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='pending_approval',
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
        ProcedureLibrary.objects.all().delete()
        api_client.force_authenticate(user=admin_user)

        response = api_client.get(
            '/api/diagnosis/test-procedures/',
            {'search': 'battery'},
        )

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get('results', response.data)
        assert any(item['name'] == 'Battery Voltage Test' for item in results)
        assert ProcedureLibrary.objects.filter(name='Battery Voltage Test').exists()
