"""
Views for customers app
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
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
