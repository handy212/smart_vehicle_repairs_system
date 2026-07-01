"""Resolve workflow profile behavior for work orders."""

from __future__ import annotations

LEGACY_ROUTINE_MAINTENANCE_TYPE = 'routine'
LEGACY_GENERAL_MAINTENANCE_TYPE = 'general'


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


def uses_fast_track_profile(work_order) -> bool:
    profile = get_workflow_profile(work_order)
    return bool(profile and profile.allows_fast_track_to_approved)


def uses_bundle_on_create(work_order) -> bool:
    profile = get_workflow_profile(work_order)
    if profile and profile.apply_service_bundle_on_create:
        return True
    return getattr(work_order, 'maintenance_type', None) == LEGACY_ROUTINE_MAINTENANCE_TYPE


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

    work_order.save()

    bundle_applied = False
    if uses_bundle_on_create(work_order) and (work_order.service_bundle_id or work_order.service_type_id):
        bundle_applied = bool(apply_service_bundle(work_order))
        work_order.refresh_from_db()

    if uses_fast_track_profile(work_order) and work_order.service_bundle_id:
        prepare_routine_service_workflow(work_order, user=user)
        work_order.refresh_from_db()

    return bundle_applied
