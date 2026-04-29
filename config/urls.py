"""
URL Configuration for Smart Vehicle Repairs System
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.auth import views as auth_views
from django.views.generic import TemplateView, RedirectView
from django.views.static import serve as static_serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from .views import (
    api_root, HomePageView, test_fcm_view, firebase_messaging_sw, 
    dashboard_view, logout_view, search_view, staff_register_view, profile_view
)
from apps.mobile_views import mobile_search_api
# Import customer auth views
from apps.customers import auth_views as customer_auth_views


urlpatterns = [
    # Homepage
    path('', HomePageView.as_view(), name='home'),
    
    # Dashboard
    path('dashboard/', dashboard_view, name='dashboard'),
    
    # Search
    path('search/', search_view, name='search'),
    
    
    # Firebase Service Worker (must be served from root)
    path('firebase-messaging-sw.js', firebase_messaging_sw, name='firebase-messaging-sw'),
    
    # Firebase Push Notification Test
    path('test-fcm/', test_fcm_view, name='test-fcm'),
    
    # API Root
    path('api/', api_root, name='api-root'),
    
    # Global Search API (accessible via /api/search/ for frontend proxy routing)
    path('api/search/', mobile_search_api, name='api-search'),
    
    # Admin
    path('admin/', admin.site.urls),
    
    # API Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # Accounting API
    path('api/accounting/', include('apps.accounting.urls')),
    path('api/quickbooks/', include('apps.quickbooks_online.urls')),
    
    # Authentication - Convenient shortcuts
    path('login/', RedirectView.as_view(pattern_name='login', permanent=False)),
    path('logout/', RedirectView.as_view(pattern_name='logout', permanent=False)),
    path('register/', RedirectView.as_view(pattern_name='register', permanent=False)),
    
    # Authentication - Django built-in views (Staff Portal)
    path('accounts/login/', auth_views.LoginView.as_view(template_name='accounts/login.html'), name='login'),
    path('accounts/logout/', logout_view, name='logout'),
    path('accounts/register/', TemplateView.as_view(template_name='accounts/register.html'), name='register'),
    path('accounts/staff-register/', staff_register_view, name='staff-register'),
    path('accounts/profile/', profile_view, name='profile'),
    path('accounts/password-change/', auth_views.PasswordChangeView.as_view(
        template_name='accounts/password_change.html',
        success_url='/accounts/profile/'
    ), name='password_change'),
    path('accounts/password-reset/', auth_views.PasswordResetView.as_view(template_name='accounts/password_reset.html'), name='password_reset'),
    path('accounts/password-reset/done/', auth_views.PasswordResetDoneView.as_view(template_name='accounts/password_reset_done.html'), name='password_reset_done'),
    path('accounts/reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(template_name='accounts/password_reset_confirm.html'), name='password_reset_confirm'),
    path('accounts/reset/done/', auth_views.PasswordResetCompleteView.as_view(template_name='accounts/password_reset_complete.html'), name='password_reset_complete'),
    
    # Customer Authentication (Separate System for Public Users)
    path('customer/login/', customer_auth_views.customer_login, name='customer_login'),
    path('customer/register/', customer_auth_views.customer_register, name='customer_register'),
    path('customer/logout/', customer_auth_views.customer_logout, name='customer_logout'),
    path('customer/forgot-password/', customer_auth_views.customer_forgot_password, name='customer_forgot_password'),
    path('customer/reset-password/<uidb64>/<token>/', customer_auth_views.customer_reset_password_confirm, name='customer_reset_password_confirm'),
    
    # API Authentication
    path('api/auth/', include('apps.accounts.urls')),
    path('api/accounts/', include('apps.accounts.urls')),  # Alias for frontend compatibility
    path('accounts/', include('allauth.urls')),
    
    # API endpoints (without namespace to avoid conflicts with frontend)
    path('api/branches/', include(('apps.branches.urls', 'api_branches'))),
    path('api/customers/', include(('apps.customers.urls', 'api_customers'))),
    path('api/vehicles/', include(('apps.vehicles.urls', 'api_vehicles'))),
    path('api/appointments/', include(('apps.appointments.urls', 'api_appointments'))),
    path('api/workorders/', include(('apps.workorders.urls', 'api_workorders'))),
    path('api/gatepass/', include(('apps.gatepass.urls', 'api_gatepass'))),
    path('api/inventory/', include(('apps.inventory.urls', 'api_inventory'))),
    path('api/billing/', include(('apps.billing.urls', 'api_billing'))),
    path('api/inspections/', include(('apps.inspections.urls', 'api_inspections'))),
    path('api/diagnosis/', include(('apps.diagnosis.urls', 'api_diagnosis'))),
    path('api/reporting/', include(('apps.reporting.urls', 'api_reporting'))),
    path('api/notifications/', include(('apps.notifications_app.urls', 'api_notifications'))),
    path('api/documents/', include(('apps.documents.urls', 'api_documents'))),
    path('api/subscriptions/', include(('apps.subscriptions.urls', 'api_subscriptions'))),
    path('api/roadside/', include(('apps.roadside.urls', 'api_roadside'))),
    path('api/fixed-assets/', include(('apps.fixed_assets.urls', 'api_fixed_assets'))),  # Fixed Assets API
    path('api/technicians/', include(('apps.technicians.urls', 'api_technicians'))),  # Technician Management
    path('api/hr/', include(('apps.hr.urls', 'api_hr'))),  # HR Management
    path('api/portal/', include(('apps.portal.urls', 'api_portal'))),  # Customer API Portal
    path('api/feedback/', include(('apps.feedback.urls', 'api_feedback'))),  # Feedback API
    path('api/chat/', include('apps.chat.urls')),  # Chat API
    path('api/workflows/', include(('apps.workflows.urls', 'api_workflows'))),  # Workflow Builder API
    
    # Frontend app routes (namespaced)
    path('branches/', include('apps.branches.frontend_urls', namespace='branches')),
    # Phase 3: Customer Management - IMPLEMENTED
    path('customers/', include('apps.customers.frontend_urls', namespace='customers')),
    
    # Phase 4: Vehicle Management - IMPLEMENTED
    path('vehicles/', include('apps.vehicles.frontend_urls', namespace='vehicles')),
    
    # Phase 5: Appointment Management - IMPLEMENTED
    path('appointments/', include('apps.appointments.frontend_urls', namespace='appointments')),
    
    # Phase 6: Work Order Management - IMPLEMENTED
    path('workorders/', include('apps.workorders.frontend_urls', namespace='workorders')),
    
    # Gate Pass Management
    path('gatepass/', include('apps.gatepass.frontend_urls', namespace='gatepass')),
    
    # Phase 7: Inventory Management - COMPLETE
    path('inventory/', include('apps.inventory.frontend_urls', namespace='inventory')),
    
    # Phase 8: Billing & Invoicing - IMPLEMENTED
    path('billing/', include('apps.billing.frontend_urls', namespace='billing')),
    
    # Phase 9: Vehicle Inspections - IMPLEMENTED
    path('inspections/', include('apps.inspections.frontend_urls', namespace='inspections')),
    
    # Phase 10: Reporting & Analytics - IMPLEMENTED
    path('reporting/', include('apps.reporting.frontend_urls', namespace='reporting')),
    
    # Phase 11: Notifications Center - IMPLEMENTED
    path('notifications/', include('apps.notifications_app.frontend_urls', namespace='notifications')),
    
    # Phase 12: Customer Portal - IMPLEMENTED
    path('portal/', include('apps.customers.portal_urls', namespace='portal')),
    
    # Phase 13: Mobile Optimization - NEW
    path('mobile/', include('apps.mobile_urls', namespace='mobile')),
    
    # Phase 14: Admin & Settings - NEW
    path('admin-panel/', include('apps.accounts.admin_urls', namespace='admin_panel')),
    
    # Django Ledger - Accounting System
    # path('ledger/', include('django_ledger.urls', namespace='django_ledger')),  # Removed for accounting module archival
]

# Serve static/media files
# - Static in production is handled by WhiteNoise or a reverse proxy.
# - Media in production should be served by a reverse proxy; but when running behind
#   Nginx Proxy Manager with /media proxied to Django, enable SERVE_MEDIA=True to serve it here.
if getattr(settings, 'SERVE_MEDIA', False):
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', static_serve, {'document_root': settings.MEDIA_ROOT}),
    ]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    
    # Debug Toolbar
    import debug_toolbar
    urlpatterns += [
        path('__debug__/', include(debug_toolbar.urls)),
    ]

# Customize admin site
admin.site.site_header = "Smart Vehicle Repairs Administration"
admin.site.site_title = "Vehicle Repairs Admin"
admin.site.index_title = "Welcome to Vehicle Repairs Management System"
