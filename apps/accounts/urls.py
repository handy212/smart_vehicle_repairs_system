"""
URL configuration for accounts app
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenVerifyView
from .views import UserViewSet, GoogleAuthView, ManualRegistrationView
from .jwt_views import (
    CookieTokenObtainPairView,
    CookieTokenRefreshView,
    LogoutView,
    SessionView,
    ImpersonateCustomerView,
    ExitImpersonationView,
)
from .two_factor_views import TwoFactorViewSet
from .admin_api_views import (
    SystemSettingsViewSet, AuditLogViewSet, SystemBackupViewSet, SystemUpdateViewSet,
    EmailTemplateViewSet, SMSTemplateViewSet, admin_dashboard_stats,
    RoleViewSet, PermissionViewSet, SystemModuleViewSet
)

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'google', GoogleAuthView, basename='google-auth')
router.register(r'register', ManualRegistrationView, basename='manual-register')
router.register(r'2fa', TwoFactorViewSet, basename='two-factor')

# Admin API routes
admin_router = DefaultRouter()
admin_router.register(r'settings', SystemSettingsViewSet, basename='system-settings')
admin_router.register(r'audit-logs', AuditLogViewSet, basename='audit-log')
admin_router.register(r'backups', SystemBackupViewSet, basename='backup')
admin_router.register(r'updates', SystemUpdateViewSet, basename='system-update')
admin_router.register(r'email-templates', EmailTemplateViewSet, basename='email-template')
admin_router.register(r'sms-templates', SMSTemplateViewSet, basename='sms-template')
admin_router.register(r'roles', RoleViewSet, basename='role')
admin_router.register(r'permissions', PermissionViewSet, basename='permission')
admin_router.register(r'modules', SystemModuleViewSet, basename='system-module')

urlpatterns = [
    # JWT Authentication (with reCAPTCHA support)
    # Accept with and without trailing slash (Next.js proxy strips slashes on /api/*).
    path('token', CookieTokenObtainPairView.as_view(), name='token_obtain_pair_no_slash'),
    path('token/', CookieTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh', CookieTokenRefreshView.as_view(), name='token_refresh_no_slash'),
    path('token/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('token/verify', TokenVerifyView.as_view(), name='token_verify_no_slash'),
    path('token/verify/', TokenVerifyView.as_view(), name='token_verify'),
    path('logout', LogoutView.as_view(), name='token_logout_no_slash'),
    path('logout/', LogoutView.as_view(), name='token_logout'),

    # BFF-compatible aliases when /api/* is routed directly to Django (bypassing Next.js).
    path('login', CookieTokenObtainPairView.as_view(), name='bff_login_no_slash'),
    path('login/', CookieTokenObtainPairView.as_view(), name='bff_login'),
    path('refresh', CookieTokenRefreshView.as_view(), name='bff_refresh_no_slash'),
    path('refresh/', CookieTokenRefreshView.as_view(), name='bff_refresh'),
    path('verify', TokenVerifyView.as_view(), name='bff_verify_no_slash'),
    path('verify/', TokenVerifyView.as_view(), name='bff_verify'),
    path('session', SessionView.as_view(), name='bff_session_no_slash'),
    path('session/', SessionView.as_view(), name='bff_session'),
    path('impersonate', ImpersonateCustomerView.as_view(), name='impersonate_customer_no_slash'),
    path('impersonate/', ImpersonateCustomerView.as_view(), name='impersonate_customer'),
    path('impersonate/exit', ExitImpersonationView.as_view(), name='exit_impersonation_no_slash'),
    path('impersonate/exit/', ExitImpersonationView.as_view(), name='exit_impersonation'),

    # Profile (no-slash variant for Next.js /api proxy without trailing-slash redirects)
    path(
        'users/me',
        UserViewSet.as_view({'get': 'me', 'put': 'me', 'patch': 'me'}),
        name='user_me_no_slash',
    ),
    
    # User management
    path('', include(router.urls)),
    
    # Admin API
    path('admin/dashboard-stats/', admin_dashboard_stats, name='admin-dashboard-stats'),
    path('admin/', include(admin_router.urls)),
]
