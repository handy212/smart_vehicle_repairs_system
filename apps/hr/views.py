"""
HR Management Views — DRF ViewSets with branch filtering and permission checks
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.db.models import Q, Count, Sum
from decimal import Decimal

from apps.accounts.permissions import HasPermission
from .models import (
    Department, Position, EmployeeProfile,
    LeaveType, LeaveBalance, LeaveRequest,
    AttendancePolicy, Attendance,
    SalaryComponent, PayrollPeriod, PaySlip,
    JobOpening, Applicant, Interview,
    PerformanceReview, TrainingProgram, EmployeeTraining, ComplianceDocument,
)
from .serializers import (
    DepartmentSerializer, PositionSerializer,
    EmployeeProfileSerializer, EmployeeProfileListSerializer,
    LeaveTypeSerializer, LeaveBalanceSerializer, LeaveRequestSerializer,
    AttendancePolicySerializer, AttendanceSerializer,
    SalaryComponentSerializer, PayrollPeriodSerializer, PaySlipSerializer,
    JobOpeningSerializer, ApplicantSerializer, InterviewSerializer,
    PerformanceReviewSerializer, TrainingProgramSerializer,
    EmployeeTrainingSerializer, ComplianceDocumentSerializer,
)


def filter_queryset_for_user_branches(queryset, user, branch_field='branch'):
    """
    Filter queryset based on user's accessible branches.
    Mirrors the pattern used in technicians/views.py.
    """
    if user.role == 'admin':
        return queryset
    accessible_branches = user.get_accessible_branches()
    return queryset.filter(**{f'{branch_field}__in': accessible_branches})


# =============================================================================
# Department & Position
# =============================================================================

def resolve_branch_for_user(request, specified_branch=None):
    """
    Helper to resolve a branch for an object during creation.
    1. If specified_branch (id or object) is provided, use it.
    2. If specified_branch is in request.data, use it.
    3. If user has a primary branch, use it.
    4. If user manages branches, use the first one.
    5. Fallback to None (which might fail DB constraint, handled in serializer/model).
    """
    if specified_branch:
        return specified_branch
    
    # Check request data
    req_branch = request.data.get('branch')
    if req_branch:
        try:
            from apps.branches.models import Branch
            return Branch.objects.get(id=req_branch)
        except (Branch.DoesNotExist, ValueError):
            pass

    # Use user's assigned branch
    if request.user.branch:
        return request.user.branch
    
    # Use first managed branch
    if hasattr(request.user, 'managed_branches') and request.user.managed_branches.exists():
        return request.user.managed_branches.first()
    
    # Final fallback for admins - use first available active branch
    if request.user.role == 'admin':
        from apps.branches.models import Branch
        return Branch.objects.filter(is_active=True).first()
    
    return None


class DepartmentViewSet(viewsets.ModelViewSet):
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'description']
    filterset_fields = ['branch', 'is_active']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']

    def get_queryset(self):
        qs = Department.objects.select_related('branch', 'head').annotate(
            staff_count=Count(
                'employee_profiles',
                filter=Q(employee_profiles__employment_status='active'),
            )
        )
        return filter_queryset_for_user_branches(qs, self.request.user)

    def perform_create(self, serializer):
        branch = resolve_branch_for_user(self.request)
        if branch:
            serializer.save(branch=branch)
        else:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'Could not resolve branch for department. Please specify one.'})


class PositionViewSet(viewsets.ModelViewSet):
    serializer_class = PositionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'description']
    filterset_fields = ['department', 'is_active']
    ordering_fields = ['title', 'created_at']
    ordering = ['title']

    def get_queryset(self):
        qs = Position.objects.select_related('department', 'department__branch')
        return filter_queryset_for_user_branches(
            qs, self.request.user, branch_field='department__branch',
        )


# =============================================================================
# Employee Profile
# =============================================================================

class EmployeeProfileViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        'user__first_name', 'user__last_name', 'user__email',
        'user__employee_id',
    ]
    filterset_fields = [
        'department', 'position', 'employment_type',
        'employment_status',
    ]
    ordering_fields = [
        'user__first_name', 'user__last_name', 'start_date', 'created_at',
    ]
    ordering = ['user__first_name']

    def get_serializer_class(self):
        if self.action == 'list':
            return EmployeeProfileListSerializer
        return EmployeeProfileSerializer

    def get_queryset(self):
        qs = EmployeeProfile.objects.select_related(
            'user', 'department', 'position', 'reporting_to',
        )
        return filter_queryset_for_user_branches(
            qs, self.request.user, branch_field='user__branch',
        )

    @action(detail=False, methods=['get'])
    def my_profile(self, request):
        """Get the current user's employee profile"""
        try:
            profile = EmployeeProfile.objects.select_related(
                'user', 'department', 'position',
            ).get(user=request.user)
            serializer = EmployeeProfileSerializer(profile, context={'request': request})
            return Response(serializer.data)
        except EmployeeProfile.DoesNotExist:
            return Response(
                {'detail': 'Employee profile not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

    @action(detail=False, methods=['get'])
    def org_chart(self, request):
        """Get organization chart data"""
        employees = self.get_queryset().filter(
            employment_status__in=['active', 'probation'],
        ).select_related('user', 'department', 'position', 'reporting_to__user')

        data = []
        for emp in employees:
            data.append({
                'id': emp.id,
                'name': emp.full_name,
                'position': emp.position.title if emp.position else None,
                'department': emp.department.name if emp.department else None,
                'reporting_to': emp.reporting_to_id,
                'profile_picture': (
                    emp.user.profile_picture.url
                    if hasattr(emp.user, 'profile_picture') and emp.user.profile_picture
                    else None
                ),
            })
        return Response(data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get employee statistics summary"""
        qs = self.get_queryset()
        total = qs.count()
        active = qs.filter(employment_status='active').count()
        probation = qs.filter(employment_status='probation').count()
        by_dept = qs.filter(
            employment_status='active',
        ).values('department__name').annotate(
            count=Count('id'),
        ).order_by('-count')

        return Response({
            'total_employees': total,
            'active': active,
            'probation': probation,
            'terminated': qs.filter(employment_status='terminated').count(),
            'resigned': qs.filter(employment_status='resigned').count(),
            'by_department': list(by_dept),
        })


# =============================================================================
# Leave Management
# =============================================================================

class LeaveTypeViewSet(viewsets.ModelViewSet):
    queryset = LeaveType.objects.all()
    serializer_class = LeaveTypeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class LeaveBalanceFilter(DjangoFilterBackend):
    def filter_queryset(self, request, queryset, view):
        staff = request.query_params.get('staff')
        if staff:
            queryset = queryset.filter(employee_id=staff)
        return super().filter_queryset(request, queryset, view)

class LeaveBalanceViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveBalanceSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [LeaveBalanceFilter, DjangoFilterBackend]
    filterset_fields = ['employee', 'leave_type', 'year']

    def get_queryset(self):
        qs = LeaveBalance.objects.select_related('employee__user', 'leave_type')
        return filter_queryset_for_user_branches(
            qs, self.request.user, branch_field='employee__user__branch',
        )

    @action(detail=False, methods=['get'])
    def my_balances(self, request):
        """Get current user's leave balances"""
        year = request.query_params.get('year', timezone.now().year)
        try:
            profile = EmployeeProfile.objects.get(user=request.user)
            balances = LeaveBalance.objects.filter(
                employee=profile, year=year,
            ).select_related('leave_type')
            serializer = self.get_serializer(balances, many=True)
            return Response(serializer.data)
        except EmployeeProfile.DoesNotExist:
            return Response([], status=status.HTTP_200_OK)


class LeaveRequestFilter(DjangoFilterBackend):
    def filter_queryset(self, request, queryset, view):
        staff = request.query_params.get('staff')
        if staff:
            queryset = queryset.filter(employee_id=staff)
        return super().filter_queryset(request, queryset, view)

class LeaveRequestViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveRequestSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [LeaveRequestFilter, DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['employee', 'leave_type', 'status']
    ordering_fields = ['created_at', 'start_date']
    ordering = ['-created_at']

    def get_queryset(self):
        qs = LeaveRequest.objects.select_related(
            'employee__user', 'leave_type', 'reviewed_by',
        )
        return filter_queryset_for_user_branches(
            qs, self.request.user, branch_field='employee__user__branch',
        )

    def perform_create(self, serializer):
        try:
            profile = EmployeeProfile.objects.get(user=self.request.user)
            serializer.save(employee=profile)
        except EmployeeProfile.DoesNotExist:
            raise serializers.ValidationError(
                {'employee': 'Employee profile not found.'}
            )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a leave request"""
        leave_request = self.get_object()
        if leave_request.status != 'pending':
            return Response(
                {'detail': 'Only pending requests can be approved.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        leave_request.status = 'approved'
        leave_request.reviewed_by = request.user
        leave_request.reviewed_at = timezone.now()
        leave_request.reviewer_notes = request.data.get('notes', '')
        leave_request.save()

        # Update leave balance
        year = leave_request.start_date.year
        balance, _created = LeaveBalance.objects.get_or_create(
            employee=leave_request.employee,
            leave_type=leave_request.leave_type,
            year=year,
            defaults={'total_days': leave_request.leave_type.days_allowed},
        )
        balance.used_days += leave_request.days_count
        balance.save()

        serializer = self.get_serializer(leave_request)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a leave request"""
        leave_request = self.get_object()
        if leave_request.status != 'pending':
            return Response(
                {'detail': 'Only pending requests can be rejected.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        leave_request.status = 'rejected'
        leave_request.reviewed_by = request.user
        leave_request.reviewed_at = timezone.now()
        leave_request.reviewer_notes = request.data.get('notes', '')
        leave_request.save()
        serializer = self.get_serializer(leave_request)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a leave request (by the employee)"""
        leave_request = self.get_object()
        if leave_request.status not in ('pending', 'approved'):
            return Response(
                {'detail': 'This request cannot be cancelled.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # If approved, reverse the balance
        if leave_request.status == 'approved':
            year = leave_request.start_date.year
            try:
                balance = LeaveBalance.objects.get(
                    employee=leave_request.employee,
                    leave_type=leave_request.leave_type,
                    year=year,
                )
                balance.used_days -= leave_request.days_count
                balance.save()
            except LeaveBalance.DoesNotExist:
                pass

        leave_request.status = 'cancelled'
        leave_request.save()
        serializer = self.get_serializer(leave_request)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def my_requests(self, request):
        """Get current user's leave requests"""
        try:
            profile = EmployeeProfile.objects.get(user=request.user)
            requests = LeaveRequest.objects.filter(
                employee=profile,
            ).select_related('leave_type', 'reviewed_by')
            serializer = self.get_serializer(requests, many=True)
            return Response(serializer.data)
        except EmployeeProfile.DoesNotExist:
            return Response([], status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def pending(self, request):
        """Get all pending leave requests (for managers)"""
        qs = self.get_queryset().filter(status='pending')
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


# =============================================================================
# Attendance
# =============================================================================

class AttendancePolicyViewSet(viewsets.ModelViewSet):
    serializer_class = AttendancePolicySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['branch', 'is_active', 'is_default']

    def get_queryset(self):
        qs = AttendancePolicy.objects.select_related('branch')
        return filter_queryset_for_user_branches(qs, self.request.user)

    def perform_create(self, serializer):
        branch = resolve_branch_for_user(self.request)
        if branch:
            serializer.save(branch=branch)
        else:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'Could not resolve branch for policy. Please specify one.'})


class AttendanceFilter(DjangoFilterBackend):
    def filter_queryset(self, request, queryset, view):
        staff = request.query_params.get('staff')
        if staff:
            queryset = queryset.filter(employee_id=staff)
        return super().filter_queryset(request, queryset, view)

class AttendanceViewSet(viewsets.ModelViewSet):
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [AttendanceFilter, DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['employee', 'date', 'status', 'branch']
    search_fields = ['employee__user__first_name', 'employee__user__last_name']
    ordering_fields = ['date', 'clock_in']
    ordering = ['-date']

    def get_queryset(self):
        qs = Attendance.objects.select_related('employee__user', 'branch')
        return filter_queryset_for_user_branches(qs, self.request.user)

    def perform_create(self, serializer):
        branch = resolve_branch_for_user(self.request)
        if branch:
            serializer.save(branch=branch)
        else:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'Could not resolve branch for attendance. Please specify one.'})

    @action(detail=False, methods=['post'])
    def clock_in(self, request):
        """Clock in for the current user"""
        try:
            profile = EmployeeProfile.objects.get(user=request.user)
        except EmployeeProfile.DoesNotExist:
            return Response(
                {'detail': 'Employee profile not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        today = timezone.now().date()
        branch = request.user.branch

        if not branch:
            return Response(
                {'detail': 'No branch assigned.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        attendance, created = Attendance.objects.get_or_create(
            employee=profile,
            date=today,
            defaults={
                'clock_in': timezone.now(),
                'status': 'present',
                'branch': branch,
            },
        )

        if not created:
            if attendance.clock_in:
                return Response(
                    {'detail': 'Already clocked in today.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            attendance.clock_in = timezone.now()
            attendance.status = 'present'
            attendance.save()

        # Check if late based on attendance policy
        policy = AttendancePolicy.objects.filter(
            branch=branch, is_default=True, is_active=True,
        ).first()
        if policy:
            clock_in_time = timezone.localtime(attendance.clock_in).time()
            from datetime import datetime, timedelta
            late_threshold = (
                datetime.combine(today, policy.work_start_time) +
                timedelta(minutes=policy.late_threshold_minutes)
            ).time()
            if clock_in_time > late_threshold:
                attendance.status = 'late'
                attendance.save()

        serializer = self.get_serializer(attendance)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def clock_out(self, request):
        """Clock out for the current user"""
        try:
            profile = EmployeeProfile.objects.get(user=request.user)
        except EmployeeProfile.DoesNotExist:
            return Response(
                {'detail': 'Employee profile not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        today = timezone.now().date()
        try:
            attendance = Attendance.objects.get(employee=profile, date=today)
        except Attendance.DoesNotExist:
            return Response(
                {'detail': 'No clock-in record found for today.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if attendance.clock_out:
            return Response(
                {'detail': 'Already clocked out today.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        attendance.clock_out = timezone.now()
        attendance.save()  # auto-calculates total_hours

        serializer = self.get_serializer(attendance)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def my_attendance(self, request):
        """Get current user's attendance records"""
        try:
            profile = EmployeeProfile.objects.get(user=request.user)
        except EmployeeProfile.DoesNotExist:
            return Response([], status=status.HTTP_200_OK)

        records = Attendance.objects.filter(
            employee=profile,
        ).select_related('branch').order_by('-date')

        # Allow date filtering
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        if start_date:
            records = records.filter(date__gte=start_date)
        if end_date:
            records = records.filter(date__lte=end_date)

        page = self.paginate_queryset(records)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(records, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def today_summary(self, request):
        """Get today's attendance summary for the branch"""
        today = timezone.now().date()
        qs = self.get_queryset().filter(date=today)
        total = qs.count()
        present = qs.filter(status='present').count()
        late = qs.filter(status='late').count()
        absent = qs.filter(status='absent').count()
        on_leave = qs.filter(status='on_leave').count()

        return Response({
            'date': today,
            'total': total,
            'present': present,
            'late': late,
            'absent': absent,
            'on_leave': on_leave,
            'attendance_rate': round((present + late) / total * 100, 1) if total > 0 else 0,
        })


# =============================================================================
# Payroll
# =============================================================================

class SalaryComponentViewSet(viewsets.ModelViewSet):
    queryset = SalaryComponent.objects.all()
    serializer_class = SalaryComponentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['component_type', 'is_active']
    search_fields = ['name']


class PayrollPeriodViewSet(viewsets.ModelViewSet):
    serializer_class = PayrollPeriodSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['branch', 'status']
    ordering_fields = ['start_date', 'created_at']
    ordering = ['-start_date']

    def get_queryset(self):
        qs = PayrollPeriod.objects.select_related('branch', 'created_by', 'approved_by')
        return filter_queryset_for_user_branches(qs, self.request.user)

    def perform_create(self, serializer):
        branch = resolve_branch_for_user(self.request)
        if branch:
            serializer.save(created_by=self.request.user, branch=branch)
        else:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'Could not resolve branch for payroll period. Please specify one.'})

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """Generate payslips for this payroll period"""
        period = self.get_object()
        if period.status != 'draft':
            return Response(
                {'detail': 'Only draft periods can be processed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get active employees for this branch
        employees = EmployeeProfile.objects.filter(
            user__branch=period.branch,
            employment_status__in=['active', 'probation'],
        )

        components = SalaryComponent.objects.filter(is_active=True)
        payslips_created = 0

        for emp in employees:
            # Skip if payslip already exists
            if PaySlip.objects.filter(payroll_period=period, employee=emp).exists():
                continue

            allowances = {}
            deductions = {}

            for comp in components:
                value = comp.calculate(emp.base_salary)
                if comp.component_type == 'allowance':
                    allowances[comp.name] = str(value)
                else:
                    deductions[comp.name] = str(value)

            payslip = PaySlip.objects.create(
                payroll_period=period,
                employee=emp,
                basic_salary=emp.base_salary,
                allowances=allowances,
                deductions=deductions,
            )
            payslip.calculate_pay()
            payslip.save()
            payslips_created += 1

        period.status = 'processing'
        period.save()

        return Response({
            'detail': f'{payslips_created} payslips generated.',
            'payslips_created': payslips_created,
        })

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a payroll period"""
        period = self.get_object()
        if period.status != 'processing':
            return Response(
                {'detail': 'Only processing periods can be approved.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        period.status = 'approved'
        period.approved_by = request.user
        period.approved_at = timezone.now()
        period.save()

        # Approve all payslips
        period.payslips.update(status='approved')

        serializer = self.get_serializer(period)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def mark_paid(self, request, pk=None):
        """Mark payroll period as paid"""
        period = self.get_object()
        if period.status != 'approved':
            return Response(
                {'detail': 'Only approved periods can be marked as paid.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payment_date = request.data.get('payment_date', timezone.now().date())
        payment_reference = request.data.get('payment_reference', '')

        period.status = 'paid'
        period.save()

        period.payslips.update(
            status='paid',
            payment_date=payment_date,
            payment_reference=payment_reference,
        )

        serializer = self.get_serializer(period)
        return Response(serializer.data)


class PaySlipViewSet(viewsets.ModelViewSet):
    serializer_class = PaySlipSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['payroll_period', 'employee', 'status']
    ordering = ['-payroll_period__start_date']

    def get_queryset(self):
        qs = PaySlip.objects.select_related(
            'payroll_period', 'employee__user',
        )
        return filter_queryset_for_user_branches(
            qs, self.request.user, branch_field='payroll_period__branch',
        )

    @action(detail=False, methods=['get'])
    def my_payslips(self, request):
        """Get current user's payslips"""
        try:
            profile = EmployeeProfile.objects.get(user=request.user)
        except EmployeeProfile.DoesNotExist:
            return Response([], status=status.HTTP_200_OK)

        payslips = PaySlip.objects.filter(
            employee=profile,
        ).select_related('payroll_period').order_by(
            '-payroll_period__start_date',
        )
        serializer = self.get_serializer(payslips, many=True)
        return Response(serializer.data)


# =============================================================================
# Recruitment
# =============================================================================

class JobOpeningViewSet(viewsets.ModelViewSet):
    serializer_class = JobOpeningSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'description']
    filterset_fields = ['department', 'status', 'employment_type', 'branch']
    ordering_fields = ['created_at', 'closing_date']
    ordering = ['-created_at']

    def get_queryset(self):
        qs = JobOpening.objects.select_related(
            'department', 'position', 'branch', 'created_by',
        )
        return filter_queryset_for_user_branches(qs, self.request.user)

    def perform_create(self, serializer):
        branch = resolve_branch_for_user(self.request)
        if branch:
            serializer.save(created_by=self.request.user, branch=branch)
        else:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'Could not resolve branch for job opening. Please specify one.'})

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        """Publish a job opening"""
        opening = self.get_object()
        opening.status = 'open'
        opening.posted_date = timezone.now().date()
        opening.save()
        serializer = self.get_serializer(opening)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """Close a job opening"""
        opening = self.get_object()
        opening.status = 'closed'
        opening.save()
        serializer = self.get_serializer(opening)
        return Response(serializer.data)


class ApplicantViewSet(viewsets.ModelViewSet):
    serializer_class = ApplicantSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['first_name', 'last_name', 'email']
    filterset_fields = ['job_opening', 'status', 'source']
    ordering = ['-applied_date']

    def get_queryset(self):
        qs = Applicant.objects.select_related(
            'job_opening', 'job_opening__branch',
        ).prefetch_related('interviews')
        return filter_queryset_for_user_branches(
            qs, self.request.user, branch_field='job_opening__branch',
        )

    @action(detail=True, methods=['post'])
    def move_to_stage(self, request, pk=None):
        """Move applicant to a new recruitment stage"""
        applicant = self.get_object()
        new_status = request.data.get('status')
        valid_statuses = dict(Applicant.STATUS_CHOICES).keys()
        if new_status not in valid_statuses:
            return Response(
                {'detail': f'Invalid status. Must be one of: {list(valid_statuses)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        applicant.status = new_status
        applicant.save()
        serializer = self.get_serializer(applicant)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def hire(self, request, pk=None):
        """Hire an applicant — creates an EmployeeProfile"""
        applicant = self.get_object()
        if applicant.status == 'hired':
            return Response(
                {'detail': 'Applicant already hired.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        applicant.status = 'hired'
        applicant.save()

        serializer = self.get_serializer(applicant)
        return Response({
            'detail': 'Applicant marked as hired. Create an employee profile to onboard.',
            'applicant': serializer.data,
        })


class InterviewViewSet(viewsets.ModelViewSet):
    serializer_class = InterviewSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['applicant', 'interviewer', 'status', 'interview_type']
    ordering = ['-scheduled_at']

    def get_queryset(self):
        qs = Interview.objects.select_related(
            'applicant', 'applicant__job_opening__branch', 'interviewer',
        )
        return filter_queryset_for_user_branches(
            qs, self.request.user,
            branch_field='applicant__job_opening__branch',
        )


# =============================================================================
# Performance & Training & Compliance
# =============================================================================

class PerformanceReviewFilter(DjangoFilterBackend):
    def filter_queryset(self, request, queryset, view):
        staff = request.query_params.get('staff')
        if staff:
            queryset = queryset.filter(employee_id=staff)
        return super().filter_queryset(request, queryset, view)

class PerformanceReviewViewSet(viewsets.ModelViewSet):
    serializer_class = PerformanceReviewSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [PerformanceReviewFilter, DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['employee', 'status']
    ordering = ['-review_period_end']

    def get_queryset(self):
        qs = PerformanceReview.objects.select_related('employee__user', 'reviewer')
        return filter_queryset_for_user_branches(
            qs, self.request.user, branch_field='employee__user__branch',
        )

    def perform_create(self, serializer):
        serializer.save(reviewer=self.request.user)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit a performance review"""
        review = self.get_object()
        review.status = 'submitted'
        review.submitted_at = timezone.now()
        review.save()
        serializer = self.get_serializer(review)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def acknowledge(self, request, pk=None):
        """Acknowledge a performance review (by the employee)"""
        review = self.get_object()
        review.status = 'acknowledged'
        review.acknowledged_at = timezone.now()
        review.employee_comments = request.data.get('comments', '')
        review.save()
        serializer = self.get_serializer(review)
        return Response(serializer.data)


class TrainingProgramViewSet(viewsets.ModelViewSet):
    serializer_class = TrainingProgramSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['name', 'description']
    filterset_fields = ['department', 'is_mandatory', 'is_active']

    def get_queryset(self):
        return TrainingProgram.objects.select_related('department')

    @action(detail=True, methods=['post'])
    def enroll(self, request, pk=None):
        """Enroll an employee in a training program"""
        program = self.get_object()
        employee_id = request.data.get('employee_id')
        try:
            employee = EmployeeProfile.objects.get(id=employee_id)
        except EmployeeProfile.DoesNotExist:
            return Response(
                {'detail': 'Employee not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        enrollment, created = EmployeeTraining.objects.get_or_create(
            employee=employee,
            training=program,
        )

        if not created:
            return Response(
                {'detail': 'Employee already enrolled.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = EmployeeTrainingSerializer(enrollment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class EmployeeTrainingFilter(DjangoFilterBackend):
    def filter_queryset(self, request, queryset, view):
        staff = request.query_params.get('staff')
        if staff:
            queryset = queryset.filter(employee_id=staff)
        return super().filter_queryset(request, queryset, view)

class EmployeeTrainingViewSet(viewsets.ModelViewSet):
    serializer_class = EmployeeTrainingSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [EmployeeTrainingFilter, DjangoFilterBackend]
    filterset_fields = ['employee', 'training', 'status']

    def get_queryset(self):
        qs = EmployeeTraining.objects.select_related(
            'employee__user', 'training',
        )
        return filter_queryset_for_user_branches(
            qs, self.request.user, branch_field='employee__user__branch',
        )


class ComplianceDocumentViewSet(viewsets.ModelViewSet):
    serializer_class = ComplianceDocumentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'document_number']
    filterset_fields = ['employee', 'document_type', 'status']
    ordering_fields = ['expiry_date', 'created_at']
    ordering = ['expiry_date']

    def get_queryset(self):
        qs = ComplianceDocument.objects.select_related('employee__user')
        return filter_queryset_for_user_branches(
            qs, self.request.user, branch_field='employee__user__branch',
        )

    @action(detail=False, methods=['get'])
    def expiring_soon(self, request):
        """Get documents expiring within 30 days"""
        from datetime import timedelta
        today = timezone.now().date()
        qs = self.get_queryset().filter(
            expiry_date__gte=today,
            expiry_date__lte=today + timedelta(days=30),
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)
