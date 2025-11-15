"""
Serializers for appointments app
"""
from rest_framework import serializers
from django.utils import timezone
from .models import Appointment, ServiceBay, AppointmentReminder


class ServiceBaySerializer(serializers.ModelSerializer):
    """Serializer for service bays"""
    is_available = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = ServiceBay
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class AppointmentListSerializer(serializers.ModelSerializer):
    """Serializer for appointment list view"""
    customer_name = serializers.CharField(source='customer.user.get_full_name', read_only=True)
    customer_number = serializers.CharField(source='customer.customer_number', read_only=True)
    vehicle_display = serializers.CharField(source='vehicle.display_name', read_only=True)
    vehicle_plate = serializers.CharField(source='vehicle.license_plate', read_only=True)
    service_bay_name = serializers.CharField(source='service_bay.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    technician_names = serializers.CharField(read_only=True)
    is_today = serializers.BooleanField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    end_time = serializers.TimeField(read_only=True)
    
    class Meta:
        model = Appointment
        fields = [
            'id', 'appointment_number', 'customer', 'customer_name', 'customer_number',
            'vehicle', 'vehicle_display', 'vehicle_plate', 'appointment_date',
            'appointment_time', 'end_time', 'estimated_duration', 'service_type',
            'priority', 'status', 'service_bay', 'service_bay_name', 'branch', 'branch_name',
            'technician_names', 'estimated_cost', 'is_today', 'is_overdue',
            'checked_in', 'created_at'
        ]


class AppointmentDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer for appointments"""
    customer_name = serializers.CharField(source='customer.user.get_full_name', read_only=True)
    customer_number = serializers.CharField(source='customer.customer_number', read_only=True)
    customer_phone = serializers.CharField(source='customer.user.phone', read_only=True)
    customer_email = serializers.CharField(source='customer.user.email', read_only=True)
    vehicle_display = serializers.CharField(source='vehicle.display_name', read_only=True)
    vehicle_vin = serializers.CharField(source='vehicle.vin', read_only=True)
    vehicle_plate = serializers.CharField(source='vehicle.license_plate', read_only=True)
    service_bay_name = serializers.CharField(source='service_bay.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    confirmed_by_name = serializers.CharField(source='confirmed_by.get_full_name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    technician_names = serializers.CharField(read_only=True)
    is_today = serializers.BooleanField(read_only=True)
    is_past = serializers.BooleanField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    end_time = serializers.TimeField(read_only=True)
    
    class Meta:
        model = Appointment
        fields = '__all__'
        read_only_fields = [
            'id', 'appointment_number', 'created_by', 'created_at', 'updated_at',
            'confirmed_by', 'confirmed_at', 'reminder_sent', 'reminder_sent_at',
            'check_in_time', 'cancelled_at'
        ]


class AppointmentCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating appointments"""
    
    class Meta:
        model = Appointment
        fields = [
            'customer', 'vehicle', 'branch', 'appointment_date', 'appointment_time',
            'estimated_duration', 'service_type', 'priority', 'customer_concerns',
            'special_instructions', 'estimated_cost', 'service_bay',
            'assigned_technicians'
        ]
    
    def validate(self, attrs):
        """Validate appointment data"""
        appointment_date = attrs.get('appointment_date')
        appointment_time = attrs.get('appointment_time')
        
        # Check if date is in the past
        from datetime import datetime
        appointment_datetime = datetime.combine(appointment_date, appointment_time)
        # Make the datetime timezone-aware for comparison
        appointment_datetime = timezone.make_aware(appointment_datetime)
        if appointment_datetime < timezone.now():
            raise serializers.ValidationError({
                'appointment_date': 'Cannot schedule appointments in the past'
            })
        
        # Check if vehicle belongs to customer
        vehicle = attrs.get('vehicle')
        customer = attrs.get('customer')
        if vehicle.owner != customer:
            raise serializers.ValidationError({
                'vehicle': 'Vehicle does not belong to the selected customer'
            })
        
        # Check service bay availability (if specified)
        service_bay = attrs.get('service_bay')
        if service_bay:
            # Check for conflicts
            conflicts = Appointment.objects.filter(
                service_bay=service_bay,
                appointment_date=appointment_date,
                appointment_time=appointment_time,
                status__in=['pending', 'confirmed', 'in_progress']
            )
            if self.instance:
                conflicts = conflicts.exclude(pk=self.instance.pk)
            
            if conflicts.exists():
                raise serializers.ValidationError({
                    'service_bay': 'Service bay is already booked for this time slot'
                })
        
        return attrs


class AppointmentUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating appointments"""
    
    class Meta:
        model = Appointment
        fields = [
            'branch', 'appointment_date', 'appointment_time', 'estimated_duration',
            'service_type', 'priority', 'customer_concerns', 'special_instructions',
            'estimated_cost', 'status', 'service_bay', 'assigned_technicians',
            'confirmation_method', 'cancellation_reason'
        ]


class AppointmentReminderSerializer(serializers.ModelSerializer):
    """Serializer for appointment reminders"""
    appointment_number = serializers.CharField(source='appointment.appointment_number', read_only=True)
    customer_name = serializers.CharField(source='appointment.customer.user.get_full_name', read_only=True)
    
    class Meta:
        model = AppointmentReminder
        fields = [
            'id', 'appointment', 'appointment_number', 'customer_name',
            'reminder_type', 'scheduled_send_time', 'status', 'sent_at',
            'error_message', 'created_at'
        ]
        read_only_fields = ['id', 'sent_at', 'created_at']


class CalendarDaySerializer(serializers.Serializer):
    """Serializer for calendar day view"""
    date = serializers.DateField()
    appointments = AppointmentListSerializer(many=True)
    total_appointments = serializers.IntegerField()
    available_slots = serializers.IntegerField()


class TechnicianScheduleSerializer(serializers.Serializer):
    """Serializer for technician schedule"""
    technician_id = serializers.IntegerField()
    technician_name = serializers.CharField()
    date = serializers.DateField()
    appointments = AppointmentListSerializer(many=True)
    total_hours = serializers.DecimalField(max_digits=5, decimal_places=2)
