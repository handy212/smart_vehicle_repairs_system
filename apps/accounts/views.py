"""
Views for accounts app
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from apps.accounts.permissions import HasPermission, HasAnyPermission, user_has_permission
from django.contrib.auth import get_user_model
from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import (
    UserSerializer, UserCreateSerializer, UserUpdateSerializer,
    ChangePasswordSerializer, StaffUserSerializer, PublicUserSerializer
)

User = get_user_model()


def self_registration_enabled():
    from apps.accounts.admin_models import SystemSettings

    value = SystemSettings.get_setting('self_registration_enabled', 'true')
    return str(value).strip().lower() in {'true', '1', 'yes', 'on'}


class UserViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing users
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['role', 'is_active', 'branch']
    search_fields = ['email', 'first_name', 'last_name', 'username']
    ordering_fields = ['created_at', 'email', 'first_name', 'last_name', 'role', 'is_active']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """
        Filter queryset based on action.
        For list action, exclude customers (they should be managed via Customer module).
        """
        queryset = super().get_queryset()
        # Exclude customers from operational access management; customers are
        # managed in the Customer module. Staff and technicians stay visible
        # here because this is where login/access controls are managed.
        if self.action == 'list':
            queryset = queryset.exclude(role='customer')
        
        # The owner/system account is intentionally kept out of operational
        # user-management surfaces. It remains available through /me only.
        queryset = queryset.exclude(role='super-admin')
            
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
            return [IsAuthenticated(), HasPermission('create_users')]
        elif self.action == 'forgot_password':
            return [AllowAny()]  # Allow public password reset request
        elif self.action == 'confirm_reset_password':
            return [AllowAny()]  # Allow public password reset confirmation
        
        # For other actions, require authentication and appropriate permissions.
        # Public customer registration is handled by /api/auth/register/*.
        if self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), HasPermission('view_users')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('edit_users')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('delete_users')]
        elif self.action in ['reset_password', 'send_password_reset_link', 'reset_2fa']:
            return [IsAuthenticated(), HasPermission('reset_user_passwords')]
        elif self.action == 'staff_list':
            return [IsAuthenticated(), HasPermission('view_users')]
        elif self.action == 'technicians':
            return [IsAuthenticated(), HasAnyPermission(['view_technicians', 'assign_workorders', 'manage_workorders'])]
        elif self.action == 'service_coordinators':
            return [IsAuthenticated(), HasAnyPermission(['view_users', 'assign_workorders', 'manage_workorders'])]
        elif self.action in ('me', 'permissions', 'change_password'):
            return [IsAuthenticated()]

        return [IsAuthenticated(), HasPermission('view_users')()]

    def create(self, request, *args, **kwargs):
        """
        Create staff/admin-managed users.

        Public customer self-registration lives under /api/auth/register/*, so
        this endpoint must stay authenticated and permission-protected.
        """
        return super().create(request, *args, **kwargs)
    
    @action(detail=False, methods=['post'])
    def forgot_password(self, request):
        """
        Public endpoint to request password reset link via email.
        Requires email and optional reCAPTCHA token.
        """
        email = request.data.get('email')
        recaptcha_token = request.data.get('recaptcha_token')
        
        if not email:
            return Response({'email': ['This field is required.']}, status=status.HTTP_400_BAD_REQUEST)
            
        # Verify reCAPTCHA if enabled
        from apps.accounts.recaptcha_views import _get_recaptcha_config, RecaptchaTokenObtainPairSerializer
        is_enabled, secret_key = _get_recaptcha_config()
        
        if is_enabled and secret_key:
            if not recaptcha_token:
                return Response(
                    {'recaptcha_token': ['reCAPTCHA verification is required.']}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if not RecaptchaTokenObtainPairSerializer._verify_recaptcha(recaptcha_token, secret_key):
                return Response(
                    {'recaptcha_token': ['reCAPTCHA verification failed. Please try again.']}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Find user by email
        try:
            user = User.objects.get(email=email, is_active=True)
            
            # Send reset link (silently fail if email sending fails to avoid leaking user existence)
            try:
                self._send_password_reset_link_email(user, request)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send password reset link to {email}: {str(e)}")
                
        except User.DoesNotExist:
            # For security, do not reveal that user implies doesn't exist
            # Just pretend we sent the email
            pass
            
        return Response({
            'detail': 'If an account exists with this email, a password reset link has been sent.'
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def confirm_reset_password(self, request):
        """
        Public endpoint to confirm password reset with token.
        """
        from .serializers import PasswordResetConfirmSerializer
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response({
            'detail': 'Password has been reset successfully. You can now log in with your new password.'
        }, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['get', 'put', 'patch'])
    def me(self, request):
        """Get or update current user profile"""
        if request.method == 'GET':
            serializer = self.get_serializer(request.user)
            return Response(serializer.data)
        else:
            profile_fields = {
                'first_name', 'last_name', 'phone', 'profile_picture', 'gender',
                'date_of_birth', 'address', 'city', 'state', 'zip_code', 'country',
                'email_notifications', 'sms_notifications',
            }
            data = {
                key: value
                for key, value in request.data.items()
                if key in profile_fields
            }
            serializer = UserUpdateSerializer(
                request.user,
                data=data,
                partial=True,
                context={'request': request},
            )
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
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated, HasPermission('view_users')])
    def staff_list(self, request):
        """Get list of all staff members"""
        staff = User.objects.filter(
            role__in=['admin', 'manager', 'service_coordinator', 'receptionist', 'technician', 'parts_manager', 'accountant', 'hr_manager']
        ).exclude(role='super-admin')
        serializer = StaffUserSerializer(staff, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def technicians(self, request):
        """Get list of technicians filtered by accessible branches"""
        from apps.branches.utils import get_user_accessible_branches
        
        technicians = User.objects.filter(role='technician', is_active=True)
        
        # Apply branch filtering to show only technicians from accessible branches
        accessible_branches = get_user_accessible_branches(request.user)
        technicians = technicians.filter(branch__in=accessible_branches)

        branch_id = request.query_params.get('branch')
        if branch_id:
            technicians = technicians.filter(branch_id=branch_id)
        
        serializer = PublicUserSerializer(technicians, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def service_coordinators(self, request):
        """Get list of service coordinators and managers filtered by accessible branches"""
        from apps.branches.utils import get_user_accessible_branches
        
        coordinators = User.objects.filter(role__in=['service_coordinator', 'manager'], is_active=True)
        
        # Apply branch filtering to show only coordinators from accessible branches
        accessible_branches = get_user_accessible_branches(request.user)
        coordinators = coordinators.filter(branch__in=accessible_branches)
        
        serializer = PublicUserSerializer(coordinators, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def reset_password(self, request, pk=None):
        """
        Admin action: Reset user password and optionally send reset link via email
        """
        user = self.get_object()
        
        # Check permissions using project's permission system
        if not user_has_permission(request.user, 'reset_user_passwords'):
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
        
        # Check permissions using project's permission system
        if not user_has_permission(request.user, 'reset_user_passwords'):
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
    
    @action(detail=True, methods=['post'])
    def reset_2fa(self, request, pk=None):
        """
        Admin action: Reset/disable 2FA for a user
        """
        user = self.get_object()
        
        # Check permissions using project's permission system
        if not user_has_permission(request.user, 'reset_user_passwords'):
             return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        
        user.two_factor_enabled = False
        user.two_factor_secret = ''
        user.save()
        
        return Response({
            'detail': f'Two-factor authentication has been disabled for {user.email}'
        }, status=status.HTTP_200_OK)
    
    def _send_password_reset_email(self, user, new_password, request):
        """
        Send password reset notification to user.
        SECURITY: Instead of sending the plaintext password, we send a
        reset link so the password never travels over email.
        """
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Password reset for {user.email} — sending reset link instead of plaintext password.")
        # Use the secure link-based flow instead
        self._send_password_reset_link_email(user, request)
    
    def _send_password_reset_link_email(self, user, request):
        """Send password reset link to user using notification trigger"""
        from apps.notifications_app.triggers import NotificationTriggers
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes
        from django.conf import settings
        
        # Generate reset token
        token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        
        # Build reset link pointing to the frontend
        # Try FRONTEND_URL, then FRONTEND_BASE_URL, then fallback to request host
        frontend_url = getattr(settings, 'FRONTEND_URL', getattr(settings, 'FRONTEND_BASE_URL', None))
        if not frontend_url:
            frontend_url = f"{request.scheme}://{request.get_host()}"
            
        reset_link = f"{frontend_url}/login/reset-password/{uid}/{token}/"
        
        triggers = NotificationTriggers()
        triggers.password_reset_link(user, reset_link, request)


class GoogleAuthView(viewsets.GenericViewSet):
    """
    API endpoint for Google OAuth authentication.
    Accepts a Google ID token and returns JWT tokens.
    """
    permission_classes = [AllowAny]
    
    @action(detail=False, methods=['post'])
    def login(self, request):
        """
        Authenticate with Google ID token and return JWT tokens.
        
        Expected request body:
        {
            "id_token": "google-id-token-from-frontend"
        }
        
        Returns:
        {
            "user": {...},
            "access": "jwt-access-token",
            "refresh": "jwt-refresh-token"
        }
        """
        from apps.accounts.google_auth import GoogleAuthSerializer, GoogleAuthResponseSerializer
        
        serializer = GoogleAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Create/get user and generate tokens
        auth_data = serializer.save()
        
        from apps.accounts.jwt_cookies import apply_auth_cookies

        response_serializer = GoogleAuthResponseSerializer(auth_data)
        response = Response(response_serializer.data, status=status.HTTP_200_OK)
        response.data = apply_auth_cookies(response, dict(response.data))
        return response

    @action(detail=False, methods=['post'])
    def resend_otp(self, request):
        """
        Resend the verification code via email.
        """
        email = request.data.get('email')
        if not email:
            return Response({"detail": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)
        
        from apps.accounts.services import OTPService
        success = OTPService.generate_otp(email)
        
        if success:
            return Response({"detail": "Verification code resent."}, status=status.HTTP_200_OK)
        return Response({"detail": "Failed to resend code."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def complete_registration(self, request):
        """
        Finalize Google registration with extra info.
        """
        from apps.accounts.google_auth import GoogleRegistrationCompleteSerializer
        
        serializer = GoogleRegistrationCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        auth_data = serializer.save()
        
        from apps.accounts.google_auth import GoogleAuthResponseSerializer
        from apps.accounts.jwt_cookies import apply_auth_cookies

        response_serializer = GoogleAuthResponseSerializer(auth_data)
        response = Response(response_serializer.data, status=status.HTTP_201_CREATED)
        response.data = apply_auth_cookies(response, dict(response.data))
        return response


class ManualRegistrationView(viewsets.GenericViewSet):
    """
    API endpoint for manual registration with OTP verification.
    """
    permission_classes = [AllowAny]
    
    @action(detail=False, methods=['post'])
    def initiate(self, request):
        """
        Step 1: Validate input and send OTP.
        """
        if not self_registration_enabled():
            return Response(
                {"detail": "Self registration is currently disabled."},
                status=status.HTTP_403_FORBIDDEN,
            )

        from apps.accounts.serializers import ManualRegistrationInitiateSerializer
        
        serializer = ManualRegistrationInitiateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Determine strict or loose validation. 
        # For initiation, we just want to ensure unique email and valid data.
        # The OTP logic needs to be triggered here.
        
        email = serializer.validated_data['email']
        
        from apps.accounts.services import OTPService
        success = OTPService.generate_otp(email, first_name=serializer.validated_data.get('first_name'))
        
        if success:
            return Response({
                "detail": "Verification code sent to your email.",
                "email": email
            }, status=status.HTTP_200_OK)
        else:
             return Response({"detail": "Failed to send verification code."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def verify(self, request):
        """
        Step 2: Verify OTP and create account.
        """
        if not self_registration_enabled():
            return Response(
                {"detail": "Self registration is currently disabled."},
                status=status.HTTP_403_FORBIDDEN,
            )

        from apps.accounts.serializers import ManualRegistrationVerifySerializer
        
        serializer = ManualRegistrationVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        auth_data = serializer.save()
        
        from apps.accounts.jwt_cookies import apply_auth_cookies

        payload = {
            'user': UserSerializer(auth_data['user']).data,
            'access': auth_data['access'],
            'refresh': auth_data['refresh'],
        }
        response = Response(payload, status=status.HTTP_201_CREATED)
        response.data = apply_auth_cookies(response, payload)
        return response
