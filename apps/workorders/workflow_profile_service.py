"""Resolve workflow profile behavior for work orders."""

from __future__ import annotations

LEGACY_ROUTINE_MAINTENANCE_TYPE = 'routine'
LEGACY_GENERAL_MAINTENANCE_TYPE = 'general'

# Extra transitions allowed for specific profiles (from_status, to_status)
PROFILE_EXTRA_TRANSITIONS = {
    'inspection_only': {
        ('inspection', 'completed'),
    },
    'diagnostic_only': {
        ('diagnosis', 'completed'),
        ('awaiting_approval', 'completed'),
        ('approved', 'completed'),
    },
}

# Transitions blocked for specific profiles
PROFILE_BLOCKED_TRANSITIONS = {
    'inspection_only': {
        ('inspection', 'intake'),
        ('inspection', 'assigned'),
        ('inspection', 'diagnosis'),
        ('draft', 'intake'),
    },
    'diagnostic_only': {
        ('approved', 'in_progress'),
        ('awaiting_approval', 'in_progress'),
    },
    'routine_fast_track': set(),
}


def get_workflow_profile(work_order):
    """Return the workflow profile for a work order, with legacy fallbacks."""
    job_type = getattr(work_order, 'job_type', None)
    if job_type is not None and getattr(job_type, 'workflow_profile', None) is not None:
        return job_type.workflow_profile

    maintenance_type = getattr(work_order, 'maintenance_type', None)
    if maintenance_type == LEGACY_ROUTINE_MAINTENANCE_TYPE:
        from .job_types import WorkflowProfile

        return WorkflowProfile.objects.filter(code='routine_fast_track', is_active=True).first()

    from .job_types import WorkflowProfile

    return WorkflowProfile.objects.filter(code='full_repair', is_active=True).first()


def get_profile_code(work_order) -> str | None:
    profile = get_workflow_profile(work_order)
    return profile.code if profile else None


def uses_fast_track_profile(work_order) -> bool:
    profile = get_workflow_profile(work_order)
    return bool(profile and profile.allows_fast_track_to_approved)


def uses_bundle_on_create(work_order) -> bool:
    profile = get_workflow_profile(work_order)
    if profile and profile.apply_service_bundle_on_create:
        return True
    return getattr(work_order, 'maintenance_type', None) == LEGACY_ROUTINE_MAINTENANCE_TYPE


def allows_simplified_completion(work_order) -> bool:
    """Inspection-only and diagnostic-only jobs can complete without repair tasks."""
    return get_profile_code(work_order) in {'inspection_only', 'diagnostic_only'}


def profile_skips_inspection(work_order) -> bool:
    profile = get_workflow_profile(work_order)
    return bool(profile and profile.skip_inspection)


def profile_skips_diagnosis(work_order) -> bool:
    profile = get_workflow_profile(work_order)
    return bool(profile and profile.skip_diagnosis)


def work_order_requires_inspection(work_order) -> bool:
    """True when inspection must be completed before intake (job type + profile)."""
    if profile_skips_inspection(work_order):
        return False
    job_type = getattr(work_order, 'job_type', None)
    if job_type is not None and not job_type.requires_inspection:
        return False
    return True


def work_order_requires_diagnosis(work_order) -> bool:
    """True when this work order follows the diagnosis / approval path."""
    if profile_skips_diagnosis(work_order):
        return False
    job_type = getattr(work_order, 'job_type', None)
    if job_type is not None and not job_type.requires_diagnosis:
        return False
    return True


# Statuses where job type may still be changed safely
JOB_TYPE_CHANGE_ALLOWED_STATUSES = frozenset({'draft', 'inspection'})


def resolve_allowed_targets(work_order, current_status: str, base_targets: list[str]) -> list[str]:
    """Merge profile-specific extra transitions and remove blocked edges."""
    profile = get_workflow_profile(work_order)
    if not profile:
        return base_targets

    allowed = list(base_targets)
    extras = PROFILE_EXTRA_TRANSITIONS.get(profile.code, set())
    blocked = PROFILE_BLOCKED_TRANSITIONS.get(profile.code, set())

    for from_status, to_status in extras:
        if from_status == current_status and to_status not in allowed:
            allowed.append(to_status)

    return [target for target in allowed if (current_status, target) not in blocked]


def sync_legacy_maintenance_type(work_order) -> str:
    """Derive legacy maintenance_type from job type / profile for API compatibility."""
    if uses_fast_track_profile(work_order):
        return LEGACY_ROUTINE_MAINTENANCE_TYPE
    return LEGACY_GENERAL_MAINTENANCE_TYPE


def resolve_job_type_for_create(*, job_type=None, job_type_code=None, maintenance_type=None):
    """
    Resolve a JobType from explicit FK/code or legacy maintenance_type.
    Returns JobType instance or None.
    """
    from .job_types import JobType

    if job_type is not None:
        if isinstance(job_type, JobType):
            return job_type
        return JobType.objects.filter(pk=job_type, is_active=True).select_related('workflow_profile').first()

    if job_type_code:
        return JobType.objects.filter(code=job_type_code, is_active=True).select_related('workflow_profile').first()

    if maintenance_type == LEGACY_ROUTINE_MAINTENANCE_TYPE:
        return JobType.objects.filter(code='routine_maintenance', is_active=True).select_related('workflow_profile').first()
    if maintenance_type == LEGACY_GENERAL_MAINTENANCE_TYPE:
        return JobType.objects.filter(code='general_repairs', is_active=True).select_related('workflow_profile').first()

    return JobType.objects.filter(code='general_repairs', is_active=True).select_related('workflow_profile').first()


def apply_job_type_on_create(work_order, job_type, *, user=None):
    """Apply job type defaults and profile-driven bundle/fast-track after WO create."""
    from .services import apply_service_bundle, prepare_routine_service_workflow

    if not job_type:
        return False

    work_order.job_type = job_type
    job_type.apply_defaults_to_work_order(work_order, overwrite=True)

    profile = job_type.workflow_profile
    if profile:
        if profile.skip_customer_approval:
            work_order.requires_approval = False
        if profile.skip_quality_check:
            work_order.quality_check_required = False
        if profile.auto_approve_on_create:
            from django.utils import timezone
            work_order.requires_approval = False
            work_order.approved_by_customer = True
            if not work_order.approved_at:
                work_order.approved_at = timezone.now()

    work_order.maintenance_type = sync_legacy_maintenance_type(work_order)
    work_order.save()

    bundle_applied = False
    if uses_bundle_on_create(work_order) and (work_order.service_bundle_id or work_order.service_type_id):
        bundle_applied = bool(apply_service_bundle(work_order))
        work_order.refresh_from_db()

    if uses_fast_track_profile(work_order) and work_order.service_bundle_id:
        prepare_routine_service_workflow(work_order, user=user)
        work_order.refresh_from_db()

    return bundle_applied


# Map legacy appointment service_type values to job type codes (see appointment_job_type_mapping.py)
from .appointment_job_type_mapping import APPOINTMENT_SERVICE_TYPE_TO_JOB_TYPE  # noqa: F401


def resolve_job_type_for_appointment(*, job_type=None, job_type_code=None, service_type=None):
    from .job_types import JobType

    if job_type is not None:
        if isinstance(job_type, JobType):
            return job_type
        return JobType.objects.filter(pk=job_type, is_active=True).first()

    if job_type_code:
        return JobType.objects.filter(code=job_type_code, is_active=True).first()

    if service_type:
        mapped = APPOINTMENT_SERVICE_TYPE_TO_JOB_TYPE.get(service_type, 'general_repairs')
        return JobType.objects.filter(code=mapped, is_active=True).first()

    return JobType.objects.filter(code='general_repairs', is_active=True).first()
