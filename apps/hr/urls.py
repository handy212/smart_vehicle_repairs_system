"""
HR Management URL Configuration
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DepartmentViewSet, PositionViewSet, EmployeeProfileViewSet,
    LeaveTypeViewSet, LeaveBalanceViewSet, LeaveRequestViewSet,
    AttendancePolicyViewSet, AttendanceViewSet,
    SalaryComponentViewSet, EmployeeSalaryComponentViewSet, TaxRuleViewSet,
    PayrollPeriodViewSet, PaySlipViewSet,
    JobOpeningViewSet, ApplicantViewSet, InterviewViewSet,
    PerformanceReviewViewSet, TrainingProgramViewSet,
    EmployeeTrainingViewSet, ComplianceDocumentViewSet,
)

router = DefaultRouter()

# Core
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'positions', PositionViewSet, basename='position')
router.register(r'staff', EmployeeProfileViewSet, basename='staff')

# Leave
router.register(r'leave-types', LeaveTypeViewSet, basename='leave-type')
router.register(r'leave-balances', LeaveBalanceViewSet, basename='leave-balance')
router.register(r'leave-requests', LeaveRequestViewSet, basename='leave-request')

# Attendance
router.register(r'attendance-policies', AttendancePolicyViewSet, basename='attendance-policy')
router.register(r'attendance', AttendanceViewSet, basename='attendance')

# Payroll
router.register(r'salary-components', SalaryComponentViewSet, basename='salary-component')
router.register(r'employee-salary-components', EmployeeSalaryComponentViewSet, basename='employee-salary-component')
router.register(r'tax-rules', TaxRuleViewSet, basename='tax-rule')
router.register(r'payroll-periods', PayrollPeriodViewSet, basename='payroll-period')
router.register(r'payslips', PaySlipViewSet, basename='payslip')

# Recruitment
router.register(r'job-openings', JobOpeningViewSet, basename='job-opening')
router.register(r'applicants', ApplicantViewSet, basename='applicant')
router.register(r'interviews', InterviewViewSet, basename='interview')

# Performance & Training
router.register(r'performance-reviews', PerformanceReviewViewSet, basename='performance-review')
router.register(r'training-programs', TrainingProgramViewSet, basename='training-program')
router.register(r'staff-training', EmployeeTrainingViewSet, basename='staff-training')

# Compliance
router.register(r'compliance-documents', ComplianceDocumentViewSet, basename='compliance-document')

urlpatterns = [
    path('', include(router.urls)),
]
