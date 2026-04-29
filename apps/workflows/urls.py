from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    WorkflowActionViewSet,
    WorkflowDefinitionViewSet,
    WorkflowGuardViewSet,
    WorkflowInstanceViewSet,
    WorkflowRuntimeViewSet,
    WorkflowStateViewSet,
    WorkflowTransitionViewSet,
    WorkflowTransitionLogViewSet,
)

router = DefaultRouter()
router.register(r'definitions', WorkflowDefinitionViewSet, basename='workflow-definition')
router.register(r'states', WorkflowStateViewSet, basename='workflow-state')
router.register(r'transitions', WorkflowTransitionViewSet, basename='workflow-transition')
router.register(r'guards', WorkflowGuardViewSet, basename='workflow-guard')
router.register(r'actions', WorkflowActionViewSet, basename='workflow-action')
router.register(r'instances', WorkflowInstanceViewSet, basename='workflow-instance')
router.register(r'logs', WorkflowTransitionLogViewSet, basename='workflow-log')
router.register(r'runtime', WorkflowRuntimeViewSet, basename='workflow-runtime')

urlpatterns = [
    path('', include(router.urls)),
]
