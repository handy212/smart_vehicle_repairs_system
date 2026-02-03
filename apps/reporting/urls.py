from django.urls import path
from . import views

# app_name = 'reporting'  # Commented out to avoid conflict with frontend namespace

urlpatterns = [
    # Dashboard
    path('dashboard-overview/', views.dashboard_overview, name='dashboard_overview'),
    
    # Financial Reports
    path('revenue-report/', views.revenue_report, name='revenue_report'),
    path('profit-margin-report/', views.profit_margin_report, name='profit_margin_report'),
    
    # Operational Reports
    path('work-order-statistics/', views.work_order_statistics, name='work_order_statistics'),
    path('technician-performance/', views.technician_performance, name='technician_performance'),
    path('appointment-statistics/', views.appointment_statistics, name='appointment_statistics'),
    
    # Inventory Reports
    path('inventory-valuation/', views.inventory_valuation, name='inventory_valuation'),
    path('inventory-turnover/', views.inventory_turnover, name='inventory_turnover'),
    path('low-stock-report/', views.low_stock_report, name='low_stock_report'),
    
    # Customer Reports
    path('customer-statistics/', views.customer_statistics, name='customer_statistics'),
    
    # Subscription Reports
    path('subscription-analytics/', views.subscription_analytics, name='subscription_analytics'),
    
    # Vehicle Reports
    path('vehicle-statistics/', views.vehicle_statistics, name='vehicle_statistics'),
    path('service-due-report/', views.service_due_report, name='service_due_report'),
]
