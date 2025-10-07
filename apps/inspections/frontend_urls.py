"""
Frontend URL patterns for Vehicle Inspections
"""
from django.urls import path
from . import frontend_views

app_name = 'inspections'

urlpatterns = [
    # Inspection List
    path('', frontend_views.inspection_list, name='inspection-list'),
    
    # Inspection CRUD
    path('create/', frontend_views.inspection_create, name='inspection-create'),
    path('<int:pk>/', frontend_views.inspection_detail, name='inspection-detail'),
    path('<int:pk>/edit/', frontend_views.inspection_edit, name='inspection-edit'),
    path('<int:pk>/delete/', frontend_views.inspection_delete, name='inspection-delete'),
    
    # Inspection Print/PDF
    path('<int:pk>/print/', frontend_views.inspection_print, name='inspection-print'),
    path('<int:pk>/pdf/', frontend_views.inspection_pdf, name='inspection-pdf'),
    
    # Inspection Templates
    path('templates/', frontend_views.template_list, name='template-list'),
    path('templates/<int:pk>/', frontend_views.template_detail, name='template-detail'),
    path('templates/<int:pk>/edit/', frontend_views.template_edit, name='template-edit'),
    path('templates/create/', frontend_views.template_create, name='template-create'),
    
    # Template Categories
    path('templates/<int:template_pk>/categories/add/', frontend_views.category_create, name='category-create'),
    path('categories/<int:pk>/edit/', frontend_views.category_edit, name='category-edit'),
    path('categories/<int:pk>/delete/', frontend_views.category_delete, name='category-delete'),
    
    # Category Items
    path('categories/<int:category_pk>/items/add/', frontend_views.item_create, name='item-create'),
    path('items/<int:pk>/edit/', frontend_views.item_edit, name='item-edit'),
    path('items/<int:pk>/delete/', frontend_views.item_delete, name='item-delete'),
    
    # API Endpoints for AJAX
    path('templates/<int:pk>/checklist/', frontend_views.template_checklist_api, name='template-checklist-api'),
]
