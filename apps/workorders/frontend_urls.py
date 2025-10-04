from django.urls import path
from . import frontend_views

app_name = 'workorders'

urlpatterns = [
    # Main CRUD views
    path('', frontend_views.workorder_list_view, name='list'),
    path('kanban/', frontend_views.workorder_kanban_view, name='kanban'),
    path('create/', frontend_views.workorder_create_view, name='create'),
    path('<int:pk>/', frontend_views.workorder_detail_view, name='detail'),
    path('<int:pk>/edit/', frontend_views.workorder_edit_view, name='edit'),
    path('<int:pk>/print/', frontend_views.workorder_print_view, name='print'),
    
    # AJAX endpoints
    path('<int:pk>/update-status/', frontend_views.update_workorder_status, name='update-status'),
    path('<int:pk>/add-note/', frontend_views.add_workorder_note, name='add-note'),
    path('<int:pk>/time-clock/', frontend_views.technician_time_clock, name='time-clock'),
    path('customer/<int:customer_id>/vehicles/', frontend_views.get_customer_vehicles, name='customer-vehicles'),
    
    # Task management
    path('<int:pk>/add-task/', frontend_views.add_task, name='add-task'),
    path('<int:pk>/tasks/<int:task_id>/update-status/', frontend_views.update_task_status, name='update-task-status'),
    path('<int:pk>/tasks/<int:task_id>/delete/', frontend_views.delete_task, name='delete-task'),
    
    # Export
    path('export/', frontend_views.workorder_export_view, name='export'),
]