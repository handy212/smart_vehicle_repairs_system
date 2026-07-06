from django.urls import path
from . import frontend_views

app_name = 'inventory'

urlpatterns = [
    # Dashboard
    path('', frontend_views.inventory_dashboard_view, name='dashboard'),
    
    # Parts management (Full CRUD)
    path('parts/', frontend_views.part_list_view, name='part_list'),
    path('parts/create/', frontend_views.part_create_view, name='part_create'),
    path('parts/import/', frontend_views.part_import_view, name='part_import'),
    path('parts/import/template/', frontend_views.part_import_template_view, name='part_import_template'),
    path('parts/<int:pk>/', frontend_views.part_detail_view, name='part_detail'),
    path('parts/<int:pk>/edit/', frontend_views.part_edit_view, name='part_edit'),
    path('parts/<int:pk>/delete/', frontend_views.part_delete_view, name='part_delete'),
    path('parts/<int:pk>/delete/confirm/', frontend_views.part_delete_confirm_view, name='part_delete_confirm'),
    path('parts/<int:pk>/adjust-stock/', frontend_views.adjust_stock, name='adjust_stock'),
    
    # AJAX API endpoints for frontend
    path('search/', frontend_views.inventory_search_api, name='inventory_search_api'),
    path('suppliers/<int:pk>/info/', frontend_views.supplier_info_api, name='supplier_info_api'),
    path('parts/<int:pk>/info/', frontend_views.part_info_api, name='part_info_api'),
    path('parts/low-stock/', frontend_views.low_stock_parts_api, name='low_stock_parts_api'),
    
    # Suppliers (Full CRUD)
    path('suppliers/', frontend_views.supplier_list_view, name='supplier_list'),
    path('suppliers/create/', frontend_views.supplier_create_view, name='supplier_create'),
    path('suppliers/<int:pk>/', frontend_views.supplier_detail_view, name='supplier_detail'),
    path('suppliers/<int:pk>/edit/', frontend_views.supplier_edit_view, name='supplier_edit'),
    path('suppliers/<int:pk>/delete/', frontend_views.supplier_delete_view, name='supplier_delete'),
    path('suppliers/import/', frontend_views.supplier_import_view, name='supplier_import'),
    
    # Purchase Orders (Full CRUD)
    path('purchase-orders/', frontend_views.purchase_order_list_view, name='purchase_order_list'),
    path('purchase-orders/create/', frontend_views.purchase_order_create_view, name='purchase_order_create'),
    path('purchase-orders/<int:pk>/', frontend_views.purchase_order_detail_view, name='purchase_order_detail'),
    path('purchase-orders/<int:pk>/edit/', frontend_views.purchase_order_edit_view, name='purchase_order_edit'),
    path('purchase-orders/<int:pk>/delete/', frontend_views.purchase_order_delete_view, name='purchase_order_delete'),
    
    # Categories (Full CRUD)
    path('categories/', frontend_views.category_list_view, name='category_list'),
    path('categories/create/', frontend_views.category_create_view, name='category_create'),
    path('categories/<int:pk>/edit/', frontend_views.category_edit_view, name='category_edit'),
    path('categories/<int:pk>/delete/', frontend_views.category_delete_view, name='category_delete'),
]