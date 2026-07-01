"""Seed data for workflow profiles and job types."""

from __future__ import annotations

PROFILE_DEFINITIONS = [
    {
        'code': 'full_repair',
        'name': 'Full Repair',
        'description': 'Standard inspection → diagnosis → approval → repair → QC → invoice → close.',
        'sort_order': 1,
        'skip_inspection': False,
        'skip_diagnosis': False,
        'skip_customer_approval': False,
        'skip_quality_check': False,
        'auto_approve_on_create': False,
        'apply_service_bundle_on_create': False,
        'allows_fast_track_to_approved': False,
    },
    {
        'code': 'routine_fast_track',
        'name': 'Routine Fast Track',
        'description': 'Pre-defined service package; skips inspection, diagnosis, and approval.',
        'sort_order': 2,
        'skip_inspection': True,
        'skip_diagnosis': True,
        'skip_customer_approval': True,
        'skip_quality_check': True,
        'auto_approve_on_create': True,
        'apply_service_bundle_on_create': True,
        'allows_fast_track_to_approved': True,
    },
    {
        'code': 'diagnostic_only',
        'name': 'Diagnostic Only',
        'description': 'Diagnosis and quotation without a default repair path.',
        'sort_order': 3,
        'skip_inspection': False,
        'skip_diagnosis': False,
        'skip_customer_approval': False,
        'skip_quality_check': True,
        'auto_approve_on_create': False,
        'apply_service_bundle_on_create': False,
        'allows_fast_track_to_approved': False,
    },
    {
        'code': 'inspection_only',
        'name': 'Inspection Only',
        'description': 'Vehicle inspection with report; no repair workflow by default.',
        'sort_order': 4,
        'skip_inspection': False,
        'skip_diagnosis': True,
        'skip_customer_approval': False,
        'skip_quality_check': True,
        'auto_approve_on_create': False,
        'apply_service_bundle_on_create': False,
        'allows_fast_track_to_approved': False,
    },
    {
        'code': 'body_collision',
        'name': 'Body & Collision',
        'description': 'Body and paint work with estimate and insurance-oriented flow.',
        'sort_order': 5,
        'skip_inspection': False,
        'skip_diagnosis': False,
        'skip_customer_approval': False,
        'skip_quality_check': False,
        'auto_approve_on_create': False,
        'apply_service_bundle_on_create': False,
        'allows_fast_track_to_approved': False,
    },
    {
        'code': 'warranty_insurance',
        'name': 'Warranty / Insurance',
        'description': 'Full repair flow with warranty or insurance billing context.',
        'sort_order': 6,
        'skip_inspection': False,
        'skip_diagnosis': False,
        'skip_customer_approval': False,
        'skip_quality_check': False,
        'auto_approve_on_create': False,
        'apply_service_bundle_on_create': False,
        'allows_fast_track_to_approved': False,
    },
]

JOB_TYPE_DEFINITIONS = [
    ('general_repairs', 'General Repairs', 'repair', 'full_repair', 10, {}),
    ('routine_maintenance', 'Routine Maintenance', 'maintenance', 'routine_fast_track', 20, {
        'allows_bundle': True,
        'requires_inspection': False,
        'requires_diagnosis': False,
        'requires_approval': False,
        'quality_check_required': False,
    }),
    ('diagnostic_inspection', 'Diagnostic Inspection', 'diagnostic', 'diagnostic_only', 30, {
        'quality_check_required': False,
    }),
    ('brake_service', 'Brake Service', 'repair', 'full_repair', 40, {'allows_bundle': True}),
    ('suspension_repair', 'Suspension Repair', 'repair', 'full_repair', 50, {}),
    ('steering_repair', 'Steering Repair', 'repair', 'full_repair', 60, {}),
    ('engine_repair', 'Engine Repair', 'repair', 'full_repair', 70, {}),
    ('transmission_repair', 'Transmission Repair', 'repair', 'full_repair', 80, {}),
    ('electrical_repair', 'Electrical Repair', 'repair', 'full_repair', 90, {}),
    ('electronic_diagnostics', 'Electronic Diagnostics', 'diagnostic', 'diagnostic_only', 100, {
        'quality_check_required': False,
    }),
    ('air_conditioning_service', 'Air Conditioning Service', 'repair', 'full_repair', 110, {'allows_bundle': True}),
    ('tyre_service', 'Tyre Service', 'maintenance', 'routine_fast_track', 120, {
        'allows_bundle': True,
        'requires_inspection': False,
        'requires_diagnosis': False,
        'requires_approval': False,
        'quality_check_required': False,
    }),
    ('wheel_alignment', 'Wheel Alignment', 'maintenance', 'routine_fast_track', 130, {
        'allows_bundle': True,
        'requires_inspection': False,
        'requires_diagnosis': False,
        'requires_approval': False,
        'quality_check_required': False,
    }),
    ('cooling_system_repair', 'Cooling System Repair', 'repair', 'full_repair', 140, {}),
    ('fuel_system_repair', 'Fuel System Repair', 'repair', 'full_repair', 150, {}),
    ('exhaust_system_repair', 'Exhaust System Repair', 'repair', 'full_repair', 160, {}),
    ('body_repair', 'Body Repair', 'body', 'body_collision', 170, {}),
    ('paint_work', 'Paint Work', 'body', 'body_collision', 180, {}),
    ('accident_repair', 'Accident Repair', 'body', 'body_collision', 190, {'sets_insurance_flag': True}),
    ('warranty_repair', 'Warranty Repair', 'commercial', 'warranty_insurance', 200, {'sets_warranty_flag': True}),
    ('insurance_repair', 'Insurance Repair', 'commercial', 'warranty_insurance', 210, {'sets_insurance_flag': True}),
    ('vehicle_inspection', 'Vehicle Inspection', 'inspection', 'inspection_only', 220, {
        'requires_diagnosis': False,
        'quality_check_required': False,
    }),
    ('accessories_installation', 'Accessories Installation', 'installation', 'routine_fast_track', 230, {
        'allows_bundle': True,
        'requires_inspection': False,
        'requires_diagnosis': False,
        'requires_approval': False,
        'quality_check_required': False,
    }),
]


# Default income category codes for predefined job types (amounts set on RevenueProduct.default_unit_price).
JOB_TYPE_DEFAULT_REVENUE_PRODUCT = {
    'vehicle_inspection': 'service_vehicle_assessment',
    'diagnostic_inspection': 'service_diagnosis',
    'electronic_diagnostics': 'service_diagnosis',
    'paint_work': 'labor_spraying',
    'body_repair': 'labor_body',
    'accident_repair': 'labor_body',
    'wheel_alignment': 'service_wheel_alignment',
    'air_conditioning_service': 'labor_ac',
    'electrical_repair': 'labor_electrical',
}


def seed_workflow_profiles_and_job_types(*, overwrite=False):
    from .job_types import JobType, WorkflowProfile

    revenue_by_code = {}
    try:
        from apps.accounting.models import RevenueProduct

        revenue_by_code = {
            row.code: row
            for row in RevenueProduct.objects.filter(is_active=True).only('id', 'code')
        }
    except Exception:
        revenue_by_code = {}

    profiles_by_code = {}
    for profile_data in PROFILE_DEFINITIONS:
        code = profile_data['code']
        defaults = {**profile_data, 'is_predefined': True, 'is_active': True}
        if overwrite:
            profile, _ = WorkflowProfile.objects.update_or_create(code=code, defaults=defaults)
        else:
            profile, created = WorkflowProfile.objects.get_or_create(code=code, defaults=defaults)
            if not created and overwrite:
                for key, value in defaults.items():
                    setattr(profile, key, value)
                profile.save()
        profiles_by_code[code] = profile

    created_types = 0
    updated_types = 0
    for code, name, category, profile_code, sort_order, extras in JOB_TYPE_DEFINITIONS:
        profile = profiles_by_code[profile_code]
        defaults = {
            'name': name,
            'category': category,
            'workflow_profile': profile,
            'sort_order': sort_order,
            'is_predefined': True,
            'is_active': True,
            'requires_inspection': extras.get('requires_inspection', True),
            'requires_diagnosis': extras.get('requires_diagnosis', True),
            'requires_approval': extras.get('requires_approval', True),
            'quality_check_required': extras.get('quality_check_required', True),
            'allows_bundle': extras.get('allows_bundle', False),
            'sets_warranty_flag': extras.get('sets_warranty_flag', False),
            'sets_insurance_flag': extras.get('sets_insurance_flag', False),
        }
        if overwrite:
            job_type, created = JobType.objects.update_or_create(code=code, defaults=defaults)
            if created:
                created_types += 1
            else:
                updated_types += 1
        else:
            job_type, created = JobType.objects.get_or_create(code=code, defaults=defaults)
            if created:
                created_types += 1

        revenue_code = JOB_TYPE_DEFAULT_REVENUE_PRODUCT.get(code)
        if revenue_code and revenue_code in revenue_by_code:
            product = revenue_by_code[revenue_code]
            if overwrite or not job_type.default_revenue_product_id:
                job_type.default_revenue_product = product
                job_type.save(update_fields=['default_revenue_product', 'updated_at'])

    return {
        'profiles': len(profiles_by_code),
        'job_types_created': created_types,
        'job_types_updated': updated_types,
    }


def backfill_work_order_job_types():
    from .job_types import JobType
    from .models import WorkOrder

    general = JobType.objects.filter(code='general_repairs').first()
    routine = JobType.objects.filter(code='routine_maintenance').first()
    if not general and not routine:
        return 0

    updated = 0
    for work_order in WorkOrder.objects.filter(job_type__isnull=True).iterator():
        if work_order.maintenance_type == 'routine' and routine:
            work_order.job_type = routine
        elif general:
            work_order.job_type = general
        else:
            continue
        work_order.save(update_fields=['job_type', 'updated_at'])
        updated += 1
    return updated
