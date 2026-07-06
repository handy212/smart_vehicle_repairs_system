"""
URL configuration for customers app
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CustomerViewSet, CustomerNoteViewSet, CustomerContactViewSet, 
    CustomerReminderViewSet, CustomerDocumentViewSet, CustomerContractViewSet
)

router = DefaultRouter()
router.register(r'customers', CustomerViewSet, basename='customer')
router.register(r'customer-notes', CustomerNoteViewSet, basename='customer-note')
router.register(r'customer-contacts', CustomerContactViewSet, basename='customer-contact')
router.register(r'customer-reminders', CustomerReminderViewSet, basename='customer-reminder')
router.register(r'customer-documents', CustomerDocumentViewSet, basename='customer-document')
router.register(r'customer-contracts', CustomerContractViewSet, basename='customer-contract')

# app_name = 'customers'  # Commented out to avoid conflict with frontend namespace

urlpatterns = [
    path('', include(router.urls)),
]
