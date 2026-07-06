"""
URL configuration for vehicles app
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    VehicleViewSet,
    VehicleMileageHistoryViewSet,
    VehicleDocumentViewSet,
    VehiclePhotoViewSet,
    ServiceTypeViewSet,
    VehicleServiceScheduleViewSet
)

router = DefaultRouter()
router.register(r'vehicles', VehicleViewSet, basename='vehicle')
router.register(r'mileage-history', VehicleMileageHistoryViewSet, basename='mileage-history')
router.register(r'documents', VehicleDocumentViewSet, basename='document')
router.register(r'photos', VehiclePhotoViewSet, basename='photo')
router.register(r'service-types', ServiceTypeViewSet, basename='service-type')
router.register(r'service-schedules', VehicleServiceScheduleViewSet, basename='service-schedule')

# app_name = 'vehicles'  # Commented out to avoid conflict with frontend namespace

urlpatterns = [
    path('', include(router.urls)),
]
