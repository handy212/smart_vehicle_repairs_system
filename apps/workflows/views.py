from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import HasAnyPermission, HasPermission

from .models import (
    WorkflowAction,
    WorkflowDefinition,
    WorkflowGuard,
    WorkflowInstance,
    WorkflowState,
    WorkflowTransition,
    WorkflowTransitionLog,
)
from .serializers import (
    WorkflowActionSerializer,
    WorkflowDefinitionDetailSerializer,
    WorkflowDefinitionListSerializer,
    WorkflowGuardSerializer,
    WorkflowInstanceSerializer,
    WorkflowRuntimeRequestSerializer,
    WorkflowStateSerializer,
    WorkflowTransitionLogSerializer,
    WorkflowTransitionRequestSerializer,
    WorkflowTransitionSerializer,
)
from .services import (
    get_available_transitions,
    get_or_create_workflow_instance,
    get_registered_workflow_models,
    get_workflow_graph,
    perform_workflow_transition,
    seed_registered_workflows,
    seed_work_order_workflow,
)


class WorkflowDefinitionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasPermission('manage_settings')]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'code', 'description', 'model_path']
    ordering_fields = ['name', 'model_path', 'version', 'created_at', 'updated_at']
    ordering = ['model_path', '-is_default', 'name']

    def get_queryset(self):
        queryset = WorkflowDefinition.objects.prefetch_related(
            'states',
            'transitions__from_state',
            'transitions__to_state',
            'transitions__guards',
            'transitions__actions',
        )
        model_path = self.request.query_params.get('model_path')
        is_active = self.request.query_params.get('is_active')
        if model_path:
            queryset = queryset.filter(model_path=model_path)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in {'1', 'true', 'yes'})
        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return WorkflowDefinitionListSerializer
        return WorkflowDefinitionDetailSerializer

    @action(detail=True, methods=['get'])
    def graph(self, request, pk=None):
        workflow = self.get_object()
        return Response(get_workflow_graph(workflow))

    @action(detail=False, methods=['post'])
    def seed_work_order(self, request):
        workflow = seed_work_order_workflow(user=request.user)
        serializer = WorkflowDefinitionDetailSerializer(workflow, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def seed_registered(self, request):
        workflows = seed_registered_workflows(user=request.user)
        serializer = WorkflowDefinitionListSerializer(workflows, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def registry(self, request):
        return Response(get_registered_workflow_models())


class WorkflowStateViewSet(viewsets.ModelViewSet):
    serializer_class = WorkflowStateSerializer
    permission_classes = [IsAuthenticated, HasPermission('manage_settings')]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['key', 'label', 'description']
    ordering_fields = ['workflow', 'order', 'label', 'created_at']
    ordering = ['workflow', 'order', 'label']

    def get_queryset(self):
        queryset = WorkflowState.objects.select_related('workflow')
        workflow_id = self.request.query_params.get('workflow')
        if workflow_id:
            queryset = queryset.filter(workflow_id=workflow_id)
        return queryset


class WorkflowTransitionViewSet(viewsets.ModelViewSet):
    serializer_class = WorkflowTransitionSerializer
    permission_classes = [IsAuthenticated, HasPermission('manage_settings')]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['label', 'button_label', 'description', 'from_state__key', 'to_state__key']
    ordering_fields = ['workflow', 'order', 'label', 'created_at']
    ordering = ['workflow', 'from_state__order', 'order', 'label']

    def get_queryset(self):
        queryset = WorkflowTransition.objects.select_related(
            'workflow', 'from_state', 'to_state'
        ).prefetch_related('guards', 'actions')
        workflow_id = self.request.query_params.get('workflow')
        from_state = self.request.query_params.get('from_state')
        if workflow_id:
            queryset = queryset.filter(workflow_id=workflow_id)
        if from_state:
            queryset = queryset.filter(from_state__key=from_state)
        return queryset


class WorkflowGuardViewSet(viewsets.ModelViewSet):
    serializer_class = WorkflowGuardSerializer
    permission_classes = [IsAuthenticated, HasPermission('manage_settings')]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['field_path', 'message']
    ordering_fields = ['transition', 'order', 'created_at']
    ordering = ['transition', 'order', 'id']

    def get_queryset(self):
        queryset = WorkflowGuard.objects.select_related('transition', 'transition__workflow')
        transition_id = self.request.query_params.get('transition')
        if transition_id:
            queryset = queryset.filter(transition_id=transition_id)
        return queryset


class WorkflowActionViewSet(viewsets.ModelViewSet):
    serializer_class = WorkflowActionSerializer
    permission_classes = [IsAuthenticated, HasPermission('manage_settings')]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['label', 'action_type']
    ordering_fields = ['transition', 'timing', 'order', 'created_at']
    ordering = ['transition', 'timing', 'order', 'id']

    def get_queryset(self):
        queryset = WorkflowAction.objects.select_related('transition', 'transition__workflow')
        transition_id = self.request.query_params.get('transition')
        if transition_id:
            queryset = queryset.filter(transition_id=transition_id)
        return queryset


class WorkflowInstanceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WorkflowInstanceSerializer
    permission_classes = [IsAuthenticated, HasPermission('manage_settings')]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['workflow__name', 'current_state__key', 'object_id']
    ordering_fields = ['workflow', 'current_state', 'updated_at', 'created_at']
    ordering = ['-updated_at']

    def get_queryset(self):
        queryset = WorkflowInstance.objects.select_related(
            'workflow', 'current_state', 'content_type'
        )
        model_path = self.request.query_params.get('model_path')
        object_id = self.request.query_params.get('object_id')
        if model_path:
            app_label, model = model_path.split('.', 1)
            queryset = queryset.filter(
                content_type__app_label=app_label,
                content_type__model=model.lower(),
            )
        if object_id:
            queryset = queryset.filter(object_id=object_id)
        return queryset


class WorkflowTransitionLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WorkflowTransitionLogSerializer
    permission_classes = [IsAuthenticated, HasPermission('manage_settings')]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['from_state', 'to_state', 'message', 'actor__email']
    ordering_fields = ['created_at', 'result', 'from_state', 'to_state']
    ordering = ['-created_at']

    def get_queryset(self):
        queryset = WorkflowTransitionLog.objects.select_related(
            'instance', 'transition', 'actor'
        )
        instance_id = self.request.query_params.get('instance')
        result = self.request.query_params.get('result')
        if instance_id:
            queryset = queryset.filter(instance_id=instance_id)
        if result:
            queryset = queryset.filter(result=result)
        return queryset


class WorkflowRuntimeViewSet(viewsets.ViewSet):
    permission_classes = [
        IsAuthenticated,
        HasAnyPermission(['view_workorders', 'view_own_workorders', 'update_workorder_status']),
    ]

    def _get_object(self, model_path, object_id):
        from .services import _get_model_and_config

        model, _ = _get_model_and_config(model_path)
        return get_object_or_404(model, pk=object_id)

    @action(detail=False, methods=['post'])
    def available_transitions(self, request):
        serializer = WorkflowRuntimeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = self._get_object(
            serializer.validated_data['model_path'],
            serializer.validated_data['object_id'],
        )
        instance = get_or_create_workflow_instance(
            obj,
            model_path=serializer.validated_data['model_path'],
        )
        transitions = get_available_transitions(
            obj,
            user=request.user,
            model_path=serializer.validated_data['model_path'],
        )
        return Response({
            'instance': WorkflowInstanceSerializer(instance).data if instance else None,
            'transitions': transitions,
        })

    @action(detail=False, methods=['post'])
    def transition(self, request):
        serializer = WorkflowTransitionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = self._get_object(
            serializer.validated_data['model_path'],
            serializer.validated_data['object_id'],
        )
        try:
            result = perform_workflow_transition(
                obj,
                serializer.validated_data['to_state'],
                user=request.user,
                model_path=serializer.validated_data['model_path'],
                metadata=serializer.validated_data.get('metadata') or {},
            )
        except ValidationError as exc:
            return Response({'detail': '; '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'from_state': result['from_state'],
            'to_state': result['to_state'],
            'actions': result['actions'],
            'log': WorkflowTransitionLogSerializer(result['log']).data,
        })
