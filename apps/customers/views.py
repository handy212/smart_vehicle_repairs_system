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
    ordering_fields = ['customer_number', 'customer_since', 'current_balance', 'loyalty_points']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Get queryset with optimizations"""
        queryset = Customer.objects.select_related('user').prefetch_related('vehicles')
        
        # Filter by status (exclude inactive by default)
        if self.action == 'list':
            status_param = self.request.query_params.get('status')
            if not status_param:
                queryset = queryset.filter(status='active')
        
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
