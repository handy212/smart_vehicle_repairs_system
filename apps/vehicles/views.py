"""
Views for vehicles app
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import HasPermission, user_has_permission
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, F
from django.utils import timezone

from .models import Vehicle, VehicleMileageHistory, VehicleDocument, VehiclePhoto
from .serializers import (
    VehicleListSerializer,
    VehicleDetailSerializer,
    VehicleCreateSerializer,
    VehicleUpdateSerializer,
    VehicleMileageHistorySerializer,
    VehicleDocumentSerializer,
    VehiclePhotoSerializer,
    VINDecodeSerializer
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
        if self.action == 'list' or self.action == 'retrieve':
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
        return Vehicle.objects.select_related('owner', 'owner__user').prefetch_related(
            'mileage_history', 'documents', 'photos'
        ).all()
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return VehicleListSerializer
        elif self.action == 'create':
            return VehicleCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return VehicleUpdateSerializer
        return VehicleDetailSerializer
    
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
    def history(self, request, pk=None):
        """Get vehicle service history"""
        vehicle = self.get_object()
        
        # This will be implemented when workorders app is ready
        return Response({
            'vehicle': str(vehicle),
            'vin': vehicle.vin,
            'total_services': 0,
            'work_orders': [],
            'message': 'Service history will be available when work orders are implemented'
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
                            license_plate=row.get('license_plate', '').strip() or None,
                            exterior_color=row.get('exterior_color', '').strip() or None,
                            current_mileage=int(row.get('current_mileage', 0)) if row.get('current_mileage') else None,
                            engine_type=row.get('engine_type', '').strip() or None,
                            transmission_type=row.get('transmission_type', '').strip() or None,
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
