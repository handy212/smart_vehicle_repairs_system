"""
Views for branches app
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Q

from .models import Branch
from .serializers import (
    BranchSerializer, 
    BranchListSerializer, 
    BranchCreateUpdateSerializer
)
from apps.accounts.models import User


class BranchViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing branches
    """
    queryset = Branch.objects.all()
    permission_classes = [IsAuthenticated]
    
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
        elif user.role in ['receptionist', 'technician', 'parts_manager']:
            if user.branch:
                return Branch.objects.filter(id=user.branch.id)
        
        return Branch.objects.none()
    
    def perform_create(self, serializer):
        """Set created_by when creating a branch"""
        serializer.save(created_by=self.request.user)
    
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
