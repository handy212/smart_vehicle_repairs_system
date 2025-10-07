"""
Customer Portal URL Configuration
"""
from django.urls import path
from apps.customers import portal_views as views, auth_views, profile_views

app_name = 'portal'

urlpatterns = [
    # Portal pages (require authentication)
    path('', views.portal_home, name='home'),
    path('my-vehicles/', views.my_vehicles, name='my-vehicles'),
    path('vehicle/<int:vehicle_id>/', views.vehicle_detail, name='vehicle-detail'),
    path('inspection/<int:inspection_id>/', views.inspection_detail, name='inspection-detail'),
    path('my-appointments/', views.my_appointments, name='my-appointments'),
    path('my-invoices/', views.my_invoices, name='my-invoices'),
    path('my-history/', views.my_history, name='my-history'),
    path('book-appointment/', views.book_appointment, name='book-appointment'),
    path('payment/<int:invoice_id>/', views.make_payment, name='make-payment'),
    
    # Profile management
    path('settings/', profile_views.customer_profile_settings, name='profile-settings'),
    path('change-password/', profile_views.customer_change_password, name='change-password'),
]
