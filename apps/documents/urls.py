"""
URL patterns for Document Management API
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DocumentCategoryViewSet,
    DocumentViewSet,
    DocumentVersionViewSet,
    DocumentShareViewSet,
    DocumentAccessViewSet,
    DocumentSignatureViewSet
)

# app_name = 'documents'  # Commented out to avoid conflict with frontend namespace

# Create router for ViewSets
router = DefaultRouter()
router.register(r'categories', DocumentCategoryViewSet, basename='category')
router.register(r'documents', DocumentViewSet, basename='document')
router.register(r'versions', DocumentVersionViewSet, basename='version')
router.register(r'shares', DocumentShareViewSet, basename='share')
router.register(r'access-logs', DocumentAccessViewSet, basename='access-log')
router.register(r'signatures', DocumentSignatureViewSet, basename='signature')

urlpatterns = [
    path('', include(router.urls)),
]
