from rest_framework import serializers
from django.db.models import Sum
from decimal import Decimal

from .models import (
    AssetCategory,
    FixedAsset,
    DepreciationSchedule,
    AssetMaintenance,
    AssetAcquisitionRequest,
    AssetAcquisitionApproval,
)
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
        total = obj.assets.filter(status='active').aggregate(
            total=Sum('net_book_value')
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
            return obj.assigned_to.full_name
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
    assigned_to_name = serializers.SerializerMethodField()
    
    class Meta:
        model = FixedAsset
        fields = '__all__'
        read_only_fields = [
            'accumulated_depreciation', 'net_book_value', 'last_depreciation_date',
            'created_at', 'updated_at'
        ]
    
    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.full_name
        return None
    
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

    def to_representation(self, instance):
        from django.db.models import Q
        from apps.documents.models import Document
        from apps.fixed_assets.models import AssetAcquisitionRequest

        data = super().to_representation(instance)
        request = self.context.get('request')

        qs = Document.objects.filter(
            Q(fixed_asset_id=instance.pk) | Q(asset_acquisition_request__created_asset_id=instance.pk),
            acquisition_document_kind__in=('invoice', 'receipt'),
        ).order_by('-uploaded_at')[:50]

        docs = []
        for d in qs:
            file_url = None
            if d.file and request:
                try:
                    file_url = request.build_absolute_uri(d.file.url)
                except Exception:
                    file_url = d.file.url if d.file else None
            elif d.file:
                file_url = d.file.url
            docs.append({
                'id': d.id,
                'document_number': d.document_number,
                'title': d.title,
                'acquisition_document_kind': d.acquisition_document_kind,
                'original_filename': d.original_filename,
                'file': file_url,
                'uploaded_at': d.uploaded_at.isoformat() if d.uploaded_at else None,
            })
        data['invoice_receipt_documents'] = docs

        acq = AssetAcquisitionRequest.objects.filter(created_asset_id=instance.pk).first()
        if acq:
            data['source_acquisition_request_id'] = acq.id
            data['source_acquisition_request_number'] = acq.request_number
        else:
            data['source_acquisition_request_id'] = None
            data['source_acquisition_request_number'] = None

        return data


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
            'name', 'description', 'category',
            'acquisition_cost', 'acquisition_date', 'salvage_value',
            'depreciation_method', 'useful_life_years', 'depreciation_start_date',
            'declining_balance_rate', 'total_units',
            'gl_asset_account_code', 'gl_depreciation_expense_account_code',
            'gl_accumulated_depreciation_account_code',
            'status', 'branch', 'location', 'assigned_to',
            'manufacturer', 'model_number', 'serial_number',
            'purchase_order', 'supplier', 'warranty_expiration', 'notes',
            'disposal_date', 'disposal_method', 'disposal_proceeds', 'disposal_notes'
        ]
    
    def validate(self, data):
        acquisition_cost = data.get('acquisition_cost', getattr(self.instance, 'acquisition_cost', 0))
        salvage_value = data.get('salvage_value', getattr(self.instance, 'salvage_value', 0))
        acquisition_date = data.get('acquisition_date', getattr(self.instance, 'acquisition_date', None))
        depreciation_start_date = data.get(
            'depreciation_start_date',
            getattr(self.instance, 'depreciation_start_date', None)
        )

        if salvage_value >= acquisition_cost:
            raise serializers.ValidationError({
                'salvage_value': 'Salvage value must be less than acquisition cost'
            })

        if depreciation_start_date and acquisition_date and depreciation_start_date < acquisition_date:
            raise serializers.ValidationError({
                'depreciation_start_date': 'Depreciation start date cannot be before acquisition date'
            })

        status = data.get('status', getattr(self.instance, 'status', None))
        if status in ['disposed', 'sold']:
            if not data.get('disposal_date') and not getattr(self.instance, 'disposal_date', None):
                raise serializers.ValidationError({
                    'disposal_date': 'Disposal date is required when status is disposed or sold'
                })
        elif status in ['active', 'inactive', 'retired']:
            data.setdefault('disposal_date', None)
            data.setdefault('disposal_method', None)
            data.setdefault('disposal_proceeds', None)
            data.setdefault('disposal_notes', '')
        
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


class AssetAcquisitionApprovalSerializer(serializers.ModelSerializer):
    approver_name = serializers.SerializerMethodField()

    class Meta:
        model = AssetAcquisitionApproval
        fields = [
            'id',
            'approver',
            'approver_name',
            'status',
            'approved_at',
            'rejected_at',
            'rejection_reason',
            'created_at',
        ]
        read_only_fields = fields

    def get_approver_name(self, obj):
        if obj.approver:
            return obj.approver.get_full_name() or obj.approver.username
        return None


class AssetAcquisitionRequestSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, allow_null=True)
    requested_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    rejected_by_name = serializers.SerializerMethodField()
    received_by_name = serializers.SerializerMethodField()
    created_asset_id = serializers.IntegerField(source='created_asset.id', read_only=True, allow_null=True)
    created_asset_number = serializers.CharField(
        source='created_asset.asset_number', read_only=True, allow_null=True
    )
    approvals = AssetAcquisitionApprovalSerializer(many=True, read_only=True)
    approval_summary = serializers.SerializerMethodField()

    class Meta:
        model = AssetAcquisitionRequest
        fields = [
            'id',
            'request_number',
            'status',
            'title',
            'description',
            'proposed_asset_name',
            'category',
            'category_name',
            'branch',
            'branch_name',
            'supplier',
            'supplier_name',
            'expected_acquisition_cost',
            'salvage_value',
            'depreciation_method',
            'useful_life_years',
            'requested_by',
            'requested_by_name',
            'submitted_at',
            'approved_by',
            'approved_by_name',
            'approved_at',
            'rejected_by',
            'rejected_by_name',
            'rejected_at',
            'rejection_reason',
            'received_by',
            'received_by_name',
            'received_at',
            'received_notes',
            'created_asset_id',
            'created_asset_number',
            'approvals',
            'approval_summary',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'request_number',
            'status',
            'requested_by',
            'submitted_at',
            'approved_by',
            'approved_at',
            'rejected_by',
            'rejected_at',
            'rejection_reason',
            'received_by',
            'received_at',
            'received_notes',
            'created_at',
            'updated_at',
        ]

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return obj.requested_by.get_full_name() or obj.requested_by.username
        return None

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username
        return None

    def get_rejected_by_name(self, obj):
        if obj.rejected_by:
            return obj.rejected_by.get_full_name() or obj.rejected_by.username
        return None

    def get_received_by_name(self, obj):
        if obj.received_by:
            return obj.received_by.get_full_name() or obj.received_by.username
        return None

    def get_approval_summary(self, obj):
        rows = list(obj.approvals.all())
        return {
            'total': len(rows),
            'pending': sum(1 for r in rows if r.status == 'pending'),
            'approved': sum(1 for r in rows if r.status == 'approved'),
            'rejected': sum(1 for r in rows if r.status == 'rejected'),
            'cancelled': sum(1 for r in rows if r.status == 'cancelled'),
        }


class AssetAcquisitionRequestWriteSerializer(serializers.ModelSerializer):
    """Editable fields while request is in draft."""

    class Meta:
        model = AssetAcquisitionRequest
        fields = [
            'title',
            'description',
            'proposed_asset_name',
            'category',
            'branch',
            'supplier',
            'expected_acquisition_cost',
            'salvage_value',
            'depreciation_method',
            'useful_life_years',
        ]

    def validate(self, data):
        salvage = data.get('salvage_value', getattr(self.instance, 'salvage_value', Decimal('0')))
        cost = data.get(
            'expected_acquisition_cost',
            getattr(self.instance, 'expected_acquisition_cost', None),
        )
        if cost is not None and salvage >= cost:
            raise serializers.ValidationError({
                'salvage_value': 'Salvage value must be less than expected acquisition cost',
            })
        return data


class AssetAcquisitionReceiveSerializer(serializers.Serializer):
    acquisition_cost = serializers.DecimalField(max_digits=12, decimal_places=2)
    acquisition_date = serializers.DateField()
    depreciation_start_date = serializers.DateField(required=False, allow_null=True)
    asset_number = serializers.CharField(required=False, allow_blank=True, max_length=50)
    location = serializers.CharField(required=False, allow_blank=True, max_length=200)
    manufacturer = serializers.CharField(required=False, allow_blank=True, max_length=100)
    model_number = serializers.CharField(required=False, allow_blank=True, max_length=100)
    serial_number = serializers.CharField(required=False, allow_blank=True, max_length=100)
    supplier = serializers.IntegerField(required=False, allow_null=True)
    total_units = serializers.IntegerField(required=False, allow_null=True)
    declining_balance_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )
    notes = serializers.CharField(required=False, allow_blank=True)
    received_notes = serializers.CharField(required=False, allow_blank=True)

    def validate_acquisition_cost(self, value):
        if value <= 0:
            raise serializers.ValidationError('Acquisition cost must be greater than zero')
        return value

    def validate_declining_balance_rate(self, value):
        if value is not None and value < Decimal('1'):
            raise serializers.ValidationError('Must be >= 1.00 when provided')
        return value

    def validate(self, data):
        acquisition = self.context.get('acquisition')
        if acquisition is None:
            raise serializers.ValidationError('Server misconfiguration: missing acquisition context')

        if data['acquisition_cost'] <= acquisition.salvage_value:
            raise serializers.ValidationError({
                'acquisition_cost': 'Actual acquisition cost must be greater than the salvage value on the request',
            })

        dep_start = data.get('depreciation_start_date') or data['acquisition_date']
        if dep_start < data['acquisition_date']:
            raise serializers.ValidationError({
                'depreciation_start_date': 'Cannot be before acquisition date',
            })
        data['_effective_depreciation_start'] = dep_start
        return data
