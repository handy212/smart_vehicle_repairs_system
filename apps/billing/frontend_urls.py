"""
URL patterns for billing frontend views
"""

from django.urls import path
from apps.billing import frontend_views

app_name = 'billing'

urlpatterns = [
    # Dashboard
    path('', frontend_views.billing_dashboard, name='dashboard'),
    
    # Invoices
    path('invoices/', frontend_views.invoice_list, name='invoice_list'),
    path('invoices/create/', frontend_views.invoice_create, name='invoice_create'),
    path('invoices/<int:invoice_id>/', frontend_views.invoice_detail, name='invoice_detail'),
    path('invoices/<int:invoice_id>/edit/', frontend_views.invoice_edit, name='invoice_edit'),
    path('invoices/<int:invoice_id>/print/', frontend_views.invoice_print, name='invoice_print'),
    
    # Estimates
    path('estimates/', frontend_views.estimate_list, name='estimate_list'),
    path('estimates/create/', frontend_views.estimate_create, name='estimate_create'),
    path('estimates/<int:estimate_id>/', frontend_views.estimate_detail, name='estimate_detail'),
    
    # Payments
    path('payments/', frontend_views.payment_list, name='payment_list'),
    path('payments/create/', frontend_views.payment_create, name='payment_create'),
    
    # Export endpoints
    path('export/invoices/csv/', frontend_views.export_invoices_csv, name='export_invoices_csv'),
    path('export/invoices/pdf/', frontend_views.export_invoices_pdf, name='export_invoices_pdf'),
    path('export/estimates/csv/', frontend_views.export_estimates_csv, name='export_estimates_csv'),
    path('export/payments/csv/', frontend_views.export_payments_csv, name='export_payments_csv'),
    path('export/invoices/bulk/', frontend_views.bulk_export_invoices, name='bulk_export_invoices'),
    
    # AJAX endpoints
    path('ajax/customer-vehicles/', frontend_views.get_customer_vehicles, name='customer_vehicles'),
    path('ajax/vehicle-workorders/', frontend_views.get_work_orders_for_vehicle, name='vehicle_workorders'),
    path('ajax/calculate-tax/', frontend_views.calculate_tax, name='calculate_tax'),
]