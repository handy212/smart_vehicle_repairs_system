"""
URL configuration for customers app
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CustomerViewSet, CustomerNoteViewSet

router = DefaultRouter()
router.register(r'customers', CustomerViewSet, basename='customer')
router.register(r'customer-notes', CustomerNoteViewSet, basename='customer-note')

# app_name = 'customers'  # Commented out to avoid conflict with frontend namespace

urlpatterns = [
    path('', include(router.urls)),
]
