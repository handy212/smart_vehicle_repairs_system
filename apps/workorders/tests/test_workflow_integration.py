from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from apps.accounts.models import User
from apps.branches.models import Branch
from apps.workorders.models import WorkOrder, ServiceTask
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.diagnosis.models import Diagnosis, RepairRecommendation
from apps.accounts.permission_models import Role, Permission

class WorkOrderWorkflowTests(TestCase):
    def setUp(self):
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

    def setup_permissions(self):
        # Create Permissions
        create_wo = Permission.objects.create(code='create_workorders', name='Create WO', category='workorders')
        view_wo = Permission.objects.create(code='view_workorders', name='View WO', category='workorders')
        edit_wo = Permission.objects.create(code='edit_workorders', name='Edit WO', category='workorders')
        delete_wo = Permission.objects.create(code='delete_workorders', name='Delete WO', category='workorders')
        
        # Create Roles
        sc_role = Role.objects.create(code='service_coordinator', name='Service Coordinator')
        sc_role.permissions.add(create_wo, view_wo, edit_wo)
        
        tech_role = Role.objects.create(code='technician', name='Technician')
        tech_role.permissions.add(view_wo, edit_wo)
        
        manager_role = Role.objects.create(code='manager', name='Manager')
        manager_role.permissions.add(create_wo, view_wo, edit_wo, delete_wo)

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
        
        # 2. START INTAKE (Draft -> Intake -> Assigned)
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
        # Create a Diagnosis record manually (simulating Diagnosis app)
        diagnosis = Diagnosis.objects.create(work_order_id=wo_id, technician=self.technician, customer_complaint="Found issues")
        RepairRecommendation.objects.create(
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

        # 6. APPROVE (Awaiting Approval -> Approved)
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

        # 7. START WORK (Approved -> In Progress)
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
            self.client.patch(url_task, {'status': 'completed'})

        # 9. REQUEST QC (In Progress -> Quality Check)
        url_qc = reverse('api_workorders:workorder-request-quality-check', args=[wo_id])
        response = self.client.post(url_qc)
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

