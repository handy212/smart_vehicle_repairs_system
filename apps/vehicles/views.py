"""
Views for vehicles app
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import HasPermission, user_has_permission
from apps.branches.utils import filter_queryset_for_user_branches
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, F
from django.utils import timezone

from .models import Vehicle, VehicleMileageHistory, VehicleDocument, VehiclePhoto, ServiceType, VehicleServiceSchedule
from .serializers import (
    VehicleListSerializer,
    VehicleDetailSerializer,
    VehicleCreateSerializer,
    VehicleUpdateSerializer,
    VehicleMileageHistorySerializer,
    VehicleOwnershipHistorySerializer,
    VehicleDocumentSerializer,
    VehiclePhotoSerializer,
    VINDecodeSerializer,
    ServiceTypeSerializer,
    ServiceTypeListSerializer,
    VehicleServiceScheduleSerializer,
    VehicleServiceScheduleListSerializer,
    VehicleServiceScheduleCreateSerializer,
    VehicleServiceScheduleUpdateSerializer
)
from .vin_decoder import VehicleVINDecoder, get_vehicle_specs


class VehicleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for vehicle operations
    
    list: Get list of vehicles
    retrieve: Get vehicle details
    create: Register new vehicle
    update: Update vehicle information
    destroy: Delete vehicle
    """
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        user = self.request.user
        
        # Customers can view their own vehicles without view_vehicles permission
        if (self.action == 'list' or self.action == 'retrieve') and getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
            return [IsAuthenticated()]
        elif self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), HasPermission('view_vehicles')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('create_vehicles')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('edit_vehicles')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('delete_vehicles')]
        return [IsAuthenticated()]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'make', 'model', 'year', 'engine_type', 'transmission_type', 'owner']
    search_fields = ['vin', 'license_plate', 'make', 'model', 'owner__user__first_name', 
                     'owner__user__last_name', 'owner__company_name']
    ordering_fields = ['year', 'make', 'model', 'current_mileage', 'created_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Get queryset with optimizations"""
        queryset = Vehicle.objects.select_related('owner', 'owner__user').prefetch_related(
            'mileage_history', 'documents', 'photos'
        )
        
        # If user is a customer, only show their own vehicles
        user = self.request.user
        if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
            queryset = queryset.filter(owner=user.customer_profile)
        
        return queryset
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return VehicleListSerializer
        elif self.action == 'create':
            return VehicleCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return VehicleUpdateSerializer
        return VehicleDetailSerializer
    
    def destroy(self, request, *args, **kwargs):
        """
        Delete a vehicle with proper error handling for protected foreign keys
        """
        vehicle = self.get_object()
        
        try:
            return super().destroy(request, *args, **kwargs)
        except Exception as e:
            from django.db.models import ProtectedError
            from rest_framework.exceptions import ValidationError
            
            # Check if it's a ProtectedError
            if isinstance(e, ProtectedError):
                # Get the protected objects
                protected_objects = list(e.protected_objects)
                
                # Build a user-friendly error message
                error_details = []
                
                # Check for subscriptions
                subscriptions = [obj for obj in protected_objects if hasattr(obj, 'subscription_number')]
                if subscriptions:
                    sub_numbers = [f"{sub.subscription_number}" for sub in subscriptions]
                    error_details.append(f"{len(subscriptions)} subscription(s): {', '.join(sub_numbers)}")
                
                # Check for work orders
                work_orders = [obj for obj in protected_objects if hasattr(obj, 'work_order_number')]
                if work_orders:
                    wo_numbers = [f"{wo.work_order_number}" for wo in work_orders]
                    error_details.append(f"{len(work_orders)} work order(s): {', '.join(wo_numbers)}")
                
                # Check for invoices
                invoices = [obj for obj in protected_objects if hasattr(obj, 'invoice_number')]
                if invoices:
                    inv_numbers = [f"{inv.invoice_number}" for inv in invoices]
                    error_details.append(f"{len(invoices)} invoice(s): {', '.join(inv_numbers)}")
                
                # Check for roadside requests
                roadside_requests = [obj for obj in protected_objects if hasattr(obj, 'request_number')]
                if roadside_requests:
                    req_numbers = [f"{req.request_number}" for req in roadside_requests]
                    error_details.append(f"{len(roadside_requests)} roadside request(s): {', '.join(req_numbers)}")
                
                # Generic fallback for other protected objects
                other_objects = [
                    obj for obj in protected_objects 
                    if not any([
                        hasattr(obj, 'subscription_number'),
                        hasattr(obj, 'work_order_number'),
                        hasattr(obj, 'invoice_number'),
                        hasattr(obj, 'request_number')
                    ])
                ]
                if other_objects:
                    error_details.append(f"{len(other_objects)} other related record(s)")
                
                # Build the error message
                if error_details:
                    error_message = (
                        f"Cannot delete this vehicle because it is referenced by: {', '.join(error_details)}. "
                        f"Please remove or reassign these records before deleting the vehicle."
                    )
                else:
                    error_message = (
                        "Cannot delete this vehicle because it is referenced by other records. "
                        "Please remove or reassign these records before deleting the vehicle."
                    )
                
                return Response(
                    {'detail': error_message},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Re-raise other exceptions
            raise
    
    @action(detail=True, methods=['post'])
    def reassign_owner(self, request, pk=None):
        """
        Reassign vehicle ownership from one customer to another.
        
        Body: {
            "new_owner_id": 123,
            "transfer_date": "2024-01-15",  # Optional, defaults to today
            "notes": "Vehicle sold to new owner"  # Optional
        }
        """
        vehicle = self.get_object()
        new_owner_id = request.data.get('new_owner_id')
        transfer_date = request.data.get('transfer_date')
        notes = request.data.get('notes', '')
        
        if not new_owner_id:
            return Response(
                {'error': 'new_owner_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from apps.customers.models import Customer
            
            # Get new owner
            try:
                new_owner = Customer.objects.get(pk=new_owner_id)
            except Customer.DoesNotExist:
                return Response(
                    {'error': f'Customer with ID {new_owner_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Validate that new owner is different from current owner
            if vehicle.owner.id == new_owner.id:
                return Response(
                    {'error': 'New owner must be different from current owner'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Parse transfer date
            if transfer_date:
                try:
                    transfer_date = timezone.datetime.strptime(transfer_date, '%Y-%m-%d').date()
                except ValueError:
                    return Response(
                        {'error': 'Invalid transfer_date format. Use YYYY-MM-DD.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            else:
                transfer_date = timezone.now().date()
            
            # Store old owner info for logging
            old_owner = vehicle.owner
            old_owner_name = old_owner.user.get_full_name() if old_owner.user else str(old_owner)
            new_owner_name = new_owner.user.get_full_name() if new_owner.user else str(new_owner)
            
            # Reassign ownership
            vehicle.owner = new_owner
            vehicle.save(update_fields=['owner', 'updated_at'])
            
            # Create ownership history record
            from .models import VehicleOwnershipHistory
            VehicleOwnershipHistory.objects.create(
                vehicle=vehicle,
                previous_owner=old_owner,
                new_owner=new_owner,
                transfer_date=transfer_date,
                transferred_by=request.user,
                notes=notes
            )
            
            # Add note to vehicle if notes field exists
            if hasattr(vehicle, 'notes'):
                ownership_note = f"\n\n[Ownership Transfer - {transfer_date}]\n"
                ownership_note += f"Transferred from: {old_owner_name} (ID: {old_owner.id})\n"
                ownership_note += f"Transferred to: {new_owner_name} (ID: {new_owner.id})\n"
                if notes:
                    ownership_note += f"Notes: {notes}\n"
                ownership_note += f"Transferred by: {request.user.get_full_name()}"
                
                vehicle.notes = (vehicle.notes or '') + ownership_note
                vehicle.save(update_fields=['notes'])
            
            # Log the transfer (if audit logging exists)
            import logging
            logger = logging.getLogger(__name__)
            logger.info(
                f"Vehicle {vehicle.id} ({vehicle.vin}) ownership transferred from "
                f"Customer {old_owner.id} to Customer {new_owner.id} by User {request.user.id}"
            )
            
            # Return updated vehicle
            serializer = self.get_serializer(vehicle)
            return Response({
                'success': True,
                'message': f'Vehicle ownership successfully transferred from {old_owner_name} to {new_owner_name}',
                'vehicle': serializer.data,
                'old_owner': {
                    'id': old_owner.id,
                    'name': old_owner_name
                },
                'new_owner': {
                    'id': new_owner.id,
                    'name': new_owner_name
                },
                'transfer_date': str(transfer_date)
            })
            
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to reassign vehicle ownership: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Failed to reassign ownership: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def suggested_service(self, request, pk=None):
        """
        Suggest the next routine service level for this vehicle based on its history.
        """
        vehicle = self.get_object()
        
        # 1. Find the most recent routine service performed
        # We look at VehicleServiceSchedule for the latest last_service_date
        latest_schedule = VehicleServiceSchedule.objects.filter(
            vehicle=vehicle,
            last_service_date__isnull=False,
            service_type__progression_order__gt=0
        ).order_by('-last_service_date').first()
        
        if not latest_schedule:
            # No routine service history found, suggest the lowest level (Minor)
            first_service = ServiceType.objects.filter(
                progression_order__gt=0
            ).order_by('progression_order').first()
            
            if first_service:
                return Response({
                    'suggested_service_id': first_service.id,
                    'suggested_service_name': first_service.name,
                    'reason': "No previous routine service history found.",
                    'last_service_name': None,
                    'is_repeat': False
                })
            return Response({'message': 'No routine service types defined.'}, status=status.HTTP_404_NOT_FOUND)

        # 2. Determine the next service in progression
        current_order = latest_schedule.service_type.progression_order
        next_service = ServiceType.objects.filter(
            progression_order__gt=current_order
        ).order_by('progression_order').first()
        
        if not next_service:
            # Loop back to the first service if we finished the progression
            next_service = ServiceType.objects.filter(
                progression_order__gt=0
            ).order_by('progression_order').first()
            
        return Response({
            'suggested_service_id': next_service.id,
            'suggested_service_name': next_service.name,
            'reason': f"Last service was {latest_schedule.service_type.name} on {latest_schedule.last_service_date}.",
            'last_service_id': latest_schedule.service_type.id,
            'last_service_name': latest_schedule.service_type.name,
            'last_service_date': latest_schedule.last_service_date,
            'is_repeat': False
        })

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """Get vehicle dashboard statistics"""
        today = timezone.now().date()
        
        stats = {
            'total_vehicles': Vehicle.objects.count(),
            'active_vehicles': Vehicle.objects.filter(status='active').count(),
            'in_service_vehicles': Vehicle.objects.filter(status='in_service').count(),
            'sold_vehicles': Vehicle.objects.filter(status='sold').count(),
            'due_service_vehicles': Vehicle.objects.filter(
                Q(next_service_due_date__lte=today) |
                Q(next_service_due_mileage__lte=F('current_mileage'))
            ).filter(status='active').count()
        }
        return Response(stats)

    @action(detail=True, methods=['get'])
    def ownership_history(self, request, pk=None):
        """Get vehicle ownership history"""
        from .models import VehicleOwnershipHistory
        
        vehicle = self.get_object()
        history = VehicleOwnershipHistory.objects.filter(vehicle=vehicle).select_related(
            'previous_owner', 'previous_owner__user',
            'new_owner', 'new_owner__user',
            'transferred_by'
        ).order_by('-transfer_date', '-created_at')
        
        serializer = VehicleOwnershipHistorySerializer(history, many=True)
        return Response({
            'count': history.count(),
            'results': serializer.data
        })

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Get vehicle service history"""
        vehicle = self.get_object()
        
        from apps.workorders.models import WorkOrder
        work_orders = WorkOrder.objects.filter(
            vehicle=vehicle
        ).order_by('-created_at').values(
            'id', 'work_order_number', 'status', 'created_at',
            'completed_at', 'actual_total'
        )[:50]
        
        total_services = WorkOrder.objects.filter(
            vehicle=vehicle,
            status__in=['completed', 'invoiced', 'closed']
        ).count()
        
        return Response({
            'vehicle': str(vehicle),
            'vin': vehicle.vin,
            'total_services': total_services,
            'work_orders': list(work_orders),
        })
    
    @action(detail=True, methods=['post'])
    def record_mileage(self, request, pk=None):
        """Record mileage for vehicle"""
        vehicle = self.get_object()
        serializer = VehicleMileageHistorySerializer(data=request.data)
        
        if serializer.is_valid():
            # Update vehicle's current mileage
            new_mileage = serializer.validated_data['mileage']
            if new_mileage > vehicle.current_mileage:
                vehicle.current_mileage = new_mileage
                vehicle.save()
            
            serializer.save(vehicle=vehicle, recorded_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'])
    def mileage_history(self, request, pk=None):
        """Get vehicle mileage history"""
        vehicle = self.get_object()
        history = vehicle.mileage_history.all()
        serializer = VehicleMileageHistorySerializer(history, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def documents(self, request, pk=None):
        """Get vehicle documents"""
        vehicle = self.get_object()
        documents = vehicle.documents.all()
        serializer = VehicleDocumentSerializer(documents, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def upload_document(self, request, pk=None):
        """Upload vehicle document"""
        vehicle = self.get_object()
        data = request.data.copy()
        data['vehicle'] = vehicle.id
        
        serializer = VehicleDocumentSerializer(data=data)
        if serializer.is_valid():
            serializer.save(vehicle=vehicle, uploaded_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'])
    def photos(self, request, pk=None):
        """Get vehicle photos"""
        vehicle = self.get_object()
        photos = vehicle.photos.all()
        serializer = VehiclePhotoSerializer(photos, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def upload_photo(self, request, pk=None):
        """Upload vehicle photo"""
        vehicle = self.get_object()
        data = request.data.copy()
        data['vehicle'] = vehicle.id
        
        serializer = VehiclePhotoSerializer(data=data)
        if serializer.is_valid():
            serializer.save(vehicle=vehicle, uploaded_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def search_vin(self, request):
        """Search vehicle by VIN"""
        vin = request.query_params.get('vin', '')
        
        if not vin:
            return Response(
                {'error': 'VIN parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        vehicles = self.get_queryset().filter(vin__icontains=vin)
        serializer = VehicleListSerializer(vehicles, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def due_service(self, request):
        """Get vehicles due for service"""
        today = timezone.now().date()
        vehicles = self.get_queryset().filter(
            Q(next_service_due_date__lte=today) |
            Q(next_service_due_mileage__lte=F('current_mileage'))
        ).filter(status='active')
        
        serializer = VehicleListSerializer(vehicles, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get only active vehicles"""
        vehicles = self.get_queryset().filter(status='active')
        page = self.paginate_queryset(vehicles)
        
        if page is not None:
            serializer = VehicleListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = VehicleListSerializer(vehicles, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def decode_vin(self, request):
        """
        Decode VIN using NHTSA API and return data for form auto-fill
        
        POST /api/vehicles/decode_vin/
        Body: { "vin": "1HGBH41JXMN109186" }
        
        Returns:
        {
            "success": true,
            "exists": false,
            "vin": "1HGBH41JXMN109186",
            "year": 1991,
            "make": "HONDA",
            "model": "ACCORD",
            "trim": "EX",
            "engine_type": "gasoline",
            "engine_size": "2.2L I4",
            "transmission_type": "automatic",
            "summary": "1991 HONDA ACCORD EX - 2.2L I4 Automatic",
            "message": "VIN decoded successfully. Form fields will be auto-filled."
        }
        
        If vehicle exists:
        {
            "success": true,
            "exists": true,
            "vehicle_id": 123,
            "vehicle": {...vehicle details...},
            "message": "Vehicle with this VIN already exists"
        }
        """
        vin = request.data.get('vin', '').upper().strip()
        
        if not vin:
            return Response(
                {'success': False, 'error': 'VIN is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if len(vin) != 17:
            return Response(
                {'success': False, 'error': f'VIN must be exactly 17 characters (got {len(vin)})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if VIN already exists in database
        existing_vehicle = Vehicle.objects.filter(vin=vin).first()
        if existing_vehicle:
            return Response({
                'success': True,
                'exists': True,
                'vehicle_id': existing_vehicle.id,
                'vehicle': VehicleDetailSerializer(existing_vehicle).data,
                'message': 'Vehicle with this VIN already exists in the system'
            })
        
        # Decode VIN (with a hard timeout so the UI doesn't hang if NHTSA is slow/unreachable)
        from django.conf import settings
        timeout_seconds = float(getattr(settings, 'VIN_DECODE_TIMEOUT_SECONDS', 5))
        decoder = VehicleVINDecoder()
        success, data = decoder.decode_vin(vin, timeout_seconds=timeout_seconds)
        
        if not success:
            # If it looks like a timeout/network issue, return 503 to encourage retry.
            msg = str(data)
            http_status = status.HTTP_503_SERVICE_UNAVAILABLE if 'timed out' in msg.lower() or 'network error' in msg.lower() else status.HTTP_400_BAD_REQUEST
            return Response({'success': False, 'error': f'VIN decode failed: {msg}'}, status=http_status)
        
        # Prepare response data
        response_data = {
            'success': True,
            'exists': False,
            'vin': vin,
            'year': data.get('year'),
            'make': data.get('make'),
            'model': data.get('model'),
            'trim': data.get('trim'),
            'engine_type': data.get('engine_type'),
            'engine_size': data.get('engine_size'),
            'transmission_type': data.get('transmission_type'),
            'body_class': data.get('body_class'),
            'vehicle_type': data.get('vehicle_type'),
            'manufacturer': data.get('manufacturer'),
            'summary': decoder.get_vehicle_summary(vin),
            'has_errors': data.get('has_errors', False),
            # Expanded "Other Information" (manufacturer-submitted fields)
            'series': data.get('series'),
            'drive_type': data.get('drive_type'),
            'gvwr': data.get('gvwr'),
            'transmission_speeds': data.get('transmission_speeds'),
            'transmission_style': data.get('transmission_style'),
            'engine_cylinders': data.get('engine_cylinders'),
            'engine_hp': data.get('engine_hp'),
            'engine_model': data.get('engine_model'),
            'engine_manufacturer': data.get('engine_manufacturer'),
            'engine_displacement_l': data.get('engine_displacement_l'),
            'fuel_type_primary': data.get('fuel_type_primary'),
            'fuel_type_secondary': data.get('fuel_type_secondary'),
            'electrification_level': data.get('electrification_level'),
            'airbag_front': data.get('airbag_front'),
            'airbag_knee': data.get('airbag_knee'),
            'airbag_side': data.get('airbag_side'),
            'airbag_curtain': data.get('airbag_curtain'),
            'airbag_seat_cushion': data.get('airbag_seat_cushion'),
            'other_restraint_info': data.get('other_restraint_info'),
        }
        
        # Add error message if exists
        if data.get('has_errors'):
            response_data['error_message'] = data.get('error_message', '')
            response_data['message'] = 'VIN decoded with warnings. Some details may be incomplete.'
        else:
            response_data['message'] = 'VIN decoded successfully. Form fields will be auto-filled.'
        
        # Add all decoded data for reference
        response_data['full_data'] = data
        
        return Response(response_data)
    
    @action(detail=False, methods=['post'])
    def check_license_plate(self, request):
        """
        Check if a license plate already exists in the system
        
        POST /api/vehicles/check_license_plate/
        Body: { "license_plate": "ABC123", "vehicle_id": null }  # vehicle_id optional for edit
        
        Returns:
        {
            "success": true,
            "exists": false,
            "message": "License plate is available"
        }
        
        If license plate exists:
        {
            "success": true,
            "exists": true,
            "vehicle_id": 123,
            "vehicle": {...vehicle details...},
            "message": "Vehicle with this license plate already exists in the system"
        }
        """
        license_plate = request.data.get('license_plate', '').strip().upper()
        vehicle_id = request.data.get('vehicle_id')  # For edit page - exclude current vehicle
        
        if not license_plate:
            return Response(
                {'success': False, 'error': 'License plate is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if license plate already exists in database
        query = Vehicle.objects.filter(license_plate__iexact=license_plate)
        if vehicle_id:
            query = query.exclude(id=vehicle_id)
        
        existing_vehicle = query.first()
        if existing_vehicle:
            return Response({
                'success': True,
                'exists': True,
                'vehicle_id': existing_vehicle.id,
                'vehicle': VehicleDetailSerializer(existing_vehicle).data,
                'message': 'Vehicle with this license plate already exists in the system'
            })
        
        return Response({
            'success': True,
            'exists': False,
            'message': 'License plate is available'
        })
    
    @action(detail=False, methods=['post'])
    def import_csv(self, request):
        """Import vehicles from CSV file"""
        import csv
        from django.db import transaction
        from apps.accounts.admin_views import log_audit
        from apps.customers.models import Customer
        
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
            required_headers = ['vin', 'make', 'model', 'year', 'owner']
            
            # Check if required headers exist
            if not all(header in reader.fieldnames for header in required_headers):
                return Response({
                    'error': f'CSV file must contain these columns: {", ".join(required_headers)}'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Process each row
            for row_num, row in enumerate(reader, start=2):
                try:
                    vin = row.get('vin', '').strip().upper()
                    make = row.get('make', '').strip()
                    model = row.get('model', '').strip()
                    year = row.get('year', '').strip()
                    owner = row.get('owner', '').strip()
                    
                    # Validate required fields
                    if not vin or not make or not model or not year or not owner:
                        errors.append(f"Row {row_num}: Missing required fields")
                        skipped_count += 1
                        continue
                    
                    # Check if VIN already exists
                    if Vehicle.objects.filter(vin=vin).exists():
                        errors.append(f"Row {row_num}: VIN {vin} already exists")
                        skipped_count += 1
                        continue
                    
                    # Find owner (customer) by email or ID
                    try:
                        if '@' in owner:
                            customer = Customer.objects.get(user__email=owner.lower())
                        else:
                            customer = Customer.objects.get(id=int(owner))
                    except (Customer.DoesNotExist, ValueError):
                        errors.append(f"Row {row_num}: Owner '{owner}' not found")
                        skipped_count += 1
                        continue
                    
                    # Create vehicle
                    with transaction.atomic():
                        Vehicle.objects.create(
                            vin=vin,
                            make=make,
                            model=model,
                            year=int(year),
                            owner=customer,
                            license_plate=row.get('license_plate', '').strip() or f'VIN-{vin[-8:]}',
                            exterior_color=row.get('exterior_color', '').strip(),
                            current_mileage=int(row.get('current_mileage', 0)) if row.get('current_mileage', '').strip() else 0,
                            engine_type=row.get('engine_type', '').strip() or 'gasoline',
                            transmission_type=row.get('transmission_type', '').strip() or 'automatic',
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
                model_name='Vehicle',
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
                model_name='Vehicle',
                object_repr=f'CSV Import Failed: {filename}',
                changes={
                    'error': str(e),
                    'filename': filename,
                },
                request=request
            )
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class VehicleMileageHistoryViewSet(viewsets.ModelViewSet):
    """ViewSet for vehicle mileage history"""
    serializer_class = VehicleMileageHistorySerializer
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), HasPermission('view_vehicle_history')]
        return [IsAuthenticated(), HasPermission('edit_vehicles')]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['vehicle']
    ordering = ['-recorded_date']
    
    def get_queryset(self):
        return VehicleMileageHistory.objects.select_related('vehicle', 'recorded_by').all()
    
    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class VehicleDocumentViewSet(viewsets.ModelViewSet):
    """ViewSet for vehicle documents"""
    serializer_class = VehicleDocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), HasPermission('view_vehicles')]
        return [IsAuthenticated(), HasPermission('edit_vehicles')]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['vehicle', 'document_type']
    ordering = ['-uploaded_at']
    
    def get_queryset(self):
        return VehicleDocument.objects.select_related('vehicle', 'uploaded_by').all()
    
    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)


class VehiclePhotoViewSet(viewsets.ModelViewSet):
    """ViewSet for vehicle photos"""
    serializer_class = VehiclePhotoSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), HasPermission('view_vehicles')]
        return [IsAuthenticated(), HasPermission('edit_vehicles')]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['vehicle', 'photo_type']
    ordering = ['-uploaded_at']
    
    def get_queryset(self):
        return VehiclePhoto.objects.select_related('vehicle', 'uploaded_by').all()
    
    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)


class ServiceTypeViewSet(viewsets.ModelViewSet):
    """ViewSet for service types"""
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_predefined', 'is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']
    
    def get_queryset(self):
        return ServiceType.objects.select_related('created_by').all()
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ServiceTypeListSerializer
        return ServiceTypeSerializer
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('view_vehicles')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('edit_vehicles')]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), HasPermission('edit_vehicles')]
        return [IsAuthenticated()]
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class VehicleServiceScheduleViewSet(viewsets.ModelViewSet):
    """ViewSet for vehicle service schedules"""
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['vehicle', 'service_type', 'is_active']
    search_fields = ['service_type__name', 'vehicle__vin', 'vehicle__license_plate']
    ordering_fields = ['next_service_due_date', 'next_service_due_mileage', 'created_at']
    ordering = ['next_service_due_date', 'next_service_due_mileage']
    
    def get_queryset(self):
        queryset = VehicleServiceSchedule.objects.select_related(
            'vehicle', 'vehicle__owner', 'vehicle__owner__user',
            'service_type', 'service_type__created_by'
        ).all()
        
        # Filter by branch (if applicable) - filter through vehicle relationship
        # Note: Vehicle model does not have a branch field, so we cannot filter by branch directly.
        # queryset = filter_queryset_for_user_branches(
        #     queryset,
        #     self.request.user,
        #     request=self.request,
        #     use_active_branch=True,
        #     branch_lookup='vehicle__branch'
        # )
        
        # Filter by date range if provided
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        
        if date_from:
            queryset = queryset.filter(next_service_due_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(next_service_due_date__lte=date_to)
        
        # Filter by due status
        due_only = self.request.query_params.get('due_only', 'false').lower() == 'true'
        if due_only:
            today = timezone.now().date()
            queryset = queryset.filter(
                Q(next_service_due_date__lte=today) |
                Q(next_service_due_mileage__lte=F('vehicle__current_mileage'))
            )
        
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'list':
            return VehicleServiceScheduleListSerializer
        elif self.action == 'create':
            return VehicleServiceScheduleCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return VehicleServiceScheduleUpdateSerializer
        return VehicleServiceScheduleSerializer
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('view_vehicles')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('edit_vehicles')]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), HasPermission('edit_vehicles')]
        return [IsAuthenticated()]
    
    @action(detail=False, methods=['get'])
    def services_due(self, request):
        """
        Get all services due within a date range
        Query params:
        - date_from: Start date (YYYY-MM-DD)
        - date_to: End date (YYYY-MM-DD)
        - days_ahead: Number of days from today (alternative to date_to)
        - service_type: Filter by service type ID
        - vehicle: Filter by vehicle ID
        - customer: Filter by customer ID
        """
        from datetime import timedelta
        
        today = timezone.now().date()
        
        # Get date range
        date_from = request.query_params.get('date_from')
        if date_from:
            try:
                date_from = timezone.datetime.strptime(date_from, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'error': 'Invalid date_from format. Use YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            date_from = today
        
        date_to = request.query_params.get('date_to')
        if not date_to:
            days_ahead = int(request.query_params.get('days_ahead', 30))
            date_to = today + timedelta(days=days_ahead)
        else:
            try:
                date_to = timezone.datetime.strptime(date_to, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'error': 'Invalid date_to format. Use YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Build queryset
        queryset = VehicleServiceSchedule.objects.select_related(
            'vehicle', 'vehicle__owner', 'vehicle__owner__user',
            'service_type'
        ).filter(
            is_active=True,
            vehicle__status='active'
        )
        
        # Filter by date range
        queryset = queryset.filter(
            Q(next_service_due_date__gte=date_from, next_service_due_date__lte=date_to) |
            Q(next_service_due_date__isnull=True, next_service_due_mileage__isnull=False)
        )
        
        # Filter by service type
        service_type_id = request.query_params.get('service_type')
        if service_type_id:
            queryset = queryset.filter(service_type_id=service_type_id)
        
        # Filter by vehicle
        vehicle_id = request.query_params.get('vehicle')
        if vehicle_id:
            queryset = queryset.filter(vehicle_id=vehicle_id)
        
        # Filter by customer
        customer_id = request.query_params.get('customer')
        if customer_id:
            queryset = queryset.filter(vehicle__owner_id=customer_id)
        
        # Filter by branch (if applicable) - filter through vehicle relationship
        # Note: Vehicle model does not have a branch field, so we cannot filter by branch directly.
        # Temporarily disabling branch filtering to avoid ValueError.
        # queryset = filter_queryset_for_user_branches(
        #     queryset,
        #     request.user,
        #     request=request,
        #     use_active_branch=True,
        #     # branch_lookup='vehicle__branch'
        # )
        
        # Order by due date
        queryset = queryset.order_by('next_service_due_date', 'next_service_due_mileage')
        
        # Serialize results
        serializer = VehicleServiceScheduleSerializer(queryset, many=True)
        
        return Response({
            'count': queryset.count(),
            'date_from': date_from,
            'date_to': date_to,
            'results': serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def mark_completed(self, request, pk=None):
        """
        Mark a service as completed
        Body: {
            "service_date": "2024-01-15",
            "service_mileage": 50000
        }
        """
        schedule = self.get_object()
        
        service_date = request.data.get('service_date')
        service_mileage = request.data.get('service_mileage')
        
        if not service_date:
            return Response(
                {'error': 'service_date is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            service_date = timezone.datetime.strptime(service_date, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Invalid service_date format. Use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update last service info
        schedule.last_service_date = service_date
        if service_mileage is not None:
            schedule.last_service_mileage = int(service_mileage)
        
        # Recalculate next service due
        schedule.calculate_next_service_due()
        
        serializer = self.get_serializer(schedule)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def send_reminder(self, request, pk=None):
        """
        Send a service due reminder to the customer
        Body: {
            "channel": "email" | "sms" | "call" (default: "email")
        }
        """
        schedule = self.get_object()
        channel = request.data.get('channel', 'email')
        
        if channel not in ['email', 'sms', 'call']:
            return Response(
                {'error': 'Invalid channel. Must be email, sms, or call.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from apps.notifications_app.triggers import notification_triggers
            notification_triggers.service_due_reminder(schedule, channel=channel)
            
            return Response({
                'success': True,
                'message': f'Service reminder sent via {channel}',
                'schedule_id': schedule.id
            })
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send service reminder: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Failed to send reminder: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'])
    def send_bulk_reminders(self, request):
        """
        Send reminders for multiple service schedules
        Body: {
            "schedule_ids": [1, 2, 3],
            "channel": "email" | "sms" | "call" (default: "email")
        }
        """
        schedule_ids = request.data.get('schedule_ids', [])
        channel = request.data.get('channel', 'email')
        
        if not schedule_ids:
            return Response(
                {'error': 'schedule_ids is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if channel not in ['email', 'sms', 'call']:
            return Response(
                {'error': 'Invalid channel. Must be email, sms, or call.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from apps.notifications_app.triggers import notification_triggers
            
            schedules = VehicleServiceSchedule.objects.filter(id__in=schedule_ids)
            sent_count = 0
            failed_count = 0
            errors = []
            
            for schedule in schedules:
                try:
                    notification_triggers.service_due_reminder(schedule, channel=channel)
                    sent_count += 1
                except Exception as e:
                    failed_count += 1
                    errors.append({
                        'schedule_id': schedule.id,
                        'error': str(e)
                    })
            
            return Response({
                'success': True,
                'sent': sent_count,
                'failed': failed_count,
                'errors': errors if errors else None
            })
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send bulk reminders: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Failed to send reminders: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
