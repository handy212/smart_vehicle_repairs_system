from django.urls import path
from . import views

# app_name = 'reporting'  # Commented out to avoid conflict with frontend namespace

urlpatterns = [
    # Dashboard
    path('dashboard/', views.dashboard_overview, name='dashboard_overview'),
    
    # Financial Reports
    path('reports/revenue/', views.revenue_report, name='revenue_report'),
    path('reports/profit-margin/', views.profit_margin_report, name='profit_margin_report'),
    
    # Operational Reports
    path('reports/work-orders/', views.work_order_statistics, name='work_order_statistics'),
    path('reports/technicians/', views.technician_performance, name='technician_performance'),
    path('reports/appointments/', views.appointment_statistics, name='appointment_statistics'),
    
    # Inventory Reports
    path('reports/inventory/valuation/', views.inventory_valuation, name='inventory_valuation'),
    path('reports/inventory/turnover/', views.inventory_turnover, name='inventory_turnover'),
    path('reports/inventory/low-stock/', views.low_stock_report, name='low_stock_report'),
    
    # Customer Reports
    path('reports/customers/', views.customer_statistics, name='customer_statistics'),
    
    # Subscription Reports
    path('reports/subscriptions/', views.subscription_analytics, name='subscription_analytics'),
    
    # Vehicle Reports
    path('reports/vehicles/', views.vehicle_statistics, name='vehicle_statistics'),
    path('reports/vehicles/service-due/', views.service_due_report, name='service_due_report'),
]
