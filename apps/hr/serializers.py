"""
HR Management Serializers
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from apps.accounts.serializers import UserSerializer
from .models import (
    Department, Position, EmployeeProfile,
    LeaveType, LeaveBalance, LeaveRequest,
    AttendancePolicy, Attendance,
    SalaryComponent, PayrollPeriod, PaySlip,
    JobOpening, Applicant, Interview,
    PerformanceReview, TrainingProgram, EmployeeTraining, ComplianceDocument,
)

User = get_user_model()


# =============================================================================
# Department & Position
# =============================================================================

class DepartmentSerializer(serializers.ModelSerializer):
    staff_count = serializers.IntegerField(read_only=True)
    head_name = serializers.CharField(source='head.get_full_name', read_only=True, default=None)
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = Department
        fields = [
            'id', 'name', 'description', 'branch', 'branch_name',
            'head', 'head_name', 'is_active', 'staff_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['branch', 'created_at', 'updated_at']


class PositionSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = Position
        fields = [
            'id', 'title', 'department', 'department_name', 'description',
            'min_salary', 'max_salary', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


# =============================================================================
# Employee Profile
# =============================================================================

class EmployeeProfileSerializer(serializers.ModelSerializer):
    user_details = UserSerializer(source='user', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True, default=None)
    position_title = serializers.CharField(source='position.title', read_only=True, default=None)
    branch_name = serializers.SerializerMethodField()
    reporting_to_name = serializers.SerializerMethodField()
    full_name = serializers.CharField(read_only=True)
    is_active_employee = serializers.BooleanField(read_only=True)

    # Write-only fields for user creation / update
    email = serializers.EmailField(write_only=True, required=False)
    first_name = serializers.CharField(write_only=True, required=False)
    last_name = serializers.CharField(write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False, style={'input_type': 'password'})
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    role = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = EmployeeProfile
        fields = [
            'id', 'user', 'user_details', 'full_name',
            'department', 'department_name', 'position', 'position_title',
            'branch_name',
            'employment_type', 'employment_status', 'is_active_employee',
            'start_date', 'end_date',
            'reporting_to', 'reporting_to_name',
            'salary_type', 'base_salary',
            'bank_name', 'bank_account_number', 'bank_branch',
            'emergency_contact_name', 'emergency_contact_phone',
            'emergency_contact_relationship',
            'national_id', 'tax_id', 'notes',
            'created_at', 'updated_at',
            # Write-only
            'email', 'first_name', 'last_name', 'password', 'phone', 'role',
        ]
        read_only_fields = ['user', 'created_at', 'updated_at']

    def get_branch_name(self, obj):
        branch = obj.branch
        return branch.name if branch else None

    def get_reporting_to_name(self, obj):
        if obj.reporting_to:
            return obj.reporting_to.full_name
        return None

    def create(self, validated_data):
        # Extract user fields
        email = validated_data.pop('email')
        password = validated_data.pop('password')
        first_name = validated_data.pop('first_name')
        last_name = validated_data.pop('last_name')
        phone = validated_data.pop('phone', '')
        role = validated_data.pop('role', 'technician')

        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            role=role,
        )

        profile = EmployeeProfile.objects.create(user=user, **validated_data)
        return profile

    def update(self, instance, validated_data):
        user_fields = {}
        for field in ['email', 'first_name', 'last_name', 'phone', 'role', 'password']:
            if field in validated_data:
                user_fields[field] = validated_data.pop(field)

        if user_fields:
            user = instance.user
            for attr, value in user_fields.items():
                if attr == 'password':
                    user.set_password(value)
                elif attr == 'email':
                    user.email = value
                    user.username = value
                else:
                    setattr(user, attr, value)
            user.save()

        return super().update(instance, validated_data)


class EmployeeProfileListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views"""
    full_name = serializers.CharField(read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True, default=None)
    position_title = serializers.CharField(source='position.title', read_only=True, default=None)
    branch_name = serializers.SerializerMethodField()
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    profile_picture = serializers.ImageField(source='user.profile_picture', read_only=True)

    class Meta:
        model = EmployeeProfile
        fields = [
            'id', 'user', 'full_name', 'email', 'phone', 'profile_picture',
            'department_name', 'position_title', 'branch_name',
            'employment_type', 'employment_status', 'start_date',
        ]

    def get_branch_name(self, obj):
        branch = obj.branch
        return branch.name if branch else None


# =============================================================================
# Leave Management
# =============================================================================

class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = [
            'id', 'name', 'description', 'days_allowed', 'is_paid',
            'carry_forward', 'max_carry_forward', 'requires_document',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class LeaveBalanceSerializer(serializers.ModelSerializer):
    staff = serializers.PrimaryKeyRelatedField(source='employee', queryset=EmployeeProfile.objects.all())
    staff_name = serializers.CharField(source='employee.full_name', read_only=True)
    leave_type_name = serializers.CharField(source='leave_type.name', read_only=True)
    remaining_days = serializers.DecimalField(max_digits=5, decimal_places=1, read_only=True)
    utilization_percentage = serializers.FloatField(read_only=True)

    class Meta:
        model = LeaveBalance
        fields = [
            'id', 'staff', 'staff_name', 'leave_type', 'leave_type_name',
            'year', 'total_days', 'used_days', 'carried_forward',
            'remaining_days', 'utilization_percentage',
        ]


class LeaveRequestSerializer(serializers.ModelSerializer):
    staff = serializers.PrimaryKeyRelatedField(source='employee', queryset=EmployeeProfile.objects.all(), required=False)
    staff_name = serializers.CharField(source='employee.full_name', read_only=True)
    leave_type_name = serializers.CharField(source='leave_type.name', read_only=True)
    reviewed_by_name = serializers.CharField(
        source='reviewed_by.get_full_name', read_only=True, default=None,
    )
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = LeaveRequest
        fields = [
            'id', 'staff', 'staff_name',
            'leave_type', 'leave_type_name',
            'start_date', 'end_date', 'days_count', 'reason',
            'status', 'status_display',
            'reviewed_by', 'reviewed_by_name', 'reviewed_at', 'reviewer_notes',
            'document',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'reviewed_by', 'reviewed_at', 'status',
            'created_at', 'updated_at',
        ]

    def validate(self, data):
        if data.get('start_date') and data.get('end_date'):
            if data['start_date'] > data['end_date']:
                raise serializers.ValidationError(
                    {'end_date': 'End date must be after start date.'}
                )
        return data


# =============================================================================
# Attendance
# =============================================================================

class AttendancePolicySerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = AttendancePolicy
        fields = [
            'id', 'name', 'work_start_time', 'work_end_time',
            'late_threshold_minutes', 'half_day_hours', 'overtime_multiplier',
            'branch', 'branch_name', 'is_default', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['branch', 'created_at', 'updated_at']


class AttendanceSerializer(serializers.ModelSerializer):
    staff = serializers.PrimaryKeyRelatedField(source='employee', queryset=EmployeeProfile.objects.all())
    staff_name = serializers.CharField(source='employee.full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = Attendance
        fields = [
            'id', 'staff', 'staff_name',
            'date', 'clock_in', 'clock_out',
            'break_start', 'break_end',
            'total_hours', 'overtime_hours',
            'status', 'status_display', 'notes',
            'branch', 'branch_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['total_hours', 'created_at', 'updated_at']


# =============================================================================
# Payroll
# =============================================================================

class SalaryComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalaryComponent
        fields = [
            'id', 'name', 'component_type', 'calculation_type',
            'amount', 'percentage', 'is_taxable', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class PaySlipSerializer(serializers.ModelSerializer):
    staff = serializers.PrimaryKeyRelatedField(source='employee', queryset=EmployeeProfile.objects.all())
    staff_name = serializers.CharField(source='employee.full_name', read_only=True)
    period_name = serializers.CharField(source='payroll_period.name', read_only=True)

    class Meta:
        model = PaySlip
        fields = [
            'id', 'payroll_period', 'period_name',
            'staff', 'staff_name',
            'basic_salary', 'overtime_pay',
            'allowances', 'deductions',
            'gross_pay', 'tax_amount', 'net_pay',
            'status', 'payment_date', 'payment_reference',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['gross_pay', 'net_pay', 'created_at', 'updated_at']


class PayrollPeriodSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    created_by_name = serializers.CharField(
        source='created_by.get_full_name', read_only=True, default=None,
    )
    total_payslips = serializers.IntegerField(read_only=True)
    total_net_pay = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True,
    )

    class Meta:
        model = PayrollPeriod
        fields = [
            'id', 'name', 'start_date', 'end_date',
            'status', 'branch', 'branch_name',
            'created_by', 'created_by_name',
            'approved_by', 'approved_at', 'notes',
            'total_payslips', 'total_net_pay',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'created_by', 'approved_by', 'approved_at',
            'created_at', 'updated_at',
        ]
        extra_kwargs = {
            'branch': {'required': False},
        }


# =============================================================================
# Recruitment
# =============================================================================

class InterviewSerializer(serializers.ModelSerializer):
    applicant_name = serializers.CharField(source='applicant.full_name', read_only=True)
    interviewer_name = serializers.CharField(
        source='interviewer.get_full_name', read_only=True, default=None,
    )

    class Meta:
        model = Interview
        fields = [
            'id', 'applicant', 'applicant_name',
            'interviewer', 'interviewer_name',
            'scheduled_at', 'duration_minutes', 'interview_type',
            'status', 'location', 'meeting_link',
            'feedback', 'rating',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ApplicantSerializer(serializers.ModelSerializer):
    job_title = serializers.CharField(source='job_opening.title', read_only=True)
    full_name = serializers.CharField(read_only=True)
    interviews = InterviewSerializer(many=True, read_only=True)

    class Meta:
        model = Applicant
        fields = [
            'id', 'job_opening', 'job_title',
            'first_name', 'last_name', 'full_name', 'email', 'phone',
            'resume', 'cover_letter',
            'status', 'source', 'applied_date', 'notes',
            'interviews',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['applied_date', 'created_at', 'updated_at']


class JobOpeningSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    applicant_count = serializers.IntegerField(read_only=True)
    created_by_name = serializers.CharField(
        source='created_by.get_full_name', read_only=True, default=None,
    )

    class Meta:
        model = JobOpening
        fields = [
            'id', 'title', 'department', 'department_name',
            'position', 'description', 'requirements',
            'employment_type', 'salary_range_min', 'salary_range_max',
            'status', 'branch', 'branch_name',
            'posted_date', 'closing_date', 'vacancies',
            'applicant_count', 'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']
        extra_kwargs = {
            'branch': {'required': False},
        }


# =============================================================================
# Performance & Training & Compliance
# =============================================================================

class PerformanceReviewSerializer(serializers.ModelSerializer):
    staff = serializers.PrimaryKeyRelatedField(source='employee', queryset=EmployeeProfile.objects.all())
    staff_name = serializers.CharField(source='employee.full_name', read_only=True)
    reviewer_name = serializers.CharField(
        source='reviewer.get_full_name', read_only=True, default=None,
    )

    class Meta:
        model = PerformanceReview
        fields = [
            'id', 'staff', 'staff_name',
            'reviewer', 'reviewer_name',
            'review_period_start', 'review_period_end',
            'overall_rating', 'strengths', 'areas_for_improvement',
            'goals', 'employee_comments',
            'status', 'submitted_at', 'acknowledged_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'reviewer', 'submitted_at', 'acknowledged_at',
            'created_at', 'updated_at',
        ]


class TrainingProgramSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True, default=None)
    enrolled_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = TrainingProgram
        fields = [
            'id', 'name', 'description', 'trainer',
            'start_date', 'end_date', 'max_participants',
            'is_mandatory', 'department', 'department_name',
            'is_active', 'enrolled_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class EmployeeTrainingSerializer(serializers.ModelSerializer):
    staff = serializers.PrimaryKeyRelatedField(source='employee', queryset=EmployeeProfile.objects.all())
    staff_name = serializers.CharField(source='employee.full_name', read_only=True)
    training_name = serializers.CharField(source='training.name', read_only=True)

    class Meta:
        model = EmployeeTraining
        fields = [
            'id', 'staff', 'staff_name',
            'training', 'training_name',
            'status', 'enrolled_date', 'completion_date',
            'certificate', 'score', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['enrolled_date', 'created_at', 'updated_at']


class ComplianceDocumentSerializer(serializers.ModelSerializer):
    staff = serializers.PrimaryKeyRelatedField(source='employee', queryset=EmployeeProfile.objects.all())
    staff_name = serializers.CharField(source='employee.full_name', read_only=True)
    is_expiring_soon = serializers.BooleanField(read_only=True)
    days_until_expiry = serializers.IntegerField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = ComplianceDocument
        fields = [
            'id', 'staff', 'staff_name',
            'document_type', 'name', 'document_number',
            'document_file', 'issue_date', 'expiry_date',
            'status', 'reminder_sent', 'notes',
            'is_expiring_soon', 'days_until_expiry', 'is_expired',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['status', 'created_at', 'updated_at']
