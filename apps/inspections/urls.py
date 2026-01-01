from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.inspections.views import (
    InspectionTemplateViewSet,
    VehicleInspectionViewSet,
    InspectionResultViewSet,
    InspectionPhotoViewSet
)

router = DefaultRouter()
router.register(r'templates', InspectionTemplateViewSet, basename='inspection-template')
router.register(r'inspections', VehicleInspectionViewSet, basename='vehicle-inspection')
router.register(r'results', InspectionResultViewSet, basename='inspection-result')
router.register(r'photos', InspectionPhotoViewSet, basename='inspection-photo')

urlpatterns = [
    path('', include(router.urls)),
]
