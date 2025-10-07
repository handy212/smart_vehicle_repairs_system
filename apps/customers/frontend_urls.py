"""
Frontend URLs for Customer Management
Template-based views for customer CRUD operations
"""
from django.urls import path
from . import frontend_views

app_name = 'customers'

urlpatterns = [
    # Customer List
    path('', frontend_views.CustomerListView.as_view(), name='customer-list'),
    
    # Customer Detail
    path('<int:pk>/', frontend_views.CustomerDetailView.as_view(), name='customer-detail'),
    
    # Customer Create
    path('create/', frontend_views.CustomerCreateView.as_view(), name='customer-create'),
    
    # Customer Edit
    path('<int:pk>/edit/', frontend_views.CustomerUpdateView.as_view(), name='customer-edit'),
    
    # Customer Delete
    path('<int:pk>/delete/', frontend_views.CustomerDeleteView.as_view(), name='customer-delete'),
    
    # Export customers
    path('export/', frontend_views.export_customers, name='customer-export'),
    
    # AJAX endpoints for dynamic content
    path('<int:pk>/notes/', frontend_views.customer_notes_ajax, name='customer-notes-ajax'),
    path('<int:pk>/vehicles/', frontend_views.customer_vehicles_ajax, name='customer-vehicles-ajax'),
    path('<int:pk>/history/', frontend_views.customer_history_ajax, name='customer-history-ajax'),
    
    # API Endpoints for inspection creation flow
    path('<int:pk>/vehicles-api/', frontend_views.customer_vehicles_api, name='customer-vehicles-api'),
]