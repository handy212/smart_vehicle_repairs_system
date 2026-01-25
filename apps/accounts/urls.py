"""
URL configuration for accounts app
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView, TokenVerifyView
from .views import UserViewSet, GoogleAuthView, ManualRegistrationView
from .recaptcha_views import RecaptchaTokenObtainPairView
from .admin_api_views import (
    SystemSettingsViewSet, AuditLogViewSet, SystemBackupViewSet,
    EmailTemplateViewSet, SMSTemplateViewSet, admin_dashboard_stats,
    RoleViewSet, PermissionViewSet
)

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'google', GoogleAuthView, basename='google-auth')
router.register(r'register', ManualRegistrationView, basename='manual-register')

# Admin API routes
admin_router = DefaultRouter()
admin_router.register(r'settings', SystemSettingsViewSet, basename='system-settings')
admin_router.register(r'audit-logs', AuditLogViewSet, basename='audit-log')
admin_router.register(r'backups', SystemBackupViewSet, basename='backup')
admin_router.register(r'email-templates', EmailTemplateViewSet, basename='email-template')
admin_router.register(r'sms-templates', SMSTemplateViewSet, basename='sms-template')
admin_router.register(r'roles', RoleViewSet, basename='role')
admin_router.register(r'permissions', PermissionViewSet, basename='permission')

urlpatterns = [
    # JWT Authentication (with reCAPTCHA support)
    path('token/', RecaptchaTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('token/verify/', TokenVerifyView.as_view(), name='token_verify'),
    
    # User management
    path('', include(router.urls)),
    
    # Admin API
    path('admin/dashboard-stats/', admin_dashboard_stats, name='admin-dashboard-stats'),
    path('admin/', include(admin_router.urls)),
]
