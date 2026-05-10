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

from .models import RoadsideRequest, RoadsideDispatch
from .serializers import (
    RoadsideRequestSerializer,
    RoadsideRequestCreateSerializer,
    RoadsideRequestUpdateSerializer,
)
from apps.accounts.permissions import HasPermission, HasAnyPermission, IsModuleEnabled
from apps.branches.utils import resolve_branch
from apps.branches.utils import filter_queryset_for_user_branches
from apps.core.services.ai_service import AIService


import logging
from apps.notifications_app.triggers import notification_triggers
from apps.subscriptions.services import SubscriptionUsageService

logger = logging.getLogger(__name__)

class RoadsideRequestViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing roadside assistance requests
    """
    queryset = RoadsideRequest.objects.all()

    def get_queryset(self):
        """Filter requests based on user role and branch"""
        user = self.request.user
        action = getattr(self, 'action', None)
        
        queryset = RoadsideRequest.objects.select_related(
            'customer', 'vehicle', 'branch', 'assigned_technician', 
            'subscription_used', 'created_by'
        ).prefetch_related('dispatches__technician')
        
        # For my_requests action, let the action handle filtering
        if action == 'my_requests':
            return queryset.none()  # Will be filtered in the action itself
        
        if not user or user.is_anonymous:
            return queryset.none()
        
        if user.role == 'customer':
            try:
                customer = user.customer_profile
                return queryset.filter(customer=customer)
            except AttributeError:
                from apps.customers.models import Customer
                try:
                    customer = Customer.objects.get(user=user)
                    return queryset.filter(customer=customer)
                except Customer.DoesNotExist:
                    return queryset.none()
        
        elif getattr(user, 'is_technician', False):
             # Technicians can only see requests assigned to them
             return queryset.filter(assigned_technician=user)
             
        # Admin, Manager, and other staff -> Apply branch filtering
        return filter_queryset_for_user_branches(queryset, user, self.request)

    permission_classes = [IsAuthenticated, IsModuleEnabled('roadside')]

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
        permission_classes = [IsAuthenticated, IsModuleEnabled('roadside')]
        if action in ['list', 'retrieve', 'my_requests']:
            return [p() for p in permission_classes]
        elif action == 'create':
            # Allow customers to create their own requests
            if getattr(self.request.user, "role", None) == "customer":
                return [p() for p in permission_classes]
            permission_classes.append(HasAnyPermission(['manage_roadside', 'create_roadside_requests']))
            return [p() for p in permission_classes]
        elif action == 'cancel':
             return [p() for p in permission_classes]
        elif action == 'assign_dispatch':
            permission_classes.append(HasAnyPermission(['manage_roadside', 'dispatch_roadside']))
            return [p() for p in permission_classes]
        elif action in ['add_technician', 'remove_technician']:
            permission_classes.append(HasAnyPermission(['manage_roadside', 'dispatch_roadside']))
            return [p() for p in permission_classes]
        elif action in ['en_route', 'in_progress', 'arrive', 'complete', 'fail']:
             # Allow dispatchers OR the assigned technician (via object permission or get_queryset security)
             # But we must Block customers
             if getattr(self.request.user, "role", None) == "customer":
                 permission_classes.append(HasAnyPermission(['manage_roadside'])) # Effectively blocks customers
                 return [p() for p in permission_classes]
             return [p() for p in permission_classes]
        elif action in ['update', 'partial_update']:
             permission_classes.append(HasAnyPermission(['manage_roadside', 'dispatch_roadside']))
             return [p() for p in permission_classes]
        elif action in ['send_customer_sms', 'send_customer_email', 'suggested_message']:
             permission_classes.append(HasAnyPermission(['manage_roadside', 'dispatch_roadside']))
             return [p() for p in permission_classes]
        return [p() for p in permission_classes]
    
    def get_serializer_class(self):
        action = getattr(self, 'action', None)
        if action == 'create':
            return RoadsideRequestCreateSerializer
        elif action in ['update', 'partial_update']:
            return RoadsideRequestUpdateSerializer
        return RoadsideRequestSerializer
    

    
    
    def perform_create(self, serializer):
        from django.db import transaction
        from rest_framework.exceptions import ValidationError
        
        request = self.request
        # Determine branch
        branch_id = request.data.get('branch') or request.data.get('branch_id')
        branch = resolve_branch(request, branch_id=branch_id)
        
        if branch is None:
            logger.error(f"Branch resolution failed for roadside request. User: {request.user}, branch_id: {branch_id}, request_data: {request.data}")
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
                notification_triggers.roadside_requested(roadside_request)
            except Exception as e:
                logger.warning(f"Failed to send roadside request notification: {e}")

        transaction.on_commit(send_notification)

    def _handle_subscription_usage(self, request, roadside_request):
        """Helper to handle strict subscription logic inside a transaction"""
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
            logger.error(f"Error in _handle_subscription_usage: {e}", exc_info=True)
            # Ensure safe fallback - clear ALL subscription fields
            roadside_request.is_covered_by_subscription = False
            roadside_request.subscription_used = None
            roadside_request.subscription_usage_record = None
            roadside_request.subscription_allowance_deducted = False
            roadside_request.save()

    def _refund_subscription_allowance(self, request, roadside_request, reason):
        if not roadside_request.subscription_allowance_deducted or not roadside_request.subscription_usage_record:
            return

        usage_record = roadside_request.subscription_usage_record
        SubscriptionUsageService.refund_allowance(
            subscription=usage_record.subscription,
            usage_type=usage_record.usage_type,
            quantity_to_refund=usage_record.quantity_used,
            reference_type='roadside',
            reference_id=roadside_request.id,
            description=f"Refund: {reason} {roadside_request.request_number}",
            created_by=request.user
        )
        roadside_request.subscription_allowance_deducted = False
        roadside_request.save(update_fields=['subscription_allowance_deducted', 'updated_at'])
    
    @action(detail=True, methods=['post'])
    def assign_dispatch(self, request, pk=None):
        """Dispatch a roadside request to a technician (sets primary technician, changes status)"""
        roadside_request = self.get_object()
        
        try:
            technician_id = request.data.get('technician_id')
            if technician_id:
                from apps.accounts.models import User
                try:
                    technician = User.objects.get(id=technician_id)
                    if not technician.is_technician:
                        return Response(
                            {'error': 'Assigned user must be a technician'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    if roadside_request.branch and not technician.has_branch_access(roadside_request.branch):
                        return Response(
                            {'error': 'Technician does not have access to this request branch'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    roadside_request.mark_dispatched(technician=technician)
                    # Record in the dispatch log (upsert: ignore if already exists)
                    RoadsideDispatch.objects.get_or_create(
                        request=roadside_request,
                        technician=technician,
                        defaults={'dispatched_by': request.user}
                    )
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
            notification_triggers.roadside_dispatched(roadside_request)
        except Exception as e:
            logger.warning(f"Failed to send dispatch notification: {e}")
        
        serializer = self.get_serializer(roadside_request)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def add_technician(self, request, pk=None):
        """Add an additional technician to an active roadside request without changing its status"""
        roadside_request = self.get_object()

        if not roadside_request.is_active():
            return Response(
                {'error': 'Cannot add technician to a completed, cancelled, or failed request'},
                status=status.HTTP_400_BAD_REQUEST
            )

        technician_id = request.data.get('technician_id')
        if not technician_id:
            return Response({'error': 'technician_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.accounts.models import User
        try:
            technician = User.objects.get(id=technician_id)
        except User.DoesNotExist:
            return Response({'error': 'Technician not found'}, status=status.HTTP_400_BAD_REQUEST)

        if not technician.is_technician:
            return Response({'error': 'Assigned user must be a technician'}, status=status.HTTP_400_BAD_REQUEST)

        if roadside_request.branch and not technician.has_branch_access(roadside_request.branch):
            return Response(
                {'error': 'Technician does not have access to this request branch'},
                status=status.HTTP_400_BAD_REQUEST
            )

        notes = request.data.get('notes', '')
        dispatch, created = RoadsideDispatch.objects.get_or_create(
            request=roadside_request,
            technician=technician,
            defaults={'dispatched_by': request.user, 'notes': notes}
        )
        if not created:
            return Response(
                {'error': 'This technician is already assigned to this request'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # If this is the first dispatch record, set as primary technician & transition status
        if not roadside_request.assigned_technician:
            roadside_request.assigned_technician = technician
            if roadside_request.status == 'requested':
                roadside_request.status = 'dispatched'
                roadside_request.dispatched_at = timezone.now()
            roadside_request.save(update_fields=['assigned_technician', 'status', 'dispatched_at', 'updated_at'])

        try:
            notification_triggers.roadside_dispatched(roadside_request)
        except Exception as e:
            logger.warning(f"Failed to send dispatch notification for additional technician: {e}")

        serializer = self.get_serializer(roadside_request)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def remove_technician(self, request, pk=None):
        """Remove a technician from an active roadside request"""
        roadside_request = self.get_object()

        if not roadside_request.is_active():
            return Response(
                {'error': 'Cannot modify technicians on a completed, cancelled, or failed request'},
                status=status.HTTP_400_BAD_REQUEST
            )

        technician_id = request.data.get('technician_id')
        if not technician_id:
            return Response({'error': 'technician_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        deleted, _ = RoadsideDispatch.objects.filter(
            request=roadside_request, technician_id=technician_id
        ).delete()
        if not deleted:
            return Response({'error': 'Technician not found on this request'}, status=status.HTTP_404_NOT_FOUND)

        # If we just removed the primary technician, promote the next one
        if str(roadside_request.assigned_technician_id) == str(technician_id):
            next_dispatch = roadside_request.dispatches.select_related('technician').first()
            roadside_request.assigned_technician = next_dispatch.technician if next_dispatch else None
            roadside_request.save(update_fields=['assigned_technician', 'updated_at'])

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
            notification_triggers.roadside_arrived(roadside_request)
        except Exception as e:
            logger.warning(f"Failed to send arrival notification: {e}")
        
        serializer = self.get_serializer(roadside_request)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark roadside request as completed"""
        roadside_request = self.get_object()
        
        try:
            with transaction.atomic():
                roadside_request.mark_completed()
                invoice_id = self._create_completion_invoice(request, roadside_request)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except DjangoValidationError as e:
            return Response(
                {'error': e.messages[0] if hasattr(e, 'messages') else str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Send notification
        try:
            notification_triggers.roadside_completed(roadside_request)
        except Exception as e:
            logger.warning(f"Failed to send completion notification: {e}")
        
        serializer = self.get_serializer(roadside_request)
        response_data = serializer.data
        if invoice_id:
            response_data['invoice_id'] = invoice_id
        return Response(response_data)

    def _create_completion_invoice(self, request, roadside_request):
        if roadside_request.invoice_id:
            return roadside_request.invoice_id
        if roadside_request.is_covered_by_subscription:
            return None
        if not roadside_request.charge_amount or roadside_request.charge_amount <= 0:
            return None

        from apps.billing.models import Invoice, InvoiceLineItem

        branch = roadside_request.branch or resolve_branch(request)
        if not branch:
            if hasattr(roadside_request.customer, 'branch') and roadside_request.customer.branch:
                branch = roadside_request.customer.branch
            else:
                from apps.branches.models import Branch
                branch = Branch.objects.filter(is_active=True).first()
        if not branch:
            raise DjangoValidationError('A branch is required to invoice roadside service.')

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

        roadside_request.invoice = invoice
        roadside_request.notes = f"{roadside_request.notes}\nInvoice: {invoice.invoice_number}" if roadside_request.notes else f"Invoice: {invoice.invoice_number}"
        roadside_request.save(update_fields=['invoice', 'notes', 'updated_at'])
        return invoice.id
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a roadside request"""
        roadside_request = self.get_object()
        
        try:
            with transaction.atomic():
                self._refund_subscription_allowance(request, roadside_request, 'Cancelled Request')
                roadside_request.mark_cancelled()
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Failed to cancel roadside request {roadside_request.id}: {e}", exc_info=True)
            return Response(
                {'error': 'Failed to cancel request safely.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Send notification
        try:
            notification_triggers.roadside_cancelled(roadside_request)
        except Exception as e:
            logger.warning(f"Failed to send cancellation notification: {e}")
            
        serializer = self.get_serializer(roadside_request)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def fail(self, request, pk=None):
        """Mark roadside request as failed"""
        roadside_request = self.get_object()
        
        reason = request.data.get('reason', '')
        try:
            with transaction.atomic():
                self._refund_subscription_allowance(request, roadside_request, 'Failed Request')
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
        if getattr(request.user, 'role', '') == 'customer':
            customer_profile = getattr(request.user, 'customer_profile', None)
            if customer_profile and roadside_request.customer == customer_profile:
                is_customer = True
        
        if not is_customer and request.user.role not in ['admin', 'manager']: # Allow admins to test
             return Response(
                {'error': 'You do not have permission to rate this request'},
                status=status.HTTP_403_FORBIDDEN
            )

        rating = request.data.get('rating')
        feedback = request.data.get('customer_feedback') or request.data.get('feedback')
        if roadside_request.status != 'completed':
            return Response(
                {'error': 'Only completed roadside requests can be rated'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
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

    @action(detail=True, methods=['post'])
    def send_customer_email(self, request, pk=None):
        """Send Email to customer for this roadside request"""
        roadside_request = self.get_object()
        
        # Get message and subject from request body
        message = request.data.get('message', '').strip()
        subject = request.data.get('subject', f'Update on your Roadside Request {roadside_request.request_number}').strip()
        
        if not message:
            return Response(
                {'error': 'Message is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if customer has an email
        customer_user = roadside_request.customer.user if roadside_request.customer else None
        if not customer_user or not customer_user.email:
            return Response(
                {'error': 'Customer email address not available'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from apps.notifications_app.models import Notification
            from apps.notifications_app.services import NotificationService
            
            # Create a notification object
            notification = Notification.objects.create(
                recipient=customer_user,
                notification_type='custom',
                channel='email',
                priority='high',
                title=subject,
                message=message,
                data={
                    'request_id': roadside_request.id,
                    'request_number': roadside_request.request_number,
                },
                related_object_type='roadside',
                related_object_id=roadside_request.id
            )
            
            # Send the notification
            success = NotificationService().send_notification(notification)
            
            if success:
                return Response({
                    'success': True,
                    'message': 'Email sent successfully'
                })
            else:
                return Response(
                    {'error': 'Failed to send email. Please check notification logs.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        except Exception as e:
            logger.error(f"Error sending custom email: {e}", exc_info=True)
            return Response(
                {'error': f'An error occurred while sending email: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def suggested_message(self, request, pk=None):
        """Get a suggested message using the centralized AI service"""
        roadside_request = self.get_object()
        channel = request.query_params.get('channel', 'email')
        suggestion = AIService.get_suggested_message(roadside_request, channel=channel, context_type='roadside')
        return Response(suggestion)
