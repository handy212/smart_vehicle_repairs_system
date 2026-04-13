from rest_framework import serializers
from django.utils import timezone
from django.utils.text import slugify
from decimal import Decimal
from apps.diagnosis.models import (
    Diagnosis, RepairRecommendation,
    DiagnosticCode, DiagnosticTest,
    DiagnosisFinding, DiagnosisPhoto,
    TestProcedureLibrary, DiagnosticCodeLibrary,
    DiagnosisHistory, DiagnosisTimeLog
)
from apps.workorders.models import WorkOrder


# ============================================================================
# Phase 2: Structured Data Serializers
# ============================================================================

def infer_diagnostic_code_type(code_number):
    """Infer the stored code type from the diagnostic code prefix."""
    normalized_code = (code_number or '').strip().upper()
    if not normalized_code:
        return None

    prefix = normalized_code[0]
    if prefix == 'B':
        return 'body'
    if prefix == 'C':
        return 'chassis'
    if prefix in {'P', 'U'}:
        return 'obd_ii'
    return 'other'

class DiagnosisPhotoSerializer(serializers.ModelSerializer):
    """Serializer for diagnosis photos"""
    photo_type_display = serializers.CharField(source='get_photo_type_display', read_only=True)
    taken_by_name = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()
    
    class Meta:
        model = DiagnosisPhoto
        fields = [
            'id', 'photo', 'photo_url', 'caption', 'photo_type', 'photo_type_display',
            'finding', 'taken_at', 'taken_by', 'taken_by_name', 'created_at'
        ]
    
    def get_taken_by_name(self, obj):
        if obj.taken_by:
            return f"{obj.taken_by.first_name} {obj.taken_by.last_name}"
        return None
    
    def get_photo_url(self, obj):
        if obj.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.photo.url)
            return obj.photo.url
        return None


class DiagnosisPhotoCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating diagnosis photos"""
    
    class Meta:
        model = DiagnosisPhoto
        fields = ['diagnosis', 'photo', 'caption', 'photo_type', 'finding', 'taken_at']


class DiagnosticCodeSerializer(serializers.ModelSerializer):
    """Serializer for diagnostic codes (DTCs)"""
    code_type_display = serializers.CharField(source='get_code_type_display', read_only=True)
    severity_display = serializers.CharField(source='get_severity_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = DiagnosticCode
        fields = [
            'id', 'code_number', 'code_type', 'code_type_display',
            'description', 'severity', 'severity_display',
            'freeze_frame_data', 'status', 'status_display',
            'recorded_at', 'created_at', 'updated_at'
        ]


class DiagnosticCodeCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating diagnostic codes"""
    
    class Meta:
        model = DiagnosticCode
        fields = [
            'id', 'diagnosis', 'code_number', 'code_type', 'description', 'severity',
            'freeze_frame_data', 'status', 'recorded_at'
        ]
        read_only_fields = ['id']
        extra_kwargs = {
            'code_type': {'required': False},
        }
    
    def validate(self, attrs):
        """Validate that the code doesn't already exist for this diagnosis"""
        diagnosis = attrs.get('diagnosis') or getattr(self.instance, 'diagnosis', None)
        raw_code_number = attrs.get('code_number')
        code_number = (raw_code_number if raw_code_number is not None else getattr(self.instance, 'code_number', ''))
        code_number = code_number.strip().upper()
        code_type_was_provided = 'code_type' in getattr(self, 'initial_data', {})

        if raw_code_number is not None:
            attrs['code_number'] = code_number

        if code_number and (not code_type_was_provided or not attrs.get('code_type')):
            inferred_code_type = infer_diagnostic_code_type(code_number)
            if inferred_code_type:
                attrs['code_type'] = inferred_code_type

        code_type = attrs.get('code_type') or getattr(self.instance, 'code_type', None)
        
        if diagnosis and code_number and code_type:
            # Check if this code already exists for this diagnosis
            existing_code = DiagnosticCode.objects.filter(
                diagnosis=diagnosis,
                code_number__iexact=code_number,  # Case-insensitive check
                code_type=code_type
            )
            
            # Exclude current instance if updating
            if self.instance:
                existing_code = existing_code.exclude(pk=self.instance.pk)
            
            if existing_code.exists():
                raise serializers.ValidationError({
                    'code_number': f'Code {code_number} ({code_type}) already exists for this diagnosis.'
                })
        
        return attrs


class DiagnosticTestSerializer(serializers.ModelSerializer):
    """Serializer for diagnostic tests"""
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    performed_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = DiagnosticTest
        fields = [
            'id', 'test_name', 'category', 'category_display',
            'test_procedure', 'expected_result', 'actual_result',
            'measurements', 'tools_used', 'status', 'status_display',
            'performed_at', 'performed_by', 'performed_by_name',
            'created_at', 'updated_at'
        ]
    
    def get_performed_by_name(self, obj):
        if obj.performed_by:
            return f"{obj.performed_by.first_name} {obj.performed_by.last_name}"
        return None


class DiagnosticTestCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating diagnostic tests"""
    
    class Meta:
        model = DiagnosticTest
        fields = [
            'id', 'diagnosis', 'test_name', 'category', 'test_procedure', 'expected_result',
            'actual_result', 'measurements', 'tools_used', 'status',
            'performed_at', 'performed_by'
        ]
        read_only_fields = ['id']


class DiagnosisFindingSerializer(serializers.ModelSerializer):
    """Serializer for diagnosis findings"""
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    severity_display = serializers.CharField(source='get_severity_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    diagnostic_codes = DiagnosticCodeSerializer(many=True, read_only=True)
    diagnostic_tests = DiagnosticTestSerializer(many=True, read_only=True)
    photos = DiagnosisPhotoSerializer(many=True, read_only=True)
    code_ids = serializers.PrimaryKeyRelatedField(
        queryset=DiagnosticCode.objects.all(),
        source='diagnostic_codes',
        many=True,
        write_only=True,
        required=False
    )
    test_ids = serializers.PrimaryKeyRelatedField(
        queryset=DiagnosticTest.objects.all(),
        source='diagnostic_tests',
        many=True,
        write_only=True,
        required=False
    )
    
    class Meta:
        model = DiagnosisFinding
        fields = [
            'id', 'finding_title', 'category', 'category_display',
            'description', 'severity', 'severity_display',
            'diagnostic_codes', 'diagnostic_tests', 'photos',
            'code_ids', 'test_ids',
            'root_cause', 'contributing_factors', 'status', 'status_display',
            'created_at', 'updated_at'
        ]


class DiagnosisFindingCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating diagnosis findings"""
    diagnostic_codes = serializers.PrimaryKeyRelatedField(
        queryset=DiagnosticCode.objects.all(),
        many=True,
        required=False
    )
    diagnostic_tests = serializers.PrimaryKeyRelatedField(
        queryset=DiagnosticTest.objects.all(),
        many=True,
        required=False
    )
    
    class Meta:
        model = DiagnosisFinding
        fields = [
            'diagnosis', 'finding_title', 'category', 'description', 'severity',
            'diagnostic_codes', 'diagnostic_tests',
            'root_cause', 'contributing_factors', 'status'
        ]
    
    def create(self, validated_data):
        codes = validated_data.pop('diagnostic_codes', [])
        tests = validated_data.pop('diagnostic_tests', [])
        finding = super().create(validated_data)
        finding.diagnostic_codes.set(codes)
        finding.diagnostic_tests.set(tests)
        return finding


class DiagnosisFindingLinkSerializer(serializers.ModelSerializer):
    """Compact finding serializer for recommendation evidence links."""
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    severity_display = serializers.CharField(source='get_severity_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    diagnostic_codes = DiagnosticCodeSerializer(many=True, read_only=True)

    class Meta:
        model = DiagnosisFinding
        fields = [
            'id', 'finding_title', 'category', 'category_display',
            'severity', 'severity_display',
            'status', 'status_display',
            'diagnostic_codes',
        ]


# ============================================================================
# Phase 1 Serializers
# ============================================================================

class RepairRecommendationSerializer(serializers.ModelSerializer):
    """Serializer for repair recommendations"""
    recommendation_type_display = serializers.CharField(source='get_recommendation_type_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    linked_findings = DiagnosisFindingLinkSerializer(source='findings', many=True, read_only=True)
    approval_status_display = serializers.CharField(source='get_approval_status_display', read_only=True)
    quotation_status_display = serializers.CharField(source='get_quotation_status_display', read_only=True)
    decision_by_name = serializers.SerializerMethodField()
    quotation_requested_by_name = serializers.SerializerMethodField()
    quoted_by_name = serializers.SerializerMethodField()
    converted_to_task_id = serializers.IntegerField(source='converted_to_task.id', read_only=True, allow_null=True)
    
    class Meta:
        model = RepairRecommendation
        fields = [
            'id', 'recommendation_type', 'recommendation_type_display',
            'description', 'priority', 'priority_display',
            'parts_needed', 'linked_findings', 'estimated_parts_cost',
            'estimated_labor_hours', 'estimated_labor_cost',
            'estimated_total_cost',
            'approval_status', 'approval_status_display',
            'decision_method', 'decision_notes', 'decision_at',
            'decision_by', 'decision_by_name',
            'customer_approved',
            'quotation_status', 'quotation_status_display',
            'quotation_requested_at', 'quotation_requested_by', 'quotation_requested_by_name',
            'quotation_estimate_id', 'quotation_estimate_number',
            'quoted_at', 'quoted_by', 'quoted_by_name',
            'converted_to_task_id', 'order',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'estimated_total_cost',
            'decision_at',
            'decision_by',
            'quotation_requested_at',
            'quotation_requested_by',
            'quotation_estimate_id',
            'quotation_estimate_number',
            'quoted_at',
            'quoted_by',
            'created_at',
            'updated_at',
        ]

    def get_decision_by_name(self, obj):
        if obj.decision_by:
            return f"{obj.decision_by.first_name} {obj.decision_by.last_name}".strip() or obj.decision_by.username
        return None

    def get_quotation_requested_by_name(self, obj):
        if obj.quotation_requested_by:
            return f"{obj.quotation_requested_by.first_name} {obj.quotation_requested_by.last_name}".strip() or obj.quotation_requested_by.username
        return None

    def get_quoted_by_name(self, obj):
        if obj.quoted_by:
            return f"{obj.quoted_by.first_name} {obj.quoted_by.last_name}".strip() or obj.quoted_by.username
        return None


class RepairRecommendationCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating repair recommendations"""
    findings = serializers.PrimaryKeyRelatedField(
        queryset=DiagnosisFinding.objects.all(),
        many=True,
        required=False,
    )

    FORBIDDEN_STATE_FIELDS = {
        'customer_approved',
        'approval_status',
        'decision_method',
        'decision_notes',
        'decision_at',
        'decision_by',
        'quotation_status',
        'quotation_requested_at',
        'quotation_requested_by',
        'quotation_estimate_id',
        'quotation_estimate_number',
        'quoted_at',
        'quoted_by',
        'converted_to_task',
        'converted_to_task_id',
    }

    FORBIDDEN_COST_FIELDS = {
        'estimated_labor_hours',
        'estimated_parts_cost',
        'estimated_labor_cost',
        'estimated_total_cost',
    }
    
    class Meta:
        model = RepairRecommendation
        fields = [
            'recommendation_type', 'description', 'priority',
            'parts_needed', 'findings',
            'order'
        ]

    def validate(self, attrs):
        forbidden_state_fields = sorted(
            field_name for field_name in self.FORBIDDEN_STATE_FIELDS
            if field_name in getattr(self, 'initial_data', {})
        )

        if forbidden_state_fields:
            raise serializers.ValidationError({
                'non_field_errors': [
                    'Approval state must be changed through the dedicated recommendation approval actions.'
                ],
                'forbidden_fields': forbidden_state_fields,
            })

        forbidden_cost_fields = sorted(
            field_name for field_name in self.FORBIDDEN_COST_FIELDS
            if field_name in getattr(self, 'initial_data', {})
        )

        if forbidden_cost_fields:
            raise serializers.ValidationError({
                'non_field_errors': [
                    'Recommendation costs are not captured during diagnosis. Submit the approved recommendation to stores for quotation instead.'
                ],
                'forbidden_fields': forbidden_cost_fields,
            })

        return super().validate(attrs)

    def validate_findings(self, findings):
        diagnosis = self.context.get('diagnosis') or getattr(self.instance, 'diagnosis', None)
        if not diagnosis:
            return findings

        invalid_ids = sorted(finding.id for finding in findings if finding.diagnosis_id != diagnosis.id)
        if invalid_ids:
            raise serializers.ValidationError(
                f'Findings must belong to diagnosis {diagnosis.id}. Invalid finding ids: {", ".join(str(item) for item in invalid_ids)}.'
            )

        return findings

    def validate_parts_needed(self, value):
        if value in (None, ''):
            return []

        if not isinstance(value, list):
            raise serializers.ValidationError('parts_needed must be a list of part lines.')

        normalized_parts = []
        for index, part in enumerate(value):
            if not isinstance(part, dict):
                raise serializers.ValidationError(f'Part line {index + 1} must be an object.')

            part_name = (part.get('part_name') or '').strip()
            if not part_name:
                raise serializers.ValidationError(f'Part line {index + 1} requires part_name.')

            try:
                quantity = int(part.get('quantity', 1))
            except (TypeError, ValueError):
                raise serializers.ValidationError(f'Part line {index + 1} quantity must be a whole number.')

            if quantity <= 0:
                raise serializers.ValidationError(f'Part line {index + 1} quantity must be greater than zero.')

            normalized_part = {
                'part_name': part_name,
                'part_number': (part.get('part_number') or '').strip(),
                'quantity': quantity,
            }

            if part.get('part_id'):
                normalized_part['part_id'] = part['part_id']

            normalized_parts.append(normalized_part)

        return normalized_parts

    def _generate_catalog_part_number(self, diagnosis_id, part_name):
        from apps.inventory.models import Part

        base_slug = slugify(part_name or 'part').upper()[:32] or 'PART'
        base_number = f"DIAG-{diagnosis_id}-{base_slug}"
        candidate = base_number
        suffix = 2

        while Part.objects.filter(part_number=candidate).exists():
            candidate = f"{base_number}-{suffix}"
            suffix += 1

        return candidate

    def _resolve_inventory_part(self, diagnosis, part_data):
        from apps.inventory.models import Part, PartCategory

        part_id = part_data.get('part_id')
        part_name = (part_data.get('part_name') or '').strip()
        part_number = (part_data.get('part_number') or '').strip()
        branch = getattr(diagnosis.work_order, 'branch', None)
        request = self.context.get('request')
        created_by = getattr(request, 'user', None)

        if part_id:
            part = Part.objects.filter(pk=part_id).first()
            if part:
                return part

        if part_number:
            part = Part.objects.filter(part_number__iexact=part_number).first()
            if part:
                return part

        if part_name:
            part_by_name = Part.objects.filter(name__iexact=part_name)
            if branch:
                part = part_by_name.filter(branch=branch).first()
                if part:
                    return part
            part = part_by_name.filter(branch__isnull=True).first() or part_by_name.first()
            if part:
                return part

        category = (
            PartCategory.objects.filter(name__iexact='Uncategorized').first()
            or PartCategory.objects.first()
            or PartCategory.objects.create(
                name='Uncategorized',
                description='Fallback category for parts created during diagnosis.',
            )
        )

        if not part_name and not part_number:
            return None

        generated_part_number = part_number or self._generate_catalog_part_number(diagnosis.id, part_name)
        default_name = part_name or generated_part_number

        return Part.objects.create(
            part_number=generated_part_number,
            name=default_name,
            description='Auto-created from a diagnosis recommendation.',
            category=category,
            branch=branch,
            unit='piece',
            cost_price=Decimal('0.01'),
            selling_price=Decimal('0.01'),
            created_by=created_by if getattr(created_by, 'is_authenticated', False) else None,
        )

    def _sync_parts_to_inventory(self, diagnosis, parts_needed):
        synced_parts = []

        for part_data in parts_needed or []:
            inventory_part = self._resolve_inventory_part(diagnosis, part_data)
            synced_part = {
                'part_name': (part_data.get('part_name') or '').strip(),
                'part_number': (part_data.get('part_number') or '').strip(),
                'quantity': int(part_data.get('quantity') or 1),
            }

            if inventory_part:
                synced_part['part_id'] = inventory_part.id
                synced_part['part_name'] = inventory_part.name
                synced_part['part_number'] = inventory_part.part_number

            synced_parts.append(synced_part)

        return synced_parts
    
    def create(self, validated_data):
        findings = validated_data.pop('findings', [])
        diagnosis = validated_data.get('diagnosis') or self.context.get('diagnosis')
        if diagnosis and 'parts_needed' in validated_data:
            validated_data['parts_needed'] = self._sync_parts_to_inventory(diagnosis, validated_data.get('parts_needed', []))
        recommendation = super().create(validated_data)
        if findings:
            recommendation.findings.set(findings)
        return recommendation

    def update(self, instance, validated_data):
        findings = validated_data.pop('findings', None)
        if 'parts_needed' in validated_data:
            validated_data['parts_needed'] = self._sync_parts_to_inventory(instance.diagnosis, validated_data.get('parts_needed', []))
        recommendation = super().update(instance, validated_data)
        if findings is not None:
            recommendation.findings.set(findings)
        return recommendation


class DiagnosisListSerializer(serializers.ModelSerializer):
    """List serializer for diagnoses"""
    technician_name = serializers.SerializerMethodField()
    work_order_number = serializers.CharField(source='work_order.work_order_number', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    diagnostic_time_formatted = serializers.CharField(read_only=True)
    recommendation_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Diagnosis
        fields = [
            'id', 'work_order', 'work_order_number',
            'technician', 'technician_name',
            'started_at', 'completed_at', 'status', 'status_display',
            'diagnostic_time_hours', 'diagnostic_time_formatted',
            'diagnostic_fee', 'is_completed', 'recommendation_count',
            'created_at', 'updated_at'
        ]
    
    def get_technician_name(self, obj):
        if obj.technician:
            return f"{obj.technician.first_name} {obj.technician.last_name}"
        return None
    
    def get_recommendation_count(self, obj):
        return obj.repair_recommendations.count()


class RepairRecommendationQuoteQueueSerializer(RepairRecommendationSerializer):
    """Serializer for the stores quotation queue."""
    diagnosis_id = serializers.IntegerField(source='diagnosis.id', read_only=True)
    work_order_id = serializers.IntegerField(source='diagnosis.work_order.id', read_only=True)
    work_order_number = serializers.CharField(source='diagnosis.work_order.work_order_number', read_only=True)
    vehicle_display = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    branch_name = serializers.CharField(source='diagnosis.work_order.branch.name', read_only=True)

    class Meta(RepairRecommendationSerializer.Meta):
        fields = RepairRecommendationSerializer.Meta.fields + [
            'diagnosis_id',
            'work_order_id',
            'work_order_number',
            'vehicle_display',
            'customer_name',
            'branch_name',
        ]

    def get_vehicle_display(self, obj):
        work_order = getattr(obj.diagnosis, 'work_order', None)
        vehicle = getattr(work_order, 'vehicle', None)
        if not vehicle:
            return None
        parts = [str(vehicle.year), vehicle.make, vehicle.model]
        return ' '.join(part for part in parts if part and str(part).strip())

    def get_customer_name(self, obj):
        work_order = getattr(obj.diagnosis, 'work_order', None)
        customer = getattr(work_order, 'customer', None)
        user = getattr(customer, 'user', None)
        if not user:
            return None
        full_name = f"{user.first_name} {user.last_name}".strip()
        return full_name or user.username or user.email


class DiagnosisTimeLogSerializer(serializers.ModelSerializer):
    """Serializer for diagnosis time logs"""
    stage_display = serializers.CharField(source='get_stage_display', read_only=True)
    technician_name = serializers.SerializerMethodField()
    duration_formatted = serializers.CharField(read_only=True)
    
    class Meta:
        model = DiagnosisTimeLog
        fields = [
            'id', 'stage', 'stage_display',
            'started_at', 'ended_at', 'duration_hours', 'duration_formatted',
            'technician', 'technician_name', 'notes',
            'created_at'
        ]
    
    def get_technician_name(self, obj):
        if obj.technician:
            return f"{obj.technician.first_name} {obj.technician.last_name}"
        return None


class DiagnosisDetailSerializer(serializers.ModelSerializer):
    """Detail serializer for diagnoses with recommendations"""
    technician_name = serializers.SerializerMethodField()
    work_order_number = serializers.CharField(source='work_order.work_order_number', read_only=True)
    work_order_status = serializers.CharField(source='work_order.status', read_only=True)
    customer_name = serializers.SerializerMethodField()
    vehicle_info = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    diagnostic_time_formatted = serializers.CharField(read_only=True)
    repair_recommendations = RepairRecommendationSerializer(many=True, read_only=True)
    total_estimated_cost = serializers.SerializerMethodField()
    time_logs = DiagnosisTimeLogSerializer(many=True, read_only=True)
    # Phase 2: Structured data
    diagnostic_codes = DiagnosticCodeSerializer(many=True, read_only=True)
    diagnostic_tests = DiagnosticTestSerializer(many=True, read_only=True)
    findings = DiagnosisFindingSerializer(many=True, read_only=True)
    photos = DiagnosisPhotoSerializer(many=True, read_only=True)
    
    class Meta:
        model = Diagnosis
        fields = [
            'id', 'work_order', 'work_order_number', 'work_order_status',
            'technician', 'technician_name',
            'customer_name', 'vehicle_info',
            'started_at', 'paused_at', 'resumed_at', 'completed_at',
            'status', 'status_display',
            'customer_complaint', 'initial_observations',
            'diagnostic_notes', 'diagnostic_time_hours', 'diagnostic_time_formatted',
            'diagnostic_fee', 'root_cause', 'root_cause_explanation',
            'is_completed', 'requires_approval',
            'repair_recommendations', 'total_estimated_cost',
            'diagnostic_codes', 'diagnostic_tests', 'findings', 'photos',
            'time_logs',
            'created_at', 'updated_at'
        ]
    
    def get_technician_name(self, obj):
        if obj.technician:
            return f"{obj.technician.first_name} {obj.technician.last_name}"
        return None
    
    def get_customer_name(self, obj):
        customer = obj.work_order.customer
        if customer:
            user = customer.user
            return f"{user.first_name} {user.last_name}"
        return None
    
    def get_vehicle_info(self, obj):
        vehicle = obj.work_order.vehicle
        if vehicle:
            return {
                'id': vehicle.id,
                'make': vehicle.make,
                'model': vehicle.model,
                'year': vehicle.year,
                'vin': vehicle.vin,
                'license_plate': vehicle.license_plate,
            }
        return None
    
    def get_total_estimated_cost(self, obj):
        return sum(
            rec.estimated_total_cost for rec in obj.repair_recommendations.all()
        )


class DiagnosisCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating diagnoses"""
    
    class Meta:
        model = Diagnosis
        fields = [
            'work_order', 'technician', 'customer_complaint',
            'initial_observations', 'diagnostic_fee'
        ]
    
    def validate_work_order(self, value):
        """Ensure work order doesn't already have a diagnosis"""
        if hasattr(value, 'diagnosis'):
            raise serializers.ValidationError(
                "This work order already has a diagnosis."
            )
        return value
    
    def create(self, validated_data):
        validated_data['technician'] = validated_data.get('technician') or self.context['request'].user
        validated_data['status'] = 'not_started'  # Diagnosis starts as not_started, must be explicitly started
        return super().create(validated_data)


class DiagnosisUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating diagnoses"""

    FORBIDDEN_WORKFLOW_FIELDS = {
        'status',
        'is_completed',
        'diagnostic_time_hours',
    }
    
    class Meta:
        model = Diagnosis
        fields = [
            'technician',
            'customer_complaint', 'initial_observations',
            'diagnostic_notes',
            'diagnostic_fee', 'root_cause', 'root_cause_explanation',
            'requires_approval'
        ]

    def validate(self, attrs):
        forbidden_fields = sorted(
            field_name for field_name in self.FORBIDDEN_WORKFLOW_FIELDS
            if field_name in getattr(self, 'initial_data', {})
        )

        if forbidden_fields:
            raise serializers.ValidationError({
                'non_field_errors': [
                    'Workflow state and tracked time must be changed through the dedicated diagnosis actions.'
                ],
                'forbidden_fields': forbidden_fields,
            })

        return super().validate(attrs)


# ============================================================================
# Phase 3: Advanced Features Serializers
# ============================================================================

class TestProcedureLibrarySerializer(serializers.ModelSerializer):
    """Serializer for test procedure library"""
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = TestProcedureLibrary
        fields = [
            'id', 'name', 'category', 'category_display', 'description',
            'test_procedure', 'expected_result', 'tools_needed',
            'measurement_fields', 'is_active', 'use_count',
            'created_by', 'created_by_name', 'created_at', 'updated_at'
        ]
        read_only_fields = ['use_count', 'created_at', 'updated_at']
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}"
        return None


class DiagnosticCodeLibrarySerializer(serializers.ModelSerializer):
    """Serializer for diagnostic code library"""
    code_type_display = serializers.CharField(source='get_code_type_display', read_only=True)
    severity_display = serializers.CharField(source='get_severity_display', read_only=True)
    
    class Meta:
        model = DiagnosticCodeLibrary
        fields = [
            'id', 'code_number', 'code_type', 'code_type_display',
            'title', 'description', 'severity', 'severity_display',
            'common_causes', 'common_fixes', 'tsb_references', 'notes',
            'use_count', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['use_count', 'created_at', 'updated_at']


class DiagnosisHistorySerializer(serializers.ModelSerializer):
    """Serializer for diagnosis history/analytics"""
    
    class Meta:
        model = DiagnosisHistory
        fields = [
            'id', 'vehicle_make', 'vehicle_model', 'vehicle_year',
            'common_complaints', 'common_root_causes', 'common_codes',
            'avg_diagnostic_time', 'avg_repair_cost', 'diagnosis_count',
            'last_updated', 'created_at'
        ]
        read_only_fields = ['last_updated', 'created_at']
