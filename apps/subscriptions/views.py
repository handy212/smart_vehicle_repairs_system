"""
Views for subscriptions app
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Q, Sum, Count, Avg, F
from django.utils import timezone
from decimal import Decimal

from .models import Package, Subscription, SubscriptionUsage
from .serializers import (
    PackageSerializer,
    PackageListSerializer,
    PackageCreateUpdateSerializer,
    SubscriptionSerializer,
    SubscriptionListSerializer,
    SubscriptionCreateSerializer,
    SubscriptionUpdateSerializer,
    SubscriptionUsageSerializer,
    SubscriptionUsageCreateSerializer,
)
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from apps.accounts.permissions import (
    HasPermission,
    HasAnyPermission,
    IsModuleEnabled,
    user_can_manage_subscriptions,
    user_has_permission,
)


def user_can_access_subscription(user, subscription):
    if user_can_manage_subscriptions(user):
        return True
    if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
        return subscription.customer_id == user.customer_profile.id
    return False
from apps.customers.models import Customer


class PackageViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing subscription packages
    """
    queryset = Package.objects.all()
    permission_classes = [IsAuthenticated, IsModuleEnabled('subscriptions')]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve', 'available', 'stats']:
            return [IsAuthenticated(), IsModuleEnabled('subscriptions'), HasPermission('view_subscriptions')()]
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsModuleEnabled('subscriptions'), HasPermission('manage_subscriptions')]
        return [IsAuthenticated(), IsModuleEnabled('subscriptions')(), HasPermission('view_subscriptions')()]
    
    def get_serializer_class(self):
        if self.action == 'list':
            return PackageListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return PackageCreateUpdateSerializer
        return PackageSerializer
    
    def perform_create(self, serializer):
        """Set created_by when creating a package"""
        serializer.save(created_by=self.request.user)
    
    @action(detail=False, methods=['get'])
    def available(self, request):
        """Get all available (active) packages for purchase"""
        packages = Package.objects.filter(is_active=True)
        serializer = PackageListSerializer(packages, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """Get statistics for a package"""
        package = self.get_object()
        
        subscriptions = Subscription.objects.filter(package=package)
        active_subscriptions = subscriptions.filter(status='active')
        
        stats = {
            'package_id': package.id,
            'package_name': package.name,
            'total_subscriptions': subscriptions.count(),
            'active_subscriptions': active_subscriptions.count(),
            'expired_subscriptions': subscriptions.filter(status='expired').count(),
            'cancelled_subscriptions': subscriptions.filter(status='cancelled').count(),
            'total_revenue': float(subscriptions.aggregate(
                total=Sum('purchase_price')
            )['total'] or Decimal('0')),
            'monthly_recurring_revenue': float(
                (active_subscriptions.count() * package.price) / package.duration_months
            ) if package.duration_months > 0 else 0,
        }
        
        return Response(stats)


class SubscriptionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing customer subscriptions
    """
    queryset = Subscription.objects.all()
    permission_classes = [IsAuthenticated, IsModuleEnabled('subscriptions')]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['customer', 'vehicle', 'status', 'payment_status', 'package', 'auto_renew']
    search_fields = ['subscription_number', 'customer__user__first_name', 'customer__user__last_name', 'package__name']
    ordering_fields = ['start_date', 'end_date', 'created_at', 'status']
    ordering = ['-created_at']
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve', 'my_subscriptions']:
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated(), IsModuleEnabled('subscriptions')]
            return [IsAuthenticated(), IsModuleEnabled('subscriptions'), HasPermission('view_subscriptions')()]
        elif self.action == 'create':
            # Allow customers to create their own subscriptions without extra perms
            if getattr(self.request.user, "role", None) == "customer":
                return [IsAuthenticated(), IsModuleEnabled('subscriptions')]
            return [IsAuthenticated(), IsModuleEnabled('subscriptions'), HasAnyPermission(['manage_subscriptions', 'create_subscriptions'])]
        elif self.action in ['update', 'partial_update', 'cancel', 'renew', 'destroy', 'change_plan']:
            return [IsAuthenticated(), IsModuleEnabled('subscriptions'), HasAnyPermission(['manage_subscriptions', 'cancel_subscriptions'])]
        elif self.action in ['usage', 'remaining']:
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated(), IsModuleEnabled('subscriptions')]
            return [IsAuthenticated(), IsModuleEnabled('subscriptions'), HasPermission('view_subscriptions')()]
        return [IsAuthenticated(), IsModuleEnabled('subscriptions'), HasPermission('view_subscriptions')()]
    
    def get_serializer_class(self):
        if self.action == 'list':
            return SubscriptionListSerializer
        elif self.action == 'create':
            return SubscriptionCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return SubscriptionUpdateSerializer
        return SubscriptionSerializer
    
    def get_queryset(self):
        """
        Filter subscriptions based on user role:
        - Admin/Manager: all subscriptions
        - Customer: only their own subscriptions
        """
        user = self.request.user
        
        queryset = Subscription.objects.select_related('customer', 'package', 'vehicle')

        if user_can_manage_subscriptions(user):
            return queryset
        elif user.role == 'customer' and hasattr(user, 'customer_profile'):
            customer = user.customer_profile
            return queryset.filter(customer=customer)
        
        return Subscription.objects.none()
    
    def _create_subscription_with_invoice(self, serializer):
        """Create a subscription through the service and return its invoice."""
        from .services import SubscriptionService
        from rest_framework.exceptions import ValidationError
        
        # If the caller is a customer, force the subscription to that customer
        user = self.request.user
        customer = None
        if getattr(user, "role", None) == "customer" and hasattr(user, "customer_profile"):
            customer = user.customer_profile
        else:
            customer = serializer.validated_data.get("customer")
        
        if not customer:
            raise ValidationError("Customer is required")
        
        package = serializer.validated_data.get("package")
        vehicle = serializer.validated_data.get("vehicle")
        if not package:
            raise ValidationError("Package is required")
        if not vehicle:
            raise ValidationError({"vehicle": "Vehicle is required"})
        if vehicle.owner_id != customer.id:
            raise ValidationError({"vehicle": "Vehicle does not belong to this customer"})
        
        auto_renew = serializer.validated_data.get("auto_renew", False)
        start_date = serializer.validated_data.get("start_date")
        
        # Use service to create subscription with invoice
        subscription, invoice = SubscriptionService.create_subscription_with_invoice(
            customer=customer,
            package=package,
            vehicle=vehicle,
            start_date=start_date,
            auto_renew=auto_renew,
            created_by=user,
            request=self.request
        )
        
        return subscription, invoice

    def create(self, request, *args, **kwargs):
        """Create a subscription and return the generated invoice reference."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        subscription, invoice = self._create_subscription_with_invoice(serializer)
        response_serializer = SubscriptionSerializer(subscription, context=self.get_serializer_context())
        data = dict(response_serializer.data)
        data['invoice_id'] = invoice.id
        data['invoice_number'] = invoice.invoice_number
        return Response(data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        """Set purchase date and handle subscription creation with invoice."""
        subscription, _invoice = self._create_subscription_with_invoice(serializer)
        serializer.instance = subscription
    
    @action(detail=False, methods=['get'])
    def my_subscriptions(self, request):
        """Get current user's subscriptions (for customer portal)"""
        if request.user.role != 'customer' or not hasattr(request.user, 'customer_profile'):
            return Response(
                {'detail': 'Only customers can view their subscriptions'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        customer = request.user.customer_profile
        subscriptions = Subscription.objects.filter(customer=customer)
        serializer = SubscriptionListSerializer(subscriptions, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def usage(self, request, pk=None):
        """Get usage history for a subscription"""
        subscription = self.get_object()
        
        # Check permissions
        if not user_can_access_subscription(request.user, subscription):
            return Response(
                {'detail': 'You do not have permission to view this subscription'},
                status=status.HTTP_403_FORBIDDEN,
            )

        usage_records = subscription.usage_records.all()
        serializer = SubscriptionUsageSerializer(usage_records, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def remaining(self, request, pk=None):
        """Get remaining allowances for a subscription"""
        subscription = self.get_object()
        
        # Check permissions
        if not user_can_access_subscription(request.user, subscription):
            return Response(
                {'detail': 'You do not have permission to view this subscription'},
                status=status.HTTP_403_FORBIDDEN,
            )

        allowances = subscription.get_all_remaining_allowances()
        initial_allowances = subscription.package.features
        
        # Calculate totals used
        usage_summary = {}
        for feature_type in initial_allowances.keys():
            if isinstance(initial_allowances[feature_type], (int, float)):
                total_used = subscription.usage_records.filter(
                    usage_type=feature_type
                ).aggregate(
                    total=Sum('quantity_used')
                )['total'] or 0
                
                usage_summary[feature_type] = {
                    'initial': initial_allowances[feature_type],
                    'used': float(total_used),
                    'remaining': allowances.get(feature_type, 0)
                }
        
        return Response({
            'subscription_id': subscription.id,
            'subscription_number': subscription.subscription_number,
            'status': subscription.status,
            'is_active': subscription.is_active(),
            'days_remaining': subscription.days_remaining(),
            'allowances': usage_summary
        })

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """Get compact subscription usage statistics."""
        subscription = self.get_object()
        allowances = subscription.get_all_remaining_allowances()
        usage_summary = {}

        for feature_type, initial in (subscription.package.features or {}).items():
            if isinstance(initial, (int, float)):
                total_used = subscription.usage_records.filter(
                    usage_type=feature_type
                ).aggregate(total=Sum('quantity_used'))['total'] or Decimal('0')
                usage_summary[feature_type] = {
                    'initial': initial,
                    'used': float(total_used),
                    'remaining': allowances.get(feature_type, 0),
                }

        return Response({
            'days_remaining': subscription.days_remaining(),
            'usage_summary': usage_summary,
            'remaining_allowances': allowances,
        })
    
    @action(detail=True, methods=['post'])
    def renew(self, request, pk=None):
        """Renew a subscription and create invoice"""
        from .services import SubscriptionService
        from rest_framework.exceptions import ValidationError
        
        subscription = self.get_object()
        
        # Check permissions
        if not user_can_access_subscription(request.user, subscription):
            return Response(
                {'detail': 'You do not have permission to renew this subscription'},
                status=status.HTTP_403_FORBIDDEN,
            )

        months = request.data.get('months', None)
        if months:
            try:
                months = int(months)
            except (ValueError, TypeError):
                return Response(
                    {'detail': 'Invalid months value'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        try:
            subscription, invoice = SubscriptionService.renew_subscription(
                subscription, 
                months=months,
                created_by=request.user,
                request=request
            )
            serializer = SubscriptionSerializer(subscription)
            serializer._invoice_id = invoice.id
            return Response({
                'subscription': serializer.data,
                'invoice_id': invoice.id,
                'invoice_number': invoice.invoice_number,
                'message': 'Subscription renewed. Please pay the invoice to activate.'
            })
        except ValidationError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a subscription"""
        subscription = self.get_object()
        
        # Check permissions
        if not user_can_access_subscription(request.user, subscription):
            return Response(
                {'detail': 'You do not have permission to cancel this subscription'},
                status=status.HTTP_403_FORBIDDEN,
            )

        reason = request.data.get('reason', '')
        subscription.cancel(reason=reason)
        serializer = SubscriptionSerializer(subscription)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def change_plan(self, request, pk=None):
        """Change subscription package plan"""
        subscription = self.get_object()
        
        # Check permissions (same as cancel/renew)
        if not user_can_manage_subscriptions(request.user):
            return Response(
                {'detail': 'You do not have permission to change the plan'},
                status=status.HTTP_403_FORBIDDEN,
            )
        
        package_id = request.data.get('package_id')
        if not package_id:
            return Response(
                {'detail': 'package_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            new_package = Package.objects.get(pk=package_id, is_active=True)
            subscription.change_package(new_package)
            
            # Record plan change in usage description for history if needed
            # For now just return updated subscription
            serializer = SubscriptionSerializer(subscription)
            return Response({
                'subscription': serializer.data,
                'message': f'Subscription plan changed to {new_package.name} successfully.'
            })
        except Package.DoesNotExist:
            return Response(
                {'detail': 'Invalid or inactive package ID'},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'detail': f'Error changing plan: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Generate membership card PDF"""
        from django.template.loader import render_to_string
        from django.http import HttpResponse
        import logging
        import traceback
        
        logger = logging.getLogger(__name__)
        subscription = self.get_object()
        
        try:
            from django.conf import settings
            from weasyprint import HTML
            
            context = {
                'subscription': subscription,
                'generated_at': timezone.now(),
            }
            
            # Render HTML template
            html_string = render_to_string('subscriptions/membership_card.html', context, request=request)
            
            # Generate PDF
            base_url = getattr(settings, 'INTERNAL_API_URL', 'http://localhost:8000')
            pdf = HTML(string=html_string, base_url=base_url).write_pdf()
            
            # Return PDF response
            response = HttpResponse(pdf, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="membership_card_{subscription.subscription_number}.pdf"'
            return response
            
        except Exception as e:
            logger.error(f"Membership card PDF generation error: {str(e)}\n{traceback.format_exc()}")
            return Response(
                {"detail": f"Error generating PDF: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class SubscriptionUsageViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing subscription usage records
    """
    queryset = SubscriptionUsage.objects.all()
    permission_classes = [IsAuthenticated, IsModuleEnabled('subscriptions')]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), IsModuleEnabled('subscriptions'), HasAnyPermission(['view_subscriptions', 'manage_subscriptions'])]
        elif self.action == 'create':
            return [IsAuthenticated(), IsModuleEnabled('subscriptions'), HasAnyPermission(['manage_subscriptions', 'record_usage'])]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), HasPermission('manage_subscriptions')]
        return [IsAuthenticated(), IsModuleEnabled('subscriptions')]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return SubscriptionUsageCreateSerializer
        return SubscriptionUsageSerializer
    
    def get_queryset(self):
        """
        Filter usage records based on user role:
        - Admin/Manager: all usage records
        - Others: none (or filtered by their subscriptions)
        """
        user = self.request.user
        
        if user_can_manage_subscriptions(user):
            return SubscriptionUsage.objects.all()
        elif user.role == 'customer' and hasattr(user, 'customer_profile'):
            customer = user.customer_profile
            subscriptions = Subscription.objects.filter(customer=customer)
            return SubscriptionUsage.objects.filter(subscription__in=subscriptions)
        
        return SubscriptionUsage.objects.none()
    
    def perform_create(self, serializer):
        """Set created_by when creating usage record"""
        serializer.save(created_by=self.request.user)
