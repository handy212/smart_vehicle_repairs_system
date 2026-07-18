from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.data_exchange.views import DataExchangeViewSet, ImportBatchViewSet

router = DefaultRouter()
router.register(r'batches', ImportBatchViewSet, basename='import-batch')
router.register(r'', DataExchangeViewSet, basename='data-exchange')

urlpatterns = [
    path('', include(router.urls)),
]
