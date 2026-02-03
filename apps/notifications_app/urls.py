from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# app_name = 'notifications_app'  # Commented out to avoid conflict with frontend namespace

router = DefaultRouter()
router.register('templates', views.NotificationTemplateViewSet, basename='template')
router.register('notifications', views.NotificationViewSet, basename='notification')
router.register('preferences', views.NotificationPreferenceViewSet, basename='preference')
router.register('logs', views.NotificationLogViewSet, basename='log')
router.register('sms-console', views.SMSConsoleViewSet, basename='sms-console')
router.register('push-subscriptions', views.WebPushSubscriptionViewSet, basename='push-subscription')

urlpatterns = [
    path('', include(router.urls)),
    path('render-template/', views.TemplateRenderView.as_view(), name='render-template'),
]
