from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    WorkOrderViewSet, ServiceTaskViewSet, ServiceTaskTypeViewSet, WorkOrderPartViewSet,
    TechnicianTimeLogViewSet, WorkOrderNoteViewSet, WorkOrderPhotoViewSet,
    PublicWorkOrderViewSet, JobTypeViewSet, WorkflowProfileViewSet,
)

router = DefaultRouter()
router.register(r'work-orders', WorkOrderViewSet, basename='workorder')
router.register(r'tasks', ServiceTaskViewSet, basename='servicetask')
router.register(r'task-types', ServiceTaskTypeViewSet, basename='servicetasktype')
router.register(r'parts', WorkOrderPartViewSet, basename='workorderpart')
router.register(r'time-logs', TechnicianTimeLogViewSet, basename='techniciantimelog')
router.register(r'notes', WorkOrderNoteViewSet, basename='workordernote')
router.register(r'photos', WorkOrderPhotoViewSet, basename='workorderphoto')
router.register(r'public', PublicWorkOrderViewSet, basename='public-workorder')
router.register(r'job-types', JobTypeViewSet, basename='jobtype')
router.register(r'workflow-profiles', WorkflowProfileViewSet, basename='workflowprofile')

urlpatterns = [
    path('', include(router.urls)),
]
