"""
Frontend URL patterns for Reporting & Analytics
"""
from django.urls import path
from . import frontend_views

app_name = 'reporting'

urlpatterns = [
    # Report Dashboard
    path('', frontend_views.report_dashboard, name='report-dashboard'),
    
    # Pre-built Reports
    path('financial/', frontend_views.financial_report, name='financial-report'),
    path('operational/', frontend_views.operational_report, name='operational-report'),
    path('inventory/', frontend_views.inventory_report, name='inventory-report'),
    path('customer/', frontend_views.customer_report, name='customer-report'),
    path('vehicle/', frontend_views.vehicle_report, name='vehicle-report'),
    
    # Custom Report Builder
    path('custom/', frontend_views.custom_report, name='custom-report'),
    path('custom/generate/', frontend_views.generate_custom_report, name='generate-custom-report'),
    
    # Report Actions
    path('email/', frontend_views.email_report, name='email-report'),
    path('save/', frontend_views.save_report, name='save-report'),
    path('schedule/<int:pk>/edit/', frontend_views.schedule_edit, name='schedule-edit'),
    path('schedule/<int:pk>/delete/', frontend_views.schedule_delete, name='schedule-delete'),
]
