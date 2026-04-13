from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import HasPermission, IsModuleEnabled
from django.db.models import Count, Q, Avg
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from django.conf import settings

from apps.inspections.models import (
    InspectionTemplate, InspectionCategory, InspectionItem,
    VehicleInspection, InspectionResult, InspectionPhoto
)
from apps.branches.utils import filter_queryset_for_user_branches, resolve_branch
from apps.notifications_app.triggers import notification_triggers
from apps.inspections.serializers import (
    InspectionTemplateListSerializer, InspectionTemplateDetailSerializer,
    InspectionTemplateCreateSerializer, InspectionCategorySerializer,
    InspectionItemSerializer, InspectionItemCreateSerializer,
    VehicleInspectionListSerializer, VehicleInspectionDetailSerializer,
    VehicleInspectionCreateSerializer, VehicleInspectionUpdateSerializer,
    InspectionResultSerializer, InspectionResultCreateSerializer,
    InspectionPhotoSerializer, InspectionSummarySerializer
)


class InspectionPhotoViewSet(viewsets.ModelViewSet):
    """ViewSet for inspection photos"""
    queryset = InspectionPhoto.objects.all()
    permission_classes = [IsAuthenticated, IsModuleEnabled('inspections')]
    serializer_class = InspectionPhotoSerializer
    
    def get_queryset(self):
        """Filter photos by active branch from session"""
        queryset = super().get_queryset()
        
        # If user is a customer, only show photos for their vehicles
        user = self.request.user
        if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
            queryset = queryset.filter(result__inspection__vehicle__owner=user.customer_profile)
            return queryset
        
        # Check if user wants to see all branches
        show_all = self.request.query_params.get('all_branches', 'false').lower() == 'true'
        return filter_queryset_for_user_branches(
            queryset, 
            self.request.user, 
            request=self.request, 
            use_active_branch=not show_all,
            branch_lookup='result__inspection__branch'
        )
    
    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsModuleEnabled('inspections'), HasPermission('edit_inspections')]
        return [IsAuthenticated(), IsModuleEnabled('inspections'), HasPermission('view_inspections')]


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
    permission_classes = [IsAuthenticated, IsModuleEnabled('inspections')]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'list' or self.action == 'retrieve' or self.action == 'active':
            return [IsAuthenticated(), IsModuleEnabled('inspections'), HasPermission('view_inspection_templates')]
        elif self.action == 'create' or self.action == 'update' or self.action == 'partial_update' or self.action == 'destroy' or self.action == 'set_default':
            return [IsAuthenticated(), IsModuleEnabled('inspections'), HasPermission('manage_inspection_templates')]
        return [IsAuthenticated(), IsModuleEnabled('inspections')]
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
    
    @action(detail=True, methods=['put', 'patch'])
    def update_category(self, request, pk=None, category_id=None):
        """Update a category in this template"""
        template = self.get_object()
        try:
            category = template.categories.get(id=request.data.get('category_id') or category_id)
        except InspectionCategory.DoesNotExist:
            return Response({'error': 'Category not found'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = InspectionCategorySerializer(category, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['delete'])
    def delete_category(self, request, pk=None):
        """Delete a category from this template"""
        template = self.get_object()
        category_id = request.data.get('category_id') or request.query_params.get('category_id')
        if not category_id:
            return Response({'error': 'category_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            category = template.categories.get(id=category_id)
            category.delete()
            return Response({'message': 'Category deleted successfully'}, status=status.HTTP_204_NO_CONTENT)
        except InspectionCategory.DoesNotExist:
            return Response({'error': 'Category not found'}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=True, methods=['post'])
    def add_item(self, request, pk=None):
        """Add an item to a category in this template"""
        template = self.get_object()
        category_id = request.data.get('category_id')
        if not category_id:
            return Response({'error': 'category_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            category = template.categories.get(id=category_id)
        except InspectionCategory.DoesNotExist:
            return Response({'error': 'Category not found'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = InspectionItemCreateSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(category=category)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['put', 'patch'])
    def update_item(self, request, pk=None):
        """Update an item in this template"""
        template = self.get_object()
        item_id = request.data.get('item_id')
        if not item_id:
            return Response({'error': 'item_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            item = InspectionItem.objects.get(id=item_id, category__template=template)
        except InspectionItem.DoesNotExist:
            return Response({'error': 'Item not found'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = InspectionItemCreateSerializer(item, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['delete'])
    def delete_item(self, request, pk=None):
        """Delete an item from this template"""
        template = self.get_object()
        item_id = request.data.get('item_id') or request.query_params.get('item_id')
        if not item_id:
            return Response({'error': 'item_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            item = InspectionItem.objects.get(id=item_id, category__template=template)
            item.delete()
            return Response({'message': 'Item deleted successfully'}, status=status.HTTP_204_NO_CONTENT)
        except InspectionItem.DoesNotExist:
            return Response({'error': 'Item not found'}, status=status.HTTP_404_NOT_FOUND)


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
    permission_classes = [IsAuthenticated, IsModuleEnabled('inspections')]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        user = self.request.user
        base_permissions = [IsAuthenticated(), IsModuleEnabled('inspections')]
        
        # Customers can view and approve/reject their own inspections without special permissions
        if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
            if self.action in ['list', 'retrieve', 'approve', 'reject']:
                return base_permissions
        
        # Staff permissions
        if self.action == 'list' or self.action == 'retrieve':
            return base_permissions + [HasPermission('view_inspections')]
        elif self.action == 'create':
            return base_permissions + [HasPermission('create_inspections')]
        elif self.action in ['update', 'partial_update']:
            return base_permissions + [HasPermission('edit_inspections')]
        elif self.action == 'destroy':
            return base_permissions + [HasPermission('delete_inspections')]
        elif self.action in ['approve', 'reject']:
            return base_permissions + [HasPermission('edit_inspections')]
        return base_permissions
    
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'overall_result', 'vehicle', 'work_order', 'template', 'performed_by']
    search_fields = ['inspection_number', 'vehicle__vin', 'vehicle__license_plate', 'notes']
    ordering_fields = ['inspection_date', 'created_at', 'inspection_number']
    ordering = ['-inspection_date']
    
    def get_queryset(self):
        """Filter inspections by active branch from session"""
        queryset = super().get_queryset()
        
        # If user is a customer, only show inspections for their vehicles
        user = self.request.user
        if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
            queryset = queryset.filter(vehicle__owner=user.customer_profile)
            return queryset
        
        # Check if user wants to see all branches (for admins) or just active branch
        show_all = self.request.query_params.get('all_branches', 'false').lower() == 'true'
        return filter_queryset_for_user_branches(
            queryset, 
            self.request.user, 
            request=self.request, 
            use_active_branch=not show_all
        )
    
    def create(self, request, *args, **kwargs):
        """Create inspection and return with full details including ID"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Get branch for assignment
        branch_id = request.data.get('branch') or request.data.get('branch_id')
        try:
            branch = resolve_branch(request, branch_id=branch_id)
        except Exception as e:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({
                'branch': f'Error resolving branch: {str(e)}'
            })
        
        if branch is None:
            from rest_framework.exceptions import ValidationError
            user = request.user
            accessible_branches = user.get_accessible_branches() if hasattr(user, 'get_accessible_branches') else None
            
            if accessible_branches and accessible_branches.exists():
                error_msg = 'A valid branch assignment is required. Please specify a branch in the request.'
            else:
                error_msg = 'You do not have access to any branches. Please contact an administrator.'
            
            raise ValidationError({'branch': error_msg})
        
        # Create inspection with branch
        inspection = serializer.save(branch=branch)
        
        # Update vehicle mileage if provided
        odometer_reading = serializer.validated_data.get('odometer_reading')
        if odometer_reading is not None and inspection.vehicle:
            # We already validated it's >= current_mileage in the serializer
            inspection.vehicle.update_mileage(
                mileage=odometer_reading,
                user=request.user,
                notes=f"Recorded during Inspection {inspection.inspection_number}"
            )
        
        # Return with detail serializer to include ID and all fields
        headers = self.get_success_headers(serializer.data)
        detail_serializer = VehicleInspectionDetailSerializer(inspection)
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED, headers=headers)
    
    def perform_create(self, serializer):
        """Assign branch when creating inspection - called by default create if not overridden"""
        request = self.request
        branch_id = request.data.get('branch') or request.data.get('branch_id')
        
        try:
            branch = resolve_branch(request, branch_id=branch_id)
        except Exception as e:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({
                'branch': f'Error resolving branch: {str(e)}'
            })
        
        if branch is None:
            from rest_framework.exceptions import ValidationError
            # Get more helpful error message
            user = request.user
            accessible_branches = user.get_accessible_branches() if hasattr(user, 'get_accessible_branches') else None
            
            if accessible_branches and accessible_branches.exists():
                error_msg = 'A valid branch assignment is required. Please specify a branch in the request.'
            else:
                error_msg = 'You do not have access to any branches. Please contact an administrator.'
            
            raise ValidationError({'branch': error_msg})
        
        
        inspection = serializer.save(branch=branch)
        
        # Update vehicle mileage if provided
        odometer_reading = serializer.validated_data.get('odometer_reading')
        if odometer_reading is not None and inspection.vehicle:
            # We already validated it's >= current_mileage in the serializer
            inspection.vehicle.update_mileage(
                mileage=odometer_reading,
                user=request.user,
                notes=f"Recorded during Inspection {inspection.inspection_number}"
            )
            
    def perform_update(self, serializer):
        """Update inspection and conditionally update vehicle mileage"""
        inspection = serializer.save()
        
        # Update vehicle mileage if provided
        odometer_reading = serializer.validated_data.get('odometer_reading')
        if odometer_reading is not None and inspection.vehicle:
            # We already validated it's >= current_mileage in the serializer
            inspection.vehicle.update_mileage(
                mileage=odometer_reading,
                user=self.request.user,
                notes=f"Updated during Inspection {inspection.inspection_number}"
            )
    
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
        
        # Check if technician signature is required
        if inspection.template.requires_technician_signature:
            technician_signature = request.data.get('technician_signature')
            if not technician_signature:
                return Response(
                    {'error': 'Technician signature is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            inspection.technician_signature = technician_signature
        
        # Validate that inspection has results before completing
        result_count = inspection.results.count()
        if result_count == 0:
            return Response(
                {'error': 'Cannot complete inspection without any results. Please record inspection results first.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate that at least some results have been checked (not all "not_checked")
        checked_results_count = inspection.results.exclude(result='not_checked').count()
        if checked_results_count == 0:
            return Response(
                {'error': 'Cannot complete inspection with only unchecked items. Please record actual inspection results for at least some items.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Recalculate overall result using the model method
        inspection.recalculate_overall_result()
        
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
        
        # Check if customer is trying to approve - ensure it's their vehicle
        user = request.user
        if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
            if inspection.vehicle.owner != user.customer_profile:
                return Response(
                    {'error': 'You can only approve inspections for your own vehicles'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        if inspection.status != 'completed':
            return Response(
                {'error': 'Only completed inspections can be approved'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate that inspection has results
        result_count = inspection.results.count()
        if result_count == 0:
            return Response(
                {'error': 'Cannot approve inspection without any results. The inspection must have recorded results before approval.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate that at least some results have been checked (not all "not_checked")
        checked_results_count = inspection.results.exclude(result='not_checked').count()
        if checked_results_count == 0:
            return Response(
                {'error': 'Cannot approve inspection with only unchecked items. Please ensure actual inspection results have been recorded.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check completion percentage - warn if very low (optional validation)
        completion_percentage = inspection.completion_percentage
        if completion_percentage < 50:
            # Allow but warn - this is informational, not blocking
            pass
        
        # Save customer signature if provided
        customer_signature = request.data.get('customer_signature')
        if customer_signature:
            inspection.customer_signature = customer_signature
        
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
        
        # Check if customer is trying to reject - ensure it's their vehicle
        user = request.user
        if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
            if inspection.vehicle.owner != user.customer_profile:
                return Response(
                    {'error': 'You can only reject inspections for your own vehicles'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
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
    def save_results(self, request, pk=None):
        """Bulk save/update multiple inspection results"""
        inspection = self.get_object()
        results_data = request.data.get('results', [])
        
        if not isinstance(results_data, list):
            return Response(
                {'error': 'results must be a list'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        saved_results = []
        errors = []
        
        for idx, result_data in enumerate(results_data):
            result_data = result_data.copy()
            result_data['inspection'] = inspection.id
            
            inspection_item_id = result_data.get('inspection_item')
            if not inspection_item_id:
                errors.append({
                    'index': idx,
                    'error': 'inspection_item is required'
                })
                continue
            
            # Check if result already exists
            existing_result = InspectionResult.objects.filter(
                inspection=inspection,
                inspection_item_id=inspection_item_id
            ).first()
            
            if existing_result:
                serializer = InspectionResultCreateSerializer(
                    existing_result,
                    data=result_data,
                    partial=True
                )
            else:
                serializer = InspectionResultCreateSerializer(data=result_data)
            
            if serializer.is_valid():
                serializer.save()
                saved_results.append(InspectionResultSerializer(serializer.instance).data)
            else:
                errors.append({
                    'index': idx,
                    'inspection_item': inspection_item_id,
                    'errors': serializer.errors
                })
        
        if errors:
            return Response({
                'saved': saved_results,
                'errors': errors
            }, status=status.HTTP_207_MULTI_STATUS)  # Multi-Status for partial success
        
        # Recalculate overall_result if inspection is completed
        inspection.refresh_from_db()
        if inspection.status == 'completed':
            inspection.recalculate_overall_result()
            inspection.save(update_fields=['overall_result'])
        
        return Response({
            'message': f'Successfully saved {len(saved_results)} results',
            'results': saved_results
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    def send_to_customer(self, request, pk=None):
        """Send inspection report to customer"""
        from apps.notifications_app.triggers import NotificationTriggers
        
        inspection = self.get_object()
        
        # Allow both 'completed' and 'approved' statuses
        if inspection.status not in ['completed', 'approved']:
            return Response(
                {'error': 'Only completed or approved inspections can be sent to customers'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if customer has user account
        if not inspection.vehicle.owner.user:
            return Response(
                {'error': 'Customer does not have a user account to receive notifications'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update sent timestamp
        inspection.sent_to_customer_at = timezone.now()
        inspection.save()
        
        # Send notification to customer with portal link
        try:
            notification_triggers.inspection_completed(inspection)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send inspection notification: {str(e)}")
            # Don't fail the request if notification fails, just log it
        
        return Response({
            'message': 'Inspection report sent to customer',
            'sent_at': inspection.sent_to_customer_at
        })
    
    @action(detail=True, methods=['post'])
    def recalculate_result(self, request, pk=None):
        """Recalculate the overall_result for an inspection"""
        inspection = self.get_object()
        old_result = inspection.overall_result
        new_result = inspection.recalculate_overall_result()
        inspection.save(update_fields=['overall_result'])
        
        return Response({
            'message': 'Overall result recalculated',
            'old_result': old_result,
            'new_result': new_result,
            'inspection': VehicleInspectionDetailSerializer(inspection).data
        })

    @action(detail=True, methods=['post'])
    def generate_summary(self, request, pk=None):
        """AI-powered auto-generation of inspection notes and recommendations"""
        inspection = self.get_object()
        
        # Guard clause
        if inspection.status not in ['completed', 'approved', 'rejected', 'in_progress']:
            return Response(
                {"error": "Perform the inspection before generating an AI summary"},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        from apps.core.services.ai_service import AIService
        ai_data = AIService.analyze_inspection_results(inspection)
        
        inspection.notes = ai_data["notes"]
        inspection.recommendations = ai_data["recommendations"]
        inspection.save(update_fields=['notes', 'recommendations'])
        
        return Response({
            "message": "AI summary generated successfully",
            "notes": inspection.notes,
            "recommendations": inspection.recommendations,
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

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Generate PDF for inspection report"""
        from apps.core.services.print_service import generate_inspection_pdf
        
        inspection = self.get_object()
        return generate_inspection_pdf(inspection)
    
    @action(detail=True, methods=['get'])
    def print(self, request, pk=None):
        """Return HTML for print view (same layout as PDF)."""
        from django.http import HttpResponse
        from apps.core.services.print_service import render_inspection_print_html
        
        inspection = self.get_object()
        try:
            html = render_inspection_print_html(inspection, branch=inspection.branch, request=request)
            return HttpResponse(html, content_type='text/html; charset=utf-8')
        except Exception as e:
            import logging
            log = logging.getLogger(__name__)
            log.error(f"Print HTML generation error: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to generate print view: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


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
    permission_classes = [IsAuthenticated, IsModuleEnabled('inspections')]
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

