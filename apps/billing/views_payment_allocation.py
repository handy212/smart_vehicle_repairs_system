from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from decimal import Decimal
import logging
from django.db import transaction

from apps.billing.models import PaymentAllocation, Payment, Invoice
from apps.billing.serializers import PaymentAllocationSerializer

logger = logging.getLogger(__name__)

class PaymentAllocationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing payment allocations
    
    Allows tracking how payments are allocated across multiple invoices,
    which is critical for proper customer account management.
    """
    
    queryset = PaymentAllocation.objects.select_related(
        'payment', 'invoice', 'invoice__customer', 'allocated_by'
    ).all()
    from apps.accounts.permissions import IsStaff, HasPermission
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve', 'by_customer']:
            # Customers can view their own allocations through get_queryset filtering
            return [IsAuthenticated()]
        # Creating, updating, and allocating (custom action) are staff-only
        return [IsAuthenticated(), IsStaff()]
    
    serializer_class = PaymentAllocationSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['payment', 'invoice', 'invoice__customer']
    search_fields = ['payment__payment_number', 'invoice__invoice_number']
    ordering_fields = ['allocated_at', 'amount']
    ordering = ['-allocated_at']
    
    def get_queryset(self):
        """Filter allocations by user's accessible branches"""
        queryset = super().get_queryset()
        
        # For customers, filter by their invoices
        if hasattr(self.request.user, 'role') and self.request.user.role == 'customer':
            from apps.customers.models import Customer
            try:
                customer = Customer.objects.get(user=self.request.user)
                queryset = queryset.filter(invoice__customer=customer)
            except Customer.DoesNotExist:
                queryset = queryset.none()
        else:
            # For staff, filter by branch access
            from apps.branches.utils import filter_queryset_for_user_branches
            invoice_ids = filter_queryset_for_user_branches(
                Invoice.objects.all(),
                self.request.user,
                request=self.request,
                use_active_branch=True
            ).values_list('id', flat=True)
            if invoice_ids.exists():
                queryset = queryset.filter(invoice_id__in=invoice_ids)
        
        return queryset
    
    def perform_create(self, serializer):
        """Set allocated_by to current user"""
        serializer.save(allocated_by=self.request.user)
    
    @action(detail=False, methods=['post'])
    def allocate_payment(self, request):
        """
        Allocate a payment to one or more invoices
        
        POST data:
        {
            "payment_id": 123,
            "allocations": [
                {"invoice_id": 1, "amount": "50.00", "notes": "partial payment"},
                {"invoice_id": 2, "amount": "30.00"}
            ]
        }
        """
        payment_id = request.data.get('payment_id')
        allocations = request.data.get('allocations', [])
        
        if not payment_id or not allocations:
            return Response(
                {"error": "payment_id and allocations are required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            payment = Payment.objects.get(id=payment_id)
        except Payment.DoesNotExist:
            return Response(
                {"error": "Payment not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Validate payment status
        if payment.status != 'completed':
            return Response(
                {"error": "Only completed payments can be allocated"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate total allocation doesn't exceed payment amount
        total_allocated = sum(Decimal(str(a.get('amount', 0))) for a in allocations)
        if total_allocated > payment.amount:
            return Response(
                {
                    "error": f"Total allocation ({total_allocated}) exceeds payment amount ({payment.amount})"
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create allocations in a transaction
        created_allocations = []
        
        try:
            with transaction.atomic():
                # Clear existing allocations for this payment
                PaymentAllocation.objects.filter(payment=payment).delete()
                
                for alloc_data in allocations:
                    invoice_id = alloc_data.get('invoice_id')
                    amount = Decimal(str(alloc_data.get('amount', 0)))
                    
                    if amount <= 0:
                        raise serializers.ValidationError(f"Allocation amount must be greater than 0")
                    
                    try:
                        invoice = Invoice.objects.get(id=invoice_id)
                    except Invoice.DoesNotExist:
                        raise serializers.ValidationError(f"Invoice {invoice_id} not found")
                    
                    # Validate allocation doesn't exceed invoice balance
                    # Logic adjustment: If the payment is already applied to this invoice (linked),
                    # we should count it as available balance for allocation purposes.
                    allowable_balance = invoice.amount_due
                    
                    # If this payment is the one linked to the invoice, add its value back to the allowable balance
                    if payment.invoice_id == invoice.id:
                        allowable_balance += payment.amount
                        
                    if amount > allowable_balance:
                        raise serializers.ValidationError(
                            f"Allocation amount ({amount}) exceeds invoice {invoice.invoice_number} balance ({invoice.amount_due})"
                        )
                    
                    allocation = PaymentAllocation.objects.create(
                        payment=payment,
                        invoice=invoice,
                        amount=amount,
                        allocated_by=request.user,
                        notes=alloc_data.get('notes', '')
                    )
                    created_allocations.append(allocation)
        except serializers.ValidationError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error allocating payment {payment_id}: {e}", exc_info=True)
            return Response(
                {"error": "Failed to allocate payment"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        serializer = self.get_serializer(created_allocations, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=False, methods=['get'])
    def by_customer(self, request):
        """Get all allocations for a specific customer"""
        customer_id = request.query_params.get('customer_id')
        if not customer_id:
            return Response(
                {"error": "customer_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        allocations = self.get_queryset().filter(invoice__customer_id=customer_id)
        serializer = self.get_serializer(allocations, many=True)
        return Response(serializer.data)
