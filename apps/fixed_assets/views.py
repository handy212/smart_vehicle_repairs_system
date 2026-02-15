from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Count, Q, Avg, F
from django.utils import timezone
from decimal import Decimal
import logging

from apps.branches.utils import filter_queryset_for_user_branches
from .models import AssetCategory, FixedAsset, DepreciationSchedule, AssetMaintenance
from .serializers import (
    AssetCategorySerializer, AssetCategoryCreateSerializer,
    FixedAssetListSerializer, FixedAssetDetailSerializer,
    FixedAssetCreateSerializer, FixedAssetUpdateSerializer,
    DepreciationScheduleSerializer,
    AssetMaintenanceSerializer, AssetMaintenanceCreateSerializer,
    AssetValuationReportSerializer, DepreciationSummarySerializer
)
from .depreciation_service import DepreciationService

logger = logging.getLogger(__name__)


class AssetCategoryViewSet(viewsets.ModelViewSet):
    """ViewSet for asset categories"""
    
    queryset = AssetCategory.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return AssetCategoryCreateSerializer
        return AssetCategorySerializer
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get only active categories"""
        categories = self.queryset.filter(is_active=True)
        serializer = self.get_serializer(categories, many=True)
        return Response(serializer.data)


class FixedAssetViewSet(viewsets.ModelViewSet):
    """ViewSet for fixed assets with comprehensive filtering and reporting"""
    
    queryset = FixedAsset.objects.select_related(
        'category', 'branch', 'supplier', 'created_by', 'assigned_to__user'
    ).all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'category', 'branch', 'depreciation_method', 'assigned_to']
    search_fields = ['asset_number', 'name', 'description', 'serial_number', 'manufacturer']
    ordering_fields = [
        'asset_number', 'name', 'acquisition_date', 'acquisition_cost',
        'net_book_value', 'accumulated_depreciation', 'created_at'
    ]
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Filter assets by user's accessible branches"""
        queryset = super().get_queryset()
        return filter_queryset_for_user_branches(queryset, self.request.user, self.request)
    
    def get_serializer_class(self):
        if self.action == 'list':
            return FixedAssetListSerializer
        elif self.action == 'create':
            return FixedAssetCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return FixedAssetUpdateSerializer
        return FixedAssetDetailSerializer
    
    def perform_create(self, serializer):
        """Set created_by on asset creation"""
        serializer.save(created_by=self.request.user)
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get only active assets"""
        assets = self.get_queryset().filter(status='active')
        page = self.paginate_queryset(assets)
        if page is not None:
            serializer = FixedAssetListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = FixedAssetListSerializer(assets, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """Get dashboard statistics for fixed assets"""
        assets = self.get_queryset()
        
        # Total counts
        total_count = assets.count()
        active_count = assets.filter(status='active').count()
        inactive_count = assets.filter(status='inactive').count()
        disposed_count = assets.filter(status='disposed').count()
        
        # Financial aggregates
        aggregates = assets.aggregate(
            total_acquisition_cost=Sum('acquisition_cost'),
            total_net_book_value=Sum('net_book_value'),
            total_accumulated_depreciation=Sum('accumulated_depreciation'),
            avg_depreciation_percent=Avg(
                (F('accumulated_depreciation') / F('acquisition_cost')) * 100
            )
        )
        
        # Calculate fully depreciated count
        fully_depreciated = assets.filter(
            accumulated_depreciation__gte=F('acquisition_cost') - F('salvage_value')
        ).count()
        
        return Response({
            'total_assets': total_count,
            'active_assets': active_count,
            'inactive_assets': inactive_count,
            'disposed_assets': disposed_count,
            'fully_depreciated': fully_depreciated,
            'total_acquisition_cost': float(aggregates['total_acquisition_cost'] or 0),
            'total_net_book_value': float(aggregates['total_net_book_value'] or 0),
            'total_accumulated_depreciation': float(aggregates['total_accumulated_depreciation'] or 0),
            'avg_depreciation_percent': float(aggregates['avg_depreciation_percent'] or 0),
        })
    
    @action(detail=False, methods=['get'])
    def fully_depreciated(self, request):
        """Get fully depreciated assets"""
        assets = self.get_queryset().filter(
            accumulated_depreciation__gte=F('acquisition_cost') - F('salvage_value')
        )
        serializer = FixedAssetListSerializer(assets, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def calculate_depreciation(self, request, pk=None):
        """Calculate depreciation for a specific asset for a period"""
        asset = self.get_object()
        
        period_months = int(request.data.get('period_months', 1))
        units_produced = int(request.data.get('units_produced', 0))
        
        depreciation_amount = DepreciationService.calculate_depreciation(
            asset,
            period_months=period_months,
            units_produced=units_produced
        )
        
        return Response({
            'asset_number': asset.asset_number,
            'depreciation_amount': float(depreciation_amount),
            'current_accumulated': float(asset.accumulated_depreciation),
            'new_accumulated': float(asset.accumulated_depreciation + depreciation_amount),
            'net_book_value': float(asset.net_book_value - depreciation_amount)
        })
    
    @action(detail=True, methods=['post'])
    def post_depreciation(self, request, pk=None):
        """Manually post depreciation for an asset"""
        asset = self.get_object()
        
        depreciation_amount = Decimal(str(request.data.get('depreciation_amount', 0)))
        period_start_date = request.data.get('period_start_date')
        period_end_date = request.data.get('period_end_date')
        post_to_gl = request.data.get('post_to_gl', True)
        
        if not period_start_date or not period_end_date:
            return Response(
                {'error': 'period_start_date and period_end_date are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from datetime import datetime
            period_start = datetime.strptime(period_start_date, '%Y-%m-%d').date()
            period_end = datetime.strptime(period_end_date, '%Y-%m-%d').date()
            
            schedule, je_id = DepreciationService.post_depreciation(
                asset,
                depreciation_amount,
                period_start,
                period_end,
                post_to_gl=post_to_gl
            )
            
            if schedule:
                return Response({
                    'message': 'Depreciation posted successfully',
                    'depreciation_amount': float(depreciation_amount),
                    'journal_entry_id': je_id,
                    'schedule_id': schedule.id
                })
            else:
                return Response(
                    {'error': 'Failed to post depreciation'},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
        except Exception as e:
            logger.error(f'Error posting depreciation: {e}', exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def valuation_report(self, request):
        """
        Asset valuation report by category
        
        Query params:
        - as_of_date: Valuation as of date (defaults to today)
        - category: Filter by category ID
        """
        as_of_date = request.query_params.get('as_of_date', timezone.now().date())
        category_id = request.query_params.get('category')
        
        assets = self.get_queryset().filter(status='active')
        
        if category_id:
            assets = assets.filter(category_id=category_id)
        
        # Group by category
        categories = AssetCategory.objects.filter(is_active=True)
        report_data = []
        
        total_acquisition = Decimal('0')
        total_accumulated = Decimal('0')
        total_nbv = Decimal('0')
        
        for category in categories:
            category_assets = assets.filter(category=category)
            
            if not category_assets.exists():
                continue
            
            summary = category_assets.aggregate(
                count=Count('id'),
                total_cost=Sum('acquisition_cost'),
                total_depreciation=Sum('accumulated_depreciation'),
                total_nbv=Sum('net_book_value')
            )
            
            acquisition_cost = summary['total_cost'] or Decimal('0')
            accumulated_dep = summary['total_depreciation'] or Decimal('0')
            net_book_value = summary['total_nbv'] or Decimal('0')
            
            avg_depreciation = (accumulated_dep / acquisition_cost * 100) if acquisition_cost > 0 else 0
            
            report_data.append({
                'category_id': category.id,
                'category_name': category.name,
                'asset_count': summary['count'],
                'total_acquisition_cost': acquisition_cost,
                'total_accumulated_depreciation': accumulated_dep,
                'total_net_book_value': net_book_value,
                'avg_depreciation_percent': float(avg_depreciation)
            })
            
            total_acquisition += acquisition_cost
            total_accumulated += accumulated_dep
            total_nbv += net_book_value
        
        serializer = AssetValuationReportSerializer(report_data, many=True)
        
        return Response({
            'as_of_date': str(as_of_date),
            'by_category': serializer.data,
            'totals': {
                'total_assets': assets.count(),
                'total_acquisition_cost': float(total_acquisition),
                'total_accumulated_depreciation': float(total_accumulated),
                'total_net_book_value': float(total_nbv),
                'avg_depreciation_percent': float((total_accumulated / total_acquisition * 100) if total_acquisition > 0 else 0)
            }
        })
    
    @action(detail=False, methods=['post'])
    def run_depreciation(self, request):
        """
        Run monthly depreciation for all assets
        
        Request body:
        {
            "target_month": 11,
            "target_year": 2024,
            "branch_id": 1 (optional),
            "post_to_gl": true
        }
        """
        target_month = request.data.get('target_month')
        target_year = request.data.get('target_year')
        branch_id = request.data.get('branch_id')
        post_to_gl = request.data.get('post_to_gl', True)
        
        try:
            from apps.branches.models import Branch
            branch = None
            if branch_id:
                branch = Branch.objects.get(id=branch_id)
            
            summary = DepreciationService.run_monthly_depreciation(
                target_month=target_month,
                target_year=target_year,
                branch=branch,
                post_to_gl=post_to_gl
            )
            
            serializer = DepreciationSummarySerializer(summary)
            return Response(serializer.data)
            
        except Exception as e:
            logger.error(f'Error running depreciation: {e}', exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class DepreciationScheduleViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing depreciation schedules (read-only)"""
    
    queryset = DepreciationSchedule.objects.select_related('asset').all()
    serializer_class = DepreciationScheduleSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['asset', 'is_posted']
    ordering_fields = ['period_start_date', 'created_at']
    ordering = ['-period_start_date']
    
    def get_queryset(self):
        """Filter by user's accessible branches"""
        queryset = super().get_queryset()
        # Filter through asset's branch
        return queryset.filter(
            asset__branch__in=filter_queryset_for_user_branches(
                self.request.user.branches.all() if hasattr(self.request.user, 'branches') else [],
                self.request.user,
                self.request
            )
        )
    
    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        """Get upcoming scheduled depreciation (not yet posted)"""
        schedules = self.get_queryset().filter(
            is_posted=False,
            period_start_date__lte=timezone.now().date()
        )
        serializer = self.get_serializer(schedules, many=True)
        return Response(serializer.data)


class AssetMaintenanceViewSet(viewsets.ModelViewSet):
    """ViewSet for asset maintenance records"""
    
    queryset = AssetMaintenance.objects.select_related(
        'asset', 'invoice', 'created_by'
    ).all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['asset', 'maintenance_type']
    ordering_fields = ['maintenance_date', 'created_at']
    ordering = ['-maintenance_date']
    
    def get_queryset(self):
        """Filter by user's accessible branches"""
        queryset = super().get_queryset()
        # Filter through asset's branch
        return queryset.filter(
            asset__branch__in=filter_queryset_for_user_branches(
                self.request.user.branches.all() if hasattr(self.request.user, 'branches') else [],
                self.request.user,
                self.request
            )
        )
    
    def get_serializer_class(self):
        if self.action == 'create':
            return AssetMaintenanceCreateSerializer
        return AssetMaintenanceSerializer
    
    def perform_create(self, serializer):
        """Set created_by on maintenance record creation"""
        serializer.save(created_by=self.request.user)
    
    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        """Get upcoming maintenance (next_maintenance_date in next 30 days)"""
        from datetime import timedelta
        today = timezone.now().date()
        upcoming_date = today + timedelta(days=30)
        
        maintenance = self.get_queryset().filter(
            next_maintenance_date__gte=today,
            next_maintenance_date__lte=upcoming_date
        )
        serializer = self.get_serializer(maintenance, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """Get overdue maintenance"""
        today = timezone.now().date()
        
        maintenance = self.get_queryset().filter(
            next_maintenance_date__lt=today
        )
        serializer = self.get_serializer(maintenance, many=True)
        return Response(serializer.data)
