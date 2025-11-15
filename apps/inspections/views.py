from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Q, Avg
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend

from apps.inspections.models import (
    InspectionTemplate, InspectionCategory, InspectionItem,
    VehicleInspection, InspectionResult, InspectionPhoto
)
from apps.branches.utils import filter_queryset_for_user_branches, resolve_branch
from apps.inspections.serializers import (
    InspectionTemplateListSerializer, InspectionTemplateDetailSerializer,
    InspectionTemplateCreateSerializer, InspectionCategorySerializer,
    InspectionItemSerializer, VehicleInspectionListSerializer,
    VehicleInspectionDetailSerializer, VehicleInspectionCreateSerializer,
    VehicleInspectionUpdateSerializer, InspectionResultSerializer,
    InspectionResultCreateSerializer, InspectionPhotoSerializer,
    InspectionSummarySerializer
)


class InspectionTemplateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for inspection templates.
    
    list: Get all templates
    retrieve: Get single template with full structure
    create: Create new template
    update: Update template
    destroy: Delete template (soft delete by setting is_active=False)
    
    Custom actions:
    - active: Get only active templates
    - set_default: Set a template as default
    """
    queryset = InspectionTemplate.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'is_default']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return InspectionTemplateListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return InspectionTemplateCreateSerializer
        return InspectionTemplateDetailSerializer
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get only active templates"""
        templates = self.queryset.filter(is_active=True)
        serializer = InspectionTemplateListSerializer(templates, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def set_default(self, request, pk=None):
        """Set this template as the default"""
        template = self.get_object()
        template.is_default = True
        template.save()  # This will automatically unset others
        return Response({
            'message': f'Template "{template.name}" set as default',
            'template': InspectionTemplateDetailSerializer(template).data
        })
    
    @action(detail=True, methods=['post'])
    def add_category(self, request, pk=None):
        """Add a category to this template"""
        template = self.get_object()
        serializer = InspectionCategorySerializer(data=request.data)
        
        if serializer.is_valid():
            serializer.save(template=template)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Duplicate a template with all categories and items"""
        original = self.get_object()
        
        # Create new template
        new_template = InspectionTemplate.objects.create(
            name=f"{original.name} (Copy)",
            description=original.description,
            is_active=original.is_active,
            requires_odometer=original.requires_odometer,
            requires_technician_signature=original.requires_technician_signature,
            requires_customer_signature=original.requires_customer_signature,
            allows_photos=original.allows_photos,
            allows_video=original.allows_video,
            created_by=request.user
        )
        
        # Copy categories and items
        for category in original.categories.all():
            new_category = InspectionCategory.objects.create(
                template=new_template,
                name=category.name,
                description=category.description,
                order=category.order
            )
            
            for item in category.items.all():
                InspectionItem.objects.create(
                    category=new_category,
                    name=item.name,
                    description=item.description,
                    item_type=item.item_type,
                    measurement_unit=item.measurement_unit,
                    min_acceptable=item.min_acceptable,
                    max_acceptable=item.max_acceptable,
                    order=item.order,
                    is_critical=item.is_critical
                )
        
        return Response({
            'message': 'Template duplicated successfully',
            'template': InspectionTemplateDetailSerializer(new_template).data
        }, status=status.HTTP_201_CREATED)


class VehicleInspectionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for vehicle inspections.
    
    list: Get all inspections
    retrieve: Get single inspection with all results
    create: Create new inspection
    update: Update inspection
    destroy: Delete inspection
    
    Custom actions:
    - complete: Mark inspection as completed
    - approve: Approve inspection
    - reject: Reject inspection
    - add_result: Add result for an inspection item
    - send_to_customer: Send inspection report to customer
    - by_vehicle: Get inspections for a specific vehicle
    - recent: Get recent inspections
    - statistics: Get inspection statistics
    """
    queryset = VehicleInspection.objects.select_related(
        'vehicle', 'work_order', 'template', 'performed_by', 'approved_by'
    ).prefetch_related('results', 'results__photos')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'overall_result', 'vehicle', 'work_order', 'template', 'performed_by']
    search_fields = ['inspection_number', 'vehicle__vin', 'vehicle__license_plate', 'notes']
    ordering_fields = ['inspection_date', 'created_at', 'inspection_number']
    ordering = ['-inspection_date']
    
    def get_queryset(self):
        """Filter inspections by active branch from session"""
        queryset = super().get_queryset()
        # Check if user wants to see all branches (for admins) or just active branch
        show_all = self.request.query_params.get('all_branches', 'false').lower() == 'true'
        return filter_queryset_for_user_branches(
            queryset, 
            self.request.user, 
            request=self.request, 
            use_active_branch=not show_all
        )
    
    def perform_create(self, serializer):
        """Assign branch when creating inspection"""
        request = self.request
        branch_id = request.data.get('branch') or request.data.get('branch_id')
        branch = resolve_branch(request, branch_id=branch_id)
        
        if branch is None:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'A valid branch assignment is required.'})
        
        serializer.save(branch=branch)
    
    def get_serializer_class(self):
        if self.action == 'list':
            return VehicleInspectionListSerializer
        elif self.action == 'create':
            return VehicleInspectionCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return VehicleInspectionUpdateSerializer
        return VehicleInspectionDetailSerializer
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark inspection as completed"""
        inspection = self.get_object()
        
        if inspection.status == 'completed':
            return Response(
                {'error': 'Inspection already completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Calculate overall result based on results
        fail_count = inspection.fail_count
        advisory_count = inspection.advisory_count
        
        if fail_count > 0:
            inspection.overall_result = 'fail'
        elif advisory_count > 0:
            inspection.overall_result = 'pass_with_advisory'
        else:
            inspection.overall_result = 'pass'
        
        inspection.status = 'completed'
        inspection.completed_at = timezone.now()
        inspection.save()
        
        return Response({
            'message': 'Inspection completed successfully',
            'inspection': VehicleInspectionDetailSerializer(inspection).data
        })
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve inspection"""
        inspection = self.get_object()
        
        if inspection.status != 'completed':
            return Response(
                {'error': 'Only completed inspections can be approved'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        inspection.status = 'approved'
        inspection.approved_by = request.user
        inspection.save()
        
        return Response({
            'message': 'Inspection approved',
            'inspection': VehicleInspectionDetailSerializer(inspection).data
        })
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject inspection"""
        inspection = self.get_object()
        
        inspection.status = 'rejected'
        inspection.notes = request.data.get('reason', inspection.notes)
        inspection.save()
        
        return Response({
            'message': 'Inspection rejected',
            'inspection': VehicleInspectionDetailSerializer(inspection).data
        })
    
    @action(detail=True, methods=['post'])
    def add_result(self, request, pk=None):
        """Add or update result for an inspection item"""
        inspection = self.get_object()
        
        data = request.data.copy()
        data['inspection'] = inspection.id
        
        # Check if result already exists
        inspection_item_id = data.get('inspection_item')
        existing_result = InspectionResult.objects.filter(
            inspection=inspection,
            inspection_item_id=inspection_item_id
        ).first()
        
        if existing_result:
            # Update existing result
            serializer = InspectionResultCreateSerializer(
                existing_result,
                data=data,
                partial=True
            )
        else:
            # Create new result
            serializer = InspectionResultCreateSerializer(data=data)
        
        if serializer.is_valid():
            serializer.save()
            return Response(
                InspectionResultSerializer(serializer.instance).data,
                status=status.HTTP_201_CREATED if not existing_result else status.HTTP_200_OK
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def send_to_customer(self, request, pk=None):
        """Send inspection report to customer"""
        inspection = self.get_object()
        
        if inspection.status != 'completed':
            return Response(
                {'error': 'Only completed inspections can be sent to customers'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # In a real implementation, this would:
        # 1. Generate PDF report
        # 2. Send email/SMS to customer
        # 3. Create notification
        
        inspection.sent_to_customer_at = timezone.now()
        inspection.save()
        
        return Response({
            'message': 'Inspection report sent to customer',
            'sent_at': inspection.sent_to_customer_at
        })
    
    @action(detail=False, methods=['get'])
    def by_vehicle(self, request):
        """Get inspections for a specific vehicle"""
        vehicle_id = request.query_params.get('vehicle_id')
        
        if not vehicle_id:
            return Response(
                {'error': 'vehicle_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        inspections = self.queryset.filter(vehicle_id=vehicle_id)
        page = self.paginate_queryset(inspections)
        
        if page is not None:
            serializer = VehicleInspectionListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = VehicleInspectionListSerializer(inspections, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def recent(self, request):
        """Get recent inspections (last 30 days)"""
        thirty_days_ago = timezone.now() - timezone.timedelta(days=30)
        inspections = self.queryset.filter(
            inspection_date__gte=thirty_days_ago
        )
        
        page = self.paginate_queryset(inspections)
        if page is not None:
            serializer = VehicleInspectionListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = VehicleInspectionListSerializer(inspections, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Get inspection statistics"""
        total = self.queryset.count()
        completed = self.queryset.filter(status='completed').count()
        in_progress = self.queryset.filter(status='in_progress').count()
        
        # Calculate pass rate
        completed_inspections = self.queryset.filter(status='completed')
        passed = completed_inspections.filter(overall_result='pass').count()
        pass_rate = (passed / completed * 100) if completed > 0 else 0
        
        # Inspections by template
        by_template = self.queryset.values('template__name').annotate(
            count=Count('id')
        ).order_by('-count')
        
        # Recent inspections
        recent = self.queryset.order_by('-inspection_date')[:10]
        
        data = {
            'total_inspections': total,
            'completed_inspections': completed,
            'in_progress_inspections': in_progress,
            'pass_rate': round(pass_rate, 2),
            'inspections_by_template': list(by_template),
            'recent_inspections': VehicleInspectionListSerializer(recent, many=True).data
        }
        
        return Response(data)
    
    @action(detail=True, methods=['get'])
    def comparison(self, request, pk=None):
        """Compare this inspection with the previous one for the same vehicle"""
        inspection = self.get_object()
        
        # Get previous inspection for same vehicle
        previous = VehicleInspection.objects.filter(
            vehicle=inspection.vehicle,
            inspection_date__lt=inspection.inspection_date,
            status='completed'
        ).order_by('-inspection_date').first()
        
        if not previous:
            return Response({
                'message': 'No previous inspection found for this vehicle',
                'current': VehicleInspectionDetailSerializer(inspection).data
            })
        
        return Response({
            'current': VehicleInspectionDetailSerializer(inspection).data,
            'previous': VehicleInspectionDetailSerializer(previous).data,
            'comparison': {
                'days_between': (inspection.inspection_date - previous.inspection_date).days,
                'odometer_increase': (
                    inspection.odometer_reading - previous.odometer_reading
                    if inspection.odometer_reading and previous.odometer_reading
                    else None
                )
            }
        })


class InspectionResultViewSet(viewsets.ModelViewSet):
    """
    ViewSet for inspection results.
    
    list: Get all results
    retrieve: Get single result
    create: Create new result
    update: Update result
    destroy: Delete result
    """
    queryset = InspectionResult.objects.select_related(
        'inspection', 'inspection_item', 'inspection_item__category'
    ).prefetch_related('photos')
    permission_classes = [IsAuthenticated]
    serializer_class = InspectionResultSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['inspection', 'result', 'condition', 'needs_immediate_attention']
    ordering_fields = ['created_at']
    ordering = ['inspection_item__category__order', 'inspection_item__order']
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return InspectionResultCreateSerializer
        return InspectionResultSerializer
    
    @action(detail=True, methods=['post'])
    def add_photo(self, request, pk=None):
        """Add photo to result"""
        result = self.get_object()
        
        serializer = InspectionPhotoSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(result=result)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def critical(self, request):
        """Get results for critical items that failed"""
        results = self.queryset.filter(
            inspection_item__is_critical=True,
            result__in=['fail', 'critical']
        )
        
        serializer = self.get_serializer(results, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def needs_attention(self, request):
        """Get all results that need immediate attention"""
        results = self.queryset.filter(needs_immediate_attention=True)
        
        serializer = self.get_serializer(results, many=True)
        return Response(serializer.data)

