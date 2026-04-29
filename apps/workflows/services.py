from django.apps import apps as django_apps
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .models import (
    WorkflowAction,
    WorkflowDefinition,
    WorkflowGuard,
    WorkflowInstance,
    WorkflowState,
    WorkflowTransition,
    WorkflowTransitionLog,
)


REGISTERED_WORKFLOW_MODELS = {
    'workorders.WorkOrder': {
        'label': 'Work Order',
        'status_field': 'status',
        'seed': 'custom_work_order',
    },
    'diagnosis.Diagnosis': {
        'label': 'Diagnosis',
        'status_field': 'status',
    },
    'diagnosis.RepairRecommendation': {
        'label': 'Diagnosis Recommendation',
        'status_field': 'approval_status',
    },
    'workorders.WorkOrderPart': {
        'label': 'Work Order Part',
        'status_field': 'status',
    },
    'inspections.VehicleInspection': {
        'label': 'Vehicle Inspection',
        'status_field': 'status',
    },
    'billing.Invoice': {
        'label': 'Invoice',
        'status_field': 'status',
    },
    'inventory.PurchaseOrder': {
        'label': 'Purchase Order',
        'status_field': 'status',
    },
    'roadside.RoadsideRequest': {
        'label': 'Roadside Request',
        'status_field': 'status',
    },
}


WORK_ORDER_STATES = [
    ('draft', 'Draft', '#64748b', 'FileText'),
    ('inspection', 'Initial Inspection', '#0ea5e9', 'ClipboardCheck'),
    ('intake', 'Intake', '#6366f1', 'LogIn'),
    ('assigned', 'Assigned', '#8b5cf6', 'UserCheck'),
    ('diagnosis', 'Diagnosis', '#f59e0b', 'Stethoscope'),
    ('awaiting_approval', 'Awaiting Customer Approval', '#f97316', 'Clock'),
    ('approved', 'Approved', '#22c55e', 'CheckCircle'),
    ('in_progress', 'In Progress', '#2563eb', 'Wrench'),
    ('additional_work_found', 'Additional Work Found', '#dc2626', 'AlertTriangle'),
    ('paused', 'Paused', '#78716c', 'Pause'),
    ('quality_check', 'Quality Check', '#14b8a6', 'ShieldCheck'),
    ('completed', 'Completed', '#16a34a', 'CheckCheck'),
    ('invoiced', 'Invoiced', '#7c3aed', 'Receipt'),
    ('closed', 'Closed', '#334155', 'Lock'),
]

WORK_ORDER_TRANSITIONS = [
    ('draft', 'inspection', 'Start Inspection', 'Start Inspection'),
    ('draft', 'intake', 'Start Intake', 'Start Intake'),
    ('inspection', 'intake', 'Move to Intake', 'Move to Intake'),
    ('inspection', 'draft', 'Return to Draft', 'Return to Draft'),
    ('intake', 'assigned', 'Assign Service Coordinator', 'Assign'),
    ('intake', 'draft', 'Return to Draft', 'Return to Draft'),
    ('assigned', 'diagnosis', 'Start Diagnosis', 'Start Diagnosis'),
    ('assigned', 'intake', 'Return to Intake', 'Return to Intake'),
    ('diagnosis', 'awaiting_approval', 'Request Approval', 'Request Approval'),
    ('diagnosis', 'approved', 'Approve Without Customer Approval', 'Approve'),
    ('diagnosis', 'in_progress', 'Start Work', 'Start Repairs'),
    ('awaiting_approval', 'approved', 'Approve Work Order', 'Approve'),
    ('awaiting_approval', 'diagnosis', 'Return to Diagnosis', 'Return to Diagnosis'),
    ('approved', 'in_progress', 'Start Repairs', 'Start Repairs'),
    ('approved', 'awaiting_approval', 'Return to Approval', 'Return to Approval'),
    ('in_progress', 'paused', 'Pause Work', 'Pause'),
    ('in_progress', 'quality_check', 'Request Quality Check', 'Request QC'),
    ('in_progress', 'completed', 'Complete Work', 'Complete'),
    ('in_progress', 'additional_work_found', 'Additional Work Found', 'Additional Work'),
    ('additional_work_found', 'awaiting_approval', 'Request Additional Approval', 'Request Approval'),
    ('additional_work_found', 'in_progress', 'Resume Work', 'Resume'),
    ('paused', 'in_progress', 'Resume Work', 'Resume'),
    ('quality_check', 'completed', 'Complete Work Order', 'Complete'),
    ('quality_check', 'in_progress', 'Return to Repairs', 'Return to Repairs'),
    ('completed', 'invoiced', 'Mark Invoiced', 'Mark Invoiced'),
    ('completed', 'closed', 'Close Work Order', 'Close'),
    ('completed', 'in_progress', 'Reopen Repairs', 'Reopen'),
    ('invoiced', 'closed', 'Close Work Order', 'Close'),
    ('closed', 'invoiced', 'Reopen to Invoiced', 'Reopen'),
    ('closed', 'completed', 'Reopen to Completed', 'Reopen'),
    ('closed', 'in_progress', 'Reopen Repairs', 'Reopen'),
]

WORK_ORDER_GUARDS = {
    ('draft', 'intake'): [
        ('required_relation', 'inspections', 'Initial inspection must be completed and approved before starting intake.'),
    ],
    ('assigned', 'diagnosis'): [
        ('required_field', 'service_coordinator', 'A Service Coordinator must be assigned before diagnosis.'),
    ],
    ('diagnosis', 'awaiting_approval'): [
        ('required_field', 'diagnosis_notes', 'Diagnosis notes are required before requesting approval.'),
    ],
    ('approved', 'in_progress'): [
        ('required_field', 'approved_by_customer', 'Work order must be approved before starting repairs.'),
        ('required_relation', 'primary_technician_or_assigned_technicians', 'At least one technician must be assigned before starting repairs.'),
    ],
    ('in_progress', 'quality_check'): [
        ('min_count', 'tasks', 'At least one mechanical task must exist before quality check.'),
        ('custom', 'all_tasks_completed_or_skipped', 'All mechanical tasks must be completed or skipped before quality check.'),
    ],
    ('quality_check', 'completed'): [
        ('required_field', 'quality_check_completed', 'Quality check must be completed before closing repair work.'),
    ],
    ('completed', 'invoiced'): [
        ('required_field', 'odometer_out', 'Odometer out is required before invoicing.'),
    ],
}

WORK_ORDER_ACTIONS = {
    ('awaiting_approval', 'approved'): [
        ('after', 'approve_recommendations', 'Approve pending recommendations'),
    ],
    ('approved', 'in_progress'): [
        ('before', 'convert_recommendations', 'Convert quoted recommendations'),
        ('after', 'reserve_parts', 'Reserve required parts'),
    ],
    ('in_progress', 'quality_check'): [
        ('after', 'create_note', 'Record quality-check request'),
    ],
}


@transaction.atomic
def seed_work_order_workflow(user=None):
    workflow, _ = WorkflowDefinition.objects.update_or_create(
        code='standard-work-order',
        defaults={
            'name': 'Standard Work Order',
            'description': 'Default repair shop workflow from intake through closing.',
            'model_path': 'workorders.WorkOrder',
            'version': 1,
            'is_active': True,
            'is_default': True,
            'updated_by': user if getattr(user, 'is_authenticated', False) else None,
        },
    )
    if user and getattr(user, 'is_authenticated', False) and not workflow.created_by:
        workflow.created_by = user
        workflow.save(update_fields=['created_by'])

    states = {}
    for order, (key, label, color, icon) in enumerate(WORK_ORDER_STATES, start=1):
        state, _ = WorkflowState.objects.update_or_create(
            workflow=workflow,
            key=key,
            defaults={
                'label': label,
                'color': color,
                'icon': icon,
                'order': order,
                'is_initial': key == 'draft',
                'is_terminal': key == 'closed',
                'is_active': True,
            },
        )
        states[key] = state

    for order, (from_key, to_key, label, button_label) in enumerate(WORK_ORDER_TRANSITIONS, start=1):
        transition, _ = WorkflowTransition.objects.update_or_create(
            workflow=workflow,
            from_state=states[from_key],
            to_state=states[to_key],
            defaults={
                'label': label,
                'button_label': button_label,
                'order': order,
                'is_active': True,
            },
        )

        WorkflowGuard.objects.filter(transition=transition).delete()
        for guard_order, (guard_type, field_path, message) in enumerate(
            WORK_ORDER_GUARDS.get((from_key, to_key), []),
            start=1,
        ):
            WorkflowGuard.objects.create(
                transition=transition,
                guard_type=guard_type,
                field_path=field_path,
                message=message,
                order=guard_order,
            )

        WorkflowAction.objects.filter(transition=transition).delete()
        for action_order, (timing, action_type, action_label) in enumerate(
            WORK_ORDER_ACTIONS.get((from_key, to_key), []),
            start=1,
        ):
            WorkflowAction.objects.create(
                transition=transition,
                timing=timing,
                action_type=action_type,
                label=action_label,
                order=action_order,
            )

    return workflow


def get_workflow_graph(workflow):
    return {
        'id': workflow.id,
        'name': workflow.name,
        'code': workflow.code,
        'model_path': workflow.model_path,
        'states': [
            {
                'id': state.id,
                'key': state.key,
                'label': state.label,
                'order': state.order,
                'color': state.color,
                'is_initial': state.is_initial,
                'is_terminal': state.is_terminal,
                'is_active': state.is_active,
            }
            for state in workflow.states.all()
        ],
        'transitions': [
            {
                'id': transition.id,
                'from': transition.from_state.key,
                'to': transition.to_state.key,
                'label': transition.label,
                'button_label': transition.button_label,
                'guards_count': transition.guards.count(),
                'actions_count': transition.actions.count(),
                'is_active': transition.is_active,
            }
            for transition in workflow.transitions.all()
        ],
    }


def get_registered_workflow_models():
    """Return installed models that can be managed by the workflow engine."""
    registered = []
    for model_path, config in REGISTERED_WORKFLOW_MODELS.items():
        try:
            app_label, model_name = model_path.split('.', 1)
            model = django_apps.get_model(app_label, model_name)
            model._meta.get_field(config.get('status_field', 'status'))
        except Exception:
            continue
        registered.append({
            'model_path': model_path,
            'label': config['label'],
            'status_field': config.get('status_field', 'status'),
            'seed': config.get('seed', 'choices'),
        })
    return registered


def _get_model_and_config(model_path):
    config = REGISTERED_WORKFLOW_MODELS.get(model_path, {'status_field': 'status'})
    app_label, model_name = model_path.split('.', 1)
    model = django_apps.get_model(app_label, model_name)
    return model, config


def _get_default_workflow(model_path):
    return WorkflowDefinition.objects.filter(
        model_path=model_path,
        is_active=True,
        is_default=True,
    ).prefetch_related(
        'states',
        'transitions__from_state',
        'transitions__to_state',
        'transitions__guards',
        'transitions__actions',
    ).first()


def _get_status_value(obj, status_field):
    return getattr(obj, status_field)


def _set_status_value(obj, status_field, value):
    setattr(obj, status_field, value)


def _state_label(key):
    return key.replace('_', ' ').replace('-', ' ').title()


@transaction.atomic
def seed_choice_workflow(model_path, user=None):
    model, config = _get_model_and_config(model_path)
    status_field = config.get('status_field', 'status')
    field = model._meta.get_field(status_field)
    choices = list(field.choices or [])
    if not choices:
        raise ValueError(f'{model_path}.{status_field} does not define choices.')

    workflow, _ = WorkflowDefinition.objects.update_or_create(
        code=f"{model_path.replace('.', '-').lower()}-standard",
        defaults={
            'name': f"Standard {config.get('label', model._meta.verbose_name.title())}",
            'description': f"Default workflow generated from {model_path}.{status_field} choices.",
            'model_path': model_path,
            'version': 1,
            'is_active': True,
            'is_default': True,
            'updated_by': user if getattr(user, 'is_authenticated', False) else None,
        },
    )
    if user and getattr(user, 'is_authenticated', False) and not workflow.created_by:
        workflow.created_by = user
        workflow.save(update_fields=['created_by'])

    states = []
    terminal_keys = {'completed', 'closed', 'cancelled', 'canceled', 'failed', 'void', 'declined', 'paid'}
    for order, choice in enumerate(choices, start=1):
        key, label = choice[0], str(choice[1])
        state, _ = WorkflowState.objects.update_or_create(
            workflow=workflow,
            key=key,
            defaults={
                'label': label,
                'order': order,
                'is_initial': order == 1 or key in {'draft', 'pending', 'not_started'},
                'is_terminal': key in terminal_keys,
                'is_active': True,
                'metadata': {'status_field': status_field},
            },
        )
        states.append(state)

    for order, (from_state, to_state) in enumerate(zip(states, states[1:]), start=1):
        WorkflowTransition.objects.update_or_create(
            workflow=workflow,
            from_state=from_state,
            to_state=to_state,
            defaults={
                'label': f'{from_state.label} to {to_state.label}',
                'button_label': to_state.label,
                'order': order,
                'is_active': True,
            },
        )

    for state in states:
        if state.key not in {'cancelled', 'canceled'}:
            cancel_state = next((item for item in states if item.key in {'cancelled', 'canceled'}), None)
            if cancel_state and state.id != cancel_state.id:
                WorkflowTransition.objects.update_or_create(
                    workflow=workflow,
                    from_state=state,
                    to_state=cancel_state,
                    defaults={
                        'label': f'Cancel from {state.label}',
                        'button_label': 'Cancel',
                        'order': 900 + state.order,
                        'is_active': True,
                    },
                )

    return workflow


@transaction.atomic
def seed_registered_workflows(user=None):
    workflows = [seed_work_order_workflow(user=user)]
    for item in get_registered_workflow_models():
        if item['model_path'] == 'workorders.WorkOrder':
            continue
        try:
            workflows.append(seed_choice_workflow(item['model_path'], user=user))
        except Exception:
            continue
    return workflows


def get_allowed_transition_keys(model_path, current_state):
    """Return active target state keys for a model/state from the default workflow."""
    try:
        workflow = WorkflowDefinition.objects.filter(
            model_path=model_path,
            is_active=True,
            is_default=True,
        ).first()
        if not workflow:
            return None

        return list(
            WorkflowTransition.objects.filter(
                workflow=workflow,
                from_state__key=current_state,
                is_active=True,
                from_state__is_active=True,
                to_state__is_active=True,
            ).values_list('to_state__key', flat=True)
        )
    except Exception:
        return None


def get_or_create_workflow_instance(obj, model_path=None, workflow=None):
    if model_path is None:
        model_path = f'{obj._meta.app_label}.{obj.__class__.__name__}'
    model, config = _get_model_and_config(model_path)
    status_field = config.get('status_field', 'status')
    workflow = workflow or _get_default_workflow(model_path)
    if not workflow:
        return None

    content_type = ContentType.objects.get_for_model(model)
    current_key = _get_status_value(obj, status_field)
    current_state = workflow.states.filter(key=current_key, is_active=True).first()
    if not current_state:
        current_state = workflow.states.filter(is_initial=True, is_active=True).order_by('order').first()
    if not current_state:
        return None

    instance, created = WorkflowInstance.objects.get_or_create(
        workflow=workflow,
        content_type=content_type,
        object_id=obj.pk,
        is_active=True,
        defaults={
            'current_state': current_state,
            'status_field': status_field,
        },
    )
    if not created and instance.current_state_id != current_state.id:
        instance.current_state = current_state
        instance.status_field = status_field
        instance.save(update_fields=['current_state', 'status_field', 'updated_at'])
    return instance


def _resolve_attr(obj, field_path):
    value = obj
    for part in field_path.split('.'):
        if not part:
            continue
        value = getattr(value, part)
        if callable(value) and not hasattr(value, 'all'):
            value = value()
    return value


def _relation_exists(value):
    if hasattr(value, 'exists'):
        return value.exists()
    if hasattr(value, 'all'):
        return value.all().exists()
    return bool(value)


def _relation_count(value):
    if hasattr(value, 'count'):
        return value.count()
    if hasattr(value, 'all'):
        return value.all().count()
    return len(value or [])


def _run_custom_guard(obj, guard):
    key = guard.field_path or guard.config.get('key')
    if key == 'all_tasks_completed_or_skipped':
        incomplete = obj.tasks.filter(is_workflow_task=False).exclude(status__in=['completed', 'skipped'])
        return not incomplete.exists()
    if key == 'primary_technician_or_assigned_technicians':
        return bool(getattr(obj, 'primary_technician', None)) or obj.assigned_technicians.exists()
    return True


def evaluate_transition_guards(obj, transition, user=None):
    results = []
    allowed = True

    if transition.required_permission:
        from apps.accounts.permissions import user_has_permission
        passed = bool(user and user_has_permission(user, transition.required_permission))
        results.append({
            'type': 'permission',
            'field_path': transition.required_permission,
            'passed': passed,
            'message': '' if passed else 'You do not have permission to perform this workflow action.',
        })
        allowed = allowed and passed

    if transition.allowed_roles:
        role = getattr(user, 'role', None)
        passed = bool(user and (role in transition.allowed_roles or getattr(user, 'is_superuser', False)))
        results.append({
            'type': 'role',
            'field_path': 'role',
            'passed': passed,
            'message': '' if passed else 'Your role is not allowed to perform this workflow action.',
        })
        allowed = allowed and passed

    for guard in transition.guards.filter(is_active=True).order_by('order', 'id'):
        passed = True
        try:
            if guard.guard_type == 'required_field':
                passed = bool(_resolve_attr(obj, guard.field_path))
            elif guard.guard_type == 'required_relation':
                value = _resolve_attr(obj, guard.field_path)
                passed = _relation_exists(value)
            elif guard.guard_type == 'min_count':
                value = _resolve_attr(obj, guard.field_path)
                minimum = int(guard.expected_value or guard.config.get('min', 1))
                passed = _relation_count(value) >= minimum
            elif guard.guard_type == 'custom':
                passed = _run_custom_guard(obj, guard)
        except Exception:
            passed = False

        results.append({
            'id': guard.id,
            'type': guard.guard_type,
            'field_path': guard.field_path,
            'passed': passed,
            'message': '' if passed else guard.message,
        })
        allowed = allowed and passed

    return allowed, results


def _run_work_order_action(obj, action, user=None):
    if action.action_type == 'approve_recommendations' and hasattr(obj, 'approve_pending_recommendations'):
        count = obj.approve_pending_recommendations(user=user, method='workflow', notes=action.label)
        return {'action': action.action_type, 'status': 'success', 'message': f'{count} recommendation(s) approved.'}
    if action.action_type == 'convert_recommendations' and hasattr(obj, 'convert_recommendations_to_tasks'):
        result = obj.convert_recommendations_to_tasks(user=user)
        return {'action': action.action_type, 'status': 'success', 'message': f"{result.get('created_count', 0)} task(s) created."}
    if action.action_type == 'reserve_parts':
        try:
            from apps.inventory.services import InventoryService
            InventoryService.reserve_parts_for_work_order(obj, user)
            return {'action': action.action_type, 'status': 'success', 'message': 'Parts reserved.'}
        except Exception as exc:
            return {'action': action.action_type, 'status': 'failed', 'message': str(exc)}
    if action.action_type == 'create_note' and hasattr(obj, 'notes'):
        from apps.workorders.models import WorkOrderNote
        WorkOrderNote.objects.create(
            work_order=obj,
            note_type='internal',
            note=action.config.get('note') or action.label,
            created_by=user if getattr(user, 'is_authenticated', False) else None,
        )
        return {'action': action.action_type, 'status': 'success', 'message': 'Note created.'}
    return {'action': action.action_type, 'status': 'skipped', 'message': 'No runtime handler configured.'}


def execute_transition_actions(obj, transition, timing, user=None):
    results = []
    for action in transition.actions.filter(is_active=True, timing=timing).order_by('order', 'id'):
        try:
            results.append(_run_work_order_action(obj, action, user=user))
        except Exception as exc:
            results.append({'action': action.action_type, 'status': 'failed', 'message': str(exc)})
    return results


def get_available_transitions(obj, user=None, model_path=None):
    instance = get_or_create_workflow_instance(obj, model_path=model_path)
    if not instance:
        return []
    transitions = WorkflowTransition.objects.filter(
        workflow=instance.workflow,
        from_state=instance.current_state,
        is_active=True,
        to_state__is_active=True,
    ).select_related('to_state').prefetch_related('guards', 'actions')

    available = []
    for transition in transitions:
        allowed, guard_results = evaluate_transition_guards(obj, transition, user=user)
        available.append({
            'transition_id': transition.id,
            'from_state': transition.from_state.key,
            'to_state': transition.to_state.key,
            'label': transition.label,
            'button_label': transition.button_label or transition.label,
            'allowed': allowed,
            'blocked_reasons': [item['message'] for item in guard_results if not item['passed'] and item.get('message')],
            'guards': guard_results,
        })
    return available


def perform_workflow_transition(obj, to_state_key, user=None, model_path=None, metadata=None):
    instance = get_or_create_workflow_instance(obj, model_path=model_path)
    if not instance:
        raise ValidationError('No active workflow is configured for this object.')

    transition = WorkflowTransition.objects.filter(
        workflow=instance.workflow,
        from_state=instance.current_state,
        to_state__key=to_state_key,
        is_active=True,
        to_state__is_active=True,
    ).select_related('to_state').prefetch_related('guards', 'actions').first()
    if not transition:
        WorkflowTransitionLog.objects.create(
            instance=instance,
            from_state=instance.current_state.key,
            to_state=to_state_key,
            result='blocked',
            message='Transition is not allowed by the active workflow.',
            actor=user if getattr(user, 'is_authenticated', False) else None,
            metadata=metadata or {},
        )
        raise ValidationError('Transition is not allowed by the active workflow.')

    allowed, guard_results = evaluate_transition_guards(obj, transition, user=user)
    if not allowed:
        message = '; '.join(item['message'] for item in guard_results if not item['passed'] and item.get('message'))
        WorkflowTransitionLog.objects.create(
            instance=instance,
            transition=transition,
            from_state=instance.current_state.key,
            to_state=to_state_key,
            result='blocked',
            message=message,
            guard_results=guard_results,
            actor=user if getattr(user, 'is_authenticated', False) else None,
            metadata=metadata or {},
        )
        raise ValidationError(message)

    with transaction.atomic():
        before_results = execute_transition_actions(obj, transition, 'before', user=user)
        old_state = instance.current_state.key
        status_field = instance.status_field

        if hasattr(obj, 'transition_to') and obj.__class__._meta.label == 'workorders.WorkOrder':
            obj.transition_to(to_state_key, user=user)
            obj.refresh_from_db()
        else:
            _set_status_value(obj, status_field, to_state_key)
            save_fields = [status_field]
            if to_state_key in {'completed', 'closed'} and hasattr(obj, 'completed_at') and not obj.completed_at:
                obj.completed_at = timezone.now()
                save_fields.append('completed_at')
            obj.save(update_fields=save_fields)

        instance.current_state = transition.to_state
        if transition.to_state.is_terminal and not instance.completed_at:
            instance.completed_at = timezone.now()
        instance.save(update_fields=['current_state', 'completed_at', 'updated_at'])

        after_results = execute_transition_actions(obj, transition, 'after', user=user)
        log = WorkflowTransitionLog.objects.create(
            instance=instance,
            transition=transition,
            from_state=old_state,
            to_state=transition.to_state.key,
            result='success',
            message='Transition completed.',
            guard_results=guard_results,
            action_results=before_results + after_results,
            actor=user if getattr(user, 'is_authenticated', False) else None,
            metadata=metadata or {},
        )
    return {
        'instance': instance,
        'transition': transition,
        'log': log,
        'from_state': old_state,
        'to_state': transition.to_state.key,
        'actions': before_results + after_results,
    }
