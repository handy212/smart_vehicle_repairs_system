from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PartCategoryViewSet, SupplierViewSet, PartViewSet,
    PurchaseOrderViewSet, PurchaseOrderItemViewSet, InventoryTransactionViewSet,
    ServicePackageViewSet
)

router = DefaultRouter()
router.register(r'categories', PartCategoryViewSet, basename='partcategory')
router.register(r'suppliers', SupplierViewSet, basename='supplier')
router.register(r'parts', PartViewSet, basename='part')
router.register(r'purchase-orders', PurchaseOrderViewSet, basename='purchaseorder')
router.register(r'po-items', PurchaseOrderItemViewSet, basename='purchaseorderitem')
router.register(r'transactions', InventoryTransactionViewSet, basename='inventorytransaction')
router.register(r'packages', ServicePackageViewSet, basename='servicepackage')

urlpatterns = [
    path('', include(router.urls)),
]
