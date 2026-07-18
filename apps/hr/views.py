"""
HR Management Views — DRF ViewSets with branch filtering and permission checks
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q, Count, Sum
from django.db import transaction
from django.db.models.deletion import ProtectedError
from rest_framework.exceptions import ValidationError as DRFValidationError
from decimal import Decimal

from apps.accounts.permissions import HasAnyPermission, HasPermission, IsModuleEnabled
from apps.accounts.models import User
from .models import (
    Department, Position, EmployeeProfile,
    LeaveType, LeaveBalance, LeaveRequest,
    AttendancePolicy, Attendance,
    SalaryComponent, EmployeeSalaryComponent, PayrollPeriod, PaySlip, PayrollAuditLog,
    JobOpening, Applicant, Interview,
    PerformanceReview, TrainingProgram, EmployeeTraining, ComplianceDocument,
    TaxRule,
)
from .serializers import (
    DepartmentSerializer, PositionSerializer,
    EmployeeProfileSerializer, EmployeeProfileListSerializer,
    STAFF_PROFILE_ROLES,
    account_is_active_for_employment_status,
    LeaveTypeSerializer, LeaveBalanceSerializer, LeaveRequestSerializer,
    AttendancePolicySerializer, AttendanceSerializer,
    SalaryComponentSerializer, EmployeeSalaryComponentSerializer, PayrollPeriodSerializer, PaySlipSerializer,
    PayrollAuditLogSerializer,
    JobOpeningSerializer, PublicJobOpeningSerializer, ApplicantSerializer,
    PublicApplicantApplySerializer, InterviewSerializer,
    PerformanceReviewSerializer, TrainingProgramSerializer,
    EmployeeTrainingSerializer, ComplianceDocumentSerializer, TaxRuleSerializer,
)


def filter_queryset_for_user_branches(queryset, user, branch_field='branch'):
    """
    Filter queryset based on user's accessible branches.
    Mirrors the pattern used in technicians/views.py.
    """
    from apps.accounts.permissions import user_can_access_all_branches

    if user_can_access_all_branches(user):
        return queryset
    accessible_branches = user.get_accessible_branches()
    return queryset.filter(**{f'{branch_field}__in': accessible_branches})


def ensure_employee_profiles_for_staff_accounts():
    """
    Older data can have staff User accounts without HR EmployeeProfile rows.
    Keep HR Staff aligned with Admin Users by healing those missing profiles.
    """
    missing_users = User.objects.filter(
        role__in=STAFF_PROFILE_ROLES,
        employee_profile__isnull=True,
    )
    for user in missing_users.iterator():
        EmployeeProfile.objects.get_or_create(
            user=user,
            defaults={'start_date': user.hire_date},
        )


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
    from apps.accounts.permissions import user_has_permission
    if user_has_permission(request.user, 'manage_branches'):
        from apps.branches.models import Branch
        return Branch.objects.filter(is_active=True).first()
    
    return None


class DepartmentViewSet(viewsets.ModelViewSet):
    serializer_class = DepartmentSerializer
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_departments'))
        else:
            permission_classes.append(HasPermission('manage_departments'))
        return [permission() for permission in permission_classes]
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
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_departments'))
        else:
            permission_classes.append(HasPermission('manage_departments'))
        return [permission() for permission in permission_classes]
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

def delete_staff_member(profile):
    """
    Delete a staff member by removing their user account.
    The employee profile and related HR records cascade from the user.
    """
    user = profile.user
    if not user:
        profile.delete()
        return
    try:
        with transaction.atomic():
            user.delete()
    except ProtectedError as exc:
        protected_types = sorted({
            obj._meta.verbose_name.title()
            for obj in exc.protected_objects
        })
        types_str = ", ".join(protected_types)
        raise DRFValidationError(
            f"Cannot delete staff member because they are referenced by existing "
            f"{types_str}. Terminate their employment or reassign those records first."
        ) from exc


class EmployeeProfileViewSet(viewsets.ModelViewSet):
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action == 'my_profile':
            pass  # authenticated HR-module users may view own profile
        elif self.action in ['org_chart', 'summary', 'list', 'retrieve']:
            permission_classes.append(HasPermission('view_staff'))
        else:
            permission_classes.append(HasPermission('manage_staff'))
        return [permission() for permission in permission_classes]
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
        'department__name', 'position__title', 'employment_status',
    ]
    ordering = ['user__first_name']

    def get_serializer_class(self):
        if self.action == 'list':
            return EmployeeProfileListSerializer
        return EmployeeProfileSerializer

    def get_queryset(self):
        if self.action in ['list', 'retrieve', 'summary', 'org_chart']:
            ensure_employee_profiles_for_staff_accounts()

        qs = EmployeeProfile.objects.select_related(
            'user', 'department', 'position', 'reporting_to', 'user__technician_profile',
        ).filter(
            user__role__in=STAFF_PROFILE_ROLES,
        )
        user = self.request.user
        from apps.accounts.permissions import user_can_access_all_branches

        if not user_can_access_all_branches(user):
            accessible_branches = user.get_accessible_branches()
            qs = qs.filter(
                Q(user__branch__in=accessible_branches) |
                Q(user__managed_branches__in=accessible_branches)
            ).distinct()

        branch_id = self.request.query_params.get('branch')
        if branch_id:
            try:
                branch_id = int(branch_id)
                qs = qs.filter(
                    Q(user__branch_id=branch_id) |
                    Q(user__managed_branches__id=branch_id)
                ).distinct()
            except (TypeError, ValueError):
                pass

        return qs

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
                {'detail': 'Employee profile not found. This feature is only available for accounts linked to an employee record.'},
                status=status.HTTP_400_BAD_REQUEST,
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
            'total_staff': total,
            'active': active,
            'probation': probation,
            'terminated': qs.filter(employment_status='terminated').count(),
            'resigned': qs.filter(employment_status='resigned').count(),
            'by_department': list(by_dept),
        })

    @action(detail=False, methods=['post'])
    def bulk_update_status(self, request):
        """Bulk update employment status for multiple staff members"""
        ids = request.data.get('ids', [])
        new_status = request.data.get('status', '')
        valid_statuses = ['active', 'probation', 'suspended', 'terminated', 'resigned']
        if not ids:
            return Response({'detail': 'No staff IDs provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if new_status not in valid_statuses:
            return Response({'detail': f'Invalid status. Must be one of: {", ".join(valid_statuses)}'}, status=status.HTTP_400_BAD_REQUEST)
        qs = self.get_queryset().filter(id__in=ids)
        updated = qs.update(employment_status=new_status)
        User.objects.filter(employee_profile__in=qs).update(
            is_active=account_is_active_for_employment_status(new_status)
        )
        return Response({'detail': f'Updated {updated} staff member(s) to {new_status}.', 'updated': updated})

    @action(detail=False, methods=['post'])
    def bulk_delete(self, request):
        """Bulk delete multiple staff members and their user accounts"""
        ids = request.data.get('ids', [])
        if not ids:
            return Response({'detail': 'No staff IDs provided.'}, status=status.HTTP_400_BAD_REQUEST)
        qs = self.get_queryset().filter(id__in=ids).select_related('user')
        deleted = 0
        for profile in qs:
            delete_staff_member(profile)
            deleted += 1
        return Response({'detail': f'Deleted {deleted} staff member(s).', 'deleted': deleted})

    def perform_destroy(self, instance):
        """Delete the linked user account; cascades to the employee profile."""
        delete_staff_member(instance)


# =============================================================================
# Leave Management
# =============================================================================

class LeaveTypeViewSet(viewsets.ModelViewSet):
    queryset = LeaveType.objects.all()
    serializer_class = LeaveTypeSerializer
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_leave'))
        else:
            permission_classes.append(HasPermission('manage_leave'))
        return [permission() for permission in permission_classes]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'days_allowed', 'is_paid', 'is_active', 'created_at']
    ordering = ['name']


class LeaveBalanceFilter(DjangoFilterBackend):
    def filter_queryset(self, request, queryset, view):
        staff = request.query_params.get('staff')
        if staff:
            queryset = queryset.filter(employee_id=staff)
        return super().filter_queryset(request, queryset, view)

class LeaveBalanceViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveBalanceSerializer
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['my_balances']:
            pass
        elif self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_leave'))
        else:
            permission_classes.append(HasPermission('manage_leave'))
        return [permission() for permission in permission_classes]
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
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['my_requests', 'create', 'cancel']:
            pass
        elif self.action in ['list', 'retrieve', 'pending']:
            permission_classes.append(HasPermission('view_leave'))
        elif self.action in ['approve', 'reject']:
            permission_classes.append(HasPermission('approve_leave'))
        else:
            permission_classes.append(HasPermission('manage_leave'))
        return [permission() for permission in permission_classes]
    filter_backends = [LeaveRequestFilter, DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['employee', 'leave_type', 'status']
    ordering_fields = ['created_at', 'start_date', 'status', 'leave_type__name', 'employee__user__last_name']
    ordering = ['-created_at']

    def get_queryset(self):
        qs = LeaveRequest.objects.select_related(
            'employee__user', 'leave_type', 'reviewed_by',
        )
        return filter_queryset_for_user_branches(
            qs, self.request.user, branch_field='employee__user__branch',
        )

    def perform_create(self, serializer):
        from apps.accounts.permissions import user_has_permission
        user = self.request.user
        requested_employee = serializer.validated_data.get('employee')

        # Check if the user is allowed to apply on behalf of others
        can_manage = user_has_permission(user, 'manage_leave') or user_has_permission(user, 'approve_leave')

        if requested_employee and can_manage:
            # Use the employee specified in the request
            serializer.save()
        else:
            # Force to self-application
            try:
                profile = EmployeeProfile.objects.get(user=user)
                serializer.save(employee=profile)
            except EmployeeProfile.DoesNotExist:
                from rest_framework.exceptions import ValidationError
                raise ValidationError(
                    {'employee': 'Employee profile not found. You must have an employee profile to apply for leave, or have management permissions to apply on behalf of others.'}
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
        if leave_request.employee.user_id == request.user.id:
            return Response(
                {'detail': 'You cannot approve your own leave request.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        year = leave_request.start_date.year
        balance, _created = LeaveBalance.objects.get_or_create(
            employee=leave_request.employee,
            leave_type=leave_request.leave_type,
            year=year,
            defaults={'total_days': leave_request.leave_type.days_allowed},
        )
        if balance.remaining_days < leave_request.days_count:
            return Response(
                {'detail': f'Insufficient leave balance. Remaining: {balance.remaining_days} day(s).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        leave_request.status = 'approved'
        leave_request.reviewed_by = request.user
        leave_request.reviewed_at = timezone.now()
        leave_request.reviewer_notes = request.data.get('notes', '')
        leave_request.save()

        # Update leave balance
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
        from apps.accounts.permissions import user_has_permission
        can_manage = user_has_permission(request.user, 'manage_leave') or user_has_permission(request.user, 'approve_leave')
        if leave_request.employee.user_id != request.user.id and not can_manage:
            return Response(
                {'detail': 'You can only cancel your own leave request.'},
                status=status.HTTP_403_FORBIDDEN,
            )
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
                balance.used_days = max(Decimal('0.0'), balance.used_days - leave_request.days_count)
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
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_attendance'))
        else:
            permission_classes.append(HasPermission('manage_attendance'))
        return [permission() for permission in permission_classes]
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
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['clock_in', 'clock_out', 'my_attendance', 'today_summary']:
            pass
        elif self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_attendance'))
        else:
            permission_classes.append(HasPermission('manage_attendance'))
        return [permission() for permission in permission_classes]
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
        if not branch:
            # Fallback: try to use the branch of the staff member being recorded
            staff_id = self.request.data.get('staff') or self.request.data.get('employee')
            if staff_id:
                try:
                    employee = EmployeeProfile.objects.select_related('user__branch').get(id=staff_id)
                    branch = employee.user.branch
                except EmployeeProfile.DoesNotExist:
                    pass

        if branch:
            serializer.save(branch=branch)
        else:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'Could not resolve branch for attendance. Please specify one.'})

    def _get_attendance_profile(self, request):
        """Resolve employee profile allowed to use HR day attendance (not WO labor)."""
        try:
            profile = EmployeeProfile.objects.select_related('user__branch').get(user=request.user)
        except EmployeeProfile.DoesNotExist:
            return None, Response(
                {
                    'detail': (
                        'Employee profile not found. HR attendance is only available for '
                        'accounts linked to a staff record.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not profile.time_tracking_enabled:
            return None, Response(
                {
                    'detail': (
                        'HR attendance time tracking is disabled for your staff profile. '
                        'Contact HR if you need daily clock-in access. '
                        'Work-order job labor time is separate and unaffected.'
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if not profile.is_active_employee:
            return None, Response(
                {
                    'detail': 'HR attendance clocking is only available for active or probation staff.',
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return profile, None

    @action(detail=False, methods=['post'])
    def clock_in(self, request):
        """Clock in for the current user (HR daily attendance — not work-order labor)."""
        profile, error = self._get_attendance_profile(request)
        if error:
            return error

        today = timezone.now().date()
        branch = resolve_branch_for_user(request)

        if not branch:
            return Response(
                {'detail': 'No active branch assigned. Please contact HR to link your account to a branch.'},
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
        """Clock out for the current user (HR daily attendance — not work-order labor)."""
        profile, error = self._get_attendance_profile(request)
        if error:
            return error

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
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_payroll'))
        else:
            permission_classes.append(HasPermission('manage_payroll'))
        return [permission() for permission in permission_classes]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['component_type', 'is_active']
    search_fields = ['name']


class EmployeeSalaryComponentViewSet(viewsets.ModelViewSet):
    queryset = EmployeeSalaryComponent.objects.all().select_related('employee', 'component').order_by('employee_id', 'component_id')
    serializer_class = EmployeeSalaryComponentSerializer
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_payroll'))
        else:
            permission_classes.append(HasPermission('manage_payroll'))
        return [permission() for permission in permission_classes]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['employee', 'component', 'is_active']
    search_fields = ['employee__user__first_name', 'employee__user__last_name', 'component__name']

    def get_queryset(self):
        qs = super().get_queryset()
        return filter_queryset_for_user_branches(
            qs, self.request.user, branch_field='employee__user__branch',
        )

    def perform_create(self, serializer):
        component = serializer.save()
        PayrollAuditLog.objects.create(
            action='salary_component_created',
            employee=component.employee,
            performed_by=self.request.user,
            changes={
                'component_id': component.component_id,
                'amount': str(component.amount),
                'is_active': component.is_active,
            },
        )

    def perform_update(self, serializer):
        before = None
        if serializer.instance:
            before = {
                'component_id': serializer.instance.component_id,
                'amount': str(serializer.instance.amount),
                'is_active': serializer.instance.is_active,
            }
        component = serializer.save()
        PayrollAuditLog.objects.create(
            action='salary_component_updated',
            employee=component.employee,
            performed_by=self.request.user,
            changes={
                'before': before,
                'after': {
                    'component_id': component.component_id,
                    'amount': str(component.amount),
                    'is_active': component.is_active,
                },
            },
        )

    def perform_destroy(self, instance):
        employee = instance.employee
        changes = {
            'component_id': instance.component_id,
            'amount': str(instance.amount),
            'is_active': instance.is_active,
        }
        instance.delete()
        PayrollAuditLog.objects.create(
            action='salary_component_deleted',
            employee=employee,
            performed_by=self.request.user,
            changes=changes,
        )


class TaxRuleViewSet(viewsets.ModelViewSet):
    queryset = TaxRule.objects.all().order_by('min_income')
    serializer_class = TaxRuleSerializer
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_payroll'))
        else:
            permission_classes.append(HasPermission('manage_payroll'))
        return [permission() for permission in permission_classes]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class PayrollAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PayrollAuditLogSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['action', 'employee', 'payroll_period', 'payslip']
    ordering = ['-created_at']

    def get_permissions(self):
        return [
            IsAuthenticated(),
            IsModuleEnabled('hr')(),
            HasPermission('view_payroll')(),
        ]

    def get_queryset(self):
        qs = PayrollAuditLog.objects.select_related(
            'employee__user', 'payroll_period__branch', 'payslip', 'performed_by',
        )
        from apps.accounts.permissions import user_can_access_all_branches

        if user_can_access_all_branches(self.request.user):
            return qs
        accessible_branches = self.request.user.get_accessible_branches()
        return qs.filter(
            Q(payroll_period__branch__in=accessible_branches)
            | Q(employee__user__branch__in=accessible_branches)
        )


class PayrollPeriodViewSet(viewsets.ModelViewSet):
    serializer_class = PayrollPeriodSerializer
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['list', 'retrieve', 'payroll_register', 'statutory_pack']:
            permission_classes.append(HasPermission('view_payroll'))
        elif self.action == 'process':
            permission_classes.append(HasAnyPermission(['process_payroll', 'manage_payroll']))
        else:
            permission_classes.append(HasPermission('manage_payroll'))
        return [permission() for permission in permission_classes]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['branch', 'status']
    ordering_fields = ['start_date', 'created_at', 'status', 'branch__name', 'name']
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

        # Active employees at this branch (user branch or department branch)
        employees = EmployeeProfile.objects.filter(
            employment_status__in=['active', 'probation'],
        ).filter(
            Q(user__branch=period.branch) | Q(department__branch=period.branch),
        ).select_related('user', 'department')
        if not employees.exists():
            return Response(
                {'detail': 'No active or probation employees found for this payroll period branch.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            from .services import PayrollService
            payslips_created = PayrollService.process_period(period, employees)
            if payslips_created == 0:
                return Response(
                    {'detail': 'No payslips were generated. This period may already have payslips.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            period.status = 'processing'
            period.save(update_fields=['status', 'updated_at'])
            PayrollAuditLog.objects.create(
                action='period_processed',
                payroll_period=period,
                performed_by=request.user,
                changes={'payslips_created': payslips_created},
            )

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
        from apps.accounts.permissions import user_has_permission

        if period.created_by_id == request.user.id and not user_has_permission(
            request.user, 'manage_payroll'
        ):
            return Response(
                {'detail': 'Payroll must be approved by a different authorized user.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            period.status = 'approved'
            period.approved_by = request.user
            period.approved_at = timezone.now()
            period.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])

            period.payslips.update(status='approved', is_locked=True)
            PayrollAuditLog.objects.create(
                action='period_approved',
                payroll_period=period,
                performed_by=request.user,
                changes={'payslips_locked': period.payslips.count()},
            )

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
        if not period.payslips.exists():
            return Response(
                {'detail': 'Cannot mark payroll as paid without payslips.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payment_date = request.data.get('payment_date', timezone.now().date())
        payment_reference = request.data.get('payment_reference', '')
        payment_batch_reference = request.data.get('payment_batch_reference', payment_reference)

        try:
            with transaction.atomic():
                period.status = 'paid'
                period.paid_by = request.user
                period.paid_at = timezone.now()
                period.payment_batch_reference = payment_batch_reference or ''
                period.save(update_fields=[
                    'status', 'paid_by', 'paid_at', 'payment_batch_reference', 'updated_at',
                ])

                period.payslips.update(
                    status='paid',
                    payment_date=payment_date,
                    payment_reference=payment_reference,
                    is_locked=True,
                )
                PayrollAuditLog.objects.create(
                    action='period_paid',
                    payroll_period=period,
                    performed_by=request.user,
                    changes={
                        'payment_date': str(payment_date),
                        'payment_reference': payment_reference,
                        'payment_batch_reference': period.payment_batch_reference,
                    },
                )
        except DjangoValidationError as exc:
            return Response({'detail': exc.messages[0] if hasattr(exc, 'messages') else str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        from django.contrib.contenttypes.models import ContentType
        from apps.accounting.models import JournalEntry
        period_type = ContentType.objects.get_for_model(period)
        journal_entry_id = JournalEntry.objects.filter(
            content_type=period_type,
            object_id=period.id,
        ).values_list('id', flat=True).first()

        serializer = self.get_serializer(period)
        data = serializer.data
        data['journal_entry_id'] = journal_entry_id
        return Response(data)

    @action(detail=True, methods=['get'])
    def payroll_register(self, request, pk=None):
        """Payroll register summary for a period."""
        from .statutory_filing import StatutoryFilingService
        period = self.get_object()
        return Response(StatutoryFilingService.get_payroll_register(period))

    @action(detail=True, methods=['get'])
    def statutory_pack(self, request, pk=None):
        """Statutory filing pack (PAYE, SSNIT, mapped deductions) for a period."""
        from .statutory_filing import StatutoryFilingService
        period = self.get_object()
        if period.status not in ('approved', 'paid', 'processing'):
            return Response(
                {'detail': 'Process and approve payroll before generating statutory packs.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(StatutoryFilingService.get_statutory_pack(period))

    @action(detail=True, methods=['post'])
    def reverse(self, request, pk=None):
        """Reverse a paid payroll period and its accounting journal."""
        period = self.get_object()
        if period.status != 'paid':
            return Response(
                {'detail': 'Only paid payroll periods can be reversed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response(
                {'detail': 'A reversal reason is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.contrib.contenttypes.models import ContentType
        from apps.accounting.models import JournalEntry
        from apps.accounting.services import AccountingService

        period_type = ContentType.objects.get_for_model(period)
        journal_entry = JournalEntry.objects.filter(
            content_type=period_type,
            object_id=period.id,
            posted=True,
        ).first()

        try:
            with transaction.atomic():
                reversal_id = None
                if journal_entry:
                    reversal = AccountingService.reverse_journal_entry(
                        journal_entry,
                        request.user,
                        reason=reason,
                    )
                    reversal_id = reversal.id

                period.status = 'reversed'
                period.reversed_by = request.user
                period.reversed_at = timezone.now()
                period.reversal_reason = reason
                period.save(update_fields=[
                    'status', 'reversed_by', 'reversed_at', 'reversal_reason', 'updated_at',
                ])
                period.payslips.update(status='reversed', is_locked=True)
                PayrollAuditLog.objects.create(
                    action='period_reversed',
                    payroll_period=period,
                    performed_by=request.user,
                    changes={
                        'reason': reason,
                        'journal_entry_id': journal_entry.id if journal_entry else None,
                        'reversal_journal_entry_id': reversal_id,
                    },
                )
        except DjangoValidationError as exc:
            return Response({'detail': exc.messages[0] if hasattr(exc, 'messages') else str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(period)
        return Response(serializer.data)


class PaySlipViewSet(viewsets.ModelViewSet):
    serializer_class = PaySlipSerializer
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['my_payslips', 'download_pdf']:
            pass
        elif self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_payroll'))
        else:
            permission_classes.append(HasPermission('manage_payroll'))
        return [permission() for permission in permission_classes]
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

    def perform_update(self, serializer):
        before = None
        if serializer.instance:
            before = {
                'basic_salary': str(serializer.instance.basic_salary),
                'overtime_pay': str(serializer.instance.overtime_pay),
                'allowances': serializer.instance.allowances,
                'deductions': serializer.instance.deductions,
                'tax_amount': str(serializer.instance.tax_amount),
                'status': serializer.instance.status,
            }
        payslip = serializer.save()
        PayrollAuditLog.objects.create(
            action='payslip_updated',
            employee=payslip.employee,
            payroll_period=payslip.payroll_period,
            payslip=payslip,
            performed_by=self.request.user,
            changes={
                'before': before,
                'after': {
                    'basic_salary': str(payslip.basic_salary),
                    'overtime_pay': str(payslip.overtime_pay),
                    'allowances': payslip.allowances,
                    'deductions': payslip.deductions,
                    'tax_amount': str(payslip.tax_amount),
                    'status': payslip.status,
                },
            },
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

    @action(detail=True, methods=['get'])
    def download_pdf(self, request, pk=None):
        """Download payslip as PDF"""
        payslip = self.get_object()
        # Ensure user can only download their own payslip unless they have manage_payroll permission
        from apps.accounts.permissions import user_has_permission
        if not user_has_permission(request.user, 'manage_payroll') and payslip.employee.user != request.user:
            return Response(status=status.HTTP_403_FORBIDDEN)

        from apps.core.services.print_service import generate_payslip_pdf
        return generate_payslip_pdf(payslip)


# =============================================================================
# Recruitment
# =============================================================================

class JobOpeningViewSet(viewsets.ModelViewSet):
    serializer_class = JobOpeningSerializer
    def get_permissions(self):
        if self.action in ['public_list', 'public_detail']:
            return [AllowAny(), IsModuleEnabled('hr')()]
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_recruitment'))
        else:
            permission_classes.append(HasPermission('manage_recruitment'))
        return [permission() for permission in permission_classes]
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

    def _public_open_jobs(self):
        today = timezone.now().date()
        return JobOpening.objects.filter(status='open').filter(
            Q(closing_date__isnull=True) | Q(closing_date__gte=today),
        ).select_related('department', 'branch').order_by('-posted_date', '-created_at')

    @action(detail=False, methods=['get'], url_path='public')
    def public_list(self, request):
        """List open job openings for the public careers portal."""
        serializer = PublicJobOpeningSerializer(self._public_open_jobs(), many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='public')
    def public_detail(self, request, pk=None):
        """Public job detail for the careers portal."""
        try:
            opening = self._public_open_jobs().get(pk=pk)
        except JobOpening.DoesNotExist:
            return Response({'detail': 'Job opening not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(PublicJobOpeningSerializer(opening).data)

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
    def get_permissions(self):
        if self.action == 'public_apply':
            return [AllowAny(), IsModuleEnabled('hr')()]
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_recruitment'))
        else:
            permission_classes.append(HasPermission('manage_recruitment'))
        return [permission() for permission in permission_classes]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['first_name', 'last_name', 'email']
    filterset_fields = ['job_opening', 'status', 'source']
    ordering = ['-applied_date']
    ordering_fields = ['applied_date', 'status', 'last_name', 'first_name', 'email']

    def get_queryset(self):
        qs = Applicant.objects.select_related(
            'job_opening', 'job_opening__branch',
        ).prefetch_related('interviews')
        return filter_queryset_for_user_branches(
            qs, self.request.user, branch_field='job_opening__branch',
        )

    @action(detail=False, methods=['post'], url_path='public_apply')
    def public_apply(self, request):
        """Accept a public careers application (website source)."""
        serializer = PublicApplicantApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        applicant = serializer.save(status='new', source='website', notes='')
        return Response(
            {
                'detail': 'Application submitted successfully.',
                'id': applicant.id,
                'job_title': applicant.job_opening.title,
            },
            status=status.HTTP_201_CREATED,
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
        """Hire an applicant and create an employee profile."""
        applicant = self.get_object()
        if applicant.status == 'hired':
            return Response(
                {'detail': 'Applicant already hired.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        password = request.data.get('password')
        if not password:
            return Response(
                {'password': 'Temporary password is required to onboard the applicant.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if EmployeeProfile.objects.filter(user__email__iexact=applicant.email).exists():
            return Response(
                {'email': 'An employee profile already exists for this applicant email.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        role = request.data.get('role') or 'technician'
        employment_type = request.data.get('employment_type') or applicant.job_opening.employment_type
        salary_type = request.data.get('salary_type') or 'monthly'
        try:
            base_salary = Decimal(str(request.data.get('base_salary') or '0.00'))
        except Exception:
            return Response(
                {'base_salary': 'Enter a valid salary amount.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        start_date_value = request.data.get('start_date')
        start_date = parse_date(start_date_value) if start_date_value else timezone.now().date()
        if start_date_value and not start_date:
            return Response(
                {'start_date': 'Enter a valid date in YYYY-MM-DD format.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        department = applicant.job_opening.department
        position = applicant.job_opening.position
        branch = applicant.job_opening.branch

        with transaction.atomic():
            user = User.objects.create_user(
                username=applicant.email,
                email=applicant.email,
                password=password,
                first_name=applicant.first_name,
                last_name=applicant.last_name,
                phone=applicant.phone,
                role=role,
                branch=branch,
            )

            profile = user.employee_profile
            profile.department = department
            profile.position = position
            profile.employment_type = employment_type
            profile.employment_status = request.data.get('employment_status') or 'probation'
            profile.salary_type = salary_type
            profile.base_salary = base_salary
            profile.start_date = start_date
            profile.notes = f"Hired from applicant #{applicant.id} for {applicant.job_opening.title}"
            profile.save()

            applicant.status = 'hired'
            applicant.save(update_fields=['status', 'updated_at'])

        serializer = self.get_serializer(applicant)
        profile_serializer = EmployeeProfileSerializer(profile, context={'request': request})
        return Response({
            'detail': 'Applicant hired and employee profile created.',
            'applicant': serializer.data,
            'employee': profile_serializer.data,
        }, status=status.HTTP_201_CREATED)


class InterviewViewSet(viewsets.ModelViewSet):
    serializer_class = InterviewSerializer
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_recruitment'))
        else:
            permission_classes.append(HasPermission('manage_recruitment'))
        return [permission() for permission in permission_classes]
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
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_performance'))
        else:
            permission_classes.append(HasPermission('manage_performance'))
        return [permission() for permission in permission_classes]
    filter_backends = [PerformanceReviewFilter, DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['employee', 'status']
    ordering = ['-review_period_end']
    ordering_fields = ['review_period_end', 'review_period_start', 'status', 'overall_rating', 'employee__user__last_name']

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
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_training'))
        else:
            permission_classes.append(HasPermission('manage_training'))
        return [permission() for permission in permission_classes]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['name', 'description']
    filterset_fields = ['department', 'is_mandatory', 'is_active']

    def get_queryset(self):
        qs = TrainingProgram.objects.select_related('department', 'department__branch')
        from apps.accounts.permissions import user_can_access_all_branches

        if user_can_access_all_branches(self.request.user):
            return qs
        accessible_branches = self.request.user.get_accessible_branches()
        return qs.filter(Q(department__branch__in=accessible_branches) | Q(department__isnull=True))

    @action(detail=True, methods=['post'])
    def enroll(self, request, pk=None):
        """Enroll an employee in a training program"""
        program = self.get_object()
        employee_id = request.data.get('employee_id') or request.data.get('staff_id')
        try:
            employee = EmployeeProfile.objects.select_related('user__branch').get(id=employee_id)
        except EmployeeProfile.DoesNotExist:
            return Response(
                {'detail': 'Staff member not found with the provided ID.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from apps.accounts.permissions import user_can_access_all_branches

        if (
            not user_can_access_all_branches(request.user)
            and employee.user.branch not in request.user.get_accessible_branches()
        ):
            return Response(
                {'detail': 'You cannot enroll staff outside your accessible branches.'},
                status=status.HTTP_403_FORBIDDEN,
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
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_training'))
        else:
            permission_classes.append(HasPermission('manage_training'))
        return [permission() for permission in permission_classes]
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
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('hr')]
        if self.action in ['list', 'retrieve']:
            permission_classes.append(HasPermission('view_compliance'))
        else:
            permission_classes.append(HasPermission('manage_compliance'))
        return [permission() for permission in permission_classes]
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
