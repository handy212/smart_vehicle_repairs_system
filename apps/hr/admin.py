"""
HR Management Django Admin Configuration
"""
from django.contrib import admin
from .models import (
    Department, Position, EmployeeProfile,
    LeaveType, LeaveBalance, LeaveRequest,
    AttendancePolicy, Attendance,
    SalaryComponent, EmployeeSalaryComponent, TaxRule,
    PayrollPeriod, PaySlip, PayslipNumberSequence, PayrollAuditLog,
    JobOpening, Applicant, Interview,
    PerformanceReview, TrainingProgram, EmployeeTraining, ComplianceDocument,
)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ['name', 'branch', 'head', 'is_active', 'active_staff_count']
    list_filter = ['branch', 'is_active']
    search_fields = ['name']


@admin.register(Position)
class PositionAdmin(admin.ModelAdmin):
    list_display = ['title', 'department', 'min_salary', 'max_salary', 'is_active']
    list_filter = ['department', 'is_active']
    search_fields = ['title']


@admin.register(EmployeeProfile)
class EmployeeProfileAdmin(admin.ModelAdmin):
    list_display = [
        'user', 'department', 'position', 'employment_type',
        'employment_status', 'time_tracking_enabled', 'start_date',
    ]
    list_filter = ['employment_type', 'employment_status', 'time_tracking_enabled', 'department']
    search_fields = ['user__first_name', 'user__last_name', 'user__email']
    raw_id_fields = ['user', 'reporting_to']


@admin.register(LeaveType)
class LeaveTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'days_allowed', 'is_paid', 'carry_forward', 'is_active']
    list_filter = ['is_paid', 'is_active']


@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
    list_display = ['employee', 'leave_type', 'year', 'total_days', 'used_days', 'remaining_days']
    list_filter = ['year', 'leave_type']
    raw_id_fields = ['employee']


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = [
        'employee', 'leave_type', 'start_date', 'end_date',
        'days_count', 'status', 'reviewed_by',
    ]
    list_filter = ['status', 'leave_type']
    search_fields = ['employee__user__first_name', 'employee__user__last_name']
    raw_id_fields = ['employee', 'reviewed_by']


@admin.register(AttendancePolicy)
class AttendancePolicyAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'branch', 'work_start_time', 'work_end_time',
        'is_default', 'is_active',
    ]
    list_filter = ['branch', 'is_active', 'is_default']


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = [
        'employee', 'date', 'clock_in', 'clock_out',
        'total_hours', 'status', 'branch',
    ]
    list_filter = ['status', 'branch', 'date']
    search_fields = ['employee__user__first_name', 'employee__user__last_name']
    raw_id_fields = ['employee']
    date_hierarchy = 'date'


@admin.register(SalaryComponent)
class SalaryComponentAdmin(admin.ModelAdmin):
    list_display = ['name', 'component_type', 'calculation_type', 'amount', 'percentage', 'is_active']
    list_filter = ['component_type', 'is_active']


@admin.register(EmployeeSalaryComponent)
class EmployeeSalaryComponentAdmin(admin.ModelAdmin):
    list_display = ['employee', 'component', 'amount', 'is_active']
    list_filter = ['is_active', 'component']
    raw_id_fields = ['employee']


@admin.register(TaxRule)
class TaxRuleAdmin(admin.ModelAdmin):
    list_display = ['name', 'min_income', 'max_income', 'rate']
    ordering = ['min_income']


@admin.register(PayrollPeriod)
class PayrollPeriodAdmin(admin.ModelAdmin):
    list_display = ['name', 'start_date', 'end_date', 'status', 'branch', 'created_by', 'approved_by', 'paid_by']
    list_filter = ['status', 'branch']
    raw_id_fields = ['created_by', 'approved_by', 'paid_by', 'reversed_by']


@admin.register(PaySlip)
class PaySlipAdmin(admin.ModelAdmin):
    list_display = [
        'payslip_number', 'employee', 'payroll_period', 'basic_salary',
        'gross_pay', 'net_pay', 'status', 'is_locked',
    ]
    list_filter = ['status', 'is_locked', 'payroll_period']
    raw_id_fields = ['employee']


@admin.register(PayslipNumberSequence)
class PayslipNumberSequenceAdmin(admin.ModelAdmin):
    list_display = ['year', 'last_sequence', 'updated_at']
    ordering = ['-year']
    readonly_fields = ['updated_at']


@admin.register(PayrollAuditLog)
class PayrollAuditLogAdmin(admin.ModelAdmin):
    list_display = ['action', 'employee', 'payroll_period', 'payslip', 'performed_by', 'created_at']
    list_filter = ['action', 'created_at']
    search_fields = [
        'employee__user__first_name', 'employee__user__last_name',
        'payroll_period__name', 'payslip__payslip_number',
    ]
    raw_id_fields = ['employee', 'payroll_period', 'payslip', 'performed_by']
    readonly_fields = ['action', 'employee', 'payroll_period', 'payslip', 'performed_by', 'changes', 'created_at']


@admin.register(JobOpening)
class JobOpeningAdmin(admin.ModelAdmin):
    list_display = ['title', 'department', 'status', 'branch', 'posted_date', 'closing_date']
    list_filter = ['status', 'branch', 'department']
    search_fields = ['title']


@admin.register(Applicant)
class ApplicantAdmin(admin.ModelAdmin):
    list_display = ['first_name', 'last_name', 'email', 'job_opening', 'status', 'source', 'applied_date']
    list_filter = ['status', 'source']
    search_fields = ['first_name', 'last_name', 'email']


@admin.register(Interview)
class InterviewAdmin(admin.ModelAdmin):
    list_display = ['applicant', 'interviewer', 'scheduled_at', 'interview_type', 'status', 'rating']
    list_filter = ['status', 'interview_type']
    raw_id_fields = ['applicant', 'interviewer']


@admin.register(PerformanceReview)
class PerformanceReviewAdmin(admin.ModelAdmin):
    list_display = ['employee', 'reviewer', 'review_period_start', 'review_period_end', 'overall_rating', 'status']
    list_filter = ['status']
    raw_id_fields = ['employee', 'reviewer']


@admin.register(TrainingProgram)
class TrainingProgramAdmin(admin.ModelAdmin):
    list_display = ['name', 'trainer', 'start_date', 'end_date', 'is_mandatory', 'is_active']
    list_filter = ['is_mandatory', 'is_active']
    search_fields = ['name']


@admin.register(EmployeeTraining)
class EmployeeTrainingAdmin(admin.ModelAdmin):
    list_display = ['employee', 'training', 'status', 'enrolled_date', 'completion_date']
    list_filter = ['status']
    raw_id_fields = ['employee']


@admin.register(ComplianceDocument)
class ComplianceDocumentAdmin(admin.ModelAdmin):
    list_display = ['name', 'employee', 'document_type', 'expiry_date', 'status']
    list_filter = ['document_type', 'status']
    search_fields = ['name', 'document_number']
    raw_id_fields = ['employee']
