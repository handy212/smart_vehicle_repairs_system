"""
URLs for roadside assistance
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RoadsideRequestViewSet

router = DefaultRouter()
router.register(r'requests', RoadsideRequestViewSet, basename='roadside-request')

app_name = 'roadside'

urlpatterns = [
    path('', include(router.urls)),
]
