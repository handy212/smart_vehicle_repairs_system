"""
Views for accounts app
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from apps.accounts.permissions import HasPermission
from django.contrib.auth import get_user_model
from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import (
    UserSerializer, UserCreateSerializer, UserUpdateSerializer,
    ChangePasswordSerializer, StaffUserSerializer, PublicUserSerializer
)

User = get_user_model()


class UserViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing users
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['role', 'is_active', 'branch']
    search_fields = ['email', 'first_name', 'last_name', 'username']
    ordering_fields = ['created_at', 'email', 'first_name', 'last_name']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """
        Filter queryset based on action.
        For list action, exclude customers (they should be managed via Customer module).
        """
        queryset = super().get_queryset()
        
        # Exclude customers from list view - they should be managed via Customer module
        if self.action == 'list':
            queryset = queryset.exclude(role='customer')
        
        # Support branch filtering via query params
        branch_id = self.request.query_params.get('branch')
        if branch_id:
            try:
                branch_id = int(branch_id)
                # Filter by direct branch assignment or managed branches
                queryset = queryset.filter(
                    Q(branch_id=branch_id) | 
                    Q(managed_branches__id=branch_id)
                ).distinct()
            except (ValueError, TypeError):
                pass
        
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return UserUpdateSerializer
        elif self.action == 'staff_list':
            return StaffUserSerializer
        return UserSerializer
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'create':
            return [AllowAny()]  # Allow user registration
        
        # For other actions, require authentication and appropriate permissions
        if self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), HasPermission('view_users')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('edit_users')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('delete_users')]
        
        # Default to authenticated for custom actions
        return [IsAuthenticated()]
    
    @action(detail=False, methods=['get', 'put', 'patch'])
    def me(self, request):
        """Get or update current user profile"""
        if request.method == 'GET':
            serializer = self.get_serializer(request.user)
            return Response(serializer.data)
        else:
            serializer = UserUpdateSerializer(request.user, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def permissions(self, request):
        """Get current user's permissions"""
        from apps.accounts.permissions import get_user_permissions
        permissions = get_user_permissions(request.user)
        return Response({'permissions': permissions})
    
    @action(detail=False, methods=['post'])
    def change_password(self, request):
        """Change user password"""
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        
        user = request.user
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        
        return Response({'detail': 'Password changed successfully.'}, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['get'])
    def staff_list(self, request):
        """Get list of all staff members"""
        staff = User.objects.filter(role__in=['admin', 'manager', 'service_coordinator', 'receptionist', 'technician', 'parts_manager', 'accountant'])
        serializer = StaffUserSerializer(staff, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def technicians(self, request):
        """Get list of technicians"""
        technicians = User.objects.filter(role='technician', is_active=True)
        serializer = PublicUserSerializer(technicians, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def service_coordinators(self, request):
        """Get list of service coordinators and managers"""
        coordinators = User.objects.filter(role__in=['service_coordinator', 'manager'], is_active=True)
        serializer = PublicUserSerializer(coordinators, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def reset_password(self, request, pk=None):
        """
        Admin action: Reset user password and optionally send reset link via email
        """
        user = self.get_object()
        
        # Check permissions
        if not request.user.has_perm('accounts.edit_users') and not request.user.is_superuser:
             return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        
        new_password = request.data.get('new_password')
        send_email = request.data.get('send_email', False)
        
        if not new_password:
            return Response(
                {'detail': 'New password is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate password
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError
        try:
            validate_password(new_password, user)
        except ValidationError as e:
            return Response(
                {'detail': 'Password validation failed.', 'errors': list(e.messages)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Set new password
        user.set_password(new_password)
        user.save()
        
        # Send password reset email if requested
        if send_email:
            try:
                self._send_password_reset_email(user, new_password, request)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send password reset email to {user.email}: {str(e)}")
        
        return Response({
            'detail': 'Password reset successfully.',
            'email_sent': send_email
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    def send_password_reset_link(self, request, pk=None):
        """
        Admin action: Send password reset link to user via email
        """
        user = self.get_object()
        
        # Check permissions
        if not request.user.has_perm('accounts.edit_users') and not request.user.is_superuser:
             return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        
        try:
            self._send_password_reset_link_email(user, request)
            
            return Response({
                'detail': f'Password reset link sent to {user.email}'
            }, status=status.HTTP_200_OK)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send password reset link to {user.email}: {str(e)}")
            return Response(
                {'detail': f'Failed to send password reset link: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def _send_password_reset_email(self, user, new_password, request):
        """Send email with new password to user using notification trigger"""
        from apps.notifications_app.triggers import NotificationTriggers
        
        triggers = NotificationTriggers()
        triggers.password_reset(user, new_password, request)
    
    def _send_password_reset_link_email(self, user, request):
        """Send password reset link to user using notification trigger"""
        from apps.notifications_app.triggers import NotificationTriggers
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes
        
        # Generate reset token
        token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        
        # Build reset link
        reset_link = request.build_absolute_uri(f'/accounts/reset/{uid}/{token}/')
        
        triggers = NotificationTriggers()
        triggers.password_reset_link(user, reset_link, request)