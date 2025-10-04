from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PartCategoryViewSet, SupplierViewSet, PartViewSet,
    PurchaseOrderViewSet, PurchaseOrderItemViewSet, InventoryTransactionViewSet
)

router = DefaultRouter()
router.register(r'categories', PartCategoryViewSet, basename='partcategory')
router.register(r'suppliers', SupplierViewSet, basename='supplier')
router.register(r'parts', PartViewSet, basename='part')
router.register(r'purchase-orders', PurchaseOrderViewSet, basename='purchaseorder')
router.register(r'po-items', PurchaseOrderItemViewSet, basename='purchaseorderitem')
router.register(r'transactions', InventoryTransactionViewSet, basename='inventorytransaction')

urlpatterns = [
    path('', include(router.urls)),
]
