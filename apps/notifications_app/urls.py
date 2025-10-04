from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# app_name = 'notifications_app'  # Commented out to avoid conflict with frontend namespace

router = DefaultRouter()
router.register('templates', views.NotificationTemplateViewSet, basename='template')
router.register('notifications', views.NotificationViewSet, basename='notification')
router.register('preferences', views.NotificationPreferenceViewSet, basename='preference')
router.register('logs', views.NotificationLogViewSet, basename='log')

urlpatterns = [
    path('', include(router.urls)),
]
