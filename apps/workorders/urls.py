from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    WorkOrderViewSet, ServiceTaskViewSet, WorkOrderPartViewSet,
    TechnicianTimeLogViewSet, WorkOrderNoteViewSet, WorkOrderPhotoViewSet
)

router = DefaultRouter()
router.register(r'work-orders', WorkOrderViewSet, basename='workorder')
router.register(r'tasks', ServiceTaskViewSet, basename='servicetask')
router.register(r'parts', WorkOrderPartViewSet, basename='workorderpart')
router.register(r'time-logs', TechnicianTimeLogViewSet, basename='techniciantimelog')
router.register(r'notes', WorkOrderNoteViewSet, basename='workordernote')
router.register(r'photos', WorkOrderPhotoViewSet, basename='workorderphoto')

urlpatterns = [
    path('', include(router.urls)),
]
