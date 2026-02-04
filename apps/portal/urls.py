from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PortalViewSet

router = DefaultRouter()
# Since PortalViewSet is a ViewSet but doesn't have a queryset/model standard, 
# we register it as a singleton-like resource or use specific base name
router.register(r'', PortalViewSet, basename='portal')

urlpatterns = [
    path('', include(router.urls)),
]
