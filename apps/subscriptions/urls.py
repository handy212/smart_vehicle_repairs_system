"""
URL configuration for subscriptions app API
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PackageViewSet, SubscriptionViewSet, SubscriptionUsageViewSet

router = DefaultRouter()
router.register(r'packages', PackageViewSet, basename='package')
router.register(r'subscriptions', SubscriptionViewSet, basename='subscription')
router.register(r'usage', SubscriptionUsageViewSet, basename='subscription-usage')

urlpatterns = router.urls

