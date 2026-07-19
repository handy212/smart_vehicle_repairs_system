"""
Tests for workorders app.
"""
import pytest
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APITestCase, APIClient
from model_bakery import baker

from apps.accounts.admin_models import SystemModule
from apps.accounting.models import AccountingControl
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder, ServiceTask, WorkOrderPart, TechnicianTimeLog
from apps.workorders.serializers import WorkOrderDetailSerializer
from apps.inventory.models import Part
from apps.diagnosis.models import Diagnosis, RepairRecommendation

User = get_user_model()


class WorkOrderModelTest(TestCase):
    """Test cases for WorkOrder model."""

    def setUp(self):
        """Set up test data."""
        self.customer_user = User.objects.create_user(
            email='customer@test.com',
            username='customer',
            password='test123',
            first_name='John',
            last_name='Doe',
            phone='1234567890',
            role='customer'
        )
        self.technician_user = User.objects.create_user(
            email='tech@test.com',
            username='technician',
            password='test123',
            first_name='Tech',
            last_name='User',
            role='technician'
        )
        self.branch = Branch.objects.create(
            name='WO Model Test Branch',
            code='WOMOD',
            created_by=self.technician_user,
        )
        self.customer = Customer(user=self.customer_user)
        self.customer._numbering_branch = self.branch
        self.customer.save()
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='ABC123',
            current_mileage=50000
        )

    def test_create_workorder(self):
        """Test creating a work order."""
        workorder = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            customer_concerns='Oil change and inspection',
            odometer_in=50000,
            status='draft',
            priority='normal'
        )
        self.assertEqual(workorder.customer, self.customer)
        self.assertEqual(workorder.vehicle, self.vehicle)
        self.assertEqual(workorder.status, 'draft')
        self.assertEqual(workorder.priority, 'normal')

    def test_workorder_string_representation(self):
        """Test work order string representation."""
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            work_order_number='WO-2023-001'
        )
        expected = f"WO-2023-001 - {self.customer} - {self.vehicle}"
        self.assertEqual(str(workorder), expected)

    def test_workorder_status_choices(self):
        """Test work order status choices match the canonical lifecycle."""
        valid_statuses = [choice[0] for choice in WorkOrder.STATUS_CHOICES]
        for status in valid_statuses:
            workorder = baker.make(
                WorkOrder,
                customer=self.customer,
                vehicle=self.vehicle,
                status=status
            )
            self.assertEqual(workorder.status, status)

    def test_workorder_priority_choices(self):
        """Test work order priority choices."""
        valid_priorities = [choice[0] for choice in WorkOrder.PRIORITY_CHOICES]
        for priority in valid_priorities:
            workorder = baker.make(
                WorkOrder,
                customer=self.customer,
                vehicle=self.vehicle,
                priority=priority
            )
            self.assertEqual(workorder.priority, priority)

    def test_workorder_total_calculation(self):
        """Test work order total calculation."""
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            actual_labor_cost=Decimal('100.00'),
            actual_parts_cost=Decimal('50.00')
        )
        expected_total = Decimal('150.00')
        self.assertEqual(workorder.actual_total, expected_total)

    def test_workorder_detail_serializer_includes_service_coordinator_name(self):
        coordinator = User.objects.create_user(
            email='coordinator@test.com',
            username='coordinator',
            password='test123',
            first_name='Efua',
            last_name='Adjei',
            role='manager'
        )
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            service_coordinator=coordinator,
        )

        serializer = WorkOrderDetailSerializer(workorder)

        self.assertEqual(serializer.data['service_coordinator_name'], 'Efua Adjei')

    def test_workorder_detail_serializer_includes_estimate_and_invoice_summaries(self):
        from apps.billing.models import Estimate, Invoice

        accountant = User.objects.create_user(
            email='accounting@test.com',
            username='accounting',
            password='test123',
            first_name='Ama',
            last_name='Mensah',
            role='accountant'
        )
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
        )
        estimate = baker.make(
            Estimate,
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=workorder,
            reference_number=f'WO:{workorder.id}',
            estimate_number='HQ-EST000099',
            status='approved',
            total=Decimal('250.00'),
        )
        baker.make(
            Invoice,
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=workorder,
            estimate=estimate,
            invoice_number='HQ-INV000099',
            status='partial',
            total=Decimal('300.00'),
            amount_paid=Decimal('120.00'),
            amount_due=Decimal('180.00'),
            created_by=accountant,
        )

        serializer = WorkOrderDetailSerializer(workorder)

        self.assertEqual(serializer.data['estimate_summary']['estimate_number'], 'HQ-EST000099')
        self.assertEqual(serializer.data['estimate_summary']['total'], '250.00')
        self.assertEqual(serializer.data['invoice_summary']['invoice_number'], 'HQ-INV000099')
        self.assertEqual(serializer.data['invoice_summary']['amount_paid'], '120.00')

    def test_workorder_detail_serializer_includes_draft_invoice_summary(self):
        from apps.billing.models import Invoice

        accountant = User.objects.create_user(
            email='draftinv@test.com',
            username='draftinv_user',
            password='test123',
            first_name='Draft',
            last_name='Inv',
            role='accountant',
        )
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            status='completed',
        )
        baker.make(
            Invoice,
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=workorder,
            invoice_number='HQ-INV-DRAFT',
            status='draft',
            total=Decimal('99.00'),
            created_by=accountant,
        )

        serializer = WorkOrderDetailSerializer(workorder)
        self.assertIsNotNone(serializer.data['invoice_summary'])
        self.assertEqual(serializer.data['invoice_summary']['invoice_number'], 'HQ-INV-DRAFT')
        self.assertEqual(serializer.data['invoice_summary']['status'], 'draft')

    def test_workorder_detail_serializer_reflects_paid_invoice_and_quote_approval_dates(self):
        from apps.billing.models import Estimate, Invoice, Payment

        accountant = User.objects.create_user(
            email='billing@test.com',
            username='billing_user',
            password='test123',
            first_name='Kojo',
            last_name='Asare',
            role='accountant'
        )
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
        )
        estimate = baker.make(
            Estimate,
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=workorder,
            reference_number=f'WO:{workorder.id}',
            estimate_number='HQ-EST000120',
            status='approved',
            total=Decimal('315.00'),
            approved_date=timezone.now(),
        )
        invoice = baker.make(
            Invoice,
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=workorder,
            estimate=estimate,
            invoice_number='HQ-INV000120',
            status='sent',
            total=Decimal('315.00'),
            amount_paid=Decimal('0.00'),
            amount_due=Decimal('315.00'),
            created_by=accountant,
        )
        Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            bank_account=AccountingControl.get_settings().default_bank_account,
            status='completed',
            amount=Decimal('315.00'),
            processed_by=accountant,
        )

        invoice.refresh_from_db()
        serializer = WorkOrderDetailSerializer(workorder)

        self.assertEqual(serializer.data['estimate_summary']['estimate_number'], 'HQ-EST000120')
        self.assertIsNotNone(serializer.data['estimate_summary']['approved_date'])
        self.assertEqual(serializer.data['invoice_summary']['invoice_number'], 'HQ-INV000120')
        self.assertEqual(serializer.data['invoice_summary']['status'], 'paid')
        self.assertEqual(serializer.data['invoice_summary']['amount_paid'], '315.00')

    def test_workorder_quote_stage_tracks_waiting_for_stores_and_quote_ready(self):
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            status='diagnosis',
        )
        diagnosis = baker.make(
            Diagnosis,
            work_order=workorder,
            status='in_progress',
        )
        recommendation = baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='pending_approval',
            quotation_status='requested',
            converted_to_task=None,
        )

        serializer = WorkOrderDetailSerializer(workorder)
        self.assertEqual(workorder.get_current_quote_stage(), 'waiting_for_stores_quotation')
        self.assertEqual(serializer.data['current_quote_stage'], 'waiting_for_stores_quotation')
        self.assertEqual(serializer.data['current_quote_stage_display'], 'Waiting for Stores Quotation')

        recommendation.quotation_status = 'quoted'
        recommendation.save(update_fields=['quotation_status'])

        serializer = WorkOrderDetailSerializer(workorder)
        self.assertEqual(workorder.get_current_quote_stage(), 'waiting_for_customer_approval')
        self.assertEqual(serializer.data['current_quote_stage'], 'waiting_for_customer_approval')
        self.assertEqual(serializer.data['current_quote_stage_display'], 'Waiting for Customer Approval')

        recommendation.approval_status = 'approved'
        recommendation.save(update_fields=['approval_status'])

        serializer = WorkOrderDetailSerializer(workorder)
        self.assertEqual(workorder.get_current_quote_stage(), 'quotation_ready')
        self.assertEqual(serializer.data['current_quote_stage'], 'quotation_ready')
        self.assertEqual(serializer.data['current_quote_stage_display'], 'Quotation Ready')

    def test_workorder_quote_stage_tracks_approved_parts_flow(self):
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            status='approved',
            approved_by_customer=True,
        )
        diagnosis = baker.make(
            Diagnosis,
            work_order=workorder,
            status='completed',
        )
        baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='approved',
            quotation_status='quoted',
            converted_to_task=None,
        )

        baker.make(
            WorkOrderPart,
            work_order=workorder,
            part_name='Brake Pad Set',
            quantity=1,
            status='pending',
        )

        serializer = WorkOrderDetailSerializer(workorder)
        self.assertEqual(workorder.get_current_quote_stage(), 'approved_waiting_for_parts')
        self.assertEqual(serializer.data['current_quote_stage_display'], 'Approved | Waiting for Parts Allocation')

        workorder.parts.update(status='ready')
        serializer = WorkOrderDetailSerializer(workorder)
        self.assertEqual(workorder.get_current_quote_stage(), 'parts_ready_waiting_for_repairs')
        self.assertEqual(serializer.data['current_quote_stage_display'], 'Parts Ready | Waiting for Repairs')

    def test_workorder_cannot_complete_with_allocated_part_not_installed(self):
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            status='quality_check',
            quality_check_required=True,
            quality_check_completed=True,
            quality_check_passed=True,
        )
        baker.make(
            ServiceTask,
            work_order=workorder,
            status='completed',
            is_workflow_task=False,
            actual_hours=Decimal('1.50'),
            labor_rate=Decimal('80.00'),
        )
        baker.make(
            WorkOrderPart,
            work_order=workorder,
            part_name='Brake Pad Set',
            quantity=1,
            status='ready',
        )

        can_transition, error = workorder.can_transition_to('completed')

        self.assertFalse(can_transition)
        self.assertIn('installed or formally returned', error)

    def test_workorder_cannot_complete_when_returned_part_has_no_reason(self):
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            status='quality_check',
            quality_check_required=True,
            quality_check_completed=True,
            quality_check_passed=True,
        )
        baker.make(
            ServiceTask,
            work_order=workorder,
            status='completed',
            is_workflow_task=False,
            actual_hours=Decimal('1.00'),
            labor_rate=Decimal('80.00'),
        )
        baker.make(
            WorkOrderPart,
            work_order=workorder,
            part_name='Oil Filter',
            quantity=1,
            status='returned',
            resolution_notes='',
        )

        can_transition, error = workorder.can_transition_to('completed')

        self.assertFalse(can_transition)
        self.assertIn('return reason', error)

    def test_workorder_can_complete_when_completed_task_has_no_charge(self):
        """Task labor_cost is optional at execution; pricing is enforced at quote approval."""
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            status='quality_check',
            quality_check_required=True,
            quality_check_completed=True,
            quality_check_passed=True,
        )
        baker.make(
            ServiceTask,
            work_order=workorder,
            status='completed',
            is_workflow_task=False,
            labor_cost=Decimal('0.00'),
        )

        can_transition, error = workorder.can_transition_to('completed')

        self.assertTrue(can_transition, error)

    def test_repair_pause_records_paused_from_status(self):
        workorder = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            customer_concerns='Brake noise',
            odometer_in=50000,
            status='in_progress',
            primary_technician=self.technician_user,
            approved_by_customer=True,
            requires_approval=True,
        )

        workorder.transition_to('paused', user=self.technician_user)
        workorder.refresh_from_db()

        self.assertEqual(workorder.status, 'paused')
        self.assertEqual(workorder.paused_from_status, 'in_progress')

        workorder.transition_to('in_progress', user=self.technician_user)
        workorder.refresh_from_db()
        self.assertIsNone(workorder.paused_from_status)

    def test_flag_additional_work_resets_approval(self):
        workorder = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            customer_concerns='Brake noise',
            odometer_in=50000,
            status='in_progress',
            primary_technician=self.technician_user,
            approved_by_customer=True,
            requires_approval=True,
        )

        workorder.transition_to('additional_work_found', user=self.technician_user)
        workorder.refresh_from_db()

        self.assertEqual(workorder.status, 'additional_work_found')
        self.assertFalse(workorder.approved_by_customer)
        self.assertTrue(workorder.requires_approval)


class WorkOrderResumeAPITest(APITestCase):
    """Resume action should restore paused_from_status, not always in_progress."""

    def setUp(self):
        SystemModule.objects.update_or_create(
            slug='workorders',
            defaults={'name': 'Work Orders', 'is_enabled': True},
        )
        self.admin_user = User.objects.create_user(
            email='resume-admin@test.com',
            username='resume-admin',
            password='admin123',
            role='admin',
            is_staff=True,
            is_superuser=True,
        )
        self.customer = baker.make(Customer)
        self.vehicle = baker.make(Vehicle, owner=self.customer)

    def test_resume_api_returns_to_paused_from_diagnosis(self):
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            status='paused',
            paused_from_status='diagnosis',
            customer_concerns='Engine noise',
            odometer_in=50000,
        )
        baker.make(
            Diagnosis,
            work_order=workorder,
            technician=self.admin_user,
            status='paused',
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(f'/api/workorders/work-orders/{workorder.id}/resume/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        workorder.refresh_from_db()
        self.assertEqual(workorder.status, 'diagnosis')
        self.assertIsNone(workorder.paused_from_status)
        self.assertEqual(response.data.get('workflow_message'), 'Diagnosis resumed.')

    def test_resume_api_defaults_to_in_progress_when_paused_from_missing(self):
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            status='paused',
            paused_from_status=None,
            customer_concerns='Brake noise',
            odometer_in=50000,
            approved_by_customer=True,
            requires_approval=True,
            primary_technician=self.admin_user,
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(f'/api/workorders/work-orders/{workorder.id}/resume/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        workorder.refresh_from_db()
        self.assertEqual(workorder.status, 'in_progress')
        self.assertIsNone(workorder.paused_from_status)


class CompleteDiagnosisAutoStartAPITest(APITestCase):
    """complete_diagnosis without approval should route through start_work pipeline."""

    def setUp(self):
        SystemModule.objects.update_or_create(
            slug='workorders',
            defaults={'name': 'Work Orders', 'is_enabled': True},
        )
        self.admin_user = User.objects.create_user(
            email='diag-auto-admin@test.com',
            username='diag-auto-admin',
            password='admin123',
            role='admin',
            is_staff=True,
            is_superuser=True,
        )
        self.customer = baker.make(Customer)
        self.vehicle = baker.make(Vehicle, owner=self.customer)

    def test_complete_diagnosis_auto_start_moves_to_in_progress_with_tasks(self):
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            status='diagnosis',
            customer_concerns='Engine noise',
            odometer_in=50000,
            primary_technician=self.admin_user,
            requires_approval=False,
        )
        baker.make(
            ServiceTask,
            work_order=workorder,
            description='Inspect belts',
            is_workflow_task=False,
            status='pending',
            labor_rate=Decimal('80.00'),
            estimated_hours=Decimal('1.0'),
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/workorders/work-orders/{workorder.id}/complete_diagnosis/',
            {
                'diagnosis_notes': 'Worn serpentine belt identified.',
                'requires_approval': False,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        workorder.refresh_from_db()
        self.assertEqual(workorder.status, 'in_progress')
        self.assertTrue(workorder.approved_by_customer)

    def test_complete_diagnosis_without_start_blockers_stays_approved(self):
        workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            status='diagnosis',
            customer_concerns='Intermittent stall',
            odometer_in=50000,
            requires_approval=False,
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/workorders/work-orders/{workorder.id}/complete_diagnosis/',
            {
                'diagnosis_notes': 'Needs further testing before repairs.',
                'requires_approval': False,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        workorder.refresh_from_db()
        self.assertEqual(workorder.status, 'approved')
        self.assertTrue(workorder.approved_by_customer)


class ServiceTaskModelTest(TestCase):
    """Test cases for ServiceTask model."""

    def setUp(self):
        """Set up test data."""
        self.technician = baker.make(User, role='technician')
        self.branch = Branch.objects.create(
            name='Service Task Test Branch',
            code='STTEST',
            created_by=self.technician,
        )
        self.customer = Customer(user=baker.make(User, role='customer'))
        self.customer._numbering_branch = self.branch
        self.customer.save()
        self.vehicle = baker.make(Vehicle, owner=self.customer)
        self.workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
        )

    def test_create_service_task(self):
        """Test creating a service task."""
        task = ServiceTask.objects.create(
            work_order=self.workorder,
            description='Change engine oil and filter',
            estimated_hours=Decimal('1.0'),
            labor_rate=Decimal('80.00'),
            assigned_to=self.technician,
            status='pending'
        )
        self.assertEqual(task.work_order, self.workorder)
        self.assertEqual(task.description, 'Change engine oil and filter')
        self.assertEqual(task.estimated_hours, Decimal('1.0'))
        self.assertEqual(task.assigned_to, self.technician)

    def test_service_task_cost_calculation(self):
        """Test service task cost calculation."""
        task = baker.make(
            ServiceTask,
            work_order=self.workorder,
            actual_hours=Decimal('2.5'),
            labor_rate=Decimal('75.00')
        )
        expected_cost = Decimal('187.50')
        self.assertEqual(task.labor_cost, expected_cost)

    def test_service_task_status_choices(self):
        """Test service task status choices."""
        valid_statuses = [choice[0] for choice in ServiceTask.STATUS_CHOICES]
        for status in valid_statuses:
            task = baker.make(
                ServiceTask,
                work_order=self.workorder,
                status=status
            )
            self.assertEqual(task.status, status)


class WorkOrderAPITest(APITestCase):
    """Test cases for WorkOrder API."""

    def setUp(self):
        """Set up test data."""
        self.admin_user = User.objects.create_user(
            email='admin@test.com',
            username='admin',
            password='admin123',
            role='admin',
            is_staff=True
        )
        self.technician_user = User.objects.create_user(
            email='tech@test.com',
            username='technician',
            password='tech123',
            role='technician',
            is_staff=True
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

        def test_list_workorders_authenticated(self):
            """Test listing work orders as authenticated user."""
            self.client.force_authenticate(user=self.admin_user)
            baker.make(WorkOrder, customer=self.customer, vehicle=self.vehicle, _quantity=3)
            response = self.client.get('/api/workorders/work-orders/')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(len(response.data['results']), 3)

        def test_list_workorders_unauthenticated(self):
            """Test listing work orders as unauthenticated user."""
            response = self.client.get('/api/workorders/work-orders/')
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        def test_create_workorder(self):
            """Test creating a work order via API."""
            self.client.force_authenticate(user=self.admin_user)
            data = {
                'customer': self.customer.id,
                'vehicle': self.vehicle.id,
                'description': 'Regular maintenance',
                'status': 'draft',
                'priority': 'medium',
                'estimated_completion_date': '2023-12-31'
            }
            response = self.client.post('/api/workorders/work-orders/', data)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            self.assertEqual(WorkOrder.objects.count(), 1)

        def test_technician_can_view_assigned_workorders(self):
            """Test that technicians can view work orders assigned to them."""
            self.client.force_authenticate(user=self.technician_user)
            workorder = baker.make(
                WorkOrder,
                customer=self.customer,
                vehicle=self.vehicle,
                primary_technician=self.technician_user
            )
            response = self.client.get('/api/workorders/work-orders/')
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        def test_customer_cannot_create_workorder(self):
            """Test that customers cannot create work orders directly."""
            self.client.force_authenticate(user=self.customer_user)
            data = {
                'customer': self.customer.id,
                'vehicle': self.vehicle.id,
                'description': 'Regular maintenance',
                'status': 'draft'
            }
            response = self.client.post('/api/workorders/work-orders/', data)
            # This should be forbidden or return a different status based on your permissions
            self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED])


@pytest.mark.django_db
class TestWorkOrderWorkflow:
    """Test work order workflow and business logic."""

    def test_workorder_status_progression(self):
        """Test work order can store canonical lifecycle statuses."""
        workorder = baker.make(WorkOrder, status='draft')

        workorder.status = 'inspection'
        workorder.save()
        assert workorder.status == 'inspection'

        workorder.status = 'in_progress'
        workorder.save()
        assert workorder.status == 'in_progress'

        workorder.status = 'quality_check'
        workorder.save()
        assert workorder.status == 'quality_check'

        workorder.status = 'completed'
        workorder.save()
        assert workorder.status == 'completed'

    def test_workorder_with_multiple_tasks(self):
        """Test work order with multiple service tasks."""
        workorder = baker.make(WorkOrder)
        tasks = baker.make(ServiceTask, work_order=workorder, _quantity=3)
        
        assert workorder.tasks.count() == 3
        assert len(tasks) == 3

    def test_workorder_with_parts(self):
        """Test work order with parts."""
        workorder = baker.make(WorkOrder)
        part = baker.make(Part)
        workorder_part = baker.make(
            WorkOrderPart,
            work_order=workorder,
            inventory_part=part,
            part_name=part.name,
            quantity=Decimal('2'),
            unit_cost=Decimal('10.00'),
        )
        
        assert workorder.parts.count() == 1
        assert workorder_part.quantity == Decimal('2')

    def test_technician_time_logging(self):
        """Test technician time logging."""
        from django.utils import timezone

        workorder = baker.make(WorkOrder)
        technician = baker.make(User, role='technician')
        time_log = baker.make(
            TechnicianTimeLog,
            work_order=workorder,
            technician=technician,
            clock_in=timezone.now(),
            duration_hours=Decimal('3.5'),
            description='Test labor',
        )
        
        assert time_log.work_order == workorder
        assert time_log.technician == technician
        assert time_log.duration_hours == Decimal('3.5')


@pytest.mark.django_db
class TestWorkOrderCalculations:
    """Test work order financial calculations."""

    def test_labor_cost_calculation(self):
        """Test labor cost calculation."""
        workorder = baker.make(WorkOrder)
        task1 = baker.make(
            ServiceTask,
            work_order=workorder,
            description='Labor task 1',
            estimated_hours=Decimal('2.0'),
            labor_rate=Decimal('80.00'),
            labor_cost=Decimal('160.00'),
        )
        task2 = baker.make(
            ServiceTask,
            work_order=workorder,
            description='Labor task 2',
            estimated_hours=Decimal('1.5'),
            labor_rate=Decimal('75.00'),
            labor_cost=Decimal('112.50'),
        )
        
        total_labor = task1.labor_cost + task2.labor_cost
        expected_total = Decimal('160.00') + Decimal('112.50')
        assert total_labor == expected_total

    def test_parts_cost_calculation(self):
        """Test parts cost calculation."""
        workorder = baker.make(WorkOrder)
        part = baker.make(Part, selling_price=Decimal('25.00'))
        workorder_part = baker.make(
            WorkOrderPart,
            work_order=workorder,
            inventory_part=part,
            part_name=part.name,
            quantity=Decimal('3'),
            unit_cost=Decimal('25.00'),
        )
        workorder_part.save()
        
        expected_cost = Decimal('75.00')  # 3 * 25.00
        assert workorder_part.total_cost == expected_cost

    def test_workorder_grand_total(self):
        """Test work order grand total calculation."""
        workorder = baker.make(
            WorkOrder,
            actual_labor_cost=Decimal('200.00'),
            actual_parts_cost=Decimal('150.00'),
            actual_total=Decimal('350.00'),
        )
        
        assert workorder.actual_total == Decimal('350.00')


@pytest.mark.django_db
class TestWorkOrderSecurity:
    """Test work order security and permissions."""

    def test_workorder_customer_ownership(self):
        """Test that work order belongs to correct customer."""
        customer1 = baker.make(Customer)
        customer2 = baker.make(Customer)
        vehicle1 = baker.make(Vehicle, owner=customer1)
        vehicle2 = baker.make(Vehicle, owner=customer2)
        
        workorder1 = baker.make(WorkOrder, customer=customer1, vehicle=vehicle1)
        workorder2 = baker.make(WorkOrder, customer=customer2, vehicle=vehicle2)
        
        assert workorder1.customer == customer1
        assert workorder1.vehicle.owner == customer1
        assert workorder2.customer == customer2
        assert workorder2.vehicle.owner == customer2

    def test_technician_assignment(self):
        """Test technician assignment to work orders."""
        technician = baker.make(User, role='technician')
        workorder = baker.make(WorkOrder, primary_technician=technician)
        
        assert workorder.primary_technician == technician
        assert workorder.primary_technician.role == 'technician'


class OpenRecommendationLookupAPITest(APITestCase):
    """Test follow-up recommendation lookup for future work orders."""

    def test_returns_open_recommendations_from_completed_diagnosis_awaiting_approval(self):
        SystemModule.objects.update_or_create(
            slug='workorders',
            defaults={'name': 'Work Orders', 'is_enabled': True},
        )
        user = baker.make(User, role='admin', is_staff=True, is_superuser=True)
        customer = baker.make(Customer)
        vehicle = baker.make(Vehicle, owner=customer)
        workorder = baker.make(
            WorkOrder,
            customer=customer,
            vehicle=vehicle,
            status='awaiting_approval',
            completed_at=None,
        )
        diagnosis = baker.make(
            Diagnosis,
            work_order=workorder,
            technician=user,
            status='completed',
            completed_at=timezone.now(),
            is_completed=True,
        )
        recommendation = baker.make(
            RepairRecommendation,
            diagnosis=diagnosis,
            approval_status='deferred',
            quotation_status='not_requested',
            converted_to_task=None,
        )

        self.client.force_authenticate(user=user)

        response = self.client.get(
            '/api/workorders/work-orders/check_unapproved_recommendations/',
            {'vehicle_id': vehicle.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['recommendations'][0]['id'], recommendation.id)
        self.assertEqual(response.data['recommendations'][0]['work_order_id'], workorder.id)


class WorkOrderRatingAPITest(APITestCase):
    def setUp(self):
        SystemModule.objects.update_or_create(
            slug='workorders',
            defaults={'name': 'Work Orders', 'is_enabled': True},
        )
        self.admin_user = User.objects.create_user(
            email='wo-rating-admin@test.com',
            username='wo-rating-admin',
            password='test123',
            role='admin',
            is_staff=True
        )
        self.customer_user = User.objects.create_user(
            email='wo-rating-customer@test.com',
            username='wo-rating-customer',
            password='test123',
            role='customer'
        )
        self.branch = Branch.objects.create(
            name='Work Order Rating Test Branch',
            code='WORATE',
            created_by=self.admin_user,
        )
        self.customer = Customer(user=self.customer_user)
        self.customer._numbering_branch = self.branch
        self.customer.save()
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Honda',
            model='Civic',
            year=2022,
            vin='2HGFC2F69NH123456',
            license_plate='WOR001',
            current_mileage=10000
        )
        self.workorder = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            status='completed',
            customer_concerns='General service',
            odometer_in=10000,
            created_by=self.admin_user,
        )

    def test_customer_can_rate_completed_workorder(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.post(
            f'/api/workorders/work-orders/{self.workorder.id}/rate_service/',
            {'rating': 4, 'customer_feedback': 'Good overall'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.workorder.refresh_from_db()
        self.assertEqual(self.workorder.customer_rating, 4)
        self.assertEqual(self.workorder.customer_feedback, 'Good overall')


class WorkOrderAdvancedDateFilterTest(APITestCase):
    def test_created_at_upper_date_bound_includes_the_whole_day(self):
        SystemModule.objects.update_or_create(
            slug='workorders',
            defaults={'name': 'Work Orders', 'is_enabled': True},
        )
        admin = baker.make(User, role='admin', is_staff=True, is_superuser=True)
        branch = baker.make(Branch, created_by=admin)
        customer = baker.make(Customer)
        vehicle = baker.make(Vehicle, owner=customer)
        workorder = baker.make(
            WorkOrder,
            customer=customer,
            vehicle=vehicle,
            branch=branch,
            created_by=admin,
        )
        WorkOrder.objects.filter(pk=workorder.pk).update(
            created_at=timezone.now().replace(hour=23, minute=45)
        )
        self.client.force_authenticate(admin)
        today = timezone.localdate()

        response = self.client.get('/api/workorders/work-orders/', {
            'created_at__gte': today,
            'created_at__lte': today,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(
            workorder.id,
            {row['id'] for row in response.data['results']},
        )
