from rest_framework import viewsets, permissions, status, parsers
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import Technician, Skill, TimeOffRequest, Shift, Certification
from .serializers import TechnicianSerializer, SkillSerializer, TimeOffRequestSerializer, ShiftSerializer, TechnicianJobHistorySerializer, CertificationSerializer
from django.db import models
from apps.branches.utils import filter_queryset_for_user_branches
from apps.accounts.permissions import HasPermission, IsModuleEnabled

class SkillViewSet(viewsets.ModelViewSet):
    queryset = Skill.objects.filter(is_active=True)
    serializer_class = SkillSerializer
    permission_classes = [permissions.IsAuthenticated, IsModuleEnabled('technicians')]

class TechnicianViewSet(viewsets.ModelViewSet):
    queryset = Technician.objects.all()
    serializer_class = TechnicianSerializer
    permission_classes = [permissions.IsAuthenticated, IsModuleEnabled('technicians')]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['my_profile', 'job_history', 'shifts', 'performance_metrics', 'update_location']:
            # Allow technicians to view their own profile/stats
            return [permissions.IsAuthenticated(), IsModuleEnabled('technicians')]
        elif self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated(), IsModuleEnabled('technicians'), HasPermission('view_users')]
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAuthenticated(), IsModuleEnabled('technicians'), HasPermission('manage_branch_staff')]
        return [permissions.IsAuthenticated(), IsModuleEnabled('technicians')]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by branch
        queryset = filter_queryset_for_user_branches(
            queryset,
            self.request.user,
            self.request,
            branch_lookup='user__branch'
        )
        
        status_param = self.request.query_params.get('status', None)
        if status_param:
            queryset = queryset.filter(current_status=status_param)
        return queryset

    @action(detail=True, methods=['post'], url_path='update-location')
    def update_location(self, request, pk=None):
        technician = self.get_object()
        lat = request.data.get('latitude')
        lng = request.data.get('longitude')
        
        if lat and lng:
            technician.last_latitude = lat
            technician.last_longitude = lng
            technician.last_location_update = timezone.now()
            technician.save()
            return Response({'status': 'Location updated'})
        return Response({'error': 'Invalid location data'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='me')
    def my_profile(self, request):
        try:
            profile = Technician.objects.get(user=request.user)
            serializer = self.get_serializer(profile)
            return Response(serializer.data)
        except Technician.DoesNotExist:
            return Response({'error': 'Profile not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['get'])
    def job_history(self, request, pk=None):
        """
        Get completed work orders for this technician
        """
        from apps.workorders.models import WorkOrder
        technician = self.get_object()
        
        # Find work orders where this technician was primary or assigned
        work_orders = WorkOrder.objects.filter(
            status='completed'
        ).filter(
            models.Q(primary_technician=technician.user) | 
            models.Q(assigned_technicians=technician.user)
        ).distinct().order_by('-completed_at')
        
        serializer = TechnicianJobHistorySerializer(work_orders, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def shifts(self, request, pk=None):
        """
        Get shifts for this technician
        """
        technician = self.get_object()
        shifts = technician.shifts.all().order_by('-start_time')
        
        # Optional date filtering
        start = request.query_params.get('start', None)
        end = request.query_params.get('end', None)
        if start:
            shifts = shifts.filter(start_time__gte=start)
        if end:
            shifts = shifts.filter(end_time__lte=end)
            
        serializer = ShiftSerializer(shifts, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def performance_metrics(self, request, pk=None):
        """
        Get performance metrics for this technician
        """
        from apps.workorders.models import WorkOrder
        from django.db.models import Count, Sum, Avg, Q
        from datetime import datetime, timedelta
        
        technician = self.get_object()
        
        # Get period parameter (default to 'all')
        period = request.query_params.get('period', 'all')
        
        # Calculate date range
        now = timezone.now()
        if period == 'week':
            start_date = now - timedelta(days=7)
        elif period == 'month':
            start_date = now - timedelta(days=30)
        elif period == 'quarter':
            start_date = now - timedelta(days=90)
        elif period == 'year':
            start_date = now - timedelta(days=365)
        else:
            start_date = None
        
        # Build base queryset
        work_orders = WorkOrder.objects.filter(
            Q(primary_technician=technician.user) | Q(assigned_technicians=technician.user)
        ).distinct()
        
        if start_date:
            work_orders = work_orders.filter(created_at__gte=start_date)
        
        # Calculate metrics
        total_jobs = work_orders.count()
        completed_jobs = work_orders.filter(status='completed').count()
        in_progress_jobs = work_orders.filter(status='in_progress').count()
        
        # Revenue metrics
        revenue_data = work_orders.filter(status='completed').aggregate(
            total_revenue=Sum('actual_total'),
            avg_job_value=Avg('actual_total')
        )
        
        # Completion rate
        completion_rate = (completed_jobs / total_jobs * 100) if total_jobs > 0 else 0
        
        # Average completion time (in days)
        completed_with_times = work_orders.filter(
            status='completed',
            completed_at__isnull=False
        )
        
        total_duration = timedelta(0)
        count = 0
        for wo in completed_with_times:
            if wo.completed_at and wo.created_at:
                total_duration += (wo.completed_at - wo.created_at)
                count += 1
        
        avg_completion_days = (total_duration.total_seconds() / 86400 / count) if count > 0 else 0
        
        # Hours worked from shifts
        shifts_qs = technician.shifts.all()
        if start_date:
            shifts_qs = shifts_qs.filter(start_time__gte=start_date)
        
        total_hours = shifts_qs.aggregate(
            total=Sum('actual_hours'),
            overtime=Sum('overtime_hours')
        )
        
        # Active days (days with shifts)
        active_days = shifts_qs.filter(status__in=['completed', 'active']).dates('start_time', 'day').count()
        
        return Response({
            'productivity': {
                'total_jobs': total_jobs,
                'completed_jobs': completed_jobs,
                'in_progress_jobs': in_progress_jobs,
                'completion_rate': round(completion_rate, 1),
                'avg_completion_days': round(avg_completion_days, 1),
            },
            'financial': {
                'total_revenue': float(revenue_data['total_revenue'] or 0),
                'avg_job_value': float(revenue_data['avg_job_value'] or 0),
            },
            'availability': {
                'total_hours_worked': float(total_hours['total'] or 0),
                'overtime_hours': float(total_hours['overtime'] or 0),
                'active_days': active_days,
            },
            'period': period,
        })

class TimeOffRequestViewSet(viewsets.ModelViewSet):
    queryset = TimeOffRequest.objects.all()
    serializer_class = TimeOffRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        action = getattr(self, 'action', None)
        if action in ['create', 'list', 'retrieve']:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), HasPermission('manage_technicians')]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
        # Filter by branch first
        queryset = filter_queryset_for_user_branches(
            queryset,
            user,
            self.request,
            branch_lookup='technician__user__branch'
        )
        
        if user.is_technician:
            return queryset.filter(technician__user=user)
        return queryset

    def perform_create(self, serializer):
        # Auto-assign the technician based on the logged-in user
        technician = Technician.objects.get(user=self.request.user)
        serializer.save(technician=technician)


class ShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.all()
    serializer_class = ShiftSerializer
    permission_classes = [permissions.IsAuthenticated, IsModuleEnabled('technicians')]

    def get_permissions(self):
        action = getattr(self, 'action', None)
        if action in ['clock_in', 'clock_out', 'add_break']:
            return [permissions.IsAuthenticated(), IsModuleEnabled('technicians')]
        if action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated(), IsModuleEnabled('technicians'), HasPermission('view_users')]
        return [permissions.IsAuthenticated(), IsModuleEnabled('technicians'), HasPermission('manage_technicians')]

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by branch
        queryset = filter_queryset_for_user_branches(
            queryset,
            self.request.user,
            self.request,
            branch_lookup='technician__user__branch'
        )
        
        technician_id = self.request.query_params.get('technician', None)
        if technician_id:
            queryset = queryset.filter(technician_id=technician_id)
        
        # Filter by date range if provided
        start = self.request.query_params.get('start', None)
        end = self.request.query_params.get('end', None)
        if start:
            queryset = queryset.filter(start_time__gte=start)
        if end:
            queryset = queryset.filter(end_time__lte=end)
            
        return queryset
    
    @action(detail=True, methods=['post'])
    def clock_in(self, request, pk=None):
        """
        Clock in to start a shift - sets actual_start_time
        """
        shift = self.get_object()
        
        if shift.actual_start_time:
            return Response(
                {'error': 'Already clocked in'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        shift.actual_start_time = timezone.now()
        shift.status = 'active'
        shift.save()
        
        serializer = self.get_serializer(shift)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def clock_out(self, request, pk=None):
        """
        Clock out to end a shift - sets actual_end_time and calculates hours
        """
        shift = self.get_object()
        
        if not shift.actual_start_time:
            return Response(
                {'error': 'Must clock in first'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if shift.actual_end_time:
            return Response(
                {'error': 'Already clocked out'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        shift.actual_end_time = timezone.now()
        shift.status = 'completed'
        shift.save()  # This will auto-calculate actual_hours and overtime
        
        serializer = self.get_serializer(shift)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def add_break(self, request, pk=None):
        """
        Add break duration to shift (in minutes)
        """
        shift = self.get_object()
        duration_minutes = request.data.get('duration', 0)
        
        if not isinstance(duration_minutes, (int, float)) or duration_minutes < 0:
            return Response(
                {'error': 'Invalid break duration'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        from datetime import timedelta
        additional_break = timedelta(minutes=duration_minutes)
        shift.break_duration = shift.break_duration + additional_break
        shift.save()  # Recalculates actual_hours
        
        serializer = self.get_serializer(shift)
        return Response(serializer.data)


class CertificationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing technician certifications and licenses
    """
    queryset = Certification.objects.all()
    serializer_class = CertificationSerializer
    permission_classes = [permissions.IsAuthenticated, IsModuleEnabled('technicians')]

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'expiring_soon']:
            return [permissions.IsAuthenticated(), IsModuleEnabled('technicians'), HasPermission('view_users')]
        return [permissions.IsAuthenticated(), IsModuleEnabled('technicians'), HasPermission('manage_technicians')]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by branch
        queryset = filter_queryset_for_user_branches(
            queryset,
            self.request.user,
            self.request,
            branch_lookup='technician__user__branch'
        )
        
        # Filter by technician
        technician_id = self.request.query_params.get('technician', None)
        if technician_id:
            queryset = queryset.filter(technician_id=technician_id)
        
        # Filter by status
        status_param = self.request.query_params.get('status', None)
        if status_param:
            queryset = queryset.filter(status=status_param)
        
        return queryset.order_by('-issue_date')
    
    @action(detail=False, methods=['get'], url_path='expiring-soon')
    def expiring_soon(self, request):
        """
        Get certifications expiring within 30 days
        """
        certifications = Certification.objects.filter(
            status='active',
            expiry_date__isnull=False
        )
        
        # Filter to only those expiring soon
        expiring = [cert for cert in certifications if cert.is_expiring_soon]
        
        serializer = self.get_serializer(expiring, many=True)
        return Response(serializer.data)
