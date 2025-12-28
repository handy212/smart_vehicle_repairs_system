from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TechnicianViewSet, SkillViewSet, TimeOffRequestViewSet, ShiftViewSet, CertificationViewSet

router = DefaultRouter()
router.register(r'technicians', TechnicianViewSet)
router.register(r'skills', SkillViewSet)
router.register(r'time-off', TimeOffRequestViewSet)
router.register(r'shifts', ShiftViewSet, basename='shifts')
router.register(r'certifications', CertificationViewSet, basename='certifications')

urlpatterns = [
    path('', include(router.urls)),
]
