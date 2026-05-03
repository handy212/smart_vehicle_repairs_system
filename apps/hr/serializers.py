"""
HR Management Serializers
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db import transaction
from datetime import timedelta
from decimal import Decimal
from apps.accounts.serializers import UserSerializer
from apps.branches.models import Branch
from .models import (
    Department, Position, EmployeeProfile,
    LeaveType, LeaveBalance, LeaveRequest,
    AttendancePolicy, Attendance,
    SalaryComponent, EmployeeSalaryComponent, PayrollPeriod, PaySlip, TaxRule,
    PayrollAuditLog,
    JobOpening, Applicant, Interview,
    PerformanceReview, TrainingProgram, EmployeeTraining, ComplianceDocument,
)

User = get_user_model()


def count_business_days(start_date, end_date):
    """Count Monday-Friday days inclusively."""
    if not start_date or not end_date or start_date > end_date:
        return 0
    count = 0
    current = start_date
    while current <= end_date:
        if current.weekday() < 5:
            count += 1
        current += timedelta(days=1)
    return count


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
    technician_id = serializers.SerializerMethodField()

    email = serializers.EmailField(write_only=True, required=False)
    first_name = serializers.CharField(write_only=True, required=False, allow_blank=False)
    last_name = serializers.CharField(write_only=True, required=False, allow_blank=False)
    password = serializers.CharField(write_only=True, required=False, style={'input_type': 'password'}, min_length=8)
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    role = serializers.CharField(write_only=True, required=False)
    profile_picture = serializers.ImageField(source='user.profile_picture', required=False, allow_null=True)
    branch = serializers.PrimaryKeyRelatedField(
        source='user.branch',
        queryset=Branch.objects.filter(is_active=True),
        required=False,
        allow_null=True
    )

    class Meta:
        model = EmployeeProfile
        fields = [
            'id', 'user', 'user_details', 'full_name',
            'department', 'department_name', 'position', 'position_title',
            'branch_name', 'technician_id',
            'employment_type', 'employment_status', 'is_active_employee',
            'start_date', 'end_date',
            'reporting_to', 'reporting_to_name',
            'salary_type', 'base_salary',
            'bank_name', 'bank_account_number', 'bank_branch',
            'emergency_contact_name', 'emergency_contact_phone',
            'emergency_contact_relationship',
            'national_id', 'tax_id', 'notes',
            'created_at', 'updated_at',
            'email', 'first_name', 'last_name', 'password', 'phone', 'role',
            'profile_picture', 'branch',
        ]
        read_only_fields = ['user', 'created_at', 'updated_at']

    def validate(self, attrs):
        request = self.context.get('request')
        user_data = attrs.get('user') or {}
        branch = user_data.get('branch')
        if request and branch and getattr(request.user, 'role', None) not in ['admin', 'super-admin']:
            if not request.user.has_branch_access(branch):
                raise serializers.ValidationError({'branch': 'You cannot assign staff to a branch you do not have access to.'})

        if self.instance is None:
            required_fields = ['email', 'first_name', 'last_name', 'password']
            missing = {field: 'This field is required when creating a staff profile.' for field in required_fields if not attrs.get(field)}
            if missing:
                raise serializers.ValidationError(missing)

            email = attrs.get('email')
            if email and User.objects.filter(email__iexact=email).exists():
                raise serializers.ValidationError({'email': 'A user with this email already exists.'})

        return attrs

    def get_branch_name(self, obj):
        branch = obj.branch
        return branch.name if branch else None

    def get_reporting_to_name(self, obj):
        if obj.reporting_to:
            return obj.reporting_to.full_name
        return None

    def get_technician_id(self, obj):
        try:
            if hasattr(obj.user, 'technician_profile') and obj.user.technician_profile:
                return obj.user.technician_profile.id
        except Exception:
            pass
        from apps.technicians.models import Technician
        return Technician.objects.filter(user=obj.user).values_list('id', flat=True).first()

    def create(self, validated_data):
        email = validated_data.pop('email')
        password = validated_data.pop('password')
        first_name = validated_data.pop('first_name')
        last_name = validated_data.pop('last_name')
        phone = validated_data.pop('phone', '')
        role = validated_data.pop('role', 'technician')
        user_data = validated_data.pop('user', {})

        with transaction.atomic():
            user = User.objects.create_user(
                username=email,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
                phone=phone,
                role=role,
            )

            for attr, value in user_data.items():
                setattr(user, attr, value)
            if user_data:
                user.save()

            profile, _created = EmployeeProfile.objects.update_or_create(
                user=user,
                defaults=validated_data
            )
            return profile

    def update(self, instance, validated_data):
        user_fields = {}
        for field in ['email', 'first_name', 'last_name', 'phone', 'role', 'password']:
            if field in validated_data:
                user_fields[field] = validated_data.pop(field)

        user_data = validated_data.pop('user', {})
        if 'email' in user_fields:
            email = user_fields['email']
            existing = User.objects.filter(email__iexact=email).exclude(pk=instance.user_id).exists()
            if existing:
                raise serializers.ValidationError({'email': 'A user with this email already exists.'})

        with transaction.atomic():
            if user_fields or user_data:
                user = instance.user
                for attr, value in user_fields.items():
                    if attr == 'password':
                        if value:
                            user.set_password(value)
                    elif attr == 'email':
                        user.email = value
                        user.username = value
                    else:
                        setattr(user, attr, value)

                for attr, value in user_data.items():
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
    technician_id = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeProfile
        fields = [
            'id', 'user', 'full_name', 'email', 'phone', 'profile_picture',
            'department_name', 'position_title', 'branch_name', 'technician_id',
            'employment_type', 'employment_status', 'start_date',
        ]

    def get_branch_name(self, obj):
        branch = obj.branch
        return branch.name if branch else None

    def get_technician_id(self, obj):
        try:
            if hasattr(obj.user, 'technician_profile') and obj.user.technician_profile:
                return obj.user.technician_profile.id
        except Exception:
            pass
        from apps.technicians.models import Technician
        return Technician.objects.filter(user=obj.user).values_list('id', flat=True).first()


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

    def validate(self, attrs):
        total_days = attrs.get('total_days', getattr(self.instance, 'total_days', 0))
        used_days = attrs.get('used_days', getattr(self.instance, 'used_days', 0))
        carried_forward = attrs.get('carried_forward', getattr(self.instance, 'carried_forward', 0))
        if used_days < 0 or total_days < 0 or carried_forward < 0:
            raise serializers.ValidationError('Leave balances cannot contain negative values.')
        if used_days > total_days + carried_forward:
            raise serializers.ValidationError({'used_days': 'Used days cannot exceed available leave.'})
        return attrs


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
        extra_kwargs = {
            'days_count': {'required': False},
        }

    def validate(self, data):
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        employee = data.get('employee') or (self.instance.employee if self.instance else None)
        if not employee:
            request = self.context.get('request')
            if request and getattr(request, 'user', None) and request.user.is_authenticated:
                employee = EmployeeProfile.objects.filter(user=request.user).first()
        leave_type = data.get('leave_type') or (self.instance.leave_type if self.instance else None)

        if start_date and end_date:
            if start_date > end_date:
                raise serializers.ValidationError({'end_date': 'End date must be after start date.'})
            if 'days_count' not in data:
                data['days_count'] = Decimal(str(count_business_days(start_date, end_date)))

        if data.get('days_count') is not None and data['days_count'] <= 0:
            raise serializers.ValidationError({'days_count': 'Leave days must be greater than zero.'})

        if leave_type and leave_type.requires_document and not (data.get('document') or getattr(self.instance, 'document', None)):
            raise serializers.ValidationError({'document': 'A supporting document is required for this leave type.'})

        if employee and start_date and end_date:
            overlaps = LeaveRequest.objects.filter(
                employee=employee,
                status__in=['pending', 'approved'],
                start_date__lte=end_date,
                end_date__gte=start_date,
            )
            if self.instance:
                overlaps = overlaps.exclude(pk=self.instance.pk)
            if overlaps.exists():
                raise serializers.ValidationError({'start_date': 'This employee already has a pending or approved leave request in this date range.'})
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
        extra_kwargs = {
            'branch': {'required': False},
        }

    def validate(self, attrs):
        clock_in = attrs.get('clock_in', getattr(self.instance, 'clock_in', None))
        clock_out = attrs.get('clock_out', getattr(self.instance, 'clock_out', None))
        break_start = attrs.get('break_start', getattr(self.instance, 'break_start', None))
        break_end = attrs.get('break_end', getattr(self.instance, 'break_end', None))

        if clock_in and clock_out and clock_out <= clock_in:
            raise serializers.ValidationError({'clock_out': 'Clock out must be after clock in.'})
        if break_start and break_end and break_end <= break_start:
            raise serializers.ValidationError({'break_end': 'Break end must be after break start.'})
        if clock_in and break_start and break_start < clock_in:
            raise serializers.ValidationError({'break_start': 'Break cannot start before clock in.'})
        if clock_out and break_end and break_end > clock_out:
            raise serializers.ValidationError({'break_end': 'Break cannot end after clock out.'})
        return attrs


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


class EmployeeSalaryComponentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    component_name = serializers.CharField(source='component.name', read_only=True)
    component_type = serializers.CharField(source='component.component_type', read_only=True)

    class Meta:
        model = EmployeeSalaryComponent
        fields = [
            'id', 'employee', 'employee_name',
            'component', 'component_name', 'component_type',
            'amount', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, attrs):
        employee = attrs.get('employee', getattr(self.instance, 'employee', None))
        if employee and PaySlip.objects.filter(
            employee=employee,
            payroll_period__status__in=['processing', 'approved'],
        ).exists():
            raise serializers.ValidationError(
                'Salary components cannot be changed while this employee has an open payroll run.'
            )
        return attrs


class PayrollAuditLogSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True, default=None)
    performed_by_name = serializers.CharField(source='performed_by.get_full_name', read_only=True, default=None)

    class Meta:
        model = PayrollAuditLog
        fields = [
            'id', 'action', 'employee', 'employee_name', 'payroll_period',
            'payslip', 'performed_by', 'performed_by_name', 'changes', 'created_at',
        ]
        read_only_fields = fields


class TaxRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxRule
        fields = [
            'id', 'name', 'min_income', 'max_income',
            'rate', 'excess_amount',
        ]


class PaySlipSerializer(serializers.ModelSerializer):
    staff = serializers.PrimaryKeyRelatedField(source='employee', queryset=EmployeeProfile.objects.all())
    staff_name = serializers.CharField(source='employee.full_name', read_only=True)
    period_name = serializers.CharField(source='payroll_period.name', read_only=True)

    class Meta:
        model = PaySlip
        fields = [
            'id', 'payslip_number', 'payroll_period', 'period_name',
            'staff', 'staff_name',
            'basic_salary', 'overtime_pay', 'unpaid_leave_deduction',
            'absence_deduction', 'proration_factor',
            'allowances', 'deductions',
            'gross_pay', 'tax_amount', 'net_pay',
            'status', 'payment_date', 'payment_reference', 'is_locked',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'payslip_number', 'gross_pay', 'net_pay', 'is_locked',
            'created_at', 'updated_at',
        ]

    def validate(self, attrs):
        if self.instance and self.instance.is_locked:
            raise serializers.ValidationError('This payslip is locked. Reverse or reopen payroll before editing.')
        return attrs


class PayrollPeriodSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    created_by_name = serializers.CharField(
        source='created_by.get_full_name', read_only=True, default=None,
    )
    total_payslips = serializers.IntegerField(read_only=True)
    total_net_pay = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True,
    )
    journal_entry_id = serializers.SerializerMethodField()

    class Meta:
        model = PayrollPeriod
        fields = [
            'id', 'name', 'start_date', 'end_date',
            'status', 'branch', 'branch_name',
            'created_by', 'created_by_name',
            'approved_by', 'approved_at', 'paid_by', 'paid_at',
            'payment_batch_reference', 'reversed_by', 'reversed_at',
            'reversal_reason', 'notes',
            'total_payslips', 'total_net_pay', 'journal_entry_id',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'created_by', 'approved_by', 'approved_at', 'paid_by', 'paid_at',
            'reversed_by', 'reversed_at', 'reversal_reason',
            'created_at', 'updated_at',
        ]
        extra_kwargs = {
            'branch': {'required': False},
        }

    def validate(self, attrs):
        start_date = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end_date = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError({'end_date': 'End date must be after start date.'})
        return attrs

    def get_journal_entry_id(self, obj):
        from django.contrib.contenttypes.models import ContentType
        from apps.accounting.models import JournalEntry

        content_type = ContentType.objects.get_for_model(obj)
        return JournalEntry.objects.filter(
            content_type=content_type,
            object_id=obj.id,
        ).values_list('id', flat=True).first()


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
    staff_comments = serializers.CharField(source='employee_comments', required=False, allow_blank=True)
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
            'goals', 'staff_comments',
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
