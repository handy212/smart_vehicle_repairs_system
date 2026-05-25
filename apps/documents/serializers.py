"""
Serializers for Document Management
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from .models import (
    DocumentCategory,
    Document,
    DocumentVersion,
    DocumentShare,
    DocumentAccess,
    DocumentSignature
)

User = get_user_model()


class ProtectedFileRepresentationMixin:
    """Replace raw storage URLs with presigned or authenticated download URLs."""

    def _protected_file_url(self, obj):
        from apps.core.media_urls import get_protected_file_url

        request = self.context.get('request')
        download_path = f'/api/documents/documents/{obj.pk}/download/'
        return get_protected_file_url(
            obj.file,
            request=request,
            download_path=download_path,
        )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.pk:
            protected = self._protected_file_url(instance)
            if protected:
                data['file'] = protected
        return data


class DocumentCategorySerializer(serializers.ModelSerializer):
    """Serializer for DocumentCategory"""
    
    full_path = serializers.ReadOnlyField()
    document_count = serializers.SerializerMethodField()
    
    class Meta:
        model = DocumentCategory
        fields = [
            'id',
            'name',
            'slug',
            'description',
            'icon',
            'parent',
            'is_active',
            'display_order',
            'full_path',
            'document_count',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def get_document_count(self, obj):
        """Get count of documents in this category"""
        return obj.documents.filter(status='active').count()
    
    def validate(self, data):
        """Validate that parent doesn't create circular reference"""
        parent = data.get('parent')
        if parent:
            # Check for circular reference
            current = parent
            max_depth = 10
            depth = 0
            while current and depth < max_depth:
                if current == self.instance:
                    raise serializers.ValidationError({
                        'parent': 'Cannot set category as its own parent (circular reference)'
                    })
                current = current.parent
                depth += 1
        return data


class DocumentCategoryTreeSerializer(serializers.ModelSerializer):
    """Hierarchical serializer for category tree"""
    
    children = serializers.SerializerMethodField()
    document_count = serializers.SerializerMethodField()
    
    class Meta:
        model = DocumentCategory
        fields = [
            'id',
            'name',
            'slug',
            'description',
            'icon',
            'is_active',
            'display_order',
            'document_count',
            'children'
        ]
    
    def get_children(self, obj):
        """Get child categories recursively"""
        children = obj.children.filter(is_active=True).order_by('display_order', 'name')
        return DocumentCategoryTreeSerializer(children, many=True).data
    
    def get_document_count(self, obj):
        """Get count of documents in this category"""
        return obj.documents.filter(status='active').count()


class DocumentListSerializer(ProtectedFileRepresentationMixin, serializers.ModelSerializer):
    """Lightweight serializer for document lists"""
    
    category_name = serializers.CharField(source='category.name', read_only=True)
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)
    uploaded_by_email = serializers.CharField(source='uploaded_by.email', read_only=True)
    file_size_display = serializers.ReadOnlyField()
    is_image = serializers.ReadOnlyField()
    is_pdf = serializers.ReadOnlyField()
    
    class Meta:
        model = Document
        fields = [
            'id',
            'document_number',
            'title',
            'description',
            'category',
            'category_name',
            'file',
            'file_size',
            'file_size_display',
            'file_type',
            'original_filename',
            'thumbnail',
            'version_number',
            'is_latest_version',
            'status',
            'tags',
            'is_image',
            'is_pdf',
            'uploaded_by',
            'uploaded_by_name',
            'uploaded_by_email',
            'uploaded_at',
            'access_count',
            'last_accessed_at',
            'asset_acquisition_request',
            'fixed_asset',
            'acquisition_document_kind',
        ]
        read_only_fields = [
            'document_number',
            'file_size',
            'file_type',
            'original_filename',
            'thumbnail',
            'uploaded_at',
            'access_count',
            'last_accessed_at'
        ]


class DocumentDetailSerializer(ProtectedFileRepresentationMixin, serializers.ModelSerializer):
    """Detailed serializer for document with all relationships"""
    
    category_name = serializers.CharField(source='category.name', read_only=True)
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)
    uploaded_by_email = serializers.CharField(source='uploaded_by.email', read_only=True)
    file_size_display = serializers.ReadOnlyField()
    is_image = serializers.ReadOnlyField()
    is_pdf = serializers.ReadOnlyField()
    
    # Related entity details
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    vehicle_display = serializers.SerializerMethodField()
    work_order_number = serializers.CharField(source='work_order.work_order_number', read_only=True)
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    estimate_number = serializers.CharField(source='estimate.estimate_number', read_only=True)
    appointment_number = serializers.CharField(source='appointment.appointment_number', read_only=True)
    acquisition_request_number = serializers.CharField(
        source='asset_acquisition_request.request_number',
        read_only=True,
        allow_null=True,
    )
    
    # Counts
    version_count = serializers.SerializerMethodField()
    share_count = serializers.SerializerMethodField()
    signature_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Document
        fields = [
            'id',
            'document_number',
            'title',
            'description',
            'category',
            'category_name',
            'file',
            'file_size',
            'file_size_display',
            'file_type',
            'original_filename',
            'thumbnail',
            'version_number',
            'is_latest_version',
            'status',
            'tags',
            'is_image',
            'is_pdf',
            'customer',
            'customer_name',
            'vehicle',
            'vehicle_display',
            'work_order',
            'work_order_number',
            'appointment',
            'appointment_number',
            'invoice',
            'invoice_number',
            'estimate',
            'estimate_number',
            'asset_acquisition_request',
            'acquisition_request_number',
            'fixed_asset',
            'acquisition_document_kind',
            'is_public',
            'access_count',
            'last_accessed_at',
            'uploaded_by',
            'uploaded_by_name',
            'uploaded_by_email',
            'uploaded_at',
            'updated_at',
            'version_count',
            'share_count',
            'signature_count'
        ]
        read_only_fields = [
            'document_number',
            'file_size',
            'file_type',
            'original_filename',
            'thumbnail',
            'version_number',
            'access_count',
            'last_accessed_at',
            'uploaded_at',
            'updated_at'
        ]
    
    def get_vehicle_display(self, obj):
        """Get vehicle display string"""
        if obj.vehicle:
            return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
        return None
    
    def get_version_count(self, obj):
        """Get count of versions"""
        return obj.versions.count()
    
    def get_share_count(self, obj):
        """Get count of active shares"""
        return obj.shares.filter(is_active=True).count()
    
    def get_signature_count(self, obj):
        """Get count of signatures"""
        return obj.signatures.count()


class DocumentCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/uploading documents"""
    
    class Meta:
        model = Document
        fields = [
            'title',
            'description',
            'category',
            'file',
            'status',
            'tags',
            'customer',
            'vehicle',
            'work_order',
            'appointment',
            'invoice',
            'estimate',
            'asset_acquisition_request',
            'fixed_asset',
            'acquisition_document_kind',
        ]
        read_only_fields = ['is_public']
    
    def validate_file(self, value):
        """Validate file upload"""
        # Check file size (max 50MB)
        max_size = 50 * 1024 * 1024  # 50 MB
        if value.size > max_size:
            raise serializers.ValidationError(
                f"File size exceeds maximum allowed size of 50 MB. Your file is {value.size / (1024*1024):.1f} MB."
            )
        
        # Check file type (basic validation)
        allowed_types = [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/gif',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]
        
        # Get content type from file
        content_type = value.content_type
        if content_type not in allowed_types:
            raise serializers.ValidationError(
                f"File type '{content_type}' is not allowed. "
                f"Allowed types: PDF, Images (JPEG, PNG, GIF), Word, Excel."
            )
        
        return value

    def validate(self, data):
        from apps.branches.utils import get_user_accessible_branches
        from apps.fixed_assets.models import AssetAcquisitionRequest, FixedAsset

        request = self.context['request']
        user = request.user

        req = data.get('asset_acquisition_request')
        fixed_asset = data.get('fixed_asset')
        kind = (data.get('acquisition_document_kind') or '').strip()

        transactional = [
            data.get('customer'),
            data.get('vehicle'),
            data.get('work_order'),
            data.get('appointment'),
            data.get('invoice'),
            data.get('estimate'),
        ]

        if fixed_asset is not None and req is not None:
            raise serializers.ValidationError(
                'Use only one of fixed_asset or asset_acquisition_request for invoice/receipt uploads.'
            )

        if fixed_asset is not None or req is not None:
            if kind not in ('invoice', 'receipt'):
                raise serializers.ValidationError({
                    'acquisition_document_kind': 'Must be invoice or receipt for fixed asset or acquisition uploads',
                })
            if any(t is not None for t in transactional):
                raise serializers.ValidationError(
                    'Invoice/receipt uploads for a fixed asset or acquisition cannot also be linked to '
                    'customer, vehicle, work order, appointment, invoice, or estimate.'
                )

        if fixed_asset is not None:
            fa_pk = getattr(fixed_asset, 'pk', fixed_asset)
            asset = FixedAsset.objects.filter(pk=fa_pk).select_related('branch').first()
            if not asset:
                raise serializers.ValidationError({'fixed_asset': 'Invalid fixed asset'})
            if getattr(user, 'is_superuser', False) or getattr(user, 'role', None) in ('super-admin', 'admin'):
                pass
            elif not get_user_accessible_branches(user).filter(id=asset.branch_id).exists():
                raise serializers.ValidationError({
                    'fixed_asset': 'You do not have access to upload documents for this asset branch',
                })

        if kind and fixed_asset is None and req is None:
            raise serializers.ValidationError({
                'acquisition_document_kind': 'Set only when fixed_asset or asset_acquisition_request is provided',
            })

        if req is not None:
            pk = getattr(req, 'pk', req)
            acquisition = AssetAcquisitionRequest.objects.filter(pk=pk).only('id', 'status').first()
            if not acquisition:
                raise serializers.ValidationError({
                    'asset_acquisition_request': 'Invalid acquisition request',
                })
            if acquisition.status == 'rejected':
                raise serializers.ValidationError({
                    'asset_acquisition_request': 'Cannot attach invoice or receipt to a rejected acquisition request',
                })

        return data
    
    def create(self, validated_data):
        """Create document with uploaded_by from request user"""
        validated_data['uploaded_by'] = self.context['request'].user
        return super().create(validated_data)


class DocumentVersionSerializer(serializers.ModelSerializer):
    """Serializer for document versions"""
    
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)
    document_number = serializers.CharField(source='document.document_number', read_only=True)
    document_title = serializers.CharField(source='document.title', read_only=True)
    file_size_display = serializers.SerializerMethodField()
    
    class Meta:
        model = DocumentVersion
        fields = [
            'id',
            'document',
            'document_number',
            'document_title',
            'version_number',
            'file',
            'file_size',
            'file_size_display',
            'file_type',
            'original_filename',
            'changes_description',
            'uploaded_by',
            'uploaded_by_name',
            'uploaded_at'
        ]
        read_only_fields = [
            'version_number',
            'file_size',
            'file_type',
            'original_filename',
            'uploaded_at'
        ]
    
    def get_file_size_display(self, obj):
        """Human-readable file size"""
        size = obj.file_size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024.0:
                return f"{size:.1f} {unit}"
            size /= 1024.0
        return f"{size:.1f} TB"


class DocumentShareSerializer(serializers.ModelSerializer):
    """Serializer for document sharing"""
    
    document_title = serializers.CharField(source='document.title', read_only=True)
    document_number = serializers.CharField(source='document.document_number', read_only=True)
    shared_by_name = serializers.CharField(source='shared_by.get_full_name', read_only=True)
    share_url = serializers.ReadOnlyField()
    is_expired = serializers.ReadOnlyField()
    
    class Meta:
        model = DocumentShare
        fields = [
            'id',
            'document',
            'document_title',
            'document_number',
            'shared_by',
            'shared_by_name',
            'shared_with_email',
            'share_token',
            'access_code',
            'expires_at',
            'max_views',
            'view_count',
            'is_active',
            'is_expired',
            'share_url',
            'created_at',
            'last_accessed_at'
        ]
        read_only_fields = [
            'share_token',
            'view_count',
            'created_at',
            'last_accessed_at',
            'shared_by'
        ]
    
    def create(self, validated_data):
        """Create share with shared_by from request user"""
        validated_data['shared_by'] = self.context['request'].user
        return super().create(validated_data)
    
    def validate(self, data):
        """Validate share settings"""
        # Set default expiration if not provided (7 days)
        if 'expires_at' not in data or data['expires_at'] is None:
            data['expires_at'] = timezone.now() + timedelta(days=7)
        
        # Validate expires_at is in the future
        if data['expires_at'] <= timezone.now():
            raise serializers.ValidationError({
                'expires_at': 'Expiration date must be in the future'
            })
        
        # Validate max_views if provided
        if 'max_views' in data and data['max_views'] is not None:
            if data['max_views'] < 1:
                raise serializers.ValidationError({
                    'max_views': 'Maximum views must be at least 1'
                })
        
        return data


class DocumentShareCreateSerializer(serializers.Serializer):
    """Serializer for creating a document share with options"""
    
    shared_with_email = serializers.EmailField(required=False, allow_blank=True)
    access_code = serializers.CharField(required=False, allow_blank=True, max_length=20)
    expires_in_days = serializers.IntegerField(default=7, min_value=1, max_value=365)
    max_views = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    send_email = serializers.BooleanField(default=True)
    
    def validate_expires_in_days(self, value):
        """Validate expiration days"""
        if value < 1 or value > 365:
            raise serializers.ValidationError("Expiration must be between 1 and 365 days")
        return value


class DocumentAccessSerializer(serializers.ModelSerializer):
    """Serializer for document access logs"""
    
    document_number = serializers.CharField(source='document.document_number', read_only=True)
    document_title = serializers.CharField(source='document.title', read_only=True)
    user_name = serializers.SerializerMethodField()
    share_token = serializers.CharField(source='share_link.share_token', read_only=True)
    
    class Meta:
        model = DocumentAccess
        fields = [
            'id',
            'document',
            'document_number',
            'document_title',
            'user',
            'user_name',
            'action',
            'accessed_at',
            'ip_address',
            'user_agent',
            'share_link',
            'share_token',
            'notes'
        ]
        read_only_fields = ['accessed_at']
    
    def get_user_name(self, obj):
        """Get user name or 'Anonymous'"""
        if obj.user:
            return obj.user.get_full_name() or obj.user.email
        return 'Anonymous'


class DocumentSignatureSerializer(serializers.ModelSerializer):
    """Serializer for document signatures"""
    
    document_title = serializers.CharField(source='document.title', read_only=True)
    document_number = serializers.CharField(source='document.document_number', read_only=True)
    requested_by_name = serializers.CharField(source='requested_by.get_full_name', read_only=True)
    signature_url = serializers.ReadOnlyField()
    is_expired = serializers.ReadOnlyField()
    
    class Meta:
        model = DocumentSignature
        fields = [
            'id',
            'document',
            'document_title',
            'document_number',
            'signer_name',
            'signer_email',
            'signature_data',
            'status',
            'request_sent_at',
            'signed_at',
            'expires_at',
            'request_token',
            'ip_address',
            'user_agent',
            'notes',
            'decline_reason',
            'requested_by',
            'requested_by_name',
            'signature_url',
            'is_expired'
        ]
        read_only_fields = [
            'request_token',
            'request_sent_at',
            'signed_at',
            'ip_address',
            'user_agent',
            'requested_by',
            'signature_data',
            'status'
        ]


class DocumentSignatureRequestSerializer(serializers.Serializer):
    """Serializer for requesting a signature"""
    
    signer_name = serializers.CharField(max_length=200)
    signer_email = serializers.EmailField()
    expires_in_days = serializers.IntegerField(default=7, min_value=1, max_value=30)
    notes = serializers.CharField(required=False, allow_blank=True)
    send_email = serializers.BooleanField(default=True)
    
    def validate_expires_in_days(self, value):
        """Validate expiration days"""
        if value < 1 or value > 30:
            raise serializers.ValidationError("Expiration must be between 1 and 30 days")
        return value


class DocumentSignatureSubmitSerializer(serializers.Serializer):
    """Serializer for submitting a signature"""
    
    signature_data = serializers.CharField(
        help_text="Base64 encoded signature image (data URL format)"
    )
    
    def validate_signature_data(self, value):
        """Validate signature data is base64"""
        if not value.startswith('data:image/'):
            raise serializers.ValidationError(
                "Signature data must be a data URL (data:image/png;base64,...)"
            )
        return value


class DocumentSignatureDeclineSerializer(serializers.Serializer):
    """Serializer for declining a signature"""
    
    reason = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Reason for declining the signature"
    )


class DocumentSearchSerializer(serializers.Serializer):
    """Serializer for document search parameters"""
    
    query = serializers.CharField(required=False, allow_blank=True)
    category = serializers.IntegerField(required=False)
    status = serializers.ChoiceField(
        choices=['draft', 'active', 'archived'],
        required=False
    )
    file_type = serializers.CharField(required=False)
    uploaded_by = serializers.IntegerField(required=False)
    customer = serializers.IntegerField(required=False)
    vehicle = serializers.IntegerField(required=False)
    work_order = serializers.IntegerField(required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    tags = serializers.CharField(required=False, help_text="Comma-separated tags")


class DocumentStatsSerializer(serializers.Serializer):
    """Serializer for document statistics"""
    
    total_documents = serializers.IntegerField()
    total_size = serializers.IntegerField()
    total_size_display = serializers.CharField()
    by_status = serializers.DictField()
    by_category = serializers.DictField()
    by_file_type = serializers.DictField()
    recent_uploads = serializers.ListField()
    most_accessed = serializers.ListField()
