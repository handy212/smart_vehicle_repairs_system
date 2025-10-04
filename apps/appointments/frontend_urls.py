"""
Frontend URL configuration for appointments app
"""
from django.urls import path
from . import frontend_views

app_name = 'appointments'

urlpatterns = [
    # Appointment CRUD
    path('', frontend_views.AppointmentListView.as_view(), name='appointment-list'),
    path('<int:pk>/', frontend_views.AppointmentDetailView.as_view(), name='appointment-detail'),
    path('create/', frontend_views.AppointmentCreateView.as_view(), name='appointment-create'),
    path('<int:pk>/edit/', frontend_views.AppointmentUpdateView.as_view(), name='appointment-edit'),
    path('<int:pk>/delete/', frontend_views.AppointmentDeleteView.as_view(), name='appointment-delete'),
    
    # Calendar view
    path('calendar/', frontend_views.calendar_view, name='calendar-view'),
    
    # Status update endpoint
    path('<int:pk>/update-status/', frontend_views.update_appointment_status, name='update-status'),
    
    # AJAX endpoints
    path('api/events/', frontend_views.get_calendar_events, name='calendar-events'),
    path('api/availability/', frontend_views.check_availability, name='check-availability'),
    path('api/time-slots/', frontend_views.get_available_time_slots, name='available-time-slots'),
    path('api/customers/', frontend_views.get_customers_ajax, name='customers-ajax'),
    path('api/customer-vehicles/', frontend_views.get_customer_vehicles, name='customer-vehicles'),
]