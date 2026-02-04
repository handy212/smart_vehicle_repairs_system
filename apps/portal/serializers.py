from rest_framework import serializers
from apps.inventory.models import ServiceBundle
from apps.vehicles.models import Vehicle
from apps.appointments.models import Appointment
from apps.workorders.models import WorkOrder
from apps.inspections.models import VehicleInspection
from apps.billing.models import Invoice

class PortalServiceBundleSerializer(serializers.ModelSerializer):
    price = serializers.DecimalField(source='total_price', max_digits=10, decimal_places=2, read_only=True)
    
    class Meta:
        model = ServiceBundle
        fields = ['id', 'name', 'description', 'price']

class PortalVehicleSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    
    class Meta:
        model = Vehicle
        fields = ['id', 'year', 'make', 'model', 'license_plate', 'vin', 'name']
        
    def get_name(self, obj):
        return f"{obj.year} {obj.make} {obj.model}"

class PortalBookingSerializer(serializers.ModelSerializer):
    service_bundle_id = serializers.IntegerField(write_only=True, required=False)
    vehicle_id = serializers.IntegerField(write_only=True)
    vehicle_info = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = Appointment
        fields = [
            'id', 'appointment_date', 'appointment_time', 'service_type', 
            'customer_concerns', 'vehicle_id', 'vehicle_info', 'service_bundle_id', 'status'
        ]
        read_only_fields = ['status', 'id', 'vehicle_info']
        
    def get_vehicle_info(self, obj):
        if obj.vehicle:
            return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
        return "Unknown Vehicle"

    def create(self, validated_data):
        vehicle_id = validated_data.pop('vehicle_id')
        service_bundle_id = validated_data.pop('service_bundle_id', None)
        user = self.context['request'].user
        
        # Resolve customer profile
        customer = getattr(user, 'customer_profile', None)
        if not customer:
            from apps.customers.models import Customer
            customer = Customer.objects.filter(user=user).first()
            
        if not customer:
            raise serializers.ValidationError("No customer profile found for this user.")
            
        # Verify vehicle belongs to customer
        try:
            vehicle = Vehicle.objects.get(id=vehicle_id, owner=customer)
        except Vehicle.DoesNotExist:
            raise serializers.ValidationError({"vehicle_id": "Invalid vehicle or not owned by you."})
            
        if service_bundle_id:
            try:
                service_bundle = ServiceBundle.objects.get(id=service_bundle_id)
                validated_data['service_bundle'] = service_bundle
            except ServiceBundle.DoesNotExist:
                pass # Or raise error, but frontend might send none
            
        validated_data['customer'] = customer
        validated_data['vehicle'] = vehicle
        
        appointment = Appointment.objects.create(**validated_data)
        return appointment

class PortalHistorySerializer(serializers.ModelSerializer):
    vehicle_name = serializers.SerializerMethodField()
    
    class Meta:
        model = WorkOrder
        fields = ['id', 'work_order_number', 'vehicle_name', 'status', 'created_at', 'total_amount']
        
    def get_vehicle_name(self, obj):
        return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"

class PortalInspectionSerializer(serializers.ModelSerializer):
    vehicle_name = serializers.SerializerMethodField()
    template_name = serializers.CharField(source='template.name', read_only=True)
    
    class Meta:
        model = VehicleInspection
        fields = [
            'id', 'inspection_number', 'vehicle_name', 'template_name', 
            'inspection_date', 'overall_result', 'status'
        ]
        
    def get_vehicle_name(self, obj):
        return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"

class PortalInvoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invoice
        fields = ['id', 'invoice_number', 'invoice_date', 'total', 'status']
