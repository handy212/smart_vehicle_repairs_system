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
    filterset_fields = ['status', 'service_type', 'customer', 'vehicle', 'branch', 'is_covered_by_subscription', 'assigned_technician']
    search_fields = ['request_number', 'customer__user__first_name', 'customer__user__last_name', 'vehicle__license_plate', 'breakdown_location']
    ordering_fields = ['requested_at', 'dispatched_at', 'completed_at', 'status']
    ordering = ['-requested_at']

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """
        Get statistics for roadside dashboard.
        """
        # Filter by user role/branch logic
        queryset = self.get_queryset()
        
        # Calculate stats
        total_requests = queryset.count()
        active_requests = queryset.filter(status__in=['requested', 'dispatched', 'en_route', 'on_site', 'in_progress']).count()
        completed_requests = queryset.filter(status='completed').count()
        covered_by_subscription = queryset.filter(is_covered_by_subscription=True).count()
        
        return Response({
            'total_requests': total_requests,
            'active_requests': active_requests,
            'completed_requests': completed_requests,
            'covered_by_subscription': covered_by_subscription
        })
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        action = getattr(self, 'action', None)
        if action in ['list', 'retrieve', 'my_requests']:
            return [IsAuthenticated()]
        elif action == 'create':
            # Allow customers to create their own requests
            if getattr(self.request.user, "role", None) == "customer":
                return [IsAuthenticated()]
            return [IsAuthenticated(), HasAnyPermission(['manage_roadside', 'create_roadside_requests'])]
        elif action == 'cancel':
             return [IsAuthenticated()]
        elif action in ['update', 'partial_update', 'assign_dispatch', 'arrive', 'complete']:
            return [IsAuthenticated(), HasAnyPermission(['manage_roadside', 'dispatch_roadside'])]
        return [IsAuthenticated()]
    
    def get_serializer_class(self):
        action = getattr(self, 'action', None)
        if action == 'create':
            return RoadsideRequestCreateSerializer
        elif action in ['update', 'partial_update']:
            return RoadsideRequestUpdateSerializer
        return RoadsideRequestSerializer
    
    def get_queryset(self):
        """Filter requests based on user role"""
        user = self.request.user
        action = getattr(self, 'action', None)
        
        # For my_requests action, let the action handle filtering
        if action == 'my_requests':
            return self.queryset.none()  # Will be filtered in the action itself
        
        if not user or user.is_anonymous:
            return self.queryset.none()
        
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
    
    
    def perform_create(self, serializer):
        from django.db import transaction
        
        request = self.request
        # Determine branch
        from apps.branches.utils import resolve_branch
        branch_id = request.data.get('branch') or request.data.get('branch_id')
        branch = resolve_branch(request, branch_id=branch_id)
        
        if branch is None:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'A valid branch assignment is required.'})
            
        # 1. Start atomic transaction for the entire request creation
        with transaction.atomic():
            # Create the request first
            roadside_request = serializer.save(
                branch=branch,
                created_by=request.user
            )
            
            # 2. Check and consume subscription allowance
            # We wrap this logic here. If subscription consumption fails BUT we catch it,
            # we must ensure that any created Usage record is rolled back OR never linked.
            self._handle_subscription_usage(request, roadside_request)

        # 3. Send notification ONLY after successful commit
        def send_notification():
            try:
                from apps.notifications_app.triggers import notification_triggers
                notification_triggers.roadside_requested(roadside_request)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Failed to send roadside request notification: {e}")

        transaction.on_commit(send_notification)

    def _handle_subscription_usage(self, request, roadside_request):
        """Helper to handle strict subscription logic inside a transaction"""
        from apps.subscriptions.services import SubscriptionUsageService
        from apps.subscriptions.models import Subscription
        from django.db import transaction
        
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
        if not feature_key:
            return

        try:
            customer = roadside_request.customer
            vehicle = roadside_request.vehicle
            
            if not customer or not vehicle:
                return

            # Check if customer has active subscription for this vehicle
            has_allowance, subscription, remaining = SubscriptionUsageService.check_allowance(
                customer, feature_key, 
                quantity_needed=roadside_request.tow_distance_km if roadside_request.service_type == 'towing' else 1,
                vehicle=vehicle
            )
            
            if has_allowance and subscription:
                # Use a SAVEPOINT specifically for the subscription consumption interaction
                # If this block fails, only the subscription usage creation is rolled back.
                try:
                    with transaction.atomic():
                        # Determine quantity to deduct
                        if roadside_request.service_type == 'towing' and roadside_request.tow_distance_km:
                            quantity_used = roadside_request.tow_distance_km
                        else:
                            quantity_used = 1
                        
                        usage_type = service_to_feature.get(roadside_request.service_type, feature_key)
                        
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
                        
                except Exception as sub_e:
                    # Log the internal subscription failure
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Subscription consumption failed in atomic block: {sub_e}", exc_info=True)
                    
                    # Ensure request is clean (the savepoint rollback handled the usage record creation)
                    # We just need to ensure the request object in memory doesn't think it's covered
                    roadside_request.refresh_from_db()
                    roadside_request.subscription_used = None
                    roadside_request.subscription_usage_record = None
                    roadside_request.subscription_allowance_deducted = False
                    roadside_request.is_covered_by_subscription = False
                    roadside_request.save()

        except Exception as e:
            # Catch top-level logic errors in this helper
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error in _handle_subscription_usage: {e}", exc_info=True)
            # Ensure safe fallback - clear ALL subscription fields
            roadside_request.is_covered_by_subscription = False
            roadside_request.subscription_used = None
            roadside_request.subscription_usage_record = None
            roadside_request.subscription_allowance_deducted = False
            roadside_request.save()
    
    @action(detail=True, methods=['post'])
    def assign_dispatch(self, request, pk=None):
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
                
                # Link invoice to roadside request
                roadside_request.invoice = invoice
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
        
        # Send notification
        try:
            from apps.notifications_app.triggers import notification_triggers
            notification_triggers.roadside_cancelled(roadside_request)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to send cancellation notification: {e}")
            
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
    
    @action(detail=True, methods=['post'])
    def rate_service(self, request, pk=None):
        """Rate completed service (Customer only)"""
        roadside_request = self.get_object()
        
        # Verify user is the customer
        is_customer = False
        if request.user.role == 'customer':
            try:
                if roadside_request.customer == request.user.customer_profile:
                    is_customer = True
            except AttributeError:
                pass
        
        if not is_customer and request.user.role not in ['admin', 'manager']: # Allow admins to test
             return Response(
                {'error': 'You do not have permission to rate this request'},
                status=status.HTTP_403_FORBIDDEN
            )

        rating = request.data.get('rating')
        feedback = request.data.get('customer_feedback') or request.data.get('feedback')
        
        if not rating:
            return Response(
                {'error': 'Rating is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        try:
            rating = int(rating)
            if not (1 <= rating <= 5):
                raise ValueError
        except (ValueError, TypeError):
             return Response(
                {'error': 'Rating must be an integer between 1 and 5'},
                status=status.HTTP_400_BAD_REQUEST
            )

        roadside_request.rating = rating
        if feedback:
            roadside_request.customer_feedback = feedback
        
        roadside_request.save()
        
        serializer = self.get_serializer(roadside_request)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def send_customer_sms(self, request, pk=None):
        """Send SMS to customer for this roadside request"""
        roadside_request = self.get_object()
        
        # Get message from request body
        message = request.data.get('message', '').strip()
        if not message:
            return Response(
                {'error': 'Message is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if customer phone exists
        if not roadside_request.customer_phone:
            return Response(
                {'error': 'Customer phone number not available'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Import SMS utilities
        try:
            from apps.notifications_app.hubtel_sms import send_sms, is_hubtel_available
        except ImportError:
            return Response(
                {'error': 'SMS service is not configured'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        
        # Check if Hubtel SMS is available
        if not is_hubtel_available():
            return Response(
                {'error': 'SMS service is not available. Please check configuration.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        
        # Send SMS
        success, response = send_sms(roadside_request.customer_phone, message)
        
        if success:
            return Response({
                'success': True,
                'message': 'SMS sent successfully',
                'details': response
            })
        else:
            return Response(
                {'error': f'Failed to send SMS: {response}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

