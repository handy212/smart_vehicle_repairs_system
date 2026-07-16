from datetime import timedelta

from rest_framework import serializers
from django.utils import timezone
from django.utils.text import slugify
from decimal import Decimal
from apps.accounts.permissions import filter_workorders_for_user
from drf_spectacular.utils import extend_schema_field, inline_serializer
from drf_spectacular.types import OpenApiTypes
from .models import (
    WorkOrder, ServiceTask, ServiceTaskType, WorkOrderPart, 
    TechnicianTimeLog, WorkOrderNote, WorkOrderPhoto
)
from .job_type_serializers import JobTypeListSerializer
from .job_types import JobType
from .workflow_profile_service import (
    resolve_job_type_for_create,
    resolve_job_types_for_create,
    apply_job_type_on_create,
)


def sync_technician_assignments(
    work_order,
    *,
    assigned_technicians=None,
    technician_assignments=None,
    primary_technician=None,
):
    """
    Sync WorkOrderTechnicianAssignment rows from either a plain ID list
    or nested technician_assignments with responsibility notes.
    """
    from .models import WorkOrderTechnicianAssignment
    from apps.accounts.models import User

    primary_id = getattr(primary_technician, 'id', primary_technician)

    if technician_assignments is not None:
        desired = []
        for row in technician_assignments:
            tech_id = row.get('technician') if isinstance(row, dict) else None
            if tech_id is None:
                continue
            tech_id = getattr(tech_id, 'id', tech_id)
            desired.append({
                'technician_id': int(tech_id),
                'responsibility_notes': (row.get('responsibility_notes') or '').strip(),
                'is_primary': bool(row.get('is_primary')) or (primary_id and int(tech_id) == int(primary_id)),
            })
        # Ensure primary is included
        if primary_id and not any(d['technician_id'] == int(primary_id) for d in desired):
            desired.insert(0, {
                'technician_id': int(primary_id),
                'responsibility_notes': '',
                'is_primary': True,
            })
        keep_ids = {d['technician_id'] for d in desired}
        work_order.technician_assignments.exclude(technician_id__in=keep_ids).delete()
        for d in desired:
            WorkOrderTechnicianAssignment.objects.update_or_create(
                work_order=work_order,
                technician_id=d['technician_id'],
                defaults={
                    'responsibility_notes': d['responsibility_notes'],
                    'is_primary': d['is_primary'],
                },
            )
        return

    if assigned_technicians is None:
        return

    tech_ids = []
    for tech in assigned_technicians:
        tech_ids.append(getattr(tech, 'id', tech))
    if primary_id and int(primary_id) not in [int(t) for t in tech_ids]:
        tech_ids.insert(0, int(primary_id))

    keep_ids = {int(t) for t in tech_ids}
    work_order.technician_assignments.exclude(technician_id__in=keep_ids).delete()
    for tid in tech_ids:
        WorkOrderTechnicianAssignment.objects.update_or_create(
            work_order=work_order,
            technician_id=int(tid),
            defaults={
                'is_primary': bool(primary_id and int(tid) == int(primary_id)),
            },
        )
from django.contrib.auth import get_user_model
from apps.customers.serializers import CustomerListSerializer
from apps.vehicles.serializers import VehicleListSerializer
from apps.appointments.serializers import AppointmentListSerializer

User = get_user_model()


# ============= Work Order Serializers =============

def build_customer_display_name(customer):
    if not customer:
        return None

    if getattr(customer, "company_name", None):
        return customer.company_name

    if getattr(customer, "full_name", None):
        return customer.full_name

    if getattr(customer, "user", None):
        full_name = customer.user.get_full_name()
        if full_name:
            return full_name
        if getattr(customer.user, "username", None):
            return customer.user.username

    return None

class WorkOrderListSerializer(serializers.ModelSerializer):
    """List view with nested customer/vehicle info"""
    customer_name = serializers.SerializerMethodField()
    vehicle_info = serializers.SerializerMethodField()
    vehicle_display = serializers.SerializerMethodField()
    primary_technician_name = serializers.SerializerMethodField()
    service_coordinator_name = serializers.SerializerMethodField()
    diagnosis_status = serializers.SerializerMethodField()
    has_technician_assignment = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)
    days_in_shop = serializers.IntegerField(read_only=True)
    task_count = serializers.SerializerMethodField()
    parts_count = serializers.SerializerMethodField()
    total_cost = serializers.SerializerMethodField()
    estimate_summary = serializers.SerializerMethodField()
    invoice_summary = serializers.SerializerMethodField()
    gate_pass_status = serializers.SerializerMethodField()
    current_inspection_status = serializers.SerializerMethodField()
    current_inspection_status_display = serializers.SerializerMethodField()
    current_inspection_completion_percentage = serializers.SerializerMethodField()
    current_quote_stage = serializers.SerializerMethodField()
    current_quote_stage_display = serializers.SerializerMethodField()
    job_type_detail = JobTypeListSerializer(source='job_type', read_only=True)
    workflow_profile_code = serializers.SerializerMethodField()
    maintenance_type = serializers.CharField(read_only=True)
    maintenance_type_display = serializers.SerializerMethodField()
    assigned_personnel_display = serializers.SerializerMethodField()
    
    class Meta:
        model = WorkOrder
        fields = [
            'id', 'work_order_number', 'status', 'paused_from_status', 'priority',
            'customer', 'customer_name', 'vehicle', 'vehicle_info', 'vehicle_display',
            'brought_by_type', 'brought_by_contact', 'brought_by_name',
            'brought_by_phone', 'brought_by_email', 'brought_by_relationship',
            'primary_technician', 'primary_technician_name',
            'service_coordinator', 'service_coordinator_name',
            'diagnosis_status', 'has_technician_assignment',
            'maintenance_type', 'maintenance_type_display', 'assigned_personnel_display',
            'created_at', 'started_at', 'completed_at', 'estimated_completion',
            'estimated_total', 'actual_total', 'total_cost', 'is_overdue', 'days_in_shop',
            'is_customer_waiting', 'requires_approval', 'approved_by_customer',
            'quality_check_required', 'quality_check_completed',
            'task_count', 'parts_count', 'estimate_summary', 'invoice_summary',
            'gate_pass_status', 'current_inspection_status',
            'current_inspection_status_display', 'current_inspection_completion_percentage',
            'current_quote_stage', 'current_quote_stage_display',
            'maintenance_type', 'job_type', 'job_type_detail', 'workflow_profile_code',
        ]
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_gate_pass_status(self, obj):
        gate_passes = obj.gate_passes.all()
        if gate_passes:
            for gp in gate_passes:
                if gp.status == 'completed':
                    return 'completed'
            return gate_passes[0].status
        return None

    def _get_latest_inspection(self, obj):
        inspections = getattr(obj, "inspections", None)
        if inspections is None:
            return None
        if hasattr(inspections, "all"):
            inspections = inspections.all()
        return inspections[0] if inspections else None
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_customer_name(self, obj):
        return build_customer_display_name(obj.customer) or "N/A"

    @extend_schema_field(OpenApiTypes.STR)
    def get_current_inspection_status(self, obj):
        inspection = self._get_latest_inspection(obj)
        return getattr(inspection, "status", None)

    @extend_schema_field(OpenApiTypes.STR)
    def get_current_inspection_status_display(self, obj):
        inspection = self._get_latest_inspection(obj)
        return inspection.get_status_display() if inspection else None

    @extend_schema_field(OpenApiTypes.INT)
    def get_current_inspection_completion_percentage(self, obj):
        inspection = self._get_latest_inspection(obj)
        return getattr(inspection, "completion_percentage", None) if inspection else None

    @extend_schema_field(OpenApiTypes.STR)
    def get_current_quote_stage(self, obj):
        return obj.get_current_quote_stage()

    @extend_schema_field(OpenApiTypes.STR)
    def get_current_quote_stage_display(self, obj):
        return obj.get_current_quote_stage_display()

    @extend_schema_field(OpenApiTypes.STR)
    def get_workflow_profile_code(self, obj):
        from .workflow_profile_service import get_workflow_profile
        profile = get_workflow_profile(obj)
        return profile.code if profile else None
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_vehicle_info(self, obj):
        if obj.vehicle:
            return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model} - {obj.vehicle.license_plate}"
        return "N/A"
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_vehicle_display(self, obj):
        return self.get_vehicle_info(obj)
    
    @extend_schema_field(OpenApiTypes.DECIMAL)
    def get_total_cost(self, obj):
        """Customer-facing billing total: linked invoice total (what they pay), not shop estimate."""
        invoice = self._get_invoice(obj)
        if invoice is not None:
            return str(invoice.total)
        return None
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_primary_technician_name(self, obj):
        if obj.primary_technician:
            return f"{obj.primary_technician.first_name} {obj.primary_technician.last_name}"
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_quality_check_assigned_to_name(self, obj):
        assignee = getattr(obj, 'quality_check_assigned_to', None)
        if assignee:
            name = f"{assignee.first_name} {assignee.last_name}".strip()
            return name or assignee.username
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_service_coordinator_name(self, obj):
        if obj.service_coordinator:
            return f"{obj.service_coordinator.first_name} {obj.service_coordinator.last_name}".strip()
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_diagnosis_status(self, obj):
        diagnosis = obj.get_linked_diagnosis() if hasattr(obj, 'get_linked_diagnosis') else getattr(obj, 'diagnosis', None)
        return getattr(diagnosis, 'status', None)

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_has_technician_assignment(self, obj):
        if obj.primary_technician_id:
            return True
        annotated = getattr(obj, 'assigned_technician_count', None)
        if annotated is not None:
            return annotated > 0
        return obj.assigned_technicians.exists()

    @extend_schema_field(OpenApiTypes.STR)
    def get_maintenance_type_display(self, obj):
        return obj.get_maintenance_type_display()

    @extend_schema_field(OpenApiTypes.STR)
    def get_assigned_personnel_display(self, obj):
        names = []
        if obj.primary_technician:
            names.append(
                f"{obj.primary_technician.first_name} {obj.primary_technician.last_name}".strip()
            )
        for tech in obj.assigned_technicians.all():
            full_name = f"{tech.first_name} {tech.last_name}".strip()
            if full_name and full_name not in names:
                names.append(full_name)
        return ', '.join(names) if names else ''
    
    @extend_schema_field(OpenApiTypes.INT)
    def get_task_count(self, obj):
        annotated = getattr(obj, 'task_count_annotated', None)
        if annotated is not None:
            return annotated
        return obj.tasks.count()
    
    @extend_schema_field(OpenApiTypes.INT)
    def get_parts_count(self, obj):
        annotated = getattr(obj, 'parts_count_annotated', None)
        if annotated is not None:
            return annotated
        return obj.parts.count()

    def _get_estimate(self, obj):
        estimate = getattr(obj, 'estimate', None)
        if estimate and estimate.status != 'draft':
            return estimate

        try:
            from apps.billing.models import Estimate
        except Exception:
            return None

        return (
            Estimate.objects.filter(
                reference_number=f"WO:{obj.id}",
                customer=obj.customer,
                vehicle=obj.vehicle,
            )
            .exclude(status__in=['draft', 'converted'])
            .order_by('-created_at')
            .first()
        )

    def _get_invoice(self, obj):
        from apps.billing.work_order_invoices import get_primary_invoice

        request = self.context.get('request')
        for_customer = getattr(getattr(request, 'user', None), 'role', None) == 'customer'
        return get_primary_invoice(obj, for_customer=for_customer)

    @extend_schema_field(serializers.DictField())
    def get_estimate_summary(self, obj):
        estimate = self._get_estimate(obj)
        if not estimate:
            return None

        return {
            'id': estimate.id,
            'estimate_number': estimate.estimate_number,
            'status': estimate.status,
            'total': str(estimate.total),
            'reference_number': estimate.reference_number,
            'estimate_date': estimate.estimate_date.isoformat() if estimate.estimate_date else None,
            'approved_date': estimate.approved_date.isoformat() if estimate.approved_date else None,
            'created_at': estimate.created_at.isoformat() if estimate.created_at else None,
        }

    @extend_schema_field(serializers.DictField())
    def get_invoice_summary(self, obj):
        from apps.billing.work_order_invoices import invoice_summary_payload

        invoice = self._get_invoice(obj)
        if not invoice:
            return None
        return invoice_summary_payload(invoice)


class WorkOrderDetailSerializer(serializers.ModelSerializer):
    """Detailed view with all related data"""
    customer = CustomerListSerializer(read_only=True)
    vehicle = VehicleListSerializer(read_only=True)
    appointment = AppointmentListSerializer(read_only=True)

    primary_technician_name = serializers.SerializerMethodField()
    service_coordinator_name = serializers.SerializerMethodField()
    diagnosis_status = serializers.SerializerMethodField()
    has_technician_assignment = serializers.SerializerMethodField()
    vehicle_display = serializers.SerializerMethodField()
    technician_names = serializers.CharField(read_only=True)
    assigned_technicians_detail = serializers.SerializerMethodField()
    
    # Computed properties
    is_overdue = serializers.BooleanField(read_only=True)
    days_in_shop = serializers.IntegerField(read_only=True)
    is_approved = serializers.BooleanField(read_only=True)
    cost_variance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    cost_variance_percentage = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    has_completed_inspection = serializers.SerializerMethodField()
    
    # Created by info
    created_by_name = serializers.SerializerMethodField()
    
    # Related work order info
    related_work_order_detail = serializers.SerializerMethodField()
    rework_work_orders = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    estimate_summary = serializers.SerializerMethodField()
    invoice_summary = serializers.SerializerMethodField()
    related_invoices = serializers.SerializerMethodField()
    gate_pass_status = serializers.SerializerMethodField()
    current_inspection_status = serializers.SerializerMethodField()
    current_inspection_status_display = serializers.SerializerMethodField()
    current_inspection_completion_percentage = serializers.SerializerMethodField()
    current_quote_stage = serializers.SerializerMethodField()
    current_quote_stage_display = serializers.SerializerMethodField()
    job_type_detail = JobTypeListSerializer(source='job_type', read_only=True)
    job_types_detail = JobTypeListSerializer(source='job_types', many=True, read_only=True)
    job_type_codes = serializers.SerializerMethodField()
    workflow_profile_code = serializers.SerializerMethodField()
    technician_assignment_status_display = serializers.SerializerMethodField()
    requires_assignment_acceptance = serializers.SerializerMethodField()
    inventory_availability_summary = serializers.SerializerMethodField()
    quality_check_assigned_to_name = serializers.SerializerMethodField()
    approval_terms = serializers.SerializerMethodField()
    
    class Meta:
        model = WorkOrder
        fields = [
            'id', 'work_order_number', 'access_token', 'branch', 'appointment',
            'customer', 'customer_name', 'vehicle', 'status', 'paused_from_status', 'priority',
            'brought_by_type', 'brought_by_contact', 'brought_by_name',
            'brought_by_phone', 'brought_by_email', 'brought_by_relationship',
            'service_coordinator', 'primary_technician', 'assigned_technicians',
            'primary_technician_name', 'service_coordinator_name',
            'diagnosis_status', 'has_technician_assignment',
            'technician_assignment_status', 'technician_assignment_status_display',
            'technician_assignment_note', 'technician_assignment_responded_at',
            'technician_assignment_responded_by',
            'requires_assignment_acceptance', 'inventory_availability_summary',
            'vehicle_display', 'technician_names',
            'assigned_technicians_detail', 'created_at', 'updated_at',
            'started_at', 'completed_at', 'estimated_completion',
            'customer_concerns', 'special_instructions',
            'customer_rating', 'customer_feedback',
            'diagnosis_notes', 'diagnosis_completed_at', 'diagnosis_by',
            'requires_approval', 'approval_requested_at', 'approved_at',
            'approved_by_customer', 'approval_method', 'approval_notes', 'approval_terms',
            'estimated_labor_hours', 'estimated_labor_cost', 'estimated_parts_cost',
            'estimated_total', 'actual_labor_hours', 'actual_labor_cost',
            'actual_parts_cost', 'actual_total', 'odometer_in', 'odometer_out',
            'fuel_level', 'battery_condition', 'valuables_notes', 'warning_lights_notes',
            'quality_check_required', 'quality_check_completed', 'quality_check_by',
            'quality_check_assigned_to', 'quality_check_assigned_to_name',
            'quality_check_at', 'quality_check_notes', 'quality_check_passed',
            'created_by', 'created_by_name', 'is_warranty', 'is_recall', 'is_insurance_claim',
            'is_customer_waiting', 'is_warranty_rework', 'related_work_order',
            'related_work_order_detail', 'rework_work_orders', 'warranty_reason',
            'maintenance_type', 'service_type', 'service_bundle', 'job_type', 'job_type_detail',
            'job_types', 'job_types_detail', 'job_type_codes',
            'workflow_profile_code',
            'is_overdue', 'days_in_shop', 'is_approved',
            'cost_variance', 'cost_variance_percentage', 'has_completed_inspection',
            'estimate_summary', 'invoice_summary', 'related_invoices', 'gate_pass_status',
            'current_inspection_status', 'current_inspection_status_display',
            'current_inspection_completion_percentage',
            'current_quote_stage', 'current_quote_stage_display',
            'customer_discontinuation_reason', 'customer_discontinuation_notes',
            'customer_discontinued_at', 'customer_discontinued_by',
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_gate_pass_status(self, obj):
        gate_passes = obj.gate_passes.all()
        if gate_passes:
            for gp in gate_passes:
                if gp.status == 'completed':
                    return 'completed'
            return gate_passes[0].status
        return None

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_has_completed_inspection(self, obj):
        inspections = getattr(obj, 'inspections', None)
        if inspections is None:
            return False
        return inspections.filter(status__in=['completed', 'approved']).exists()

    def _get_latest_inspection(self, obj):
        inspections = getattr(obj, "inspections", None)
        if inspections is None:
            return None
        if hasattr(inspections, "all"):
            inspections = inspections.all()
        return inspections[0] if inspections else None

    @extend_schema_field(OpenApiTypes.STR)
    def get_customer_name(self, obj):
        return build_customer_display_name(obj.customer) or "N/A"

    @extend_schema_field(OpenApiTypes.STR)
    def get_current_inspection_status(self, obj):
        inspection = self._get_latest_inspection(obj)
        return getattr(inspection, "status", None)

    @extend_schema_field(OpenApiTypes.STR)
    def get_current_inspection_status_display(self, obj):
        inspection = self._get_latest_inspection(obj)
        return inspection.get_status_display() if inspection else None

    @extend_schema_field(OpenApiTypes.INT)
    def get_current_inspection_completion_percentage(self, obj):
        inspection = self._get_latest_inspection(obj)
        return getattr(inspection, "completion_percentage", None) if inspection else None

    @extend_schema_field(OpenApiTypes.STR)
    def get_current_quote_stage(self, obj):
        return obj.get_current_quote_stage()

    @extend_schema_field(OpenApiTypes.STR)
    def get_current_quote_stage_display(self, obj):
        return obj.get_current_quote_stage_display()

    @extend_schema_field(OpenApiTypes.STR)
    def get_workflow_profile_code(self, obj):
        from .workflow_profile_service import get_workflow_profile
        profile = get_workflow_profile(obj)
        return profile.code if profile else None

    def _get_estimate(self, obj):
        estimate = getattr(obj, 'estimate', None)
        if estimate and estimate.status != 'draft':
            return estimate

        try:
            from apps.billing.models import Estimate
        except Exception:
            return None

        return (
            Estimate.objects.filter(
                reference_number=f"WO:{obj.id}",
                customer=obj.customer,
                vehicle=obj.vehicle,
            )
            .exclude(status__in=['draft', 'converted'])
            .order_by('-created_at')
            .first()
        )

    def _get_invoice(self, obj):
        from apps.billing.work_order_invoices import get_primary_invoice

        request = self.context.get('request')
        for_customer = getattr(getattr(request, 'user', None), 'role', None) == 'customer'
        return get_primary_invoice(obj, for_customer=for_customer)
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_vehicle_display(self, obj):
        if obj.vehicle:
            return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model} - {obj.vehicle.license_plate}"
        return "N/A"

    @extend_schema_field(serializers.DictField())
    def get_estimate_summary(self, obj):
        estimate = self._get_estimate(obj)
        if not estimate:
            return None

        return {
            'id': estimate.id,
            'estimate_number': estimate.estimate_number,
            'status': estimate.status,
            'total': str(estimate.total),
            'reference_number': estimate.reference_number,
            'estimate_date': estimate.estimate_date.isoformat() if estimate.estimate_date else None,
            'approved_date': estimate.approved_date.isoformat() if estimate.approved_date else None,
            'created_at': estimate.created_at.isoformat() if estimate.created_at else None,
        }

    @extend_schema_field(serializers.DictField())
    def get_invoice_summary(self, obj):
        from apps.billing.work_order_invoices import get_primary_invoice, invoice_summary_payload

        invoice = self._get_invoice(obj)
        if not invoice:
            return None
        return invoice_summary_payload(invoice)

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_related_invoices(self, obj):
        from apps.billing.work_order_invoices import related_invoices_payload

        request = self.context.get('request')
        for_customer = getattr(getattr(request, 'user', None), 'role', None) == 'customer'
        rows = related_invoices_payload(obj, for_customer=for_customer)
        return rows if len(rows) > 1 else []
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_primary_technician_name(self, obj):
        if obj.primary_technician:
            return f"{obj.primary_technician.first_name} {obj.primary_technician.last_name}"
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_quality_check_assigned_to_name(self, obj):
        assignee = getattr(obj, 'quality_check_assigned_to', None)
        if assignee:
            name = f"{assignee.first_name} {assignee.last_name}".strip()
            return name or assignee.username
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_service_coordinator_name(self, obj):
        if obj.service_coordinator:
            return f"{obj.service_coordinator.first_name} {obj.service_coordinator.last_name}".strip()
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_diagnosis_status(self, obj):
        diagnosis = obj.get_linked_diagnosis() if hasattr(obj, 'get_linked_diagnosis') else getattr(obj, 'diagnosis', None)
        return getattr(diagnosis, 'status', None)

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_has_technician_assignment(self, obj):
        return bool(obj.primary_technician_id or obj.assigned_technicians.exists())

    @extend_schema_field(OpenApiTypes.STR)
    def get_technician_assignment_status_display(self, obj):
        status = obj.get_technician_assignment_gate_status()
        if not status:
            return ''
        return dict(WorkOrder.TECHNICIAN_ASSIGNMENT_STATUS_CHOICES).get(status, status)

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_requires_assignment_acceptance(self, obj):
        return obj.requires_technician_assignment_acceptance()

    @extend_schema_field(serializers.DictField())
    def get_inventory_availability_summary(self, obj):
        return obj.get_inventory_availability_summary()
    
    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_assigned_technicians_detail(self, obj):
        primary_id = obj.primary_technician_id
        assignments = {
            a.technician_id: a
            for a in obj.technician_assignments.select_related('technician').all()
        }
        result = []
        for tech in obj.assigned_technicians.all():
            assignment = assignments.get(tech.id)
            result.append({
                'id': tech.id,
                'name': f"{tech.first_name} {tech.last_name}".strip() or tech.email,
                'email': tech.email,
                'responsibility_notes': assignment.responsibility_notes if assignment else '',
                'is_primary': bool(
                    (assignment and assignment.is_primary) or (primary_id and tech.id == primary_id)
                ),
            })
        return result

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_job_type_codes(self, obj):
        codes = list(obj.job_types.values_list('code', flat=True))
        if not codes and obj.job_type_id:
            return [obj.job_type.code]
        return codes
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}"
        return None
    
    @extend_schema_field(serializers.DictField())
    def get_related_work_order_detail(self, obj):
        """Get details of related work order if this is a rework"""
        if obj.related_work_order:
            return {
                'id': obj.related_work_order.id,
                'work_order_number': obj.related_work_order.work_order_number,
                'completed_at': obj.related_work_order.completed_at,
                'status': obj.related_work_order.status,
            }
        return None
    
    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_rework_work_orders(self, obj):
        """Get list of rework work orders that reference this one"""
        reworks = obj.rework_work_orders.all()
        return [
            {
                'id': wo.id,
                'work_order_number': wo.work_order_number,
                'created_at': wo.created_at,
                'status': wo.status,
            }
            for wo in reworks
        ]

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_approval_terms(self, obj):
        from apps.accounts.terms_service import get_terms_for_document
        from apps.accounts.terms_models import TermsAcceptance
        if getattr(obj, 'estimate', None) or getattr(obj, 'estimate_id', None):
            return get_terms_for_document(TermsAcceptance.DOCUMENT_ESTIMATE)
        return get_terms_for_document(TermsAcceptance.DOCUMENT_WORK_ORDER)


class WorkOrderCreateSerializer(serializers.ModelSerializer):
    """Create work order with validation"""

    job_type_code = serializers.SlugField(
        write_only=True,
        required=False,
        help_text='Primary job type code (e.g. brake_service). Preferred over legacy maintenance_type.',
    )
    job_type_codes = serializers.ListField(
        child=serializers.SlugField(),
        write_only=True,
        required=False,
        help_text='All job type codes for this work order (multi-select). First/primary used when job_type_code omitted.',
    )
    technician_assignments = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        required=False,
        help_text='Optional [{technician, responsibility_notes, is_primary}] for team assignment with notes.',
    )
    
    class Meta:
        model = WorkOrder
        fields = [
            'id', 'work_order_number',
            'appointment', 'customer', 'vehicle', 'branch',
            'status', 'priority',
            'brought_by_type', 'brought_by_contact', 'brought_by_name',
            'brought_by_phone', 'brought_by_email', 'brought_by_relationship',
            'service_coordinator',
            'primary_technician', 'assigned_technicians', 'technician_assignments',
            'estimated_completion',
            'customer_concerns', 'special_instructions',
            'estimated_labor_hours', 'estimated_labor_cost',
            'estimated_parts_cost',
            'odometer_in',
            'fuel_level', 'battery_condition', 'valuables_notes', 'warning_lights_notes',
            'requires_approval', 'is_warranty', 'is_recall', 'is_insurance_claim',
            'is_customer_waiting', 'quality_check_required',
            'is_warranty_rework', 'related_work_order', 'warranty_reason',
            'maintenance_type', 'service_type', 'service_bundle',
            'job_type', 'job_type_code', 'job_type_codes',
        ]
    
    def validate(self, data):
        brought_by_type = data.get('brought_by_type', 'account_holder')
        brought_by_contact = data.get('brought_by_contact')
        brought_by_name = (data.get('brought_by_name') or '').strip()
        # Validate vehicle belongs to customer
        if data['vehicle'].owner != data['customer']:
            raise serializers.ValidationError(
                "Vehicle does not belong to the selected customer."
            )
        
        # If appointment provided, validate it matches customer/vehicle
        if data.get('appointment'):
            appt = data['appointment']
            if appt.customer != data['customer']:
                raise serializers.ValidationError(
                    "Appointment customer does not match work order customer."
                )
            if appt.vehicle != data['vehicle']:
                raise serializers.ValidationError(
                    "Appointment vehicle does not match work order vehicle."
                )
            if not data.get('job_type') and not self.initial_data.get('job_type_code'):
                if appt.job_type_id:
                    data['job_type'] = appt.job_type
                elif appt.service_type:
                    from .workflow_profile_service import resolve_job_type_for_appointment
                    appt_job_type = resolve_job_type_for_appointment(service_type=appt.service_type)
                    if appt_job_type:
                        data['job_type'] = appt_job_type
        
        # Validate estimated completion is in the future
        if data.get('estimated_completion'):
            if data['estimated_completion'] < timezone.now():
                raise serializers.ValidationError(
                    "Estimated completion must be in the future."
                )
        
        # Check for active work orders at other branches
        vehicle = data['vehicle']
        request = self.context.get('request')
        
        if request:
            from apps.branches.utils import resolve_branch
            current_branch = resolve_branch(request, branch_id=request.data.get('branch') or request.data.get('branch_id'))
            
            if current_branch:
                # Active work order statuses (not closed)
                active_statuses = [
                    'draft', 'inspection', 'intake', 'diagnosis', 
                    'awaiting_approval', 'approved', 'in_progress', 
                    'additional_work_found', 'paused', 'quality_check'
                ]
                
                # Check for active work orders at other branches
                active_work_orders = WorkOrder.objects.filter(
                    vehicle=vehicle,
                    status__in=active_statuses
                ).exclude(branch=current_branch).select_related('branch')
                
                if active_work_orders.exists():
                    active_wo = active_work_orders.first()
                    branch_name = active_wo.branch.name if active_wo.branch else 'Unknown Branch'
                    raise serializers.ValidationError(
                        f"This vehicle has an active work order ({active_wo.work_order_number}) "
                        f"at {branch_name}. A new work order can only be created once the existing "
                        f"work order has been closed at the branch where it was opened."
                    )
        
        # Validate odometer reading
        odometer_in = data.get('odometer_in')
        if vehicle and odometer_in is not None:
            if vehicle.current_mileage and odometer_in < vehicle.current_mileage:
                raise serializers.ValidationError({
                    'odometer_in': f"Odometer reading ({odometer_in}) cannot be less than the vehicle's current mileage ({vehicle.current_mileage})."
                })
        
        # Validate warranty rework fields
        is_warranty_rework = data.get('is_warranty_rework', False)
        related_work_order = data.get('related_work_order')
        
        if is_warranty_rework:
            if not related_work_order:
                raise serializers.ValidationError({
                    'related_work_order': 'Related work order is required when marking as warranty/rework.'
                })
            
            # Validate that related work order exists and is completed/closed
            try:
                related_wo = WorkOrder.objects.get(pk=related_work_order.id if hasattr(related_work_order, 'id') else related_work_order)
                if related_wo.status not in ['completed', 'invoiced', 'closed']:
                    raise serializers.ValidationError({
                        'related_work_order': 'Related work order must be completed, invoiced, or closed.'
                    })
                # Optionally validate same vehicle (comment out if cross-vehicle rework is allowed)
                # if related_wo.vehicle != data['vehicle']:
                #     raise serializers.ValidationError({
                #         'related_work_order': 'Related work order must be for the same vehicle.'
                #     })
            except WorkOrder.DoesNotExist:
                raise serializers.ValidationError({
                    'related_work_order': 'Related work order not found.'
                })
        
        # Check for repeat visits (non-blocking - stored in context for frontend)
        from django.conf import settings
        if getattr(settings, 'REPEAT_VISIT_ENABLED', False) and data.get('customer_concerns'):
            from .utils import detect_repeat_visit
            matches = detect_repeat_visit(
                vehicle=data['vehicle'],
                customer_concerns=data['customer_concerns'],
                days=getattr(settings, 'REPEAT_VISIT_DAYS', 30),
                similarity_threshold=getattr(settings, 'REPEAT_VISIT_SIMILARITY_THRESHOLD', 0.3)
            )
            if matches:
                # Store in context for use in create method
                self.context['repeat_visit_matches'] = matches

        customer = data.get('customer')
        if customer:
            customer_type = getattr(customer, 'customer_type', '')

            if brought_by_contact:
                if brought_by_contact.customer_id != customer.id:
                    raise serializers.ValidationError({
                        'brought_by_contact': 'Selected contact does not belong to the chosen customer account.'
                    })
                if customer_type not in {'business', 'fleet'}:
                    raise serializers.ValidationError({
                        'brought_by_contact': 'Saved contacts can only be used for business or fleet accounts.'
                    })

            if customer_type in {'business', 'fleet'}:
                if brought_by_type == 'saved_contact' and not brought_by_contact:
                    raise serializers.ValidationError({
                        'brought_by_contact': 'Select the business contact who brought the vehicle.'
                    })
                if brought_by_type == 'third_party' and not brought_by_name:
                    raise serializers.ValidationError({
                        'brought_by_name': 'Enter the name of the person who brought the vehicle.'
                    })
            else:
                if brought_by_type == 'saved_contact':
                    raise serializers.ValidationError({
                        'brought_by_type': 'Individual customers cannot use a saved business contact here.'
                    })
                if brought_by_type == 'third_party' and not brought_by_name:
                    raise serializers.ValidationError({
                        'brought_by_name': 'Enter the name of the driver or representative who brought the vehicle.'
                    })

            if brought_by_type == 'account_holder':
                data['brought_by_contact'] = None
                data['brought_by_name'] = ''
                data['brought_by_phone'] = ''
                data['brought_by_email'] = ''
                data['brought_by_relationship'] = ''
            elif brought_by_type == 'saved_contact' and brought_by_contact:
                data['brought_by_name'] = f"{brought_by_contact.first_name} {brought_by_contact.last_name}".strip()
                data['brought_by_phone'] = brought_by_contact.phone or data.get('brought_by_phone', '')
                data['brought_by_email'] = brought_by_contact.email or data.get('brought_by_email', '')
                data['brought_by_relationship'] = (
                    data.get('brought_by_relationship')
                    or brought_by_contact.job_title
                    or 'Business Contact'
                )

        job_type_codes = self.initial_data.get('job_type_codes')
        primary, resolved_types = resolve_job_types_for_create(
            job_type_codes=job_type_codes,
            job_type=data.get('job_type'),
            job_type_code=self.initial_data.get('job_type_code'),
            maintenance_type=data.get('maintenance_type'),
        )
        if primary is None:
            raise serializers.ValidationError({
                'job_type': 'A valid job type is required. Run seed_job_types or choose an active job type.',
            })
        data['job_type'] = primary
        self.context['_resolved_job_types'] = resolved_types

        # Bundle required when effective profile needs it (all selected types)
        from .workflow_profile_service import _merge_profiles
        profiles = [jt.workflow_profile for jt in resolved_types if jt.workflow_profile_id]
        effective = _merge_profiles(profiles) if profiles else None
        if effective and effective.apply_service_bundle_on_create:
            if not data.get('service_bundle') and not data.get('service_type'):
                raise serializers.ValidationError({
                    'service_bundle': 'A service package is required for this job type.',
                })

        if (
            primary.code == 'routine_maintenance'
            or (effective and effective.code == 'routine_fast_track' and effective.allows_fast_track_to_approved)
        ):
            data['maintenance_type'] = 'routine'
        else:
            data['maintenance_type'] = data.get('maintenance_type') or 'general'
        
        return data

    def to_representation(self, instance):
        """Include repeat visit matches in response"""
        data = super().to_representation(instance)
        
        # Add repeat visit matches if found during validation
        repeat_matches = self.context.get('repeat_visit_matches')
        if repeat_matches:
            # Clean up matches for JSON serialization (remove work_order instances)
            serializable_matches = []
            for match in repeat_matches:
                clean_match = {k: v for k, v in match.items() if k != 'work_order'}
                # Convert datetime to ISO format
                if 'completed_at' in clean_match and clean_match['completed_at']:
                    clean_match['completed_at'] = clean_match['completed_at'].isoformat()
                serializable_matches.append(clean_match)
            data['repeat_issue_matches'] = serializable_matches
            
        return data
    
    def create(self, validated_data):
        # Extract many-to-many / nested fields
        assigned_technicians = validated_data.pop('assigned_technicians', [])
        technician_assignments = validated_data.pop('technician_assignments', None)
        validated_data.pop('job_type_codes', None)
        
        # Extract repeat visit related fields
        is_warranty_rework = validated_data.pop('is_warranty_rework', False)
        related_work_order = validated_data.pop('related_work_order', None)
        warranty_reason = validated_data.pop('warranty_reason', '')
        related_work_order_id = getattr(related_work_order, 'id', related_work_order)
        
        if not validated_data.get('branch'):
            raise serializers.ValidationError({'branch': 'Branch is required.'})

        # Set created_by
        request = self.context.get('request')
        if request and request.user:
            validated_data['created_by'] = request.user
        
        # Handle warranty rework flag
        if is_warranty_rework:
            validated_data['is_warranty'] = True
            validated_data['is_warranty_rework'] = True
            if related_work_order:
                validated_data['related_work_order'] = related_work_order
            if warranty_reason:
                validated_data['warranty_reason'] = warranty_reason
        
        # Create work order — job type defaults applied after save
        validated_data.setdefault('requires_approval', True)
        job_type = validated_data.get('job_type')
        validated_data.pop('job_type_code', None)
        work_order = WorkOrder.objects.create(**validated_data)
        
        # Add assigned technicians (with optional responsibility notes)
        sync_technician_assignments(
            work_order,
            assigned_technicians=assigned_technicians,
            technician_assignments=technician_assignments,
            primary_technician=validated_data.get('primary_technician'),
        )
        
        # Create RepeatVisitAlert if matches were found
        repeat_visit_matches = self.context.get('repeat_visit_matches', [])
        if repeat_visit_matches and not is_warranty_rework:
            # Use the first (most similar) match
            match = repeat_visit_matches[0]
            from .models import RepeatVisitAlert
            from django.utils import timezone
            
            related_wo = match['work_order']
            days_since = match['days_ago']
            similarity = match['similarity']
            
            RepeatVisitAlert.objects.create(
                work_order=work_order,
                related_work_order=related_wo,
                days_since_previous=days_since,
                similarity_score=similarity,
                marked_as_warranty=is_warranty_rework
            )
        elif is_warranty_rework and related_work_order_id:
            # Create alert for warranty rework
            from .models import RepeatVisitAlert
            from django.utils import timezone
            from django.conf import settings
            
            try:
                related_wo = related_work_order or WorkOrder.objects.get(id=related_work_order_id)
                if related_wo.completed_at:
                    days_since = (timezone.now() - related_wo.completed_at).days
                else:
                    days_since = 0
                
                # Calculate similarity
                from .utils import calculate_concern_similarity
                similarity = calculate_concern_similarity(
                    work_order.customer_concerns,
                    related_wo.customer_concerns
                )
                
                RepeatVisitAlert.objects.create(
                    work_order=work_order,
                    related_work_order=related_wo,
                    days_since_previous=days_since,
                    similarity_score=similarity,
                    marked_as_warranty=True
                )
            except WorkOrder.DoesNotExist:
                pass  # Related work order not found, skip alert creation
        
        # Apply job type profile (bundle + fast-track) + multi job types
        resolved_types = self.context.get('_resolved_job_types') or ([job_type] if job_type else [])
        apply_job_type_on_create(
            work_order,
            job_type,
            user=request.user if request and request.user.is_authenticated else None,
            job_types=resolved_types,
        )
        work_order.refresh_from_db()
        
        return work_order


class WorkOrderUpdateSerializer(serializers.ModelSerializer):
    """Update work order"""

    job_type_code = serializers.SlugField(write_only=True, required=False)
    job_type_codes = serializers.ListField(
        child=serializers.SlugField(),
        write_only=True,
        required=False,
    )
    technician_assignments = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        required=False,
    )
    
    class Meta:
        model = WorkOrder
        fields = [
            'status', 'priority',
            'service_coordinator',
            'primary_technician', 'assigned_technicians', 'technician_assignments',
            'brought_by_type', 'brought_by_contact', 'brought_by_name',
            'brought_by_phone', 'brought_by_email', 'brought_by_relationship',
            'started_at', 'completed_at', 'estimated_completion',
            'customer_concerns', 'special_instructions',
            'diagnosis_notes', 'diagnosis_completed_at', 'diagnosis_by',
            'requires_approval', 'approval_requested_at',
            'approved_by_customer', 'approval_method', 'approval_notes',
            'estimated_labor_hours', 'estimated_labor_cost', 'estimated_parts_cost',
            'odometer_out',
            'fuel_level', 'battery_condition', 'valuables_notes', 'warning_lights_notes',
            'quality_check_required', 'quality_check_completed',
            'quality_check_by', 'quality_check_notes', 'quality_check_passed',
            'is_customer_waiting',
            'maintenance_type', 'service_type', 'service_bundle',
            'job_type', 'job_type_code', 'job_type_codes',
        ]
        read_only_fields = [
            'quality_check_completed',
            'quality_check_by',
            'quality_check_notes',
            'quality_check_passed',
        ]

    def _validate_branch_technician(self, technician, work_order, field_name):
        if technician.role != 'technician':
            raise serializers.ValidationError({field_name: "Only technicians can be assigned to diagnosis or repair work."})
        if work_order and work_order.branch_id and technician.branch_id != work_order.branch_id:
            raise serializers.ValidationError({field_name: "Assigned technician must belong to the same branch as the work order."})

    def _validate_branch_service_coordinator(self, coordinator, work_order):
        if not coordinator or not work_order or not work_order.branch_id:
            return

        if coordinator.role == 'service_coordinator' and coordinator.branch_id != work_order.branch_id:
            raise serializers.ValidationError({
                'service_coordinator': "Service Coordinator must belong to the same branch as the work order."
            })

        if coordinator.role == 'manager' and not coordinator.has_branch_access(work_order.branch):
            raise serializers.ValidationError({
                'service_coordinator': "Selected manager does not have access to this work order branch."
            })

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Override the queryset for service_coordinator to include all users
        # We'll validate the role in validate_service_coordinator instead
        from apps.accounts.models import User
        # Use all users as queryset so we can validate role in validate_service_coordinator
        self.fields['service_coordinator'].queryset = User.objects.all()
    
    def validate_service_coordinator(self, value):
        """Validate that service_coordinator has the correct role"""
        if value is None:
            return value  # Allow null/None
        
        # value will be a User instance at this point due to PrimaryKeyRelatedField
        user = value
        
        # Check if user has service_coordinator or manager role
        if user.role not in ['service_coordinator', 'manager']:
            raise serializers.ValidationError(
                f"User '{user.get_full_name()}' (ID: {user.id}, Role: {user.role}) does not have the required role. "
                f"Only users with role 'service_coordinator' or 'manager' can be assigned as Service Coordinator."
            )
        
        return user
        
    def validate(self, data):
        work_order = self.instance

        if self.instance and self.instance.status == 'closed':
            raise serializers.ValidationError(
                "Closed work orders cannot be edited."
            )

        primary_technician = data.get('primary_technician')
        assigned_technicians = data.get('assigned_technicians')
        service_coordinator = data.get('service_coordinator')

        if primary_technician:
            self._validate_branch_technician(primary_technician, work_order, 'primary_technician')

        if assigned_technicians is not None:
            for technician in assigned_technicians:
                self._validate_branch_technician(technician, work_order, 'assigned_technicians')

        if service_coordinator:
            self._validate_branch_service_coordinator(service_coordinator, work_order)

        job_type_codes = data.pop('job_type_codes', None)
        if job_type_codes is None:
            job_type_codes = self.initial_data.get('job_type_codes')

        job_type_code = data.pop('job_type_code', None)
        if job_type_code is None:
            job_type_code = self.initial_data.get('job_type_code')

        if job_type_codes or job_type_code:
            primary, resolved_types = resolve_job_types_for_create(
                job_type_codes=job_type_codes,
                job_type_code=job_type_code,
                job_type=data.get('job_type'),
            )
            if primary is None:
                raise serializers.ValidationError({
                    'job_type_code': f'Unknown or inactive job type: {job_type_code or job_type_codes}',
                })
            if work_order and work_order.job_type_id and primary.pk != work_order.job_type_id:
                from .workflow_profile_service import JOB_TYPE_CHANGE_ALLOWED_STATUSES
                if work_order.status not in JOB_TYPE_CHANGE_ALLOWED_STATUSES:
                    raise serializers.ValidationError({
                        'job_type_code': (
                            'Job type cannot be changed after work has progressed beyond inspection. '
                            f'Current status: {work_order.get_status_display()}.'
                        ),
                    })
            data['job_type'] = primary
            self.context['_resolved_job_types'] = resolved_types

        incoming_job_type = data.get('job_type')
        if (
            incoming_job_type
            and work_order
            and work_order.job_type_id
            and incoming_job_type.pk != work_order.job_type_id
            and not job_type_code
            and not job_type_codes
        ):
            from .workflow_profile_service import JOB_TYPE_CHANGE_ALLOWED_STATUSES
            if work_order.status not in JOB_TYPE_CHANGE_ALLOWED_STATUSES:
                raise serializers.ValidationError({
                    'job_type': (
                        'Job type cannot be changed after work has progressed beyond inspection. '
                        f'Current status: {work_order.get_status_display()}.'
                    ),
                })
            if not incoming_job_type.is_active:
                raise serializers.ValidationError({'job_type': 'Cannot assign an inactive job type.'})

        # Validate odometer reading
        odometer_out = data.get('odometer_out')
        if odometer_out is not None and self.instance and self.instance.vehicle:
            vehicle = self.instance.vehicle
            if vehicle.current_mileage and odometer_out < vehicle.current_mileage:
                raise serializers.ValidationError({
                    'odometer_out': f"Odometer reading ({odometer_out}) cannot be less than the vehicle's current mileage ({vehicle.current_mileage})."
                })
        return data
    
    def update(self, instance, validated_data):
        """
        Override update to handle status transitions properly using transition_to method.
        This ensures validation, notifications, and proper state management.
        """
        from django.core.exceptions import ValidationError
        
        # Extract status if it's being updated
        new_status = validated_data.pop('status', None)
        assigned_technicians = validated_data.pop('assigned_technicians', None)
        technician_assignments = validated_data.pop('technician_assignments', None)
        validated_data.pop('job_type_codes', None)
        old_primary_technician_id = instance.primary_technician_id
        old_assigned_ids = set(instance.assigned_technicians.values_list('id', flat=True))
        if assigned_technicians is not None:
            for technician in assigned_technicians:
                self._validate_branch_technician(technician, instance, 'assigned_technicians')

        new_service_coordinator = validated_data.get('service_coordinator')
        if new_service_coordinator:
            self._validate_branch_service_coordinator(new_service_coordinator, instance)
        
        # Check if service_coordinator is being assigned/changed (before updating)
        old_service_coordinator_id = instance.service_coordinator.id if instance.service_coordinator else None
        # After validation, service_coordinator will be a User instance
        new_service_coordinator_id = new_service_coordinator.id if new_service_coordinator and hasattr(new_service_coordinator, 'id') else None
        
        service_coordinator_changed = (
            new_service_coordinator is not None and 
            (old_service_coordinator_id is None or old_service_coordinator_id != new_service_coordinator_id)
        )
        
        old_job_type_id = instance.job_type_id
        old_status = instance.status

        # Update other fields first
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if technician_assignments is not None or assigned_technicians is not None:
            sync_technician_assignments(
                instance,
                assigned_technicians=assigned_technicians,
                technician_assignments=technician_assignments,
                primary_technician=validated_data.get('primary_technician', instance.primary_technician),
            )

        resolved_types = self.context.get('_resolved_job_types')
        if instance.job_type_id and instance.job_type_id != old_job_type_id:
            user = self.context.get('request').user if self.context.get('request') else None
            if old_status in ('draft', 'inspection'):
                apply_job_type_on_create(
                    instance,
                    instance.job_type,
                    user=user,
                    job_types=resolved_types,
                )
            else:
                instance.job_type.apply_defaults_to_work_order(instance, overwrite=True)
                if resolved_types:
                    instance.job_types.set(resolved_types)
                from .workflow_profile_service import sync_legacy_maintenance_type
                instance.maintenance_type = sync_legacy_maintenance_type(instance)
                instance.save(update_fields=[
                    'maintenance_type', 'is_warranty', 'is_insurance_claim',
                    'requires_approval', 'quality_check_required',
                ])
        elif resolved_types is not None:
            instance.job_types.set(resolved_types)

        new_primary_id = instance.primary_technician_id
        new_assigned_ids = (
            set(instance.assigned_technicians.values_list('id', flat=True))
            if (assigned_technicians is not None or technician_assignments is not None)
            else old_assigned_ids
        )
        technician_assignment_changed = (
            ('primary_technician' in validated_data and new_primary_id != old_primary_technician_id)
            or (
                (assigned_technicians is not None or technician_assignments is not None)
                and new_assigned_ids != old_assigned_ids
            )
        )
        if technician_assignment_changed:
            if new_primary_id or new_assigned_ids:
                instance.mark_technician_assignment_pending()
            else:
                instance.technician_assignment_status = ''
                instance.technician_assignment_note = ''
                instance.technician_assignment_responded_at = None
                instance.technician_assignment_responded_by = None
            
        # Check if maintenance type or service type implies applied bundle
        # We only apply if it wasn't applied before or explicit change. 
        # For simplicity, if changed to 'routine', apply it.
        # Note: This might duplicate items if applied multiple times. ideally we check if items exist.
        # But 'apply_service_bundle' is basic. We'll trust user intent.
        if instance.maintenance_type == 'routine' and instance.service_type:
            # We could check if we just switched to routine
            # For now, let's assuming if they update it, they might want to re-apply or apply.
            # But let's be careful not to spam parts.
            # Only apply if we have 0 parts? Or just let the user delete updates?
            # Let's simple check: if parts count is 0, auto apply.
            if instance.parts.count() == 0:
                 from .services import apply_service_bundle
                 apply_service_bundle(instance)
        
        # Handle status transition if status is being changed
        if new_status and new_status != instance.status:
            dedicated_endpoint_transitions = {
                ('approved', 'in_progress'),
                ('additional_work_found', 'in_progress'),
                ('diagnosis', 'in_progress'),
                ('assigned', 'in_progress'),
                ('paused', 'in_progress'),
            }
            if (instance.status, new_status) in dedicated_endpoint_transitions:
                from rest_framework.exceptions import ValidationError as DRFValidationError
                raise DRFValidationError({
                    'status': (
                        'This transition must use the workflow action endpoint '
                        '(start_work, resume, or request_approval) instead of a direct status update.'
                    ),
                })

            # Status changes must go through the same transition guards as workflow actions.
            try:
                user = self.context.get('request').user if self.context.get('request') else None
                instance.transition_to(new_status, user=user)
            except ValidationError as e:
                # Re-raise as DRF ValidationError so it's properly formatted
                from rest_framework.exceptions import ValidationError as DRFValidationError
                raise DRFValidationError({'status': str(e)})
        else:
            # If no status change or same status, just save normally
            instance.save()
        
        # Send notification if service coordinator was assigned/changed
        if service_coordinator_changed and instance.service_coordinator:
            from apps.notifications_app.triggers import notification_triggers
            notification_triggers.work_order_service_coordinator_assigned(
                work_order=instance,
                service_coordinator=instance.service_coordinator
            )

        if technician_assignment_changed and instance.has_technician_assigned():
            from apps.notifications_app.triggers import notification_triggers
            if instance.primary_technician_id:
                notification_triggers.work_order_technician_assigned(
                    work_order=instance,
                    technician=instance.primary_technician,
                )
            for technician in instance.assigned_technicians.all():
                if technician.id != instance.primary_technician_id:
                    notification_triggers.work_order_technician_assigned(
                        work_order=instance,
                        technician=technician,
                    )
        
        return instance


# ============= Service Task Serializers =============

class ServiceTaskSerializer(serializers.ModelSerializer):
    """Service task with technician info"""
    assigned_to_name = serializers.SerializerMethodField()
    calculated_hours = serializers.SerializerMethodField()
    billing_revenue_product_name = serializers.SerializerMethodField()
    billing_owner_account_code = serializers.SerializerMethodField()
    billing_revenue_product_code = serializers.SerializerMethodField()
    
    class Meta:
        model = ServiceTask
        fields = '__all__'
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}"
        # For workflow tasks in 'assigned' phase, show service coordinator if task is assigned to them
        if obj.is_workflow_task and obj.workflow_phase == 'assigned' and obj.work_order.service_coordinator:
            sc = obj.work_order.service_coordinator
            return f"{sc.first_name} {sc.last_name}"
        return None
    
    @extend_schema_field(OpenApiTypes.FLOAT)
    def get_calculated_hours(self, obj):
        """Return calculated actual hours from time logs or actual_hours field"""
        try:
            hours = obj.calculated_actual_hours
            return float(hours) if hours is not None else 0.0
        except (AttributeError, TypeError):
            return 0.0

    def _billing_revenue_product(self, obj):
        from apps.billing.revenue_resolution import resolve_revenue_product_for_task

        return resolve_revenue_product_for_task(obj)

    @extend_schema_field(OpenApiTypes.STR)
    def get_billing_revenue_product_name(self, obj):
        product = self._billing_revenue_product(obj)
        return product.name if product else None

    @extend_schema_field(OpenApiTypes.STR)
    def get_billing_owner_account_code(self, obj):
        product = self._billing_revenue_product(obj)
        return product.owner_account_code if product else None

    @extend_schema_field(OpenApiTypes.STR)
    def get_billing_revenue_product_code(self, obj):
        product = self._billing_revenue_product(obj)
        return product.code if product else None

    def update(self, instance, validated_data):
        if 'revenue_product' not in validated_data and 'task_type' in validated_data:
            from apps.billing.revenue_resolution import revenue_product_from_task_type_code

            product = revenue_product_from_task_type_code(validated_data['task_type'])
            if product:
                validated_data['revenue_product'] = product
        return super().update(instance, validated_data)


class ServiceTaskCreateSerializer(serializers.ModelSerializer):
    """Create service task"""
    
    class Meta:
        model = ServiceTask
        fields = [
            'id', 'work_order', 'task_type', 'description', 'detailed_notes',
            'sequence_order', 'assigned_to',
            'estimated_hours', 'labor_rate', 'labor_cost', 'revenue_product',
        ]
        read_only_fields = ['id']
        extra_kwargs = {'revenue_product': {'required': False, 'allow_null': True}}

    def create(self, validated_data):
        task_type_code = validated_data.get('task_type')
        task_type = None
        if task_type_code:
            task_type = ServiceTaskType.objects.filter(code=task_type_code, is_active=True).select_related(
                'revenue_product', 'revenue_product__catalog_part'
            ).first()
        if validated_data.get('labor_cost') in (None, '', Decimal('0')) and task_type:
            from apps.workorders.task_billing import resolve_flat_unit_price_for_task_type

            flat = resolve_flat_unit_price_for_task_type(task_type)
            if flat > 0:
                validated_data['labor_cost'] = flat
        if validated_data.get('revenue_product') is None and task_type and task_type.revenue_product_id:
            validated_data['revenue_product'] = task_type.revenue_product
        if validated_data.get('revenue_product') is None:
            from apps.billing.revenue_resolution import revenue_product_from_task_type_code

            product = revenue_product_from_task_type_code(validated_data.get('task_type'))
            if product:
                validated_data['revenue_product'] = product
        return super().create(validated_data)

    def validate_assigned_to(self, value):
        if value and value.role != 'technician':
            raise serializers.ValidationError("Service tasks can only be assigned to a technician.")
        return value

    def validate(self, data):
        work_order = data.get('work_order')
        assigned_to = data.get('assigned_to')
        if work_order and assigned_to:
            if work_order.branch_id and assigned_to.branch_id != work_order.branch_id:
                raise serializers.ValidationError({
                    'assigned_to': "Assigned technician must belong to the same branch as the work order."
                })
        return data


class ServiceTaskTypeSerializer(serializers.ModelSerializer):
    """Manage service task types used by service tasks."""
    value = serializers.CharField(source='code', read_only=True)
    label = serializers.CharField(source='name', read_only=True)
    revenue_product_name = serializers.CharField(source='revenue_product.name', read_only=True, default=None)
    owner_account_code = serializers.CharField(source='revenue_product.owner_account_code', read_only=True, default=None)

    class Meta:
        model = ServiceTaskType
        fields = [
            'id', 'code', 'name', 'value', 'label', 'description',
            'default_labor_rate', 'is_billable', 'is_active',
            'revenue_product', 'revenue_product_name', 'owner_account_code',
            'sort_order', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'value', 'label']

    def validate_code(self, value):
        code = slugify(value).replace('-', '_') if value else ''
        if not code:
            raise serializers.ValidationError("Code is required.")
        return code

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Name is required.")
        return value.strip()


# ============= Work Order Part Serializers =============

class WorkOrderPartSerializer(serializers.ModelSerializer):
    """Work order part with full details"""
    installed_by_name = serializers.SerializerMethodField()
    requested_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = WorkOrderPart
        fields = '__all__'
    
    inventory_status = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    vehicle_info = serializers.SerializerMethodField()
    purchase_order_number = serializers.SerializerMethodField()
    work_order_status = serializers.CharField(source='work_order.status', read_only=True)
    work_order_is_approved = serializers.BooleanField(source='work_order.is_approved', read_only=True)
    work_order_quote_stage = serializers.SerializerMethodField()
    work_order_quote_stage_display = serializers.SerializerMethodField()
    
    work_order_number = serializers.CharField(source='work_order.work_order_number', read_only=True)
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_customer_name(self, obj):
        return build_customer_display_name(obj.work_order.customer) or "Unknown"
        
    @extend_schema_field(OpenApiTypes.STR)
    def get_vehicle_info(self, obj):
        if obj.work_order.vehicle:
            return f"{obj.work_order.vehicle.year} {obj.work_order.vehicle.make} {obj.work_order.vehicle.model}"
        return "Unknown Vehicle"

    @extend_schema_field(OpenApiTypes.STR)
    def get_work_order_quote_stage(self, obj):
        return obj.work_order.get_current_quote_stage()

    @extend_schema_field(OpenApiTypes.STR)
    def get_work_order_quote_stage_display(self, obj):
        return obj.work_order.get_current_quote_stage_display()
    
    @extend_schema_field(inline_serializer(
        name='InventoryStatus',
        fields={
            'available': serializers.BooleanField(),
            'quantity': serializers.DecimalField(max_digits=10, decimal_places=2),
            'part_id': serializers.IntegerField(allow_null=True),
            'stock_item_id': serializers.IntegerField(allow_null=True, required=False),
            'message': serializers.CharField(),
        }
    ))
    def get_inventory_status(self, obj):
        return obj.get_inventory_status_payload()

    @extend_schema_field(OpenApiTypes.STR)
    def get_purchase_order_number(self, obj):
        if obj.purchase_order_item and obj.purchase_order_item.purchase_order:
            return obj.purchase_order_item.purchase_order.po_number
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_installed_by_name(self, obj):
        if obj.installed_by:
            return f"{obj.installed_by.first_name} {obj.installed_by.last_name}"
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return f"{obj.requested_by.first_name} {obj.requested_by.last_name}"
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return f"{obj.approved_by.first_name} {obj.approved_by.last_name}"
        return None


class WorkOrderPartCreateSerializer(serializers.ModelSerializer):
    """Create work order part"""
    requisition_number = serializers.CharField(read_only=True)
    requested_by = serializers.PrimaryKeyRelatedField(read_only=True)
    additional_work_triggered = serializers.SerializerMethodField()
    
    class Meta:
        model = WorkOrderPart
        fields = [
            'id',
            'work_order', 'task',
            'inventory_part',
            'part_number', 'part_name', 'description',
            'quantity', 'unit_cost', 'markup_percentage',
            'status', 'warranty_months', 'warranty_notes',
            'resolution_notes',
            'requisition_number', 'requested_by',
            'additional_work_triggered',
        ]

    def validate_status(self, value):
        if value not in {'draft', 'pending'}:
            raise serializers.ValidationError(
                "New part requests must start as draft or pending. Stores must allocate, receive, or install parts through the parts workflow."
            )
        return value

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_additional_work_triggered(self, obj):
        return bool(getattr(obj, 'additional_work_triggered', False))

    def validate(self, data):
        work_order = data.get('work_order')
        if work_order and work_order.status in {'quality_check', 'completed', 'invoiced', 'closed'}:
            raise serializers.ValidationError(
                "Parts cannot be added at this stage. Reopen the repair workflow or create a new work order."
            )
        return data
    
    def create(self, validated_data):
        # Set requested_by to current user
        request = self.context.get('request')
        if request and request.user:
            validated_data['requested_by'] = request.user

        inventory_part = validated_data.get('inventory_part')
        if inventory_part:
            if not validated_data.get('part_number'):
                validated_data['part_number'] = inventory_part.part_number
            if not validated_data.get('part_name'):
                validated_data['part_name'] = inventory_part.name
            if not validated_data.get('description'):
                validated_data['description'] = inventory_part.description or ''
            if not validated_data.get('unit_cost'):
                validated_data['unit_cost'] = inventory_part.cost_price or Decimal('0')

        return super().create(validated_data)

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value


# ============= Technician Time Log Serializers =============

class TechnicianTimeLogSerializer(serializers.ModelSerializer):
    """Time log with technician info"""
    technician_name = serializers.SerializerMethodField()
    work_order_number = serializers.CharField(source='work_order.work_order_number', read_only=True)
    
    class Meta:
        model = TechnicianTimeLog
        fields = '__all__'
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_technician_name(self, obj):
        return f"{obj.technician.first_name} {obj.technician.last_name}"


class TechnicianTimeLogCreateSerializer(serializers.ModelSerializer):
    """Create time log (clock in)"""
    technician = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False
    )
    hourly_rate = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        required=False
    )
    clock_in = serializers.DateTimeField(required=False)
    
    class Meta:
        model = TechnicianTimeLog
        fields = [
            'id', 'work_order', 'task', 'technician',
            'clock_in', 'description', 'hourly_rate', 'is_billable'
        ]
    
    def validate(self, data):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        work_order = data.get('work_order')
        if work_order is None:
            raise serializers.ValidationError({'work_order': 'Work order is required.'})

        if user and user.is_authenticated:
            accessible = filter_workorders_for_user(
                WorkOrder.objects.filter(pk=work_order.pk), user
            )
            if not accessible.exists():
                raise serializers.ValidationError({
                    'work_order': 'You do not have access to this work order.',
                })

            active = TechnicianTimeLog.objects.filter(
                technician=user,
                clock_out__isnull=True,
            ).first()
            if active:
                raise serializers.ValidationError({
                    'detail': (
                        'You are already clocked in. Clock out before starting another job.'
                    ),
                    'active_log_id': active.id,
                    'active_work_order': active.work_order_id,
                })

        if work_order.status in ('cancelled', 'void', 'closed'):
            raise serializers.ValidationError({
                'work_order': 'Cannot clock in on a closed work order.',
            })

        now = timezone.now()
        clock_in = data.get('clock_in')
        if clock_in is None:
            data['clock_in'] = now
        else:
            grace = timedelta(minutes=2)
            if clock_in > now + grace:
                raise serializers.ValidationError({
                    'clock_in': 'Clock in time cannot be in the future.',
                })
            if clock_in < now - timedelta(days=1):
                raise serializers.ValidationError({
                    'clock_in': 'Clock in time is too far in the past.',
                })

        description = (data.get('description') or '').strip()
        if not description:
            data['description'] = 'Field work'

        return data


class TechnicianTimeLogClockOutSerializer(serializers.Serializer):
    """Clock out serializer"""
    clock_out = serializers.DateTimeField()
    notes = serializers.CharField(required=False, allow_blank=True)
    
    def validate_clock_out(self, value):
        if value > timezone.now():
            raise serializers.ValidationError(
                "Clock out time cannot be in the future."
            )
        return value


# ============= Work Order Note Serializers =============

class WorkOrderNoteSerializer(serializers.ModelSerializer):
    """Work order note with author info"""
    created_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = WorkOrderNote
        fields = '__all__'
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}"
        return None


class WorkOrderNoteCreateSerializer(serializers.ModelSerializer):
    """Create work order note"""
    
    class Meta:
        model = WorkOrderNote
        fields = [
            'work_order', 'note_type', 'note',
            'is_important', 'is_customer_visible'
        ]
    
    def create(self, validated_data):
        # Set created_by
        request = self.context.get('request')
        if request and request.user:
            validated_data['created_by'] = request.user
        
        return WorkOrderNote.objects.create(**validated_data)


# ============= Work Order Photo Serializers =============

class WorkOrderPhotoSerializer(serializers.ModelSerializer):
    """Work order photo"""
    taken_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = WorkOrderPhoto
        fields = '__all__'
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_taken_by_name(self, obj):
        if obj.taken_by:
            return f"{obj.taken_by.first_name} {obj.taken_by.last_name}"
        return None


class WorkOrderPhotoCreateSerializer(serializers.ModelSerializer):
    """Upload work order photo"""
    
    class Meta:
        model = WorkOrderPhoto
        fields = [
            'work_order', 'photo', 'photo_type',
            'caption', 'description'
        ]
    
    def create(self, validated_data):
        # Set taken_by
        request = self.context.get('request')
        if request and request.user:
            validated_data['taken_by'] = request.user
        
        return WorkOrderPhoto.objects.create(**validated_data)


# ============= Dashboard/Summary Serializers =============

class TechnicianWorkloadSerializer(serializers.Serializer):
    """Technician workload summary"""
    technician_id = serializers.IntegerField()
    technician_name = serializers.CharField()
    active_work_orders = serializers.IntegerField()
    total_hours_this_week = serializers.DecimalField(max_digits=6, decimal_places=2)
    work_orders = WorkOrderListSerializer(many=True)


class WorkOrderStatusSummarySerializer(serializers.Serializer):
    """Work order status summary"""
    status = serializers.CharField()
    count = serializers.IntegerField()
    total_estimated = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    total_actual = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    total_invoiced = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True, required=False
    )


# ============= Public Portal Serializers =============

class PublicWorkOrderSerializer(serializers.ModelSerializer):
    """Restricted serializer for public customer portal"""
    customer_name = serializers.SerializerMethodField()
    vehicle_info = serializers.SerializerMethodField()
    vehicle_details = serializers.SerializerMethodField()
    recommendations = serializers.SerializerMethodField()
    approved_jobs = serializers.SerializerMethodField()
    timeline_status = serializers.SerializerMethodField()
    total_cost = serializers.SerializerMethodField()
    estimate_summary = serializers.SerializerMethodField()
    invoice_summary = serializers.SerializerMethodField()
    approval_terms = serializers.SerializerMethodField()
    
    class Meta:
        model = WorkOrder

        fields = [
            'id', 'work_order_number', 'status', 'created_at',
            'customer_name', 'vehicle_info', 'vehicle_details',
            'estimated_total', 'total_cost',
            'customer_concerns',
            'customer_rating', 'customer_feedback',
            'recommendations', 'approved_jobs', 'timeline_status',
            'estimate_summary', 'invoice_summary', 'approval_terms',
        ]
        read_only_fields = fields

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_approval_terms(self, obj):
        from apps.accounts.terms_service import get_terms_for_document
        from apps.accounts.terms_models import TermsAcceptance
        if getattr(obj, 'estimate', None) or getattr(obj, 'estimate_id', None):
            return get_terms_for_document(TermsAcceptance.DOCUMENT_ESTIMATE)
        return get_terms_for_document(TermsAcceptance.DOCUMENT_WORK_ORDER)

    @extend_schema_field(OpenApiTypes.STR)
    def get_customer_name(self, obj):
        return build_customer_display_name(obj.customer) or "Valued Customer"

    @extend_schema_field(OpenApiTypes.STR)
    def get_vehicle_info(self, obj):
        if obj.vehicle:
            return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
        return "Unknown Vehicle"
        
    @extend_schema_field(inline_serializer(
        name='VehicleDetailsPublic',
        fields={
            'vin': serializers.CharField(),
            'license_plate': serializers.CharField(),
            'color': serializers.CharField(),
        }
    ))
    def get_vehicle_details(self, obj):
        if obj.vehicle:
            vin = obj.vehicle.vin or ''
            masked_vin = vin if len(vin) <= 4 else f"{'*' * (len(vin) - 4)}{vin[-4:]}"
            return {
                'vin': masked_vin,
                'license_plate': obj.vehicle.license_plate,
                'color': obj.vehicle.exterior_color
            }
        return {}
    
    def get_total_cost(self, obj):
        """Billing total from linked invoice when present."""
        invoice = self._get_invoice(obj)
        if invoice is not None:
            return str(invoice.total)
        return None

    def _get_estimate(self, obj):
        estimate = getattr(obj, 'estimate', None)
        if estimate and estimate.status != 'draft':
            return estimate
        return None

    def _get_invoice(self, obj):
        from apps.billing.work_order_invoices import get_primary_invoice

        return get_primary_invoice(obj, for_customer=True)

    @extend_schema_field(serializers.DictField())
    def get_estimate_summary(self, obj):
        estimate = self._get_estimate(obj)
        if not estimate:
            return None
        return {
            'id': estimate.id,
            'estimate_number': estimate.estimate_number,
            'status': estimate.status,
            'total': str(estimate.total),
            'estimate_date': estimate.estimate_date.isoformat() if estimate.estimate_date else None,
            'approved_date': estimate.approved_date.isoformat() if estimate.approved_date else None,
        }

    @extend_schema_field(serializers.DictField())
    def get_invoice_summary(self, obj):
        from apps.billing.work_order_invoices import invoice_summary_payload

        invoice = self._get_invoice(obj)
        if not invoice:
            return None
        return invoice_summary_payload(invoice, include_internal=False)

    def get_recommendations(self, obj):

        """Get pending recommendations"""
        # Return simplified list of ServiceTasks that are not completed
        # This is a simplification for now
        tasks = obj.tasks.exclude(status='completed')
        return [
            {
                'id': t.id,
                'name': t.description,
                'status': t.status,
                'estimated_cost': t.estimated_hours * t.labor_rate
            }
            for t in tasks
        ]

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_approved_jobs(self, obj):
        """Get list of completed tasks"""
        tasks = obj.tasks.filter(status='completed')
        return [
            {
                'id': t.id,
                'name': t.description,
                'status': t.status,
                # 'total': t.total_cost # removed as field might not exist on simple task model verify later
            }
            for t in tasks
        ]

    @extend_schema_field(serializers.DictField())
    def get_timeline_status(self, obj):
        return {
            'current_status': obj.status,
            'last_updated': obj.updated_at.isoformat(),
            'estimated_completion': obj.estimated_completion
        }
