from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.diagnosis.views import (
    DiagnosisViewSet,
    RepairRecommendationViewSet,
    DiagnosticCodeViewSet,
    DiagnosticTestViewSet,
    DiagnosisFindingViewSet,
    DiagnosisPhotoViewSet,
    TestProcedureLibraryViewSet,
    DiagnosticCodeLibraryViewSet,
    DiagnosisHistoryViewSet
)

router = DefaultRouter()
router.register(r'diagnoses', DiagnosisViewSet, basename='diagnosis')
router.register(r'recommendations', RepairRecommendationViewSet, basename='repair-recommendation')
# Phase 2: Structured Data
router.register(r'codes', DiagnosticCodeViewSet, basename='diagnostic-code')
router.register(r'tests', DiagnosticTestViewSet, basename='diagnostic-test')
router.register(r'findings', DiagnosisFindingViewSet, basename='diagnosis-finding')
router.register(r'photos', DiagnosisPhotoViewSet, basename='diagnosis-photo')
# Phase 3: Advanced Features
router.register(r'test-procedures', TestProcedureLibraryViewSet, basename='test-procedure-library')
router.register(r'code-library', DiagnosticCodeLibraryViewSet, basename='diagnostic-code-library')
router.register(r'history', DiagnosisHistoryViewSet, basename='diagnosis-history')

urlpatterns = [
    path('', include(router.urls)),
]

