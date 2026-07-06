from rest_framework import serializers

from .models import (
    WorkflowAction,
    WorkflowDefinition,
    WorkflowGuard,
    WorkflowInstance,
    WorkflowState,
    WorkflowTransition,
    WorkflowTransitionLog,
)


class WorkflowStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowState
        fields = [
            'id', 'workflow', 'key', 'label', 'description', 'color', 'icon',
            'order', 'is_initial', 'is_terminal', 'is_active', 'metadata',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class WorkflowGuardSerializer(serializers.ModelSerializer):
    guard_type_display = serializers.CharField(source='get_guard_type_display', read_only=True)

    class Meta:
        model = WorkflowGuard
        fields = [
            'id', 'transition', 'guard_type', 'guard_type_display', 'field_path',
            'expected_value', 'message', 'config', 'order', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class WorkflowActionSerializer(serializers.ModelSerializer):
    action_type_display = serializers.CharField(source='get_action_type_display', read_only=True)
    timing_display = serializers.CharField(source='get_timing_display', read_only=True)

    class Meta:
        model = WorkflowAction
        fields = [
            'id', 'transition', 'action_type', 'action_type_display', 'timing',
            'timing_display', 'label', 'config', 'order', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class WorkflowTransitionSerializer(serializers.ModelSerializer):
    from_state_key = serializers.CharField(source='from_state.key', read_only=True)
    from_state_label = serializers.CharField(source='from_state.label', read_only=True)
    to_state_key = serializers.CharField(source='to_state.key', read_only=True)
    to_state_label = serializers.CharField(source='to_state.label', read_only=True)
    guards = WorkflowGuardSerializer(many=True, read_only=True)
    actions = WorkflowActionSerializer(many=True, read_only=True)

    class Meta:
        model = WorkflowTransition
        fields = [
            'id', 'workflow', 'from_state', 'from_state_key', 'from_state_label',
            'to_state', 'to_state_key', 'to_state_label', 'label', 'button_label',
            'description', 'order', 'allowed_roles', 'required_permission',
            'is_active', 'metadata', 'guards', 'actions', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class WorkflowDefinitionListSerializer(serializers.ModelSerializer):
    states_count = serializers.SerializerMethodField()
    transitions_count = serializers.SerializerMethodField()

    class Meta:
        model = WorkflowDefinition
        fields = [
            'id', 'name', 'code', 'description', 'model_path', 'version',
            'is_active', 'is_default', 'states_count', 'transitions_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_states_count(self, obj):
        return obj.states.count()

    def get_transitions_count(self, obj):
        return obj.transitions.count()


class WorkflowDefinitionDetailSerializer(serializers.ModelSerializer):
    states = WorkflowStateSerializer(many=True, read_only=True)
    transitions = WorkflowTransitionSerializer(many=True, read_only=True)

    class Meta:
        model = WorkflowDefinition
        fields = [
            'id', 'name', 'code', 'description', 'model_path', 'version',
            'is_active', 'is_default', 'states', 'transitions',
            'created_by', 'updated_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'updated_by', 'created_at', 'updated_at']

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user
            validated_data['updated_by'] = request.user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['updated_by'] = request.user
        return super().update(instance, validated_data)


class WorkflowInstanceSerializer(serializers.ModelSerializer):
    workflow_name = serializers.CharField(source='workflow.name', read_only=True)
    current_state_key = serializers.CharField(source='current_state.key', read_only=True)
    current_state_label = serializers.CharField(source='current_state.label', read_only=True)
    content_type_label = serializers.CharField(source='content_type.model', read_only=True)

    class Meta:
        model = WorkflowInstance
        fields = [
            'id', 'workflow', 'workflow_name', 'current_state', 'current_state_key',
            'current_state_label', 'content_type', 'content_type_label', 'object_id',
            'status_field', 'is_active', 'started_at', 'completed_at', 'metadata',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['started_at', 'completed_at', 'created_at', 'updated_at']


class WorkflowTransitionLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    transition_label = serializers.CharField(source='transition.label', read_only=True)

    class Meta:
        model = WorkflowTransitionLog
        fields = [
            'id', 'instance', 'transition', 'transition_label', 'from_state',
            'to_state', 'result', 'message', 'guard_results', 'action_results',
            'actor', 'actor_name', 'metadata', 'created_at',
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        if not obj.actor:
            return None
        return obj.actor.get_full_name() or getattr(obj.actor, 'email', None) or str(obj.actor)


class WorkflowRuntimeRequestSerializer(serializers.Serializer):
    model_path = serializers.CharField(max_length=120)
    object_id = serializers.IntegerField(min_value=1)


class WorkflowTransitionRequestSerializer(WorkflowRuntimeRequestSerializer):
    to_state = serializers.CharField(max_length=80)
    metadata = serializers.JSONField(required=False)
