from django.urls import path
from . import frontend_views

app_name = 'inventory'

urlpatterns = [
    # Dashboard
    path('', frontend_views.inventory_dashboard_view, name='dashboard'),
    
    # Parts management
    path('parts/', frontend_views.part_list_view, name='part_list'),
    path('parts/create/', frontend_views.part_create_view, name='part_create'),
    path('parts/<int:pk>/', frontend_views.part_detail_view, name='part_detail'),
    path('parts/<int:pk>/edit/', frontend_views.part_edit_view, name='part_edit'),
    path('parts/<int:pk>/adjust-stock/', frontend_views.adjust_stock, name='adjust_stock'),
    
    # Suppliers
    path('suppliers/', frontend_views.supplier_list_view, name='supplier_list'),
    path('suppliers/import/', frontend_views.supplier_import_view, name='supplier_import'),
    
    # Purchase orders
    path('purchase-orders/', frontend_views.purchase_order_list_view, name='purchase_order_list'),
    path('purchase-orders/create/', frontend_views.purchase_order_create_view, name='purchase_order_create'),
    path('purchase-orders/<int:pk>/', frontend_views.purchase_order_detail_view, name='purchase_order_detail'),
]