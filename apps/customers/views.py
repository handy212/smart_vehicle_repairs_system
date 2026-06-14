"""
Views for customers app
"""
from rest_framework import viewsets, status, filters, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema, inline_serializer
from apps.accounts.permissions import HasPermission, user_has_permission, IsModuleEnabled
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Count, Sum, Avg
from django.utils import timezone
from datetime import timedelta

from .models import Customer, CustomerNote, CustomerContact, CustomerReminder
from .serializers import (
    CustomerListSerializer,
    CustomerDetailSerializer,
    CustomerCreateSerializer,
    CustomerUpdateSerializer,
    CustomerNoteSerializer,
    CustomerStatsSerializer,
    CustomerContactSerializer,
    CustomerReminderSerializer
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
    permission_classes = [IsAuthenticated, IsModuleEnabled('customers')]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), IsModuleEnabled('customers'), HasPermission('view_customers')]
        elif self.action == 'create':
            return [IsAuthenticated(), IsModuleEnabled('customers'), HasPermission('create_customers')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), IsModuleEnabled('customers'), HasPermission('edit_customers')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), IsModuleEnabled('customers'), HasPermission('delete_customers')]
        return [IsAuthenticated(), IsModuleEnabled('customers')]
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
        if user_has_permission(user, 'view_own_profile') and not user_has_permission(user, 'view_customers'):
            # User can only view own customer profile
            if hasattr(user, 'customer_profile'):
                queryset = queryset.filter(id=user.customer_profile.id)
            else:
                queryset = queryset.none()
            return queryset
        
        # Filter by status (exclude inactive by default)
        if self.action == 'list':
            # Check for inactive_period first - if set, don't auto-filter by status
            inactive_period = self.request.query_params.get('inactive_period')
            
            status_param = self.request.query_params.get('status')
            # Only auto-filter by active status if inactive_period is not set
            if not status_param and not inactive_period:
                queryset = queryset.filter(status='active')
            
            # Date range filtering
            date_from = self.request.query_params.get('created_at__gte') or self.request.query_params.get('date_from')
            date_to = self.request.query_params.get('created_at__lte') or self.request.query_params.get('date_to')
            if date_from:
                queryset = queryset.filter(created_at__gte=date_from)
            if date_to:
                queryset = queryset.filter(created_at__lte=date_to)
            
            # Inactive period filtering
            if inactive_period:
                from datetime import timedelta
                from apps.workorders.models import WorkOrder
                
                # Map period to days
                period_days = {
                    '3_months': 90,
                    '6_months': 180,
                    '1_year': 365,
                    '2_years': 730,
                }
                
                if inactive_period in period_days:
                    threshold_days = period_days[inactive_period]
                elif inactive_period.startswith('custom_'):
                    # Format: custom_180 (custom number of days)
                    try:
                        threshold_days = int(inactive_period.replace('custom_', ''))
                    except ValueError:
                        threshold_days = 180
                else:
                    threshold_days = 180  # Default 6 months
                
                cutoff_date = timezone.now().date() - timedelta(days=threshold_days)
                
                # Get customers who have recent visits (within the threshold period)
                customers_with_recent_visits = WorkOrder.objects.filter(
                    customer__in=queryset,
                    status__in=['completed', 'invoiced', 'closed'],
                    completed_at__isnull=False,
                    completed_at__date__gte=cutoff_date
                ).values_list('customer_id', flat=True).distinct()
                
                # Filter to customers NOT in the recent visits list
                # This includes:
                # 1. Customers with no completed work orders at all
                # 2. Customers whose last visit was before the cutoff_date
                if customers_with_recent_visits:
                    queryset = queryset.exclude(id__in=customers_with_recent_visits)
                # If no customers have recent visits, the queryset already contains all inactive customers
        
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
    
    def get_serializer_context(self):
        """Add context for serializer"""
        context = super().get_serializer_context()
        # Add inactive threshold days to context if inactive_period is specified
        if self.action == 'list':
            inactive_period = self.request.query_params.get('inactive_period')
            if inactive_period:
                from datetime import timedelta
                period_days = {
                    '3_months': 90,
                    '6_months': 180,
                    '1_year': 365,
                    '2_years': 730,
                }
                if inactive_period in period_days:
                    threshold_days = period_days[inactive_period]
                elif inactive_period.startswith('custom_'):
                    try:
                        threshold_days = int(inactive_period.replace('custom_', ''))
                    except ValueError:
                        threshold_days = 180
                else:
                    threshold_days = 180
                context['inactive_threshold_days'] = threshold_days
        return context
    
    def perform_create(self, serializer):
        """Create customer with user account"""
        serializer.save()

    def perform_destroy(self, instance):
        """
        Custom delete to ensure the associated User is also deleted.
        Deleting the User cascades to Customer (CASCADE) and AllAuth SocialAccounts.
        Handles ProtectedError gracefully if the customer has dependent records.
        """
        from django.db.models.deletion import ProtectedError
        from rest_framework.exceptions import ValidationError
        
        user = instance.user
        try:
            if user:
                user.delete()  # Cascades to Customer via OneToOneField
            else:
                instance.delete()
        except ProtectedError as e:
            # e.protected_objects contains a list of objects preventing deletion
            # We can format this into a helpful message
            protected_types = set()
            for obj in e.protected_objects:
                protected_types.add(obj._meta.verbose_name.title())
            
            types_str = ", ".join(protected_types)
            message = (
                f"Cannot delete customer because they are referenced by existing "
                f"{types_str}. Please delete or reassign these records first."
            )
            raise ValidationError(message)
    
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
        
        from apps.workorders.models import WorkOrder
        work_orders = WorkOrder.objects.filter(
            customer=customer
        ).order_by('-created_at').values(
            'id', 'work_order_number', 'status', 'created_at',
            'completed_at', 'actual_total'
        )[:50]
        
        total_visits = WorkOrder.objects.filter(
            customer=customer,
            status__in=['completed', 'invoiced', 'closed']
        ).count()
        
        return Response({
            'customer': customer.customer_number,
            'total_visits': total_visits,
            'work_orders': list(work_orders),
        })
    
    def _handle_customer_excel_import(self, request):
        """Import customers from an Excel workbook."""
        import openpyxl
        from django.contrib.auth import get_user_model
        from django.db import transaction
        from apps.accounts.admin_views import log_audit
        
        User = get_user_model()
        
        if 'file' not in request.FILES:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        import_file = request.FILES['file']
        filename = import_file.name

        if not filename.lower().endswith('.xlsx'):
            return Response({
                'error': 'Customer import now requires a proper Excel workbook (.xlsx). Download the template and upload that format.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            imported_count = 0
            skipped_count = 0
            errors = []
            
            workbook = openpyxl.load_workbook(import_file, read_only=True, data_only=True)
            worksheet = workbook.active
            rows = worksheet.iter_rows(values_only=True)
            raw_headers = next(rows, None)

            if not raw_headers:
                return Response({'error': 'Excel file is empty'}, status=status.HTTP_400_BAD_REQUEST)

            headers = [str(header or '').strip() for header in raw_headers]
            normalized_headers = [header.lower() for header in headers]
            required_headers = ['first_name', 'last_name', 'email']

            if not all(header in normalized_headers for header in required_headers):
                return Response({
                    'error': f'Excel file must contain these columns: {", ".join(required_headers)}'
                }, status=status.HTTP_400_BAD_REQUEST)

            def clean_value(value):
                if value is None:
                    return ''
                return str(value).strip()

            for row_num, values in enumerate(rows, start=2):
                row = {
                    normalized_headers[index]: clean_value(value)
                    for index, value in enumerate(values)
                    if index < len(normalized_headers) and normalized_headers[index]
                }

                if not any(row.values()):
                    continue

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
                        
                        customer = Customer.objects.create(
                            user=user,
                            company_name=row.get('company_name', '').strip(),
                            customer_type=row.get('customer_type', 'individual').strip() or 'individual',
                            status=row.get('status', 'active').strip() or 'active',
                            service_address=row.get('service_address', '').strip() or None,
                            service_city=row.get('service_city', '').strip() or None,
                            service_state=row.get('service_state', '').strip() or None,
                            service_zip_code=row.get('service_zip_code', '').strip() or None,
                            billing_address=row.get('billing_address', '').strip(),
                            billing_city=row.get('billing_city', '').strip(),
                            billing_state=row.get('billing_state', '').strip(),
                            billing_zip_code=row.get('billing_zip_code', '').strip(),
                            payment_terms=row.get('payment_terms', 'due_on_receipt').strip() or 'due_on_receipt',
                            preferred_contact_method=row.get('preferred_contact_method', 'email').strip() or 'email',
                        )
                        from apps.customers.contact_services import (
                            apply_business_contact_person_name,
                            sync_primary_contact,
                        )
                        apply_business_contact_person_name(customer)
                        customer.save(update_fields=['contact_person_name'])
                        sync_primary_contact(customer)
                        
                        imported_count += 1
                        
                except Exception as e:
                    errors.append(f"Row {row_num}: {str(e)}")
                    skipped_count += 1
            
            # Log import to audit log
            log_audit(
                user=request.user,
                action='import',
                model_name='Customer',
                object_repr=f'Excel Import: {filename}',
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
                object_repr=f'Excel Import Failed: {filename}',
                changes={
                    'error': str(e),
                    'filename': filename,
                },
                request=request
            )
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def import_excel(self, request):
        """Import customers from an Excel workbook."""
        return self._handle_customer_excel_import(request)

    @action(detail=False, methods=['post'])
    def import_csv(self, request):
        """Compatibility route for the old import URL; only Excel is accepted now."""
        return self._handle_customer_excel_import(request)
    
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
    
    @extend_schema(
        responses={
            200: inline_serializer(
                name='CustomerDashboardStatsResponse',
                fields={
                    'total_customers': serializers.IntegerField(),
                    'active_customers': serializers.IntegerField(),
                    'inactive_customers': serializers.IntegerField(),
                    'active_contacts': serializers.IntegerField(),
                    'inactive_contacts': serializers.IntegerField(),
                    'new_this_month': serializers.IntegerField(),
                    'growth_percentage': serializers.FloatField(),
                }
            )
        }
    )
    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """Get customer dashboard statistics"""
        total_customers = Customer.objects.count()
        active_customers = Customer.objects.filter(status='active').count()
        inactive_customers = Customer.objects.filter(status='inactive').count()
        
        # Count contacts
        active_contacts = CustomerContact.objects.filter(customer__status='active').count()
        inactive_contacts = CustomerContact.objects.filter(customer__status='inactive').count()
        
        # New this month
        today = timezone.now().date()
        month_start = today.replace(day=1)
        new_this_month = Customer.objects.filter(created_at__date__gte=month_start).count()
        
        # Growth calculation (compare with last month)
        last_month_end = month_start - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)
        new_last_month = Customer.objects.filter(
            created_at__date__gte=last_month_start,
            created_at__date__lte=last_month_end
        ).count()
        
        growth_percentage = 0
        if new_last_month > 0:
            growth_percentage = round(((new_this_month - new_last_month) / new_last_month) * 100, 1)
        elif new_this_month > 0:
            growth_percentage = 100.0  # From 0 to something is 100% growth for simplicity
            
        return Response({
            'total_customers': total_customers,
            'active_customers': active_customers,
            'inactive_customers': inactive_customers,
            'active_contacts': active_contacts,
            'inactive_contacts': inactive_contacts,
            'new_this_month': new_this_month,
            'growth_percentage': growth_percentage
        })

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
    
    @action(detail=False, methods=['post'])
    def check_email(self, request):
        """
        Check if an email address already exists in the system
        
        POST /api/customers/customers/check_email/
        Body: { "email": "user@example.com", "customer_id": null }  # customer_id optional for edit
        
        Returns:
        {
            "success": true,
            "exists": false,
            "message": "Email is available"
        }
        
        If email exists:
        {
            "success": true,
            "exists": true,
            "user_id": 123,
            "customer_id": 456,
            "customer": {...customer details...},
            "message": "A user with this email already exists in the system"
        }
        """
        from apps.accounts.models import User
        
        email = request.data.get('email', '').strip().lower()
        customer_id = request.data.get('customer_id')  # For edit page - exclude current customer
        
        if not email:
            return Response(
                {'success': False, 'error': 'Email is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if email already exists in database
        query = User.objects.filter(email__iexact=email)
        if customer_id:
            # Exclude the current customer's user
            try:
                customer = Customer.objects.get(id=customer_id)
                query = query.exclude(id=customer.user.id)
            except Customer.DoesNotExist:
                pass
        
        existing_user = query.first()
        if existing_user:
            # Get customer if exists
            customer = None
            if hasattr(existing_user, 'customer_profile'):
                customer = existing_user.customer_profile
                customer_data = CustomerDetailSerializer(customer).data
            else:
                customer_data = None
            
            return Response({
                'success': True,
                'exists': True,
                'user_id': existing_user.id,
                'customer_id': customer.id if customer else None,
                'customer': customer_data,
                'user': {
                    'id': existing_user.id,
                    'email': existing_user.email,
                    'first_name': existing_user.first_name,
                    'last_name': existing_user.last_name,
                    'role': existing_user.role,
                },
                'message': 'A user with this email already exists in the system'
            })
        
        return Response({
            'success': True,
            'exists': False,
            'message': 'Email is available'
        })


class CustomerNoteViewSet(viewsets.ModelViewSet):
    """ViewSet for customer notes"""
    serializer_class = CustomerNoteSerializer
    from apps.accounts.permissions import IsStaff
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['customer', 'note_type', 'is_important']
    ordering = ['-created_at']
    
    def get_queryset(self):
        return CustomerNote.objects.select_related('customer', 'created_by').all()
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

class CustomerContactViewSet(viewsets.ModelViewSet):
    """ViewSet for customer contacts"""
    serializer_class = CustomerContactSerializer
    from apps.accounts.permissions import IsStaff
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['customer', 'is_primary', 'is_billing']
    ordering = ['-is_primary', 'first_name']

    def get_queryset(self):
        return CustomerContact.objects.filter(customer__user__is_active=True).select_related('customer')


class CustomerReminderViewSet(viewsets.ModelViewSet):
    """ViewSet for customer reminders"""
    serializer_class = CustomerReminderSerializer
    from apps.accounts.permissions import IsStaff
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['customer', 'status', 'is_system_generated']
    ordering = ['due_date']

    def get_queryset(self):
        return CustomerReminder.objects.select_related('customer', 'created_by').all()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


from .models import CustomerDocument, CustomerContract
from .serializers import CustomerDocumentSerializer, CustomerContractSerializer

class CustomerDocumentViewSet(viewsets.ModelViewSet):
    """ViewSet for customer documents"""
    serializer_class = CustomerDocumentSerializer
    from apps.accounts.permissions import IsStaff
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['customer', 'is_public']
    ordering = ['-created_at']
    
    def get_queryset(self):
        return CustomerDocument.objects.select_related('customer', 'uploaded_by').all()
        
    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)


class CustomerContractViewSet(viewsets.ModelViewSet):
    """ViewSet for customer contracts"""
    serializer_class = CustomerContractSerializer
    from apps.accounts.permissions import IsStaff
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['customer', 'status']
    ordering = ['-created_at']
    
    def get_queryset(self):
        return CustomerContract.objects.select_related('customer', 'created_by').all()
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
