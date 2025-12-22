"""
Views for roadside assistance
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError

from .models import RoadsideRequest
from .serializers import (
    RoadsideRequestSerializer,
    RoadsideRequestCreateSerializer,
    RoadsideRequestUpdateSerializer,
)
from apps.accounts.permissions import HasPermission, HasAnyPermission
from apps.branches.utils import resolve_branch


class RoadsideRequestViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing roadside assistance requests
    """
    queryset = RoadsideRequest.objects.select_related(
        'customer', 'vehicle', 'branch', 'assigned_technician', 
        'subscription_used', 'created_by'
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'service_type', 'customer', 'vehicle', 'branch', 'is_covered_by_subscription']
    search_fields = ['request_number', 'customer__first_name', 'customer__last_name', 'vehicle__license_plate', 'breakdown_location']
    ordering_fields = ['requested_at', 'dispatched_at', 'completed_at', 'status']
    ordering = ['-requested_at']
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve', 'my_requests']:
            return [IsAuthenticated()]
        elif self.action == 'create':
            # Allow customers to create their own requests
            if getattr(self.request.user, "role", None) == "customer":
                return [IsAuthenticated()]
            return [IsAuthenticated(), HasAnyPermission(['manage_roadside', 'create_roadside_requests'])]
        elif self.action in ['update', 'partial_update', 'dispatch', 'arrive', 'complete', 'cancel']:
            return [IsAuthenticated(), HasAnyPermission(['manage_roadside', 'dispatch_roadside'])]
        return [IsAuthenticated()]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return RoadsideRequestCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return RoadsideRequestUpdateSerializer
        return RoadsideRequestSerializer
    
    def get_queryset(self):
        """Filter requests based on user role"""
        user = self.request.user
        
        # For my_requests action, let the action handle filtering
        if self.action == 'my_requests':
            return self.queryset.none()  # Will be filtered in the action itself
        
        if user.role == 'customer':
            try:
                customer = user.customer_profile
                return self.queryset.filter(customer=customer)
            except AttributeError:
                from apps.customers.models import Customer
                try:
                    customer = Customer.objects.get(user=user)
                    return self.queryset.filter(customer=customer)
                except Customer.DoesNotExist:
                    return self.queryset.none()
        elif user.role in ['admin', 'manager']:
            return self.queryset.all()
        else:
            # Staff can see requests for their branch
            from apps.branches.utils import filter_queryset_for_user_branches
            return filter_queryset_for_user_branches(
                self.queryset,
                user,
                request=self.request,
                use_active_branch=True
            )
    
    @transaction.atomic
    def perform_create(self, serializer):
        """Create roadside request with subscription check and deduction"""
        from apps.subscriptions.services import SubscriptionUsageService
        
        request = self.request
        branch_id = request.data.get('branch') or request.data.get('branch_id')
        branch = resolve_branch(request, branch_id=branch_id)
        
        if branch is None:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'A valid branch assignment is required.'})
        
        # Save the request
        roadside_request = serializer.save(
            branch=branch,
            created_by=request.user
        )
        
        # Map service types to subscription feature keys
        service_to_feature = {
            'towing': 'towing_services_km',
            'battery_boost': 'battery_boosts',
            'flat_tyre': 'flat_tyre_service',
            'key_lockout': 'key_lock_out',
            'emergency_fuel': 'emergency_fuel',
            'extrication': 'extrication',
            'mechanical_first_aid': 'roadside_first_aid',
        }
        
        feature_key = service_to_feature.get(roadside_request.service_type)
        
        if feature_key:
            try:
                customer = roadside_request.customer
                vehicle = roadside_request.vehicle
                
                # Check if customer has active subscription for this vehicle
                has_allowance, subscription, remaining = SubscriptionUsageService.check_allowance(
                    customer, feature_key, 
                    quantity_needed=roadside_request.tow_distance_km if roadside_request.service_type == 'towing' else 1,
                    vehicle=vehicle
                )
                
                if has_allowance and subscription:
                    # Determine quantity to deduct
                    if roadside_request.service_type == 'towing' and roadside_request.tow_distance_km:
                        quantity_used = roadside_request.tow_distance_km
                    else:
                        quantity_used = 1
                    
                    # Map service type to usage type for subscription
                    # (service_type is the model choice, usage_type is what subscription expects)
                    service_to_usage_type = {
                        'towing': 'towing_services_km',
                        'battery_boost': 'battery_boosts',
                        'flat_tyre': 'flat_tyre_service',
                        'key_lockout': 'key_lock_out',
                        'emergency_fuel': 'emergency_fuel',
                        'extrication': 'extrication',
                        'mechanical_first_aid': 'roadside_first_aid',
                    }
                    usage_type = service_to_usage_type.get(roadside_request.service_type, feature_key)
                    
                    # Consume allowance
                    usage_record = SubscriptionUsageService.consume_allowance(
                        subscription=subscription,
                        usage_type=usage_type,
                        quantity_used=quantity_used,
                        reference_type='roadside',
                        reference_id=roadside_request.id,
                        description=f'{roadside_request.get_service_type_display()} - {roadside_request.request_number}',
                        created_by=request.user
                    )
                    
                    # Update request with subscription info
                    roadside_request.subscription_used = subscription
                    roadside_request.subscription_allowance_deducted = True
                    roadside_request.subscription_usage_record = usage_record
                    roadside_request.is_covered_by_subscription = True
                    roadside_request.save()
                    
            except DjangoValidationError as e:
                # Log but don't block request creation - subscription is optional
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(
                    f"Subscription allowance check failed for roadside request {roadside_request.id}: {e}. "
                    f"Service will be charged normally."
                )
                # Request is created but not covered by subscription
                roadside_request.is_covered_by_subscription = False
                roadside_request.save()
            except Exception as e:
                # Catch any other errors in subscription processing
                import logging
                logger = logging.getLogger(__name__)
                logger.error(
                    f"Unexpected error during subscription check for roadside request {roadside_request.id}: {e}",
                    exc_info=True
                )
                # Request is created but not covered by subscription
                roadside_request.is_covered_by_subscription = False
                roadside_request.save()
        
        # Send notification to customer (after all processing)
        try:
            from apps.notifications_app.triggers import notification_triggers
            notification_triggers.roadside_requested(roadside_request)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to send roadside request notification: {e}")
    
    @action(detail=True, methods=['post'])
    def dispatch(self, request, pk=None):
        """Dispatch a roadside request to a technician"""
        roadside_request = self.get_object()
        
        try:
            technician_id = request.data.get('technician_id')
            if technician_id:
                from apps.accounts.models import User
                try:
                    technician = User.objects.get(id=technician_id)
                    roadside_request.mark_dispatched(technician=technician)
                except User.DoesNotExist:
                    return Response(
                        {'error': 'Technician not found'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            else:
                roadside_request.mark_dispatched()
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Send notification
        try:
            from apps.notifications_app.triggers import notification_triggers
            notification_triggers.roadside_dispatched(roadside_request)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to send dispatch notification: {e}")
        
        serializer = self.get_serializer(roadside_request)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def en_route(self, request, pk=None):
        """Mark that service provider is en route"""
        roadside_request = self.get_object()
        
        try:
            roadside_request.mark_en_route()
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = self.get_serializer(roadside_request)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def in_progress(self, request, pk=None):
        """Mark that service is in progress"""
        roadside_request = self.get_object()
        
        try:
            roadside_request.mark_in_progress()
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = self.get_serializer(roadside_request)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def arrive(self, request, pk=None):
        """Mark that service provider has arrived on site"""
        roadside_request = self.get_object()
        
        try:
            roadside_request.mark_arrived()
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Send notification
        try:
            from apps.notifications_app.triggers import notification_triggers
            notification_triggers.roadside_arrived(roadside_request)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to send arrival notification: {e}")
        
        serializer = self.get_serializer(roadside_request)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark roadside request as completed"""
        roadside_request = self.get_object()
        
        try:
            roadside_request.mark_completed()
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create invoice if service is not covered by subscription and has charge amount
        invoice_id = None
        if not roadside_request.is_covered_by_subscription and roadside_request.charge_amount and roadside_request.charge_amount > 0:
            try:
                from apps.billing.models import Invoice, InvoiceLineItem
                from apps.branches.utils import resolve_branch
                
                branch = roadside_request.branch or resolve_branch(request)
                if not branch:
                    # Fallback to customer's branch or first active branch
                    if hasattr(roadside_request.customer, 'branch') and roadside_request.customer.branch:
                        branch = roadside_request.customer.branch
                    else:
                        from apps.branches.models import Branch
                        branch = Branch.objects.filter(is_active=True).first()
                
                invoice = Invoice.objects.create(
                    customer=roadside_request.customer,
                    vehicle=roadside_request.vehicle,
                    branch=branch,
                    invoice_date=timezone.now().date(),
                    due_date=timezone.now().date(),
                    description=f"Roadside Assistance: {roadside_request.get_service_type_display()} - {roadside_request.request_number}",
                    subtotal=roadside_request.charge_amount,
                    total=roadside_request.charge_amount,
                    amount_due=roadside_request.charge_amount,
                    status='pending',
                    created_by=request.user
                )
                
                InvoiceLineItem.objects.create(
                    invoice=invoice,
                    item_type='service',
                    description=f"{roadside_request.get_service_type_display()} - {roadside_request.request_number}",
                    quantity=1,
                    unit_price=roadside_request.charge_amount,
                    total=roadside_request.charge_amount,
                )
                
                invoice_id = invoice.id
                
                # Link invoice to roadside request in metadata
                roadside_request.notes = f"{roadside_request.notes}\nInvoice: {invoice.invoice_number}" if roadside_request.notes else f"Invoice: {invoice.invoice_number}"
                roadside_request.save()
                
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to create invoice for roadside request {roadside_request.id}: {e}", exc_info=True)
        
        # Send notification
        try:
            from apps.notifications_app.triggers import notification_triggers
            notification_triggers.roadside_completed(roadside_request)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to send completion notification: {e}")
        
        serializer = self.get_serializer(roadside_request)
        response_data = serializer.data
        if invoice_id:
            response_data['invoice_id'] = invoice_id
        return Response(response_data)
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a roadside request"""
        roadside_request = self.get_object()
        
        try:
            roadside_request.mark_cancelled()
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = self.get_serializer(roadside_request)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def fail(self, request, pk=None):
        """Mark roadside request as failed"""
        roadside_request = self.get_object()
        
        reason = request.data.get('reason', '')
        try:
            roadside_request.mark_failed(reason=reason)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = self.get_serializer(roadside_request)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def my_requests(self, request):
        """Get current user's roadside requests (for customer portal)"""
        try:
            if request.user.role != 'customer':
                return Response(
                    {'detail': 'Only customers can view their requests'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Try to get customer profile
            try:
                customer = request.user.customer_profile
            except AttributeError:
                # Try alternative method to get customer
                from apps.customers.models import Customer
                try:
                    customer = Customer.objects.get(user=request.user)
                except Customer.DoesNotExist:
                    return Response(
                        {'detail': 'Customer profile not found'},
                        status=status.HTTP_404_NOT_FOUND
                    )
            
            requests = RoadsideRequest.objects.filter(customer=customer).select_related(
                'customer', 'vehicle', 'branch', 'assigned_technician', 'subscription_used'
            )
            serializer = self.get_serializer(requests, many=True)
            return Response(serializer.data)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error in my_requests: {e}", exc_info=True)
            return Response(
                {'detail': f'An error occurred: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
