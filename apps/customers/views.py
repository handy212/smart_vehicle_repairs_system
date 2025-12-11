"""
Views for customers app
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import HasPermission, user_has_permission
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Count, Sum, Avg
from django.utils import timezone

from .models import Customer, CustomerNote
from .serializers import (
    CustomerListSerializer,
    CustomerDetailSerializer,
    CustomerCreateSerializer,
    CustomerUpdateSerializer,
    CustomerNoteSerializer,
    CustomerStatsSerializer
)


class CustomerViewSet(viewsets.ModelViewSet):
    """
    ViewSet for customer operations
    
    list: Get list of customers
    retrieve: Get customer details
    create: Create new customer with user account
    update: Update customer information
    destroy: Delete customer (soft delete recommended)
    """
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), HasPermission('view_customers')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('create_customers')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('edit_customers')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('delete_customers')]
        return [IsAuthenticated()]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'customer_type', 'payment_terms', 'loyalty_tier']
    search_fields = [
        'customer_number', 'company_name', 'user__first_name',
        'user__last_name', 'user__email', 'user__phone', 'tags'
    ]
    ordering_fields = [
        'customer_number', 'customer_since', 'current_balance', 'loyalty_points',
        'user__last_name', 'user__first_name', 'user__email', 'customer_type', 'status',
        'created_at', 'company_name'
    ]
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Get queryset with optimizations"""
        queryset = Customer.objects.select_related('user').prefetch_related('vehicles')
        user = self.request.user
        
        # Filter based on permissions - if user can only view own, filter accordingly
        if user_has_permission(user, 'view_own_customers') and not user_has_permission(user, 'view_customers'):
            # User can only view own customer profile
            if hasattr(user, 'customer_profile'):
                queryset = queryset.filter(id=user.customer_profile.id)
            else:
                queryset = queryset.none()
            return queryset
        
        # Filter by status (exclude inactive by default)
        if self.action == 'list':
            status_param = self.request.query_params.get('status')
            if not status_param:
                queryset = queryset.filter(status='active')
            
            # Date range filtering
            date_from = self.request.query_params.get('created_at__gte') or self.request.query_params.get('date_from')
            date_to = self.request.query_params.get('created_at__lte') or self.request.query_params.get('date_to')
            if date_from:
                queryset = queryset.filter(created_at__gte=date_from)
            if date_to:
                queryset = queryset.filter(created_at__lte=date_to)
        
        return queryset
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return CustomerListSerializer
        elif self.action == 'create':
            return CustomerCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return CustomerUpdateSerializer
        return CustomerDetailSerializer
    
    def perform_create(self, serializer):
        """Create customer with user account"""
        serializer.save()
    
    @action(detail=True, methods=['get'])
    def vehicles(self, request, pk=None):
        """Get customer's vehicles"""
        customer = self.get_object()
        vehicles = customer.vehicles.all()
        
        # Import here to avoid circular dependency
        from apps.vehicles.serializers import VehicleListSerializer
        serializer = VehicleListSerializer(vehicles, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Get customer's service history"""
        customer = self.get_object()
        
        # This will be implemented when workorders app is ready
        # For now, return placeholder
        return Response({
            'customer': customer.customer_number,
            'total_visits': 0,
            'work_orders': [],
            'message': 'Service history will be available when work orders are implemented'
        })
    
    @action(detail=False, methods=['post'])
    def import_csv(self, request):
        """Import customers from CSV file"""
        import csv
        from django.contrib.auth import get_user_model
        from django.db import transaction
        from apps.accounts.admin_views import log_audit
        
        User = get_user_model()
        
        if 'file' not in request.FILES:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        csv_file = request.FILES['file']
        filename = csv_file.name
        
        try:
            imported_count = 0
            skipped_count = 0
            errors = []
            
            # Read CSV file
            decoded_file = csv_file.read().decode('utf-8').splitlines()
            reader = csv.DictReader(decoded_file)
            
            # Required headers
            required_headers = ['first_name', 'last_name', 'email']
            
            # Check if required headers exist
            if not all(header in reader.fieldnames for header in required_headers):
                return Response({
                    'error': f'CSV file must contain these columns: {", ".join(required_headers)}'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Process each row
            for row_num, row in enumerate(reader, start=2):
                try:
                    first_name = row.get('first_name', '').strip()
                    last_name = row.get('last_name', '').strip()
                    email = row.get('email', '').strip().lower()
                    phone = row.get('phone', '').strip()
                    
                    # Validate required fields
                    if not first_name or not last_name or not email:
                        errors.append(f"Row {row_num}: Missing required fields")
                        skipped_count += 1
                        continue
                    
                    # Check if user with this email already exists
                    if User.objects.filter(email=email).exists():
                        errors.append(f"Row {row_num}: Email {email} already exists")
                        skipped_count += 1
                        continue
                    
                    # Create user and customer in a transaction
                    with transaction.atomic():
                        username = email
                        user = User.objects.create_user(
                            username=username,
                            email=email,
                            first_name=first_name,
                            last_name=last_name,
                            phone=phone or '',
                            role='customer'
                        )
                        
                        Customer.objects.create(
                            user=user,
                            company_name=row.get('company_name', '').strip() or None,
                            customer_type=row.get('customer_type', 'individual').strip() or 'individual',
                            status=row.get('status', 'active').strip() or 'active',
                        )
                        
                        imported_count += 1
                        
                except Exception as e:
                    errors.append(f"Row {row_num}: {str(e)}")
                    skipped_count += 1
            
            # Log import to audit log
            log_audit(
                user=request.user,
                action='import',
                model_name='Customer',
                object_repr=f'CSV Import: {filename}',
                changes={
                    'imported': imported_count,
                    'skipped': skipped_count,
                    'total_errors': len(errors),
                    'filename': filename,
                },
                request=request
            )
            
            return Response({
                'imported': imported_count,
                'skipped': skipped_count,
                'errors': errors[:50]  # Limit errors to 50
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            # Log failed import
            log_audit(
                user=request.user,
                action='import',
                model_name='Customer',
                object_repr=f'CSV Import Failed: {filename}',
                changes={
                    'error': str(e),
                    'filename': filename,
                },
                request=request
            )
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """Get customer statistics"""
        customer = self.get_object()
        
        # Placeholder stats - will be implemented with work orders and billing
        stats = {
            'total_spent': 0.00,
            'total_visits': 0,
            'last_visit_date': None,
            'average_invoice': 0.00,
            'vehicles_serviced': customer.vehicle_count
        }
        
        serializer = CustomerStatsSerializer(stats)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def add_note(self, request, pk=None):
        """Add note to customer"""
        customer = self.get_object()
        serializer = CustomerNoteSerializer(data=request.data)
        
        if serializer.is_valid():
            serializer.save(customer=customer, created_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'])
    def notes(self, request, pk=None):
        """Get customer notes"""
        customer = self.get_object()
        notes = customer.customer_notes.all()
        serializer = CustomerNoteSerializer(notes, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def search(self, request):
        """Advanced customer search"""
        query = request.query_params.get('q', '')
        
        if not query:
            return Response(
                {'error': 'Search query parameter "q" is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        customers = self.get_queryset().filter(
            Q(customer_number__icontains=query) |
            Q(company_name__icontains=query) |
            Q(user__first_name__icontains=query) |
            Q(user__last_name__icontains=query) |
            Q(user__email__icontains=query) |
            Q(user__phone__icontains=query) |
            Q(tags__icontains=query)
        ).distinct()[:10]  # Limit to 10 results
        
        serializer = CustomerListSerializer(customers, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get only active customers"""
        customers = self.get_queryset().filter(status='active')
        page = self.paginate_queryset(customers)
        
        if page is not None:
            serializer = CustomerListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = CustomerListSerializer(customers, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def fleet(self, request):
        """Get fleet customers"""
        customers = self.get_queryset().filter(customer_type='fleet')
        serializer = CustomerListSerializer(customers, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def suspend(self, request, pk=None):
        """Suspend customer account"""
        customer = self.get_object()
        customer.status = 'suspended'
        customer.save()
        
        return Response({
            'message': f'Customer {customer.customer_number} has been suspended',
            'status': customer.status
        })
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Activate customer account"""
        customer = self.get_object()
        customer.status = 'active'
        customer.save()
        
        return Response({
            'message': f'Customer {customer.customer_number} has been activated',
            'status': customer.status
        })
    
    @action(detail=True, methods=['post'])
    def reset_password(self, request, pk=None):
        """
        Admin action: Reset customer password and optionally send reset link via email
        """
        customer = self.get_object()
        user = customer.user
        
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
        user.is_active = True  # Activate user if portal access is granted
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
        Admin action: Send password reset link to customer via email
        """
        customer = self.get_object()
        user = customer.user
        
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
    def grant_portal_access(self, request, pk=None):
        """
        Grant portal access to customer (activate user account)
        """
        customer = self.get_object()
        user = customer.user
        password = request.data.get('password', None)
        send_email = request.data.get('send_email', False)
        
        # Generate password if not provided
        if not password:
            import secrets
            import string
            alphabet = string.ascii_letters + string.digits + string.punctuation
            password = ''.join(secrets.choice(alphabet) for i in range(16))
        
        # Validate password
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError
        try:
            validate_password(password, user)
        except ValidationError as e:
            return Response(
                {'detail': 'Password validation failed.', 'errors': list(e.messages)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Set password and activate
        user.set_password(password)
        user.is_active = True
        user.save()
        
        # Send welcome email if requested
        if send_email:
            try:
                self._send_welcome_email(user, password, request)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send welcome email to {user.email}: {str(e)}")
        
        return Response({
            'detail': 'Portal access granted successfully.',
            'email_sent': send_email,
            'password': password if not send_email else None  # Only return password if email not sent
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    def revoke_portal_access(self, request, pk=None):
        """
        Revoke portal access from customer (deactivate user account)
        """
        customer = self.get_object()
        user = customer.user
        
        user.is_active = False
        user.save()
        
        return Response({
            'detail': 'Portal access revoked successfully.'
        }, status=status.HTTP_200_OK)
    
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
        
        # Build reset link (use customer portal reset URL)
        reset_link = request.build_absolute_uri(f'/customer/reset-password/{uid}/{token}/')
        
        triggers = NotificationTriggers()
        triggers.password_reset_link(user, reset_link, request)
    
    def _send_welcome_email(self, user, password, request):
        """Send welcome email to customer"""
        from apps.notifications_app.triggers import NotificationTriggers
        
        triggers = NotificationTriggers()
        # Use user_welcome template for now (customers are users with role='customer')
        if hasattr(triggers, 'user_welcome'):
            triggers.user_welcome(user, password, 'customer', None)


class CustomerNoteViewSet(viewsets.ModelViewSet):
    """ViewSet for customer notes"""
    serializer_class = CustomerNoteSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['customer', 'note_type', 'is_important']
    ordering = ['-created_at']
    
    def get_queryset(self):
        return CustomerNote.objects.select_related('customer', 'created_by').all()
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
