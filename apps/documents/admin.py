"""
Admin interface for Document Management
"""
from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.utils.safestring import mark_safe
from .models import (
    DocumentCategory,
    Document,
    DocumentVersion,
    DocumentShare,
    DocumentAccess,
    DocumentSignature
)


@admin.register(DocumentCategory)
class DocumentCategoryAdmin(admin.ModelAdmin):
    """Admin for DocumentCategory"""
    
    list_display = [
        'name',
        'slug',
        'parent',
        'icon_display',
        'document_count',
        'is_active',
        'display_order',
        'created_at'
    ]
    list_filter = ['is_active', 'parent', 'created_at']
    search_fields = ['name', 'slug', 'description']
    prepopulated_fields = {'slug': ('name',)}
    ordering = ['display_order', 'name']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'slug', 'description', 'icon')
        }),
        ('Hierarchy', {
            'fields': ('parent', 'display_order')
        }),
        ('Status', {
            'fields': ('is_active',)
        }),
    )
    
    def icon_display(self, obj):
        """Display icon"""
        if obj.icon:
            return format_html('<i class="{}"></i> {}', obj.icon, obj.icon)
        return '-'
    icon_display.short_description = 'Icon'
    
    def document_count(self, obj):
        """Count of documents in category"""
        count = obj.documents.filter(status='active').count()
        if count > 0:
            url = reverse('admin:documents_document_changelist') + f'?category__id__exact={obj.id}'
            return format_html('<a href="{}">{}</a>', url, count)
        return count
    document_count.short_description = 'Documents'


class DocumentVersionInline(admin.TabularInline):
    """Inline for document versions"""
    model = DocumentVersion
    extra = 0
    readonly_fields = ['version_number', 'file_size', 'file_type', 'uploaded_by', 'uploaded_at']
    fields = ['version_number', 'file', 'file_size', 'changes_description', 'uploaded_by', 'uploaded_at']
    can_delete = False


class DocumentShareInline(admin.TabularInline):
    """Inline for document shares"""
    model = DocumentShare
    extra = 0
    readonly_fields = ['share_token', 'view_count', 'created_at', 'last_accessed_at']
    fields = ['shared_with_email', 'share_token', 'expires_at', 'max_views', 'view_count', 'is_active']


class DocumentSignatureInline(admin.TabularInline):
    """Inline for document signatures"""
    model = DocumentSignature
    extra = 0
    readonly_fields = ['request_token', 'status', 'signed_at', 'request_sent_at']
    fields = ['signer_name', 'signer_email', 'status', 'request_token', 'signed_at']


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    """Admin for Document"""
    
    list_display = [
        'document_number',
        'title',
        'category',
        'file_type_badge',
        'file_size_display',
        'status',
        'version_number',
        'access_count',
        'uploaded_by',
        'uploaded_at'
    ]
    list_filter = [
        'status',
        'category',
        'file_type',
        'is_public',
        'uploaded_at',
        'uploaded_by'
    ]
    search_fields = [
        'document_number',
        'title',
        'description',
        'tags',
        'original_filename'
    ]
    readonly_fields = [
        'document_number',
        'file_size',
        'file_type',
        'original_filename',
        'version_number',
        'is_latest_version',
        'access_count',
        'last_accessed_at',
        'uploaded_at',
        'updated_at'
    ]
    
    fieldsets = (
        ('Document Information', {
            'fields': (
                'document_number',
                'title',
                'description',
                'category',
                'status',
                'tags'
            )
        }),
        ('File Information', {
            'fields': (
                'file',
                'thumbnail'
            )
        }),
        ('Version Information', {
            'fields': (
                'version_number',
                'is_latest_version'
            )
        }),
        ('Relationships', {
            'fields': (
                'customer',
                'vehicle',
                'work_order',
                'appointment',
                'invoice',
                'estimate'
            ),
            'classes': ('collapse',)
        }),
        ('Access Control', {
            'fields': (
                'is_public',
                'access_count',
                'last_accessed_at'
            )
        }),
        ('Metadata', {
            'fields': (
                'uploaded_by',
                'uploaded_at',
                'updated_at'
            )
        }),
    )
    
    inlines = [DocumentVersionInline, DocumentShareInline, DocumentSignatureInline]
    
    def file_type_badge(self, obj):
        """Display file type as badge"""
        if obj.is_image:
            icon = '🖼️'
            text = 'Image'
        elif obj.is_pdf:
            icon = '📄'
            text = 'PDF'
        elif 'word' in obj.file_type.lower() or 'document' in obj.file_type.lower():
            icon = '📝'
            text = 'Word'
        elif 'excel' in obj.file_type.lower() or 'sheet' in obj.file_type.lower():
            icon = '📊'
            text = 'Excel'
        else:
            icon = '📎'
            text = 'File'
        
        return f'{icon} {text}'
    file_type_badge.short_description = 'Type'


@admin.register(DocumentVersion)
class DocumentVersionAdmin(admin.ModelAdmin):
    """Admin for DocumentVersion"""
    
    list_display = [
        'document',
        'version_number',
        'file_size_display',
        'uploaded_by',
        'uploaded_at'
    ]
    list_filter = ['uploaded_at', 'uploaded_by']
    search_fields = ['document__document_number', 'document__title', 'changes_description']
    readonly_fields = ['version_number', 'file_size', 'file_type', 'original_filename', 'uploaded_at']
    
    def file_size_display(self, obj):
        """Human-readable file size"""
        size = obj.file_size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024.0:
                return f"{size:.1f} {unit}"
            size /= 1024.0
        return f"{size:.1f} TB"
    file_size_display.short_description = 'File Size'


@admin.register(DocumentShare)
class DocumentShareAdmin(admin.ModelAdmin):
    """Admin for DocumentShare"""
    
    list_display = [
        'document',
        'shared_with_email',
        'status_display',
        'view_count',
        'max_views',
        'expires_at',
        'shared_by',
        'created_at'
    ]
    list_filter = ['is_active', 'created_at', 'expires_at', 'shared_by']
    search_fields = [
        'document__document_number',
        'document__title',
        'shared_with_email',
        'share_token'
    ]
    readonly_fields = [
        'share_token',
        'share_url',
        'view_count',
        'created_at',
        'last_accessed_at',
        'is_expired'
    ]
    
    fieldsets = (
        ('Share Information', {
            'fields': ('document', 'shared_by', 'shared_with_email')
        }),
        ('Access Control', {
            'fields': ('share_token', 'share_url', 'access_code', 'is_active')
        }),
        ('Expiration & Limits', {
            'fields': ('expires_at', 'max_views', 'view_count', 'is_expired')
        }),
        ('Tracking', {
            'fields': ('created_at', 'last_accessed_at')
        }),
    )
    
    def status_display(self, obj):
        """Display status"""
        if obj.is_expired:
            return '❌ Expired'
        elif obj.is_active:
            return '✅ Active'
        else:
            return '⏸️ Inactive'
    status_display.short_description = 'Status'


@admin.register(DocumentAccess)
class DocumentAccessAdmin(admin.ModelAdmin):
    """Admin for DocumentAccess"""
    
    list_display = [
        'document',
        'user_display',
        'action',
        'accessed_at',
        'ip_address',
        'share_link'
    ]
    list_filter = ['action', 'accessed_at']
    search_fields = [
        'document__document_number',
        'document__title',
        'user__email',
        'ip_address'
    ]
    readonly_fields = ['accessed_at']
    
    def user_display(self, obj):
        """Display user or anonymous"""
        if obj.user:
            return obj.user.get_full_name() or obj.user.email
        return 'Anonymous'
    user_display.short_description = 'User'


@admin.register(DocumentSignature)
class DocumentSignatureAdmin(admin.ModelAdmin):
    """Admin for DocumentSignature"""
    
    list_display = [
        'document',
        'signer_name',
        'signer_email',
        'status',
        'signed_at',
        'expires_at',
        'requested_by',
        'request_sent_at'
    ]
    list_filter = ['status', 'request_sent_at', 'signed_at', 'requested_by']
    search_fields = [
        'document__document_number',
        'document__title',
        'signer_name',
        'signer_email',
        'request_token'
    ]
    readonly_fields = [
        'request_token',
        'signature_url',
        'request_sent_at',
        'signed_at',
        'ip_address',
        'user_agent',
        'is_expired'
    ]
    
    fieldsets = (
        ('Document & Signer', {
            'fields': ('document', 'signer_name', 'signer_email')
        }),
        ('Signature Request', {
            'fields': (
                'requested_by',
                'request_token',
                'signature_url',
                'request_sent_at',
                'expires_at',
                'is_expired',
                'notes'
            )
        }),
        ('Signature Data', {
            'fields': ('status', 'signature_data', 'signed_at')
        }),
        ('Decline Information', {
            'fields': ('decline_reason',),
            'classes': ('collapse',)
        }),
        ('Tracking', {
            'fields': ('ip_address', 'user_agent')
        }),
    )
