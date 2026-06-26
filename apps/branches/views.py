import logging
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, status, permissions, filters
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.contenttypes.models import ContentType
from django.db.models import Sum, F
from django.utils import timezone

from .models import Branch
from .serializers import (
    BranchSerializer, 
    BranchListSerializer, 
    BranchCreateUpdateSerializer,
    PublicBranchSerializer
)
from apps.accounts.models import User
from apps.accounts.permissions import HasPermission, user_has_permission



logger = logging.getLogger(__name__)


class BranchViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing branches
    """
    queryset = Branch.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active', 'is_headquarters']
    search_fields = ['name', 'code', 'city', 'state']
    ordering_fields = ['name', 'code', 'city', 'state', 'is_active', 'created_at']
    ordering = ['name']
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'list':
            return [permissions.AllowAny()]
        if self.action in ['retrieve', 'staff', 'managers', 'stats']:
            return [IsAuthenticated(), HasPermission('view_branches')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('manage_branches')]
        elif self.action in ['update', 'partial_update', 'destroy', 'permanent_delete']:
            return [IsAuthenticated(), HasPermission('manage_branches')]
        elif self.action in ['assign_staff', 'assign_manager', 'remove_manager']:
            return [IsAuthenticated(), HasPermission('manage_branches')]
        elif self.action in ['qbo_departments', 'qbo_mapping']:
            return [IsAuthenticated(), HasPermission('manage_branches')]
        return [IsAuthenticated(), HasPermission('view_branches')()]
    
    def get_serializer_class(self):
        if self.action == 'list':
            user = self.request.user
            if user.is_anonymous or getattr(user, 'role', None) == 'customer':
                return PublicBranchSerializer
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
        if user.is_anonymous or getattr(user, 'role', None) == 'customer':
            return Branch.objects.filter(is_active=True)

        if user.role == 'super-admin' or user_has_permission(user, 'manage_branches'):
            return Branch.objects.all()
        elif user.role == 'manager':
            return user.managed_branches.all()
        elif user.role in ['receptionist', 'technician', 'parts_manager', 'service_coordinator', 'accountant', 'hr_manager']:
            if user.branch:
                return Branch.objects.filter(id=user.branch.id)
        
        return Branch.objects.none()
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.action == 'list':
            from apps.quickbooks_online.services import QuickBooksService
            from apps.quickbooks_online.models import QBOMapping

            if QuickBooksService.is_connected():
                branch_ct = ContentType.objects.get_for_model(Branch)
                mappings = list(
                    QBOMapping.objects.filter(content_type=branch_ct)
                )
                context['qbo_branch_mappings'] = {mapping.object_id: mapping for mapping in mappings}
        return context
    
    def perform_create(self, serializer):
        """Set created_by when creating a branch"""
        if not user_has_permission(self.request.user, 'manage_branches'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You do not have permission to create branches.')
        serializer.save(created_by=self.request.user)
    
    def perform_update(self, serializer):
        """Check permissions before updating"""
        if not user_has_permission(self.request.user, 'manage_branches'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You do not have permission to update branches.')
        serializer.save()
    
    def perform_destroy(self, instance):
        """Check permissions and prevent deletion of branches with data"""
        if not user_has_permission(self.request.user, 'manage_branches'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You do not have permission to delete branches.')
        
        # Prevent deletion if it's the only active branch
        active_branches = Branch.objects.filter(is_active=True).exclude(pk=instance.pk)
        if instance.is_active and not active_branches.exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                'Cannot deactivate the last active branch. Please activate another branch first or create a new one.'
            )
        
        instance.is_active = False
        instance.save()
    
    @action(detail=True, methods=['delete'])
    def force_delete(self, request, pk=None):
        """
        Deprecated destructive endpoint.

        Branches are archived by deactivation so operational history remains
        intact. This keeps old work orders, invoices, inspections, and stock
        movements auditable.
        """
        if not user_has_permission(request.user, 'manage_branches'):
            return Response(
                {'detail': 'You do not have permission to archive branches.'},
                status=status.HTTP_403_FORBIDDEN
            )
        instance = self.get_object()
        active_branches = Branch.objects.filter(is_active=True).exclude(pk=instance.pk)
        if not active_branches.exists() and instance.is_active:
            return Response(
                {'detail': 'Cannot deactivate the last active branch. Please activate another branch first.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        return Response(
            {'detail': f'Branch "{instance.name}" has been archived. Historical records were preserved.'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'], url_path='permanent-delete')
    def permanent_delete(self, request, pk=None):
        """Permanently delete a branch that has no operational records."""
        from rest_framework.exceptions import ValidationError

        from .deletion import get_branch_delete_blockers, permanently_delete_branch

        if not user_has_permission(request.user, 'manage_branches'):
            return Response(
                {'detail': 'You do not have permission to delete branches.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        instance = self.get_object()
        confirmation = str(request.data.get('confirmation', '')).strip()
        if confirmation != instance.name:
            return Response(
                {
                    'detail': (
                        f'Permanent deletion requires confirmation. '
                        f'Type the exact branch name: {instance.name}'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        blockers = get_branch_delete_blockers(instance)
        if blockers:
            return Response(
                {
                    'detail': (
                        'Cannot permanently delete this branch because it still has: '
                        + ', '.join(blockers)
                        + '. Archive it instead, or remove the related records first.'
                    ),
                    'blockers': blockers,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            fallback = permanently_delete_branch(instance)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

        payload = {'detail': f'Branch "{confirmation}" was permanently deleted.'}
        if fallback:
            payload['fallback_branch'] = {
                'id': fallback.id,
                'name': fallback.name,
                'code': fallback.code,
            }
        return Response(payload, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['get'])
    def staff(self, request, pk=None):
        """Get all staff members assigned to this branch"""
        branch = self.get_object()
        
        # Check if user has access to this branch
        if not request.user.has_branch_access(branch) and not user_has_permission(request.user, 'manage_branches'):
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
        if not request.user.has_branch_access(branch) and not user_has_permission(request.user, 'manage_branches'):
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
        
        if not user_has_permission(request.user, 'manage_branches') and not request.user.has_branch_access(branch):
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
        
        if not user_has_permission(request.user, 'manage_branches'):
            return Response(
                {'detail': 'You do not have permission to assign managers to branches.'},
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
        
        if not user_has_permission(request.user, 'manage_branches'):
            return Response(
                {'detail': 'You do not have permission to remove managers from branches.'},
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
    
    @action(detail=False, methods=['get'], url_path='qbo-departments')
    def qbo_departments(self, request):
        """List QBO locations and show which SVR branch each one is mapped to."""
        from apps.quickbooks_online.services import QuickBooksService

        if not QuickBooksService.is_connected():
            return Response(
                {'detail': 'QuickBooks is not connected. Connect under Admin → Integrations first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        departments, error = QuickBooksService().list_departments()
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'departments': departments,
            'is_connected': True,
        })

    @action(detail=True, methods=['post'], url_path='qbo-mapping')
    def qbo_mapping(self, request, pk=None):
        """
        Manage the QBO location mapping for a branch.

        Body:
          { "department_id": "12" }  — map to an existing QBO location
          { "action": "auto_sync" }  — create/update QBO location from branch data
          { "action": "clear" }      — remove mapping
        """
        from apps.quickbooks_online.services import QuickBooksService

        branch = self.get_object()

        if not QuickBooksService.is_connected():
            return Response(
                {'detail': 'QuickBooks is not connected.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = QuickBooksService()
        action_name = request.data.get('action')
        department_id = request.data.get('department_id')

        if action_name == 'clear':
            service.clear_branch_qbo_mapping(branch)
            return Response({'detail': 'QuickBooks mapping cleared.', 'branch_id': branch.id})

        if action_name == 'auto_sync':
            qb_department = service.sync_branch(branch)
            if not qb_department:
                from apps.quickbooks_online.models import QBOMapping
                branch_ct = ContentType.objects.get_for_model(Branch)
                mapping = QBOMapping.objects.filter(content_type=branch_ct, object_id=branch.id).first()
                error_message = mapping.error_message if mapping else 'Failed to sync branch to QuickBooks.'
                return Response({'detail': error_message}, status=status.HTTP_400_BAD_REQUEST)
            return Response({
                'detail': 'Branch synced to QuickBooks.',
                'branch_id': branch.id,
                'qbo_department_id': str(qb_department.Id),
                'qbo_department_name': qb_department.Name,
            })

        if department_id:
            success, error = service.map_branch_to_department(branch, department_id)
            if not success:
                return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

            departments, _list_error = service.list_departments()
            department_name = None
            if departments:
                department_name = next(
                    (item['name'] for item in departments if item['id'] == str(department_id)),
                    None,
                )
            return Response({
                'detail': 'Branch mapped to QuickBooks location.',
                'branch_id': branch.id,
                'qbo_department_id': str(department_id),
                'qbo_department_name': department_name,
            })

        return Response(
            {'detail': 'Provide department_id or action (auto_sync, clear).'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """Get statistics for a specific branch"""
        branch = self.get_object()
        
        # Check if user has access to this branch
        # Admin users have access to all branches
        user_has_access = False
        if user_has_permission(request.user, 'manage_branches') or request.user.is_superuser:
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
