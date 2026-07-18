from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from apps.accounts.models import User
from apps.branches.models import Branch
from apps.workorders.models import WorkOrder, ServiceTask, ServiceTaskType
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.diagnosis.models import Diagnosis, RepairRecommendation
from apps.accounts.permission_models import Role, Permission
from apps.inspections.models import InspectionTemplate
from apps.workorders.job_type_seed import seed_workflow_profiles_and_job_types

class WorkOrderWorkflowTests(TestCase):
    def setUp(self):
        seed_workflow_profiles_and_job_types(overwrite=True)
        self.client = APIClient()
        
        # 1. Setup Users
        # Service Coordinator
        self.coordinator = User.objects.create_user(
            username='coordinator', email='sc@example.com', password='password', role='service_coordinator'
        )
        # Technician
        self.technician = User.objects.create_user(
            username='tech', email='tech@example.com', password='password', role='technician'
        )
        # Admin/Manager (for setup/overrides)
        self.manager = User.objects.create_user(
            username='manager', email='manager@example.com', password='password', role='manager'
        )
        
        # 2. Setup Branch
        self.branch = Branch.objects.create(name="Main Branch", code="MAIN", created_by=self.manager)
        self.coordinator.branch = self.branch
        self.coordinator.save()
        self.technician.branch = self.branch
        self.technician.save()
        self.manager.managed_branches.add(self.branch)

        # 3. Setup Customer & Vehicle
        self.customer_user = User.objects.create_user(
            username='customer', email='cust@example.com', password='password', role='customer'
        )
        self.customer = Customer.objects.create(
            user=self.customer_user, customer_number="CUST-001", customer_type='individual'
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer, vin="ABC1234567890", year=2020, make="Toyota", model="Camry", license_plate="TEST-01",
            current_mileage=50000
        )
        
        # 4. Setup Permissions
        self.setup_permissions()
        
        # Authenticate as Coordinator initially
        self.client.force_authenticate(user=self.coordinator)

    def test_start_intake_uses_existing_service_coordinator_assignment(self):
        """Starting intake should auto-advance to assigned when the coordinator is already set."""
        work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns='Intermittent no-start condition',
            odometer_in=50000,
            priority='normal',
            service_coordinator=self.coordinator,
            status='inspection',
        )
        inspection_template = InspectionTemplate.objects.create(
            name='Workflow Intake Template',
            description='Template used for workflow transition tests',
            created_by=self.manager,
        )
        from apps.inspections.models import VehicleInspection

        VehicleInspection.objects.create(
            work_order=work_order,
            vehicle=self.vehicle,
            branch=self.branch,
            template=inspection_template,
            performed_by=self.technician,
            status='approved',
            approved_by=self.manager,
        )

        url_intake = reverse('api_workorders:workorder-start-intake', args=[work_order.id])
        response = self.client.post(url_intake, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'assigned')
        self.assertEqual(int(response.data['service_coordinator']), self.coordinator.id)

    def test_service_task_can_be_assigned_to_same_branch_technician(self):
        work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns='Brake noise',
            odometer_in=50000,
            priority='normal',
            status='in_progress',
        )

        response = self.client.post(reverse('api_workorders:servicetask-list'), {
            'work_order': work_order.id,
            'task_type': 'repair',
            'description': 'Replace front brake pads',
            'assigned_to': self.technician.id,
            'estimated_hours': '1.50',
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        task = ServiceTask.objects.get(id=response.data['id'])
        self.assertEqual(task.assigned_to_id, self.technician.id)

    def test_service_task_rejects_cross_branch_technician_assignment(self):
        other_branch = Branch.objects.create(name="Other Branch", code="OTHR", created_by=self.manager)
        other_technician = User.objects.create_user(
            username='othertech',
            email='othertech@example.com',
            password='password',
            role='technician',
            branch=other_branch,
        )
        work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns='Brake noise',
            odometer_in=50000,
            priority='normal',
            status='in_progress',
        )

        response = self.client.post(reverse('api_workorders:servicetask-list'), {
            'work_order': work_order.id,
            'task_type': 'repair',
            'description': 'Replace front brake pads',
            'assigned_to': other_technician.id,
            'estimated_hours': '1.50',
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('assigned_to', response.data)

    def test_service_task_types_endpoint_returns_backend_choices(self):
        ServiceTaskType.objects.create(code='wheel_alignment', name='Wheel Alignment', sort_order=1)
        response = self.client.get(reverse('api_workorders:servicetask-task-types'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        values = {item['value'] for item in response.data}
        self.assertIn('wheel_alignment', values)

    def test_service_task_type_crud(self):
        create_response = self.client.post(reverse('api_workorders:servicetasktype-list'), {
            'name': 'Road Test',
            'code': 'road_test',
            'default_labor_rate': '75.00',
            'is_billable': True,
            'is_active': True,
            'sort_order': 15,
        })

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        task_type_id = create_response.data['id']

        update_response = self.client.patch(reverse('api_workorders:servicetasktype-detail', args=[task_type_id]), {
            'default_labor_rate': '85.00',
            'is_active': False,
        })

        self.assertEqual(update_response.status_code, status.HTTP_200_OK, update_response.data)
        self.assertEqual(update_response.data['default_labor_rate'], '85.00')
        self.assertFalse(update_response.data['is_active'])

    def test_work_order_update_allows_multiple_same_branch_technicians(self):
        second_technician = User.objects.create_user(
            username='tech2',
            email='tech2@example.com',
            password='password',
            role='technician',
            branch=self.branch,
        )
        work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns='Brake noise',
            odometer_in=50000,
            priority='normal',
            status='assigned',
        )

        response = self.client.patch(
            reverse('api_workorders:workorder-detail', args=[work_order.id]),
            {
                'primary_technician': self.technician.id,
                'assigned_technicians': [self.technician.id, second_technician.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        work_order.refresh_from_db()
        self.assertEqual(work_order.primary_technician_id, self.technician.id)
        self.assertEqual(
            set(work_order.assigned_technicians.values_list('id', flat=True)),
            {self.technician.id, second_technician.id},
        )

    def test_work_order_update_rejects_cross_branch_assigned_technician(self):
        other_branch = Branch.objects.create(name="Remote Branch", code="RMT", created_by=self.manager)
        other_technician = User.objects.create_user(
            username='remote-tech',
            email='remote-tech@example.com',
            password='password',
            role='technician',
            branch=other_branch,
        )
        work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns='Brake noise',
            odometer_in=50000,
            priority='normal',
            status='assigned',
        )

        response = self.client.patch(
            reverse('api_workorders:workorder-detail', args=[work_order.id]),
            {'assigned_technicians': [other_technician.id]},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('assigned_technicians', response.data)

    def test_cannot_skip_from_draft_to_intake_even_with_completed_inspection(self):
        work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns='Intermittent no-start condition',
            odometer_in=50000,
            priority='normal',
            service_coordinator=self.coordinator,
            status='draft',
        )
        inspection_template = InspectionTemplate.objects.create(
            name='Draft Skip Guard Template',
            description='Template used for workflow transition tests',
            created_by=self.manager,
        )
        from apps.inspections.models import VehicleInspection

        VehicleInspection.objects.create(
            work_order=work_order,
            vehicle=self.vehicle,
            branch=self.branch,
            template=inspection_template,
            performed_by=self.technician,
            status='approved',
            approved_by=self.manager,
        )

        url_intake = reverse('api_workorders:workorder-start-intake', args=[work_order.id])
        response = self.client.post(url_intake, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('inspection', response.data['error'].lower())

    def test_request_quality_check_returns_actionable_blocking_tasks(self):
        work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns='Brake vibration',
            odometer_in=50000,
            priority='normal',
            service_coordinator=self.coordinator,
            primary_technician=self.technician,
            status='in_progress',
            requires_approval=True,
            approved_by_customer=True,
        )
        task = ServiceTask.objects.create(
            work_order=work_order,
            task_type='repair',
            description='Replace front brake pads',
            status='in_progress',
            is_workflow_task=False,
            assigned_to=self.technician,
        )

        url_qc = reverse('api_workorders:workorder-request-quality-check', args=[work_order.id])
        response = self.client.post(url_qc, {'assigned_to': self.manager.id}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('blocking_tasks', response.data)
        self.assertEqual(response.data['blocking_tasks'][0]['id'], task.id)
        self.assertIn('Tasks tab', response.data['next_step'])

    def test_check_auto_complete_stays_in_progress_without_qc_inspector(self):
        """Auto QC advance must not move jobs into quality_check with no inspector."""
        work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns='Brake vibration',
            odometer_in=50000,
            priority='normal',
            service_coordinator=self.coordinator,
            primary_technician=self.technician,
            status='in_progress',
            requires_approval=True,
            approved_by_customer=True,
            quality_check_required=True,
        )
        ServiceTask.objects.create(
            work_order=work_order,
            task_type='repair',
            description='Replace front brake pads',
            status='completed',
            is_workflow_task=False,
            assigned_to=self.technician,
        )

        work_order.check_auto_complete()
        work_order.refresh_from_db()
        self.assertEqual(work_order.status, 'in_progress')
        self.assertIsNone(work_order.quality_check_assigned_to_id)

        can, error = work_order.can_transition_to('quality_check')
        self.assertFalse(can)
        self.assertIn('inspector', error.lower())

    def test_check_auto_complete_advances_when_inspector_assigned(self):
        work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns='Brake vibration',
            odometer_in=50000,
            priority='normal',
            service_coordinator=self.coordinator,
            primary_technician=self.technician,
            status='in_progress',
            requires_approval=True,
            approved_by_customer=True,
            quality_check_required=True,
            quality_check_assigned_to=self.manager,
        )
        ServiceTask.objects.create(
            work_order=work_order,
            task_type='repair',
            description='Replace front brake pads',
            status='completed',
            is_workflow_task=False,
            assigned_to=self.technician,
        )

        work_order.check_auto_complete()
        work_order.refresh_from_db()
        self.assertEqual(work_order.status, 'quality_check')

    def test_inventory_hook_failure_rolls_back_status_change(self):
        from unittest.mock import patch
        from django.core.exceptions import ValidationError

        work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns='Brake vibration',
            odometer_in=50000,
            priority='normal',
            service_coordinator=self.coordinator,
            primary_technician=self.technician,
            status='approved',
            requires_approval=True,
            approved_by_customer=True,
        )

        with patch(
            'apps.inventory.services.InventoryService.reserve_parts_for_work_order',
            side_effect=RuntimeError('stock service down'),
        ):
            with self.assertRaises(ValidationError):
                work_order.transition_to('in_progress', user=self.manager)

        work_order.refresh_from_db()
        self.assertEqual(work_order.status, 'approved')

    def test_start_diagnosis_creates_diagnosis_record_when_missing(self):
        """Starting diagnosis should create the linked diagnosis record the UI expects."""
        work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            customer_concerns='Loss of power under acceleration',
            special_instructions='Check intake airflow before recommending repairs.',
            odometer_in=50000,
            priority='normal',
            service_coordinator=self.coordinator,
            primary_technician=self.technician,
            status='assigned',
            requires_approval=True,
        )

        url_diagnosis = reverse('api_workorders:workorder-start-diagnosis', args=[work_order.id])
        response = self.client.post(url_diagnosis, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'diagnosis')
        self.assertIn('diagnosis_id', response.data)
        self.assertTrue(response.data['diagnosis_created'])

        diagnosis = Diagnosis.objects.get(work_order=work_order)
        self.assertEqual(diagnosis.id, response.data['diagnosis_id'])
        self.assertEqual(diagnosis.technician, self.technician)
        self.assertEqual(diagnosis.customer_complaint, work_order.customer_concerns)
        self.assertEqual(diagnosis.initial_observations, work_order.special_instructions)

    def setup_permissions(self):
        # Create Permissions
        create_wo, _ = Permission.objects.update_or_create(
            code='create_workorders',
            defaults={'name': 'Create WO', 'category': 'workorders', 'is_active': True},
        )
        view_wo, _ = Permission.objects.update_or_create(
            code='view_workorders',
            defaults={'name': 'View WO', 'category': 'workorders', 'is_active': True},
        )
        edit_wo, _ = Permission.objects.update_or_create(
            code='edit_workorders',
            defaults={'name': 'Edit WO', 'category': 'workorders', 'is_active': True},
        )
        delete_wo, _ = Permission.objects.update_or_create(
            code='delete_workorders',
            defaults={'name': 'Delete WO', 'category': 'workorders', 'is_active': True},
        )
        perform_qc, _ = Permission.objects.update_or_create(
            code='perform_quality_check',
            defaults={'name': 'Perform QC', 'category': 'workorders', 'is_active': True},
        )
        update_status, _ = Permission.objects.update_or_create(
            code='update_workorder_status',
            defaults={'name': 'Update WO Status', 'category': 'workorders', 'is_active': True},
        )
        
        # Create Roles
        sc_role, _ = Role.objects.update_or_create(
            code='service_coordinator',
            defaults={'name': 'Service Coordinator', 'is_active': True},
        )
        sc_role.permissions.add(create_wo, view_wo, edit_wo, perform_qc, update_status)
        
        tech_role, _ = Role.objects.update_or_create(
            code='technician',
            defaults={'name': 'Technician', 'is_active': True},
        )
        tech_role.permissions.add(view_wo, edit_wo, update_status)
        
        manager_role, _ = Role.objects.update_or_create(
            code='manager',
            defaults={'name': 'Manager', 'is_active': True},
        )
        manager_role.permissions.add(create_wo, view_wo, edit_wo, delete_wo, perform_qc, update_status)

    def test_full_happy_path_workflow(self):
        """
        Test the complete Happy Path:
        Draft -> Intake -> Assigned -> Diagnosis -> Analysis -> Approval -> In Progress -> QC -> Completed
        """
        
        # 1. CREATE WORK ORDER (Draft)
        create_data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'branch': self.branch.id,
            'odometer_in': 50000,
            'customer_concerns': "Engine noise and oil change needed",
            'priority': 'normal'
        }
        url_list = reverse('api_workorders:workorder-list')
        response = self.client.post(url_list, create_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        wo_id = response.data['id']
        self.assertEqual(response.data['status'], 'draft')
        work_order = WorkOrder.objects.get(pk=wo_id)
        inspection_template = InspectionTemplate.objects.create(
            name='Happy Path Intake Template',
            description='Template used for full workflow transition tests',
            created_by=self.manager,
        )
        from apps.inspections.models import VehicleInspection

        VehicleInspection.objects.create(
            work_order=work_order,
            vehicle=self.vehicle,
            branch=self.branch,
            template=inspection_template,
            performed_by=self.technician,
            status='approved',
            approved_by=self.manager,
        )
        work_order.transition_to('inspection', user=self.coordinator)

        # 2. START INTAKE (Inspection -> Intake -> Assigned)
        # Verify transition to Intake
        url_intake = reverse('api_workorders:workorder-start-intake', args=[wo_id])
        # Assign self as coordinator
        response = self.client.post(url_intake, {'service_coordinator': self.coordinator.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'assigned') # Should jump to assigned if SC provided
        self.assertEqual(int(response.data['service_coordinator']), self.coordinator.id)

        # 3. START DIAGNOSIS (Assigned -> Diagnosis)
        url_diagnosis = reverse('api_workorders:workorder-start-diagnosis', args=[wo_id])
        response = self.client.post(url_diagnosis)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'diagnosis')

        # 4. PERFORM DIAGNOSIS (Add recommendations)
        diagnosis = Diagnosis.objects.get(work_order_id=wo_id)
        recommendation = RepairRecommendation.objects.create(
            diagnosis=diagnosis,
            description="Replace Oil Filter",
            priority='high',
            estimated_labor_hours=0.5,
            estimated_labor_cost=20.00, 
            estimated_parts_cost=10.00
        )
        
        # 5. COMPLETE DIAGNOSIS (Diagnosis -> Awaiting Approval)
        url_comp_diag = reverse('api_workorders:workorder-complete-diagnosis', args=[wo_id])
        diag_data = {
            'diagnosis_notes': "Completed diagnosis. Needs oil and filter.",
            'requires_approval': True,
            'estimated_labor_hours': 1.0,
            'estimated_labor_cost': 100.00,
            'estimated_parts_cost': 50.00
        }
        response = self.client.post(url_comp_diag, diag_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'awaiting_approval')
        self.assertTrue(response.data['requires_approval'])

        # 6. Quote and approve the recommendation before approving the work order.
        recommendation.refresh_from_db()
        recommendation.request_quotation(requested_by=self.coordinator)
        recommendation.mark_quoted(quoted_by=self.manager)
        recommendation.set_decision(
            'approved',
            acted_by=self.manager,
            method='phone',
            notes='Customer approved via call',
        )

        # 7. APPROVE (Awaiting Approval -> Approved)
        # Simulate Customer Approval via phone
        url_approve = reverse('api_workorders:workorder-approve', args=[wo_id])
        approve_data = {
            'approval_method': 'phone',
            'approval_notes': 'Customer approved via call'
        }
        response = self.client.post(url_approve, approve_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'approved')
        self.assertTrue(response.data['approved_by_customer'])

        # 8. START WORK (Approved -> In Progress)
        # Must assign technician first? 
        # The 'start_work' endpoint can auto-assign the requester if they are a tech.
        
        # Switch to Technician user
        self.client.force_authenticate(user=self.technician)
        
        url_start = reverse('api_workorders:workorder-start-work', args=[wo_id])
        response = self.client.post(url_start)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'in_progress')
        self.assertEqual(response.data['primary_technician'], self.technician.id)
        
        # Check if Task was created from Recommendation
        tasks_count = ServiceTask.objects.filter(work_order_id=wo_id).count()
        # Should have created tasks if recommendations existed
        # In setup steps above we created one recommendation.
        # But 'convert_recommendations_to_tasks' acts on 'customer_approved=True' ones if status != approved, 
        # OR all if status == approved.
        # Since status is 'approved', it should convert all.
        # But wait, `convert_recommendations_to_tasks` implementation in model:
        # if self.status == 'approved': recommendations = ... converted_to_task__isnull=True
        
        # Verify tasks
        self.assertGreater(tasks_count, 0, "Tasks should have been auto-created from recommendations")

        # 8. PERFORM WORK (Detailed steps skipped, just complete tasks)
        # Update tasks to completed
        tasks = ServiceTask.objects.filter(work_order_id=wo_id)
        for task in tasks:
            url_task = reverse('api_workorders:servicetask-detail', args=[task.id])
            payload = {'status': 'completed'}
            if (task.labor_cost or Decimal('0')) <= 0 and task.estimated_hours and task.labor_rate:
                payload['labor_cost'] = str((task.estimated_hours * task.labor_rate).quantize(Decimal('0.01')))
            elif (task.labor_cost or Decimal('0')) <= 0:
                payload['labor_cost'] = '20.00'
            self.client.patch(url_task, payload)

        # 9. REQUEST QC (In Progress -> Quality Check) — must assign authorized inspector
        url_qc = reverse('api_workorders:workorder-request-quality-check', args=[wo_id])
        response = self.client.post(url_qc, {'assigned_to': self.manager.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'quality_check')
        
        # 10. COMPLETE WORK ORDER (Quality Check -> Completed)
        # Switch to Manager for QC + Completion? Or Tech can do it if allowed.
        # Assuming direct transition to completed via update or specific action?
        # Model suggests 'completed' transition requires 'quality_check_completed = True' if required.
        
        # Let's verify we need QC completed
        wo = WorkOrder.objects.get(id=wo_id)
        wo.quality_check_completed = True
        wo.quality_check_passed = True
        wo.quality_check_by = self.manager
        wo.save()
        
        # Now transition to completed
        # Using standard update or is there an action? Standard update for now as no 'complete' action seen in snippet
        url_detail = reverse('api_workorders:workorder-detail', args=[wo_id])
        response = self.client.patch(url_detail, {'status': 'completed'})
        
        if response.status_code != 200:
            print(f"FAILED to complete: {response.data}")
            
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'completed')
        self.assertIsNotNone(response.data['completed_at'])
