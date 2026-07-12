"""Resolve workflow profile behavior for work orders."""

from __future__ import annotations

from types import SimpleNamespace

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


def _iter_job_types(work_order):
    """Yield all JobType instances for a work order (M2M + primary fallback)."""
    cached = getattr(work_order, '_effective_job_types_cache', None)
    if cached:
        return list(cached)

    job_types_manager = getattr(work_order, 'job_types', None)
    if job_types_manager is not None:
        try:
            types = list(job_types_manager.select_related('workflow_profile').all())
            if types:
                return types
        except Exception:
            # Unsaved instance or M2M not ready
            pass

    job_type = getattr(work_order, 'job_type', None)
    if job_type is not None:
        return [job_type]
    return []


def _merge_profiles(profiles):
    """
    Merge workflow profiles conservatively (union of required stages).
    Returns a SimpleNamespace with the same boolean/code attributes used by callers.
    """
    if not profiles:
        return None
    if len(profiles) == 1:
        return profiles[0]

    codes = {p.code for p in profiles}
    unanimous_code = next(iter(codes)) if len(codes) == 1 else 'full_repair'

    return SimpleNamespace(
        code=unanimous_code,
        name='Merged workflow' if len(codes) > 1 else profiles[0].name,
        skip_inspection=all(p.skip_inspection for p in profiles),
        skip_diagnosis=all(p.skip_diagnosis for p in profiles),
        skip_customer_approval=all(p.skip_customer_approval for p in profiles),
        skip_quality_check=all(p.skip_quality_check for p in profiles),
        auto_approve_on_create=all(p.auto_approve_on_create for p in profiles),
        apply_service_bundle_on_create=all(p.apply_service_bundle_on_create for p in profiles),
        allows_fast_track_to_approved=all(p.allows_fast_track_to_approved for p in profiles),
    )


def get_workflow_profile(work_order):
    """
    Return the effective workflow profile for a work order.
    When multiple job types are set, merges profiles conservatively.
    """
    job_types = _iter_job_types(work_order)
    profiles = [
        jt.workflow_profile
        for jt in job_types
        if getattr(jt, 'workflow_profile', None) is not None
    ]
    if profiles:
        return _merge_profiles(profiles)

    maintenance_type = getattr(work_order, 'maintenance_type', None)
    if maintenance_type == LEGACY_ROUTINE_MAINTENANCE_TYPE:
        from .job_types import WorkflowProfile

        return WorkflowProfile.objects.filter(code='routine_fast_track', is_active=True).first()

    from .job_types import WorkflowProfile

    return WorkflowProfile.objects.filter(code='full_repair', is_active=True).first()


def get_effective_workflow_profile(work_order):
    """Alias for get_workflow_profile (effective merge across job types)."""
    return get_workflow_profile(work_order)


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
    code = get_profile_code(work_order)
    if code not in {'inspection_only', 'diagnostic_only'}:
        return False
    # Only when all profiles agree on the same simplified code
    job_types = _iter_job_types(work_order)
    profiles = [jt.workflow_profile for jt in job_types if getattr(jt, 'workflow_profile', None)]
    if len(profiles) > 1 and len({p.code for p in profiles}) > 1:
        return False
    return True


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
    job_types = _iter_job_types(work_order)
    if job_types and not any(jt.requires_inspection for jt in job_types):
        return False
    return True


def work_order_requires_diagnosis(work_order) -> bool:
    """True when this work order follows the diagnosis / approval path."""
    if profile_skips_diagnosis(work_order):
        return False
    job_types = _iter_job_types(work_order)
    if job_types and not any(jt.requires_diagnosis for jt in job_types):
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


def resolve_job_types_for_create(*, job_type_codes=None, job_type_code=None, job_type=None, maintenance_type=None):
    """
    Resolve primary + list of JobType instances for multi-select create/update.
    Returns (primary_job_type, [job_types]).
    """
    from .job_types import JobType

    codes = []
    if job_type_codes:
        if isinstance(job_type_codes, str):
            codes = [c.strip() for c in job_type_codes.split(',') if c.strip()]
        else:
            codes = [str(c).strip() for c in job_type_codes if str(c).strip()]

    primary = resolve_job_type_for_create(
        job_type=job_type,
        job_type_code=job_type_code or (codes[0] if codes else None),
        maintenance_type=maintenance_type,
    )

    resolved = []
    if codes:
        by_code = {
            jt.code: jt
            for jt in JobType.objects.filter(code__in=codes, is_active=True).select_related('workflow_profile')
        }
        for code in codes:
            if code in by_code:
                resolved.append(by_code[code])
    if primary and primary not in resolved:
        resolved.insert(0, primary)
    elif not resolved and primary:
        resolved = [primary]

    return primary, resolved


def apply_job_type_on_create(work_order, job_type, *, user=None, job_types=None):
    """Apply job type defaults and profile-driven bundle/fast-track after WO create."""
    from .services import apply_service_bundle, prepare_routine_service_workflow

    types = list(job_types or [])
    if job_type and job_type not in types:
        types.insert(0, job_type)
    if not types and not job_type:
        return False

    primary = job_type or types[0]
    work_order.job_type = primary
    primary.apply_defaults_to_work_order(work_order, overwrite=True)

    # OR commercial flags across all selected types
    for jt in types:
        if getattr(jt, 'sets_warranty_flag', False):
            work_order.is_warranty = True
        if getattr(jt, 'sets_insurance_flag', False):
            work_order.is_insurance_claim = True

    # Use effective (merged) profile for skip/auto-approve
    # Temporarily attach types for merge before M2M is set
    work_order._effective_job_types_cache = types
    profile = get_workflow_profile(work_order)
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

    if types:
        work_order.job_types.set(types)

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
