"""Optional integration with the parked workflow builder app."""

from django.apps import apps as django_apps


def workflow_app_enabled():
    return django_apps.is_installed('apps.workflows')


def get_workflow_allowed_targets(work_order):
    """Return allowed target statuses from the default workflow, if configured."""
    if not workflow_app_enabled():
        return None

    from apps.workflows.services import get_allowed_transition_keys

    return get_allowed_transition_keys('workorders.WorkOrder', work_order.status)


def evaluate_workflow_guards_for_transition(work_order, new_status, user=None):
    """
    Evaluate declarative workflow guards for a work-order transition.
    Returns an error message when blocked, otherwise None.
    """
    if not workflow_app_enabled():
        return None

    from apps.workflows.models import WorkflowTransition
    from apps.workflows.services import _get_default_workflow, evaluate_transition_guards

    workflow = _get_default_workflow('workorders.WorkOrder')
    if not workflow:
        return None

    transition = (
        WorkflowTransition.objects.filter(
            workflow=workflow,
            from_state__key=work_order.status,
            to_state__key=new_status,
            is_active=True,
            to_state__is_active=True,
        )
        .select_related('to_state')
        .prefetch_related('guards', 'actions')
        .first()
    )
    if not transition:
        return None

    allowed, guard_results = evaluate_transition_guards(work_order, transition, user=user)
    if allowed:
        return None

    messages = [
        item['message']
        for item in guard_results
        if not item.get('passed') and item.get('message')
    ]
    return messages[0] if messages else 'Transition blocked by workflow rules.'
