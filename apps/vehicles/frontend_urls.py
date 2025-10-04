"""
Frontend URLs for Vehicle Management
Template-based views for vehicle CRUD operations
"""
from django.urls import path
from . import frontend_views

app_name = 'vehicles'

urlpatterns = [
    # Vehicle List
    path('', frontend_views.VehicleListView.as_view(), name='vehicle-list'),
    
    # Vehicle Detail
    path('<int:pk>/', frontend_views.VehicleDetailView.as_view(), name='vehicle-detail'),
    
    # Vehicle Create
    path('create/', frontend_views.VehicleCreateView.as_view(), name='vehicle-create'),
    
    # Vehicle Edit
    path('<int:pk>/edit/', frontend_views.VehicleUpdateView.as_view(), name='vehicle-edit'),
    
    # Vehicle Delete
    path('<int:pk>/delete/', frontend_views.VehicleDeleteView.as_view(), name='vehicle-delete'),
    
    # Vehicle Service History
    path('<int:pk>/history/', frontend_views.VehicleServiceHistoryView.as_view(), name='vehicle-service-history'),
    
    # AJAX endpoints
    path('search/', frontend_views.vehicle_search_ajax, name='vehicle-search-ajax'),
    path('vin-decode/', frontend_views.vin_decode_ajax, name='vin-decode-ajax'),
    path('stats/', frontend_views.vehicle_stats_ajax, name='vehicle-stats-ajax'),
    path('<int:pk>/mileage-history/', frontend_views.vehicle_mileage_history_ajax, name='vehicle-mileage-history-ajax'),
    path('<int:pk>/upload-document/', frontend_views.upload_vehicle_document_ajax, name='upload-vehicle-document-ajax'),
    path('<int:pk>/upload-photo/', frontend_views.upload_vehicle_photo_ajax, name='upload-vehicle-photo-ajax'),
    path('export/', frontend_views.vehicle_export_view, name='vehicle-export'),
]