from django.test import TestCase
from django.contrib.auth import get_user_model

from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder
from apps.workflows.models import (
    WorkflowDefinition,
    WorkflowGuard,
    WorkflowInstance,
    WorkflowState,
    WorkflowTransition,
    WorkflowTransitionLog,
)
from apps.workflows.services import (
    get_allowed_transition_keys,
    get_available_transitions,
    perform_workflow_transition,
    seed_registered_workflows,
    seed_work_order_workflow,
)

User = get_user_model()


class WorkflowBuilderTests(TestCase):
    def test_seed_work_order_workflow_creates_editable_states_and_transitions(self):
        workflow = seed_work_order_workflow()

        self.assertEqual(workflow.code, 'standard-work-order')
        self.assertTrue(workflow.is_default)
        self.assertEqual(workflow.model_path, 'workorders.WorkOrder')
        self.assertGreaterEqual(workflow.states.count(), 10)
        self.assertTrue(
            workflow.transitions.filter(
                from_state__key='approved',
                to_state__key='in_progress',
                actions__action_type='convert_recommendations',
            ).exists()
        )

    def test_allowed_transitions_use_default_workflow_when_present(self):
        workflow = WorkflowDefinition.objects.create(
            name='Custom Work Order',
            code='custom-work-order',
            model_path='workorders.WorkOrder',
            is_default=True,
            is_active=True,
        )
        draft = WorkflowState.objects.create(workflow=workflow, key='draft', label='Draft')
        closed = WorkflowState.objects.create(workflow=workflow, key='closed', label='Closed')
        WorkflowTransition.objects.create(
            workflow=workflow,
            from_state=draft,
            to_state=closed,
            label='Fast Close',
        )

        self.assertEqual(
            get_allowed_transition_keys('workorders.WorkOrder', 'draft'),
            ['closed'],
        )

        work_order = WorkOrder(status='draft')
        can_transition, error = work_order.can_transition_to('closed')

        self.assertTrue(can_transition)
        self.assertIsNone(error)

    def test_seed_registered_workflows_creates_multiple_module_workflows(self):
        workflows = seed_registered_workflows()
        model_paths = {workflow.model_path for workflow in workflows}

        self.assertIn('workorders.WorkOrder', model_paths)
        self.assertIn('diagnosis.Diagnosis', model_paths)
        self.assertIn('diagnosis.RepairRecommendation', model_paths)

    def test_runtime_blocks_transition_when_guard_fails_and_logs_attempt(self):
        user = User.objects.create_user(
            username='manager',
            email='workflow-manager@example.com',
            password='password',
            role='manager',
        )
        customer_user = User.objects.create_user(
            username='customer',
            email='workflow-customer@example.com',
            password='password',
        )
        customer = Customer.objects.create(user=customer_user)
        vehicle = Vehicle.objects.create(
            owner=customer,
            vin='11111111111111111',
            make='Toyota',
            model='Corolla',
            year=2022,
            current_mileage=12000,
        )
        work_order = WorkOrder.objects.create(
            customer=customer,
            vehicle=vehicle,
            status='draft',
            customer_concerns='Noise on startup',
            odometer_in=12000,
        )
        workflow = WorkflowDefinition.objects.create(
            name='Runtime Work Order',
            code='runtime-work-order',
            model_path='workorders.WorkOrder',
            is_default=True,
            is_active=True,
        )
        draft = WorkflowState.objects.create(workflow=workflow, key='draft', label='Draft', is_initial=True)
        inspection = WorkflowState.objects.create(workflow=workflow, key='inspection', label='Inspection')
        transition = WorkflowTransition.objects.create(
            workflow=workflow,
            from_state=draft,
            to_state=inspection,
            label='Start Inspection',
        )
        WorkflowGuard.objects.create(
            transition=transition,
            guard_type='required_field',
            field_path='diagnosis_notes',
            message='Diagnosis notes are required.',
        )

        available = get_available_transitions(work_order, user=user, model_path='workorders.WorkOrder')

        self.assertFalse(available[0]['allowed'])
        self.assertIn('Diagnosis notes are required.', available[0]['blocked_reasons'])

        with self.assertRaises(Exception):
            perform_workflow_transition(
                work_order,
                'inspection',
                user=user,
                model_path='workorders.WorkOrder',
            )

        self.assertEqual(WorkflowTransitionLog.objects.filter(result='blocked').count(), 1)

    def test_runtime_transition_updates_object_instance_and_audit_log(self):
        user = User.objects.create_user(
            username='manager2',
            email='workflow-manager2@example.com',
            password='password',
            role='manager',
        )
        customer_user = User.objects.create_user(
            username='customer2',
            email='workflow-customer2@example.com',
            password='password',
        )
        customer = Customer.objects.create(user=customer_user)
        vehicle = Vehicle.objects.create(
            owner=customer,
            vin='22222222222222222',
            make='Honda',
            model='Civic',
            year=2021,
            current_mileage=9000,
        )
        work_order = WorkOrder.objects.create(
            customer=customer,
            vehicle=vehicle,
            status='draft',
            customer_concerns='Routine check',
            odometer_in=9000,
        )
        workflow = WorkflowDefinition.objects.create(
            name='Runtime Success Work Order',
            code='runtime-success-work-order',
            model_path='workorders.WorkOrder',
            is_default=True,
            is_active=True,
        )
        draft = WorkflowState.objects.create(workflow=workflow, key='draft', label='Draft', is_initial=True)
        inspection = WorkflowState.objects.create(workflow=workflow, key='inspection', label='Inspection')
        WorkflowTransition.objects.create(
            workflow=workflow,
            from_state=draft,
            to_state=inspection,
            label='Start Inspection',
        )

        result = perform_workflow_transition(
            work_order,
            'inspection',
            user=user,
            model_path='workorders.WorkOrder',
        )
        work_order.refresh_from_db()

        self.assertEqual(work_order.status, 'inspection')
        self.assertEqual(result['to_state'], 'inspection')
        self.assertEqual(WorkflowInstance.objects.get(object_id=work_order.id).current_state.key, 'inspection')
        self.assertEqual(WorkflowTransitionLog.objects.filter(result='success').count(), 1)
