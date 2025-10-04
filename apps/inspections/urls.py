from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.inspections.views import (
    InspectionTemplateViewSet,
    VehicleInspectionViewSet,
    InspectionResultViewSet
)

router = DefaultRouter()
router.register(r'templates', InspectionTemplateViewSet, basename='inspection-template')
router.register(r'inspections', VehicleInspectionViewSet, basename='vehicle-inspection')
router.register(r'results', InspectionResultViewSet, basename='inspection-result')

urlpatterns = [
    path('', include(router.urls)),
]
