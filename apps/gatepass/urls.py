from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import GatePassViewSet

router = DefaultRouter()
router.register(r'gate-passes', GatePassViewSet, basename='gatepass')

urlpatterns = [
    path('', include(router.urls)),
]
