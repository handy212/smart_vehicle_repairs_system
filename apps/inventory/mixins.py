from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from .services import InventoryService
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)

class StockManagementMixin:
    """Mixin for stock adjustment and history actions"""
    
    @action(detail=True, methods=['post'])
    def adjust(self, request, pk=None):
        """Manually adjust stock quantity"""
        part = self.get_object()
        if not part.tracks_inventory():
            return Response(
                {'error': 'Only inventory-type catalog items track stock levels.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from .serializers import PartStockAdjustmentSerializer
        serializer = PartStockAdjustmentSerializer(data=request.data)
        
        if serializer.is_valid():
            quantity = serializer.validated_data['quantity']
            reason = serializer.validated_data['reason']
            notes = serializer.validated_data.get('notes', '')
            
            from apps.branches.utils import resolve_branch
            branch = resolve_branch(request)
            if not branch:
                return Response(
                    {'error': 'Branch is required for stock adjustments.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            try:
                inv_trans = InventoryService.record_transaction(
                    part=part,
                    quantity=quantity,
                    transaction_type='adjustment',
                    user=request.user,
                    branch=branch,
                    reason=reason,
                    notes=notes
                )
                return Response({
                    'status': 'Stock adjusted successfully',
                    'new_quantity': inv_trans.balance_after,
                    'adjustment': quantity,
                    'branch': branch.name
                })
            except ValueError as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def bulk_adjust(self, request):
        """Bulk stock adjustment for multiple parts"""
        from .serializers import BulkStockAdjustmentSerializer
        from apps.branches.utils import resolve_branch
        from django.db import transaction as db_transaction
        
        serializer = BulkStockAdjustmentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        branch = resolve_branch(request)
        if not branch:
            return Response({'error': 'Branch is required for bulk adjustments.'}, status=status.HTTP_400_BAD_REQUEST)
        
        adjustments = serializer.validated_data['adjustments']
        transaction_type = serializer.validated_data.get('transaction_type', 'adjustment')
        default_reason = serializer.validated_data.get('reason', 'Bulk adjustment')
        
        results = {'successful': [], 'failed': [], 'total_requested': len(adjustments)}
        
        with db_transaction.atomic():
            for adj in adjustments:
                try:
                    from .models import Part
                    part = Part.objects.get(id=adj['part_id'])
                    inv_trans = InventoryService.record_transaction(
                        part=part,
                        quantity=adj['quantity_change'],
                        transaction_type=transaction_type,
                        user=request.user,
                        branch=branch,
                        reason=adj.get('reason') or default_reason,
                        notes=adj.get('notes', '')
                    )
                    results['successful'].append({'part_id': part.id, 'new_quantity': inv_trans.balance_after})
                except Exception as e:
                    results['failed'].append({'part_id': adj.get('part_id'), 'error': str(e)})
        
        return Response(results)

    @action(detail=True, methods=['get'])
    def transaction_history(self, request, pk=None):
        """Get transaction history for a part"""
        part = self.get_object()
        from .serializers import InventoryTransactionSerializer
        transactions = part.transactions.all().order_by('-created_at')[:50]
        serializer = InventoryTransactionSerializer(transactions, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def reserve(self, request, pk=None):
        """Reserve quantity for a work order"""
        part = self.get_object()
        try:
            quantity = int(request.data.get('quantity', 0))
        except (ValueError, TypeError):
            return Response({'error': 'Invalid quantity'}, status=status.HTTP_400_BAD_REQUEST)
        
        from apps.branches.utils import resolve_branch
        branch = resolve_branch(request)
        if not branch:
            return Response({'error': 'Branch is required.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            InventoryService.record_transaction(
                part=part,
                quantity=quantity,
                transaction_type='reserve',
                user=request.user,
                branch=branch,
                reason=request.data.get('reason', 'Manual reservation')
            )
            return Response({'status': 'Quantity reserved'})
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def release_reservation(self, request, pk=None):
        """Release reserved quantity"""
        part = self.get_object()
        try:
            quantity = int(request.data.get('quantity', 0))
        except (ValueError, TypeError):
            return Response({'error': 'Invalid quantity'}, status=status.HTTP_400_BAD_REQUEST)
        
        from apps.branches.utils import resolve_branch
        branch = resolve_branch(request)
        if not branch:
            return Response({'error': 'Branch is required.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            InventoryService.record_transaction(
                part=part,
                quantity=quantity,
                transaction_type='release',
                user=request.user,
                branch=branch,
                reason=request.data.get('reason', 'Manual release')
            )
            return Response({'status': 'Reservation released'})
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class InventoryReportMixin:
    """Mixin for inventory specific reports and stats"""
    
    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """Get inventory dashboard statistics"""
        from django.db.models import F, Value, IntegerField
        from django.db.models.functions import Coalesce
        from apps.branches.utils import resolve_branch
        branch = resolve_branch(request)
        queryset = InventoryService.get_stock_queryset(self.get_queryset(), branch)
        effective_reorder = Coalesce(
            'branch_reorder_point', 'reorder_point', Value(0), output_field=IntegerField()
        )
        qs = queryset.annotate(_eff_reorder=effective_reorder)

        stats = {
            'total_parts': qs.count(),
            'low_stock': qs.filter(current_stock__lte=F('_eff_reorder')).count(),
            'out_of_stock': qs.filter(current_stock=0).count(),
            'total_value': InventoryService.get_stock_valuation(self.get_queryset(), branch)
        }
        return Response(stats)

    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        """Get list of parts with low stock"""
        from django.db.models import F, Value, IntegerField
        from django.db.models.functions import Coalesce
        from apps.branches.utils import resolve_branch
        branch = resolve_branch(request)
        queryset = InventoryService.get_stock_queryset(self.get_queryset(), branch)
        effective_reorder = Coalesce(
            'branch_reorder_point', 'reorder_point', Value(0), output_field=IntegerField()
        )
        low_stock_parts = queryset.annotate(_eff_reorder=effective_reorder).filter(
            current_stock__lte=F('_eff_reorder')
        )
        
        page = self.paginate_queryset(low_stock_parts)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(low_stock_parts, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def out_of_stock(self, request):
        """Get parts that are out of stock"""
        from apps.branches.utils import resolve_branch
        branch = resolve_branch(request)
        queryset = InventoryService.get_stock_queryset(self.get_queryset(), branch)
        parts = queryset.filter(current_stock=0)
        
        page = self.paginate_queryset(parts)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(parts, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def inventory_value(self, request):
        """Get total inventory value breakdown"""
        from apps.branches.utils import resolve_branch
        from .models import PartCategory
        from decimal import Decimal
        
        branch = resolve_branch(request)
        parts = self.get_queryset().filter(is_active=True)
        total_value = InventoryService.get_stock_valuation(parts, branch)
        
        by_category = []
        for category in PartCategory.objects.filter(is_active=True):
            cat_parts = parts.filter(category=category)
            cat_value = InventoryService.get_stock_valuation(cat_parts, branch)
            if cat_value > 0:
                by_category.append({
                    'category_name': category.name,
                    'parts_count': cat_parts.count(),
                    'total_value': float(cat_value)
                })
        
        return Response({
            'total_value': float(total_value),
            'by_category': by_category
        })
