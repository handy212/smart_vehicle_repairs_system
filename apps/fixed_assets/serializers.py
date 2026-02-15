from rest_framework import serializers
from .models import AssetCategory, FixedAsset, DepreciationSchedule, AssetMaintenance
from apps.branches.serializers import BranchListSerializer
from apps.inventory.serializers import SupplierListSerializer


class AssetCategorySerializer(serializers.ModelSerializer):
    """Serializer for asset categories"""
    
    assets_count = serializers.SerializerMethodField()
    total_value = serializers.SerializerMethodField()
    
    class Meta:
        model = AssetCategory
        fields = [
            'id', 'name', 'description', 'default_useful_life_years',
            'default_depreciation_method', 'gl_asset_account_code',
            'gl_depreciation_expense_account_code', 'gl_accumulated_depreciation_account_code',
            'is_active', 'assets_count', 'total_value', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def get_assets_count(self, obj):
        return obj.assets.filter(status='active').count()
    
    def get_total_value(self, obj):
        from decimal import Decimal
        total = obj.assets.filter(status='active').aggregate(
            total=serializers.models.Sum('net_book_value')
        )['total']
        return float(total) if total else 0.0


class AssetCategoryCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating asset categories"""
    
    class Meta:
        model = AssetCategory
        fields = [
            'name', 'description', 'default_useful_life_years',
            'default_depreciation_method', 'gl_asset_account_code',
            'gl_depreciation_expense_account_code', 'gl_accumulated_depreciation_account_code',
            'is_active'
        ]


class FixedAssetListSerializer(serializers.ModelSerializer):
    """List serializer for fixed assets"""
    
    category_name = serializers.CharField(source='category.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    depreciation_percent = serializers.SerializerMethodField()
    
    class Meta:
        model = FixedAsset
        fields = [
            'id', 'asset_number', 'name', 'category', 'category_name',
            'acquisition_cost', 'acquisition_date', 'depreciation_method',
            'useful_life_years', 'accumulated_depreciation', 'net_book_value',
            'depreciation_percent', 'status', 'branch', 'branch_name',
            'assigned_to', 'assigned_to_name',
            'last_depreciation_date', 'created_at'
        ]
    
    def get_depreciation_percent(self, obj):
        if obj.acquisition_cost > 0:
            return float((obj.accumulated_depreciation / obj.acquisition_cost) * 100)
        return 0.0

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.user.get_full_name() or obj.assigned_to.user.username
        return None


class FixedAssetDetailSerializer(serializers.ModelSerializer):
    """Detail serializer for fixed assets"""
    
    category_name = serializers.CharField(source='category.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, allow_null=True)
    created_by_name = serializers.SerializerMethodField()
    depreciation_percent = serializers.SerializerMethodField()
    depreciable_amount = serializers.SerializerMethodField()
    is_fully_depreciated = serializers.BooleanField(read_only=True)
    remaining_useful_life_months = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = FixedAsset
        fields = '__all__'
        read_only_fields = [
            'accumulated_depreciation', 'net_book_value', 'last_depreciation_date',
            'created_at', 'updated_at'
        ]
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None
    
    def get_depreciation_percent(self, obj):
        if obj.acquisition_cost > 0:
            return float((obj.accumulated_depreciation / obj.acquisition_cost) * 100)
        return 0.0
    
    def get_depreciable_amount(self, obj):
        return float(obj.depreciable_amount)


class FixedAssetCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating fixed assets"""
    
    class Meta:
        model = FixedAsset
        fields = [
            'asset_number', 'name', 'description', 'category',
            'acquisition_cost', 'acquisition_date', 'salvage_value',
            'depreciation_method', 'useful_life_years', 'depreciation_start_date',
            'declining_balance_rate', 'total_units',
            'gl_asset_account_code', 'gl_depreciation_expense_account_code',
            'gl_accumulated_depreciation_account_code',
            'status', 'branch', 'location', 'assigned_to',
            'manufacturer', 'model_number', 'serial_number',
            'purchase_order', 'supplier', 'warranty_expiration', 'notes'
        ]
    
    def validate_asset_number(self, value):
        """Ensure asset number is unique"""
        if FixedAsset.objects.filter(asset_number=value).exists():
            raise serializers.ValidationError("Asset number already exists")
        return value
    
    def validate(self, data):
        """Cross-field validation"""
        if data.get('salvage_value', 0) >= data.get('acquisition_cost', 0):
            raise serializers.ValidationError({
                'salvage_value': 'Salvage value must be less than acquisition cost'
            })
        
        if data.get('depreciation_start_date') < data.get('acquisition_date'):
            raise serializers.ValidationError({
                'depreciation_start_date': 'Depreciation start date cannot be before acquisition date'
            })
        
        return data


class FixedAssetUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating fixed assets"""
    
    class Meta:
        model = FixedAsset
        fields = [
            'name', 'description', 'status', 'location', 'assigned_to',
            'manufacturer', 'model_number', 'serial_number',
            'warranty_expiration', 'notes',
            'disposal_date', 'disposal_method', 'disposal_proceeds', 'disposal_notes'
        ]
    
    def validate(self, data):
        """Validate disposal fields"""
        if data.get('status') in ['disposed', 'sold']:
            if not data.get('disposal_date'):
                raise serializers.ValidationError({
                    'disposal_date': 'Disposal date is required when status is disposed or sold'
                })
        
        return data


class DepreciationScheduleSerializer(serializers.ModelSerializer):
    """Serializer for depreciation schedules"""
    
    asset_number = serializers.CharField(source='asset.asset_number', read_only=True)
    asset_name = serializers.CharField(source='asset.name', read_only=True)
    
    class Meta:
        model = DepreciationSchedule
        fields = [
            'id', 'asset', 'asset_number', 'asset_name',
            'period_start_date', 'period_end_date',
            'opening_book_value', 'depreciation_amount',
            'accumulated_depreciation', 'closing_book_value',
            'is_posted', 'posted_at', 'journal_entry_id', 'created_at'
        ]
        read_only_fields = [
            'opening_book_value', 'depreciation_amount', 'accumulated_depreciation',
            'closing_book_value', 'is_posted', 'posted_at', 'journal_entry_id', 'created_at'
        ]


class AssetMaintenanceSerializer(serializers.ModelSerializer):
    """Serializer for asset maintenance records"""
    
    asset_number = serializers.CharField(source='asset.asset_number', read_only=True)
    asset_name = serializers.CharField(source='asset.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True, allow_null=True)
    
    class Meta:
        model = AssetMaintenance
        fields = [
            'id', 'asset', 'asset_number', 'asset_name',
            'maintenance_type', 'maintenance_date', 'description',
            'cost', 'performed_by', 'next_maintenance_date', 'notes',
            'invoice', 'invoice_number', 'created_by', 'created_by_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None


class AssetMaintenanceCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating maintenance records"""
    
    class Meta:
        model = AssetMaintenance
        fields = [
            'asset', 'maintenance_type', 'maintenance_date', 'description',
            'cost', 'performed_by', 'next_maintenance_date', 'notes', 'invoice'
        ]


class AssetValuationReportSerializer(serializers.Serializer):
    """Serializer for asset valuation report"""
    
    category_id = serializers.IntegerField()
    category_name = serializers.CharField()
    asset_count = serializers.IntegerField()
    total_acquisition_cost = serializers.DecimalField(max_digits=15, decimal_places=2)
    total_accumulated_depreciation = serializers.DecimalField(max_digits=15, decimal_places=2)
    total_net_book_value = serializers.DecimalField(max_digits=15, decimal_places=2)
    avg_depreciation_percent = serializers.FloatField()


class DepreciationSummarySerializer(serializers.Serializer):
    """Serializer for depreciation summary report"""
    
    period_start = serializers.DateField()
    period_end = serializers.DateField()
    assets_processed = serializers.IntegerField()
    total_depreciation = serializers.DecimalField(max_digits=15, decimal_places=2)
    assets_skipped = serializers.IntegerField()
    errors = serializers.ListField()
