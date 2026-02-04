from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from datetime import datetime, timedelta, time
from django.db.models import Sum
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiTypes, inline_serializer
from rest_framework import serializers

from apps.workorders.models import WorkOrder
from apps.appointments.models import Appointment
from apps.vehicles.models import Vehicle
from apps.inventory.models import ServiceBundle
from apps.customers.models import Customer
from apps.inspections.models import VehicleInspection
from apps.billing.models import Invoice

from .serializers import (
    PortalServiceBundleSerializer, 
    PortalVehicleSerializer, 
    PortalBookingSerializer, 
    PortalHistorySerializer,
    PortalInspectionSerializer,
    PortalInvoiceSerializer
)

class PortalViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def _get_customer(self, user):
        """Helper to get customer profile for user"""
        if hasattr(user, 'customer_profile'):
            return user.customer_profile
        return Customer.objects.filter(user=user).first()

    @extend_schema(responses=PortalServiceBundleSerializer(many=True))
    @action(detail=False, methods=['get'])
    def services(self, request):
        """
        List available services/bundles for booking
        """
        bundles = ServiceBundle.objects.filter(is_active=True).order_by('name')
        serializer = PortalServiceBundleSerializer(bundles, many=True)
        return Response(serializer.data)

    @extend_schema(responses=PortalVehicleSerializer(many=True))
    @action(detail=False, methods=['get'])
    def vehicles(self, request):
        """
        List authenticated user's vehicles
        """
        customer = self._get_customer(request.user)
        if not customer:
            return Response([], status=status.HTTP_200_OK)
            
        vehicles = Vehicle.objects.filter(owner=customer)
        serializer = PortalVehicleSerializer(vehicles, many=True)
        return Response(serializer.data)

    @extend_schema(responses=PortalHistorySerializer(many=True))
    @action(detail=False, methods=['get'])
    def history(self, request):
        """
        List service history (WorkOrders) for user's vehicles
        """
        customer = self._get_customer(request.user)
        if not customer:
            return Response([], status=status.HTTP_200_OK)

        orders = WorkOrder.objects.filter(customer=customer).order_by('-created_at')
        serializer = PortalHistorySerializer(orders, many=True)
        return Response(serializer.data)

    @extend_schema(responses=PortalInspectionSerializer(many=True))
    @action(detail=False, methods=['get'])
    def inspections(self, request):
        """
        List inspections for user's vehicles
        """
        customer = self._get_customer(request.user)
        if not customer:
            return Response([], status=status.HTTP_200_OK)

        inspections = VehicleInspection.objects.filter(vehicle__owner=customer).order_by('-inspection_date')
        serializer = PortalInspectionSerializer(inspections, many=True)
        return Response(serializer.data)
    
    @extend_schema(responses=PortalInvoiceSerializer(many=True))
    @action(detail=False, methods=['get'])
    def invoices(self, request):
        """
        List invoices
        """
        customer = self._get_customer(request.user)
        if not customer:
            return Response([], status=status.HTTP_200_OK)
            
        invoices = Invoice.objects.filter(customer=customer).order_by('-invoice_date')
        serializer = PortalInvoiceSerializer(invoices, many=True)
        return Response(serializer.data)

    @extend_schema(
        request=PortalBookingSerializer,
        responses=PortalBookingSerializer
    )
    @action(detail=False, methods=['post'])
    def bookings(self, request):
        """
        Create a new appointment
        """
        serializer = PortalBookingSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        parameters=[
            OpenApiParameter('date', OpenApiTypes.DATE, description='Date to check (YYYY-MM-DD)')
        ]
    )
    @action(detail=False, methods=['get'])
    def availability(self, request):
        """
        Check available time slots for a given date
        """
        date_str = request.query_params.get('date')
        if not date_str:
            return Response({'error': 'Date parameter required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'Invalid date format (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)
            
        if target_date < timezone.now().date():
            return Response({'error': 'Cannot book in the past'}, status=status.HTTP_400_BAD_REQUEST)

        # Basic Business Hours: 8:00 AM - 5:00 PM (17:00)
        start_hour = 8
        end_hour = 17
        slot_duration = 60 # minutes
        
        available_slots = []
        current_time = datetime.combine(target_date, time(start_hour, 0))
        end_time = datetime.combine(target_date, time(end_hour, 0))
        
        # If today, start from next hour
        now = timezone.now()
        if target_date == now.date():
            next_hour = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
            if next_hour > current_time:
                current_time = max(next_hour, current_time)

        while current_time < end_time:
            slot_time = current_time.time()
            
            slot_appointments = Appointment.objects.filter(
                appointment_date=target_date,
                appointment_time=slot_time,
                status__in=['pending', 'confirmed']
            ).count()
            
            # Simple 3-bay logic
            if slot_appointments < 5:
                available_slots.append(slot_time.strftime('%H:%M'))
            
            current_time += timedelta(minutes=slot_duration)
            
        return Response({'date': date_str, 'slots': available_slots})
    
    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """
        Get dashboard statistics and recent activity
        """
        customer = self._get_customer(request.user)
        if not customer:
            return Response({'stats': {}, 'recent_appointments': [], 'recent_invoices': []})
            
        # Stats
        total_vehicles = Vehicle.objects.filter(owner=customer).count()
        upcoming_appointments_count = Appointment.objects.filter(
            customer=customer, 
            status__in=['pending', 'confirmed'],
            appointment_date__gte=timezone.now().date()
        ).count()
        
        pending_invoices_count = Invoice.objects.filter(
            customer=customer,
            status__in=['sent', 'viewed', 'partial', 'overdue']
        ).count()
        
        total_spent = Invoice.objects.filter(
            customer=customer,
            status__in=['paid', 'partial']
        ).aggregate(Sum('total'))['total__sum'] or 0
        
        # Recent Appointments (Upcoming top 5)
        recent_appointments = Appointment.objects.filter(
            customer=customer,
            appointment_date__gte=timezone.now().date()
        ).order_by('appointment_date')[:5]
        
        # Recent Invoices (Top 5)
        recent_invoices = Invoice.objects.filter(
            customer=customer
        ).order_by('-invoice_date')[:5]
        
        return Response({
            'stats': {
                'total_vehicles': total_vehicles,
                'upcoming_appointments_count': upcoming_appointments_count,
                'pending_invoices_count': pending_invoices_count,
                'total_spent': total_spent
            },
            'recent_appointments': PortalBookingSerializer(recent_appointments, many=True).data,
            'recent_invoices': PortalInvoiceSerializer(recent_invoices, many=True).data
        })
