"""
Mobile URL Configuration
URL patterns for mobile-optimized views
"""

from django.urls import path
from . import mobile_views

app_name = 'mobile'

urlpatterns = [
    # Mobile Dashboard
    path('dashboard/', mobile_views.mobile_dashboard, name='dashboard'),
    
    # Mobile Work Orders
    path('workorders/', mobile_views.mobile_workorder_list, name='workorder_list'),
    
    # Mobile Inspections
    path('inspections/new/', mobile_views.mobile_inspection_form, name='inspection_create'),
    path('inspections/new/<int:vehicle_id>/', mobile_views.mobile_inspection_form, name='inspection_create_vehicle'),
    
    # Mobile API Endpoints
    path('api/quick-update/', mobile_views.mobile_quick_update, name='quick_update'),
    path('api/search/', mobile_views.mobile_search_api, name='search_api'),
    path('api/sync/', mobile_views.mobile_offline_sync, name='offline_sync'),
]