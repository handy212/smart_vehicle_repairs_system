from rest_framework import serializers
from django.utils import timezone
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
            'diagnosis', 'code_number', 'code_type', 'description', 'severity',
            'freeze_frame_data', 'status', 'recorded_at'
        ]
    
    def validate(self, attrs):
        """Validate that the code doesn't already exist for this diagnosis"""
        diagnosis = attrs.get('diagnosis')
        code_number = attrs.get('code_number', '').strip().upper()
        code_type = attrs.get('code_type')
        
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
            'diagnosis', 'test_name', 'category', 'test_procedure', 'expected_result',
            'actual_result', 'measurements', 'tools_used', 'status',
            'performed_at', 'performed_by'
        ]


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


# ============================================================================
# Phase 1 Serializers
# ============================================================================

class RepairRecommendationSerializer(serializers.ModelSerializer):
    """Serializer for repair recommendations"""
    recommendation_type_display = serializers.CharField(source='get_recommendation_type_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    converted_to_task_id = serializers.IntegerField(source='converted_to_task.id', read_only=True, allow_null=True)
    
    class Meta:
        model = RepairRecommendation
        fields = [
            'id', 'recommendation_type', 'recommendation_type_display',
            'description', 'priority', 'priority_display',
            'parts_needed', 'estimated_parts_cost',
            'estimated_labor_hours', 'estimated_labor_cost',
            'estimated_total_cost', 'customer_approved',
            'converted_to_task_id', 'order',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['estimated_total_cost', 'created_at', 'updated_at']


class RepairRecommendationCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating repair recommendations"""
    
    class Meta:
        model = RepairRecommendation
        fields = [
            'recommendation_type', 'description', 'priority',
            'parts_needed', 'estimated_parts_cost',
            'estimated_labor_hours', 'estimated_labor_cost',
            'order', 'customer_approved'
        ]
    
    def create(self, validated_data):
        # Diagnosis will be set in the view
        return super().create(validated_data)


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
    
    class Meta:
        model = Diagnosis
        fields = [
            'technician', 'status',
            'customer_complaint', 'initial_observations',
            'diagnostic_notes', 'diagnostic_time_hours',
            'diagnostic_fee', 'root_cause', 'root_cause_explanation',
            'is_completed', 'requires_approval'
        ]
    
    def update(self, instance, validated_data):
        # Auto-complete if status is being set to completed
        if validated_data.get('status') == 'completed' and not instance.is_completed:
            instance.complete()
        return super().update(instance, validated_data)


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

