from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import acquisition_views

router = DefaultRouter()
router.register(r'categories', views.AssetCategoryViewSet, basename='assetcategory')
router.register(r'assets', views.FixedAssetViewSet, basename='fixedasset')
router.register(r'depreciation-schedules', views.DepreciationScheduleViewSet, basename='depreciationschedule')
router.register(r'maintenance', views.AssetMaintenanceViewSet, basename='assetmaintenance')
router.register(
    r'acquisition-requests',
    acquisition_views.AssetAcquisitionRequestViewSet,
    basename='assetacquisitionrequest',
)

urlpatterns = [
    path('', include(router.urls)),
]
