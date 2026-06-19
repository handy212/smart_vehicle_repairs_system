from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PartCategoryViewSet, SupplierViewSet, PartViewSet,
    PurchaseOrderViewSet, PurchaseOrderItemViewSet, InventoryTransactionViewSet,
    ServicePackageViewSet, StockItemViewSet, TransferViewSet, ServiceBundleViewSet,
    PhysicalCountSessionViewSet, PhysicalCountItemViewSet, StockAlertViewSet,
)
from . import report_views

router = DefaultRouter()
router.register(r'categories', PartCategoryViewSet, basename='partcategory')
router.register(r'suppliers', SupplierViewSet, basename='supplier')
router.register(r'parts', PartViewSet, basename='part')
router.register(r'purchase-orders', PurchaseOrderViewSet, basename='purchaseorder')
router.register(r'po-items', PurchaseOrderItemViewSet, basename='purchaseorderitem')
router.register(r'transactions', InventoryTransactionViewSet, basename='inventorytransaction')
router.register(r'packages', ServicePackageViewSet, basename='servicepackage')
router.register(r'stock-items', StockItemViewSet, basename='stockitem')
router.register(r'transfers', TransferViewSet, basename='transfer')
router.register(r'service-bundles', ServiceBundleViewSet, basename='servicebundle')
router.register(r'physical-counts', PhysicalCountSessionViewSet, basename='physicalcountsession')
router.register(r'physical-count-items', PhysicalCountItemViewSet, basename='physicalcountitem')
router.register(r'stock-alerts', StockAlertViewSet, basename='stockalert')

urlpatterns = [
    path('reports/availability-top-100/', report_views.availability_top_100, name='availability-top-100'),
    path('reports/inventory-accuracy/', report_views.inventory_accuracy_report, name='inventory-accuracy'),
    path('reports/shrinkage/', report_views.shrinkage_report, name='shrinkage-report'),
    path('reports/obsolescence/', report_views.obsolescence_report, name='obsolescence-report'),
    path('reports/p2p-compliance/', report_views.p2p_compliance_report, name='p2p-compliance'),
    path('reports/orphan-supply/', report_views.orphan_supply_report, name='orphan-supply'),
    path('reports/unbilled-delivered/', report_views.unbilled_delivered_report, name='unbilled-delivered'),
    path('reports/inventory-control/', report_views.inventory_control_report, name='inventory-control'),
    path('', include(router.urls)),
]
