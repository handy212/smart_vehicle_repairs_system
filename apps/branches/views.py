"""
Views for branches app
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Q, Count, Sum, Avg, F
from django.utils import timezone
from datetime import timedelta

from .models import Branch
from .serializers import (
    BranchSerializer, 
    BranchListSerializer, 
    BranchCreateUpdateSerializer
)
from apps.accounts.models import User
from apps.accounts.permissions import HasPermission, HasAnyPermission


class BranchViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing branches
    """
    queryset = Branch.objects.all()
    permission_classes = [IsAuthenticated]
    filterset_fields = ['is_active', 'is_headquarters']
    search_fields = ['name', 'code', 'city', 'state']
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve', 'staff', 'managers', 'stats']:
            return [IsAuthenticated(), HasPermission('view_branches')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('manage_branches')]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), HasPermission('manage_branches')]
        elif self.action in ['assign_staff', 'assign_manager', 'remove_manager']:
            return [IsAuthenticated(), HasPermission('manage_branches')]
        return [IsAuthenticated()]
    
    def get_serializer_class(self):
        if self.action == 'list':
            return BranchListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return BranchCreateUpdateSerializer
        return BranchSerializer
    
    def get_queryset(self):
        """
        Filter branches based on user role:
        - Admin: all branches
        - Manager: only their managed branches
        - Other staff: only their assigned branch
        """
        user = self.request.user
        
        if user.role == 'admin':
            return Branch.objects.all()
        elif user.role == 'manager':
            return user.managed_branches.all()
        elif user.role in ['receptionist', 'technician', 'parts_manager', 'service_coordinator', 'accountant']:
            if user.branch:
                return Branch.objects.filter(id=user.branch.id)
        
        return Branch.objects.none()
    
    def perform_create(self, serializer):
        """Set created_by when creating a branch"""
        # Only admins can create branches
        if self.request.user.role != 'admin':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only administrators can create branches.')
        serializer.save(created_by=self.request.user)
    
    def perform_update(self, serializer):
        """Check permissions before updating"""
        # Only admins can update branches
        if self.request.user.role != 'admin':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only administrators can update branches.')
        serializer.save()
    
    def perform_destroy(self, instance):
        """Check permissions and prevent deletion of branches with data"""
        # Only admins can delete branches
        if self.request.user.role != 'admin':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only administrators can delete branches.')
        
        # If branch has staff assigned, reassign them to no branch
        if instance.staff_count > 0:
            # Reassign all staff to no branch before deletion
            for user in User.objects.filter(branch=instance):
                user.branch = None
                user.save()
        
        # Prevent deletion if it's the only active branch
        active_branches = Branch.objects.filter(is_active=True).exclude(pk=instance.pk)
        if not active_branches.exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                'Cannot delete the last active branch. Please activate another branch first or create a new one.'
            )
        
        # Soft delete by setting is_active=False instead of actually deleting
        instance.is_active = False
        instance.save()
    
    @action(detail=True, methods=['get'])
    def staff(self, request, pk=None):
        """Get all staff members assigned to this branch"""
        branch = self.get_object()
        
        # Check if user has access to this branch
        if not request.user.has_branch_access(branch) and request.user.role != 'admin':
            return Response(
                {'detail': 'You do not have permission to view staff for this branch.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        from apps.accounts.serializers import StaffUserSerializer
        
        staff = User.objects.filter(
            branch=branch,
            role__in=['receptionist', 'technician', 'parts_manager']
        )
        serializer = StaffUserSerializer(staff, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def managers(self, request, pk=None):
        """Get all managers assigned to this branch"""
        branch = self.get_object()
        
        # Check if user has access to this branch
        if not request.user.has_branch_access(branch) and request.user.role != 'admin':
            return Response(
                {'detail': 'You do not have permission to view managers for this branch.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        from apps.accounts.serializers import StaffUserSerializer
        
        managers = branch.managers.filter(role='manager')
        serializer = StaffUserSerializer(managers, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def assign_staff(self, request, pk=None):
        """Assign a staff member to this branch"""
        branch = self.get_object()
        
        # Only admin and managers of this branch can assign staff
        if request.user.role != 'admin' and not request.user.has_branch_access(branch):
            return Response(
                {'detail': 'You do not have permission to assign staff to this branch.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user_id = request.data.get('user_id')
        if not user_id:
            return Response(
                {'detail': 'user_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            user = User.objects.get(id=user_id)
            
            # Only assign non-manager staff
            if user.role not in ['receptionist', 'technician', 'parts_manager']:
                return Response(
                    {'detail': 'Only receptionist, technician, and parts_manager can be assigned to a single branch.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            user.branch = branch
            user.save()
            
            return Response(
                {'detail': f'{user.get_full_name()} has been assigned to {branch.name}'},
                status=status.HTTP_200_OK
            )
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['post'])
    def assign_manager(self, request, pk=None):
        """Assign a manager to this branch"""
        branch = self.get_object()
        
        # Only admin can assign managers
        if request.user.role != 'admin':
            return Response(
                {'detail': 'Only administrators can assign managers to branches.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user_id = request.data.get('user_id')
        if not user_id:
            return Response(
                {'detail': 'user_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            user = User.objects.get(id=user_id, role='manager')
            user.managed_branches.add(branch)
            
            return Response(
                {'detail': f'{user.get_full_name()} has been assigned as manager to {branch.name}'},
                status=status.HTTP_200_OK
            )
        except User.DoesNotExist:
            return Response(
                {'detail': 'Manager not found'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['post'])
    def remove_manager(self, request, pk=None):
        """Remove a manager from this branch"""
        branch = self.get_object()
        
        # Only admin can remove managers
        if request.user.role != 'admin':
            return Response(
                {'detail': 'Only administrators can remove managers from branches.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user_id = request.data.get('user_id')
        if not user_id:
            return Response(
                {'detail': 'user_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            user = User.objects.get(id=user_id, role='manager')
            user.managed_branches.remove(branch)
            
            return Response(
                {'detail': f'{user.get_full_name()} has been removed from {branch.name}'},
                status=status.HTTP_200_OK
            )
        except User.DoesNotExist:
            return Response(
                {'detail': 'Manager not found'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=False, methods=['get'])
    def accessible(self, request):
        """Get all branches accessible to the current user"""
        branches = request.user.get_accessible_branches()
        serializer = BranchListSerializer(branches, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """Get statistics for a specific branch"""
        branch = self.get_object()
        
        # Check if user has access to this branch
        # Admin users have access to all branches
        user_has_access = False
        if request.user.role == 'admin' or request.user.is_superuser:
            user_has_access = True
        elif request.user.role == 'manager':
            # Managers can access branches they manage
            user_has_access = branch in request.user.managed_branches.all()
        elif request.user.branch == branch:
            # Staff can access their assigned branch
            user_has_access = True
        
        if not user_has_access:
            return Response(
                {'detail': 'You do not have permission to view stats for this branch.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            from apps.workorders.models import WorkOrder
            from apps.appointments.models import Appointment
            from apps.inventory.models import Part
            
            # Work order stats
            work_orders = WorkOrder.objects.filter(branch=branch)
            total_work_orders = work_orders.count()
            active_work_orders = work_orders.filter(status__in=['pending', 'in_progress', 'on_hold']).count()
            completed_work_orders = work_orders.filter(status='completed').count()
            total_revenue = work_orders.filter(status='completed').aggregate(
                total=Sum('actual_total')
            )['total'] or 0
            
            # Appointment stats
            appointments = Appointment.objects.filter(branch=branch)
            total_appointments = appointments.count()
            upcoming_appointments = appointments.filter(
                appointment_date__gte=timezone.now().date()
            ).count()
            
            # Inventory stats - Use StockItem model
            try:
                from apps.inventory.models import StockItem
                stock_items = StockItem.objects.filter(branch=branch).select_related('part')
                total_parts = stock_items.values('part').distinct().count()
                # Count parts where quantity_in_stock <= minimum_stock
                low_stock_parts = stock_items.filter(
                    quantity_in_stock__lte=F('minimum_stock')
                ).values('part').distinct().count()
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error calculating inventory stats for branch {branch.id}: {e}", exc_info=True)
                total_parts = 0
                low_stock_parts = 0
            
            stats = {
                'branch_id': branch.id,
                'branch_name': branch.name,
                'work_orders': {
                    'total': total_work_orders,
                    'active': active_work_orders,
                    'completed': completed_work_orders,
                    'total_revenue': float(total_revenue),
                },
                'appointments': {
                    'total': total_appointments,
                    'upcoming': upcoming_appointments,
                },
                'inventory': {
                    'total_parts': total_parts,
                    'low_stock_parts': low_stock_parts,
                },
                'staff': {
                    'total_staff': branch.staff_count,
                    'total_managers': branch.manager_count,
                }
            }
            
            return Response(stats)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error in stats endpoint for branch {branch.id}: {e}", exc_info=True)
            return Response(
                {'detail': f'Error calculating statistics: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
