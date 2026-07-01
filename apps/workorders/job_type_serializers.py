from rest_framework import serializers

from .job_types import JobType, WorkflowProfile


class WorkflowProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowProfile
        fields = [
            'id',
            'code',
            'name',
            'description',
            'is_active',
            'is_predefined',
            'sort_order',
            'skip_inspection',
            'skip_diagnosis',
            'skip_customer_approval',
            'skip_quality_check',
            'auto_approve_on_create',
            'apply_service_bundle_on_create',
            'allows_fast_track_to_approved',
        ]
        read_only_fields = ['is_predefined']


class JobTypeListSerializer(serializers.ModelSerializer):
    workflow_profile = WorkflowProfileSerializer(read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = JobType
        fields = [
            'id',
            'code',
            'name',
            'category',
            'category_display',
            'description',
            'workflow_profile',
            'is_active',
            'sort_order',
            'requires_inspection',
            'requires_diagnosis',
            'requires_approval',
            'quality_check_required',
            'allows_bundle',
            'sets_warranty_flag',
            'sets_insurance_flag',
        ]


class JobTypeSerializer(JobTypeListSerializer):
    default_service_type = serializers.PrimaryKeyRelatedField(read_only=True)
    default_service_bundle = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta(JobTypeListSerializer.Meta):
        fields = JobTypeListSerializer.Meta.fields + [
            'is_predefined',
            'default_service_type',
            'default_service_bundle',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['is_predefined', 'created_at', 'updated_at']


class JobTypeWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobType
        fields = [
            'code',
            'name',
            'category',
            'description',
            'workflow_profile',
            'is_active',
            'sort_order',
            'requires_inspection',
            'requires_diagnosis',
            'requires_approval',
            'quality_check_required',
            'allows_bundle',
            'default_service_type',
            'default_service_bundle',
            'sets_warranty_flag',
            'sets_insurance_flag',
        ]

    def validate(self, data):
        profile = data.get('workflow_profile') or getattr(self.instance, 'workflow_profile', None)
        allows_bundle = data.get('allows_bundle', getattr(self.instance, 'allows_bundle', False))
        if allows_bundle and profile and not profile.apply_service_bundle_on_create:
            raise serializers.ValidationError(
                {'allows_bundle': 'Selected workflow profile does not support service bundles.'}
            )
        return data
