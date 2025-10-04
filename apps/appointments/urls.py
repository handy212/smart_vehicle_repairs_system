"""
URL configuration for appointments app
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AppointmentViewSet, ServiceBayViewSet, AppointmentReminderViewSet

router = DefaultRouter()
router.register(r'appointments', AppointmentViewSet, basename='appointment')
router.register(r'service-bays', ServiceBayViewSet, basename='service-bay')
router.register(r'reminders', AppointmentReminderViewSet, basename='reminder')

# app_name = 'appointments'  # Commented out to avoid conflict with frontend namespace

urlpatterns = [
    path('', include(router.urls)),
]
