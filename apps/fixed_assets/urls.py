from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'categories', views.AssetCategoryViewSet, basename='assetcategory')
router.register(r'assets', views.FixedAssetViewSet, basename='fixedasset')
router.register(r'depreciation-schedules', views.DepreciationScheduleViewSet, basename='depreciationschedule')
router.register(r'maintenance', views.AssetMaintenanceViewSet, basename='assetmaintenance')

urlpatterns = [
    path('', include(router.urls)),
]
