from django.urls import include, path
from rest_framework.routers import DefaultRouter
from . import views
from . import operations_views
from . import operations_ai_views

# app_name = 'reporting'  # Commented out to avoid conflict with frontend namespace

router = DefaultRouter()
router.register(r'saved-reports', views.SavedReportViewSet, basename='saved-report')
router.register(r'schedules', views.ReportScheduleViewSet, basename='report-schedule')
router.register(r'export-logs', views.ReportExportLogViewSet, basename='report-export-log')

urlpatterns = [
    path('', include(router.urls)),
    path('catalog/', views.report_catalog, name='report_catalog'),

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
    
    # Service Bundle Reports
    path('service-bundle-popularity/', views.service_bundle_popularity, name='service_bundle_popularity'),

    # Operations intelligence (Part B Phase 3)
    path('roadside-revenue/', operations_views.roadside_revenue_report, name='roadside_revenue'),
    path('cost-control-return-jobs/', operations_views.cost_control_return_jobs, name='cost_control_return_jobs'),
    path('ap-cycle-time/', operations_views.ap_cycle_time_dashboard, name='ap_cycle_time'),
    path('exception-log/', operations_views.exception_log_report, name='exception_log'),
    path('traceability/', operations_views.traceability_dashboard, name='traceability'),
    path('capacity-planning/', operations_views.capacity_planning_report, name='capacity_planning'),
    path('system-usage/', operations_views.system_usage_report, name='system_usage'),

    # Operations AI
    path('operations/daily-briefing/', operations_ai_views.daily_briefing, name='ops_daily_briefing'),
    path('operations/triage-exceptions/', operations_ai_views.triage_exceptions, name='ops_triage_exceptions'),
    path('operations/analyze-return-jobs/', operations_ai_views.analyze_return_jobs, name='ops_analyze_return_jobs'),
    path('operations/capacity-narrative/', operations_ai_views.capacity_narrative, name='ops_capacity_narrative'),
    path('operations/ap-cycle-narrative/', operations_ai_views.ap_cycle_narrative, name='ops_ap_cycle_narrative'),
    path('operations/traceability-qa/', operations_ai_views.traceability_qa, name='ops_traceability_qa'),
    path('operations/workflow-bottleneck/', operations_ai_views.workflow_bottleneck_analysis, name='ops_workflow_bottleneck'),
]
