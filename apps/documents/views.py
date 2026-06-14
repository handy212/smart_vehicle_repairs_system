"""
Views for Document Management API
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from apps.accounts.permissions import HasPermission, user_has_permission, IsModuleEnabled
from apps.accounts.throttles import ShareAccessCodeRateThrottle
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.shortcuts import get_object_or_404
from django.http import FileResponse, HttpResponse
from django.db.models import Q, Count, Sum
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from datetime import timedelta
import mimetypes
from apps.branches.utils import get_user_accessible_branches

from .models import (
    DocumentCategory,
    Document,
    DocumentVersion,
    DocumentShare,
    DocumentAccess,
    DocumentSignature
)
from .serializers import (
    DocumentCategorySerializer,
    DocumentCategoryTreeSerializer,
    DocumentListSerializer,
    DocumentDetailSerializer,
    DocumentCreateSerializer,
    DocumentVersionSerializer,
    DocumentShareSerializer,
    DocumentShareCreateSerializer,
    DocumentAccessSerializer,
    DocumentSignatureSerializer,
    DocumentSignatureRequestSerializer,
    DocumentSignatureSubmitSerializer,
    DocumentSignatureDeclineSerializer,
    DocumentSearchSerializer,
    DocumentStatsSerializer
)


def get_client_ip(request):
    """Get client IP address from request"""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


def get_user_agent(request):
    """Get user agent from request"""
    return request.META.get('HTTP_USER_AGENT', '')


def log_document_access(document, user, action, request, share_link=None, notes=''):
    """Helper to log document access"""
    DocumentAccess.objects.create(
        document=document,
        user=user if user and user.is_authenticated else None,
        action=action,
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
        share_link=share_link,
        notes=notes
    )


class DocumentCategoryViewSet(viewsets.ModelViewSet):
    """ViewSet for DocumentCategory"""
    
    queryset = DocumentCategory.objects.all()
    serializer_class = DocumentCategorySerializer
    permission_classes = [IsAuthenticated, IsModuleEnabled('workorders')]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve', 'tree']:
            return [IsAuthenticated(), HasPermission('view_documents')]
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), HasPermission('manage_document_categories')]
        return [IsAuthenticated(), HasPermission('view_documents')()]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter, DjangoFilterBackend]
    search_fields = ['name', 'slug', 'description']
    ordering_fields = ['name', 'display_order', 'created_at']
    ordering = ['display_order', 'name']
    filterset_fields = ['is_active', 'parent']
    
    @action(detail=False, methods=['get'])
    def tree(self, request):
        """Get hierarchical category tree"""
        # Get root categories (no parent)
        root_categories = self.queryset.filter(
            parent__isnull=True,
            is_active=True
        ).order_by('display_order', 'name')
        
        serializer = DocumentCategoryTreeSerializer(root_categories, many=True)
        return Response(serializer.data)


import logging
logger = logging.getLogger(__name__)

class DocumentViewSet(viewsets.ModelViewSet):
    """ViewSet for Document with file upload and management"""
    
    queryset = Document.objects.select_related(
        'category',
        'uploaded_by',
        'customer',
        'vehicle',
        'work_order',
        'appointment',
        'invoice',
        'estimate'
    ).all()
    permission_classes = [IsAuthenticated, IsModuleEnabled('workorders')]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), HasPermission('view_documents')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('upload_documents')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('edit_documents')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('delete_documents')]
        return [IsAuthenticated(), HasPermission('view_documents')()]
    
    def get_queryset(self):
        """Filter queryset based on permissions and branch context"""
        queryset = super().get_queryset()
        user = self.request.user
        
        # If user can only view own, filter accordingly
        if user_has_permission(user, 'view_own_documents') and not user_has_permission(user, 'view_documents'):
            queryset = queryset.filter(uploaded_by=user)
            
        # Branch Filtering (Hybrid)
        if hasattr(user, 'is_superuser') and not user.is_superuser:
            branches = get_user_accessible_branches(user)
            
            # Logic: Show documents linked to accessible branches
            # OR documents not linked to any transactional entity
            branch_linked = (
                Q(work_order__branch__in=branches) |
                Q(appointment__branch__in=branches) |
                Q(invoice__branch__in=branches) |
                Q(estimate__branch__in=branches) |
                Q(asset_acquisition_request__branch__in=branches) |
                Q(fixed_asset__branch__in=branches)
            )
            
            has_transactional_entity = (
                Q(work_order__isnull=False) |
                Q(appointment__isnull=False) |
                Q(invoice__isnull=False) |
                Q(estimate__isnull=False) |
                Q(asset_acquisition_request__isnull=False) |
                Q(fixed_asset__isnull=False)
            )
            
            queryset = queryset.filter(branch_linked | ~has_transactional_entity).distinct()

        return queryset
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter, DjangoFilterBackend]
    search_fields = ['document_number', 'title', 'description', 'tags', 'original_filename']
    ordering_fields = ['uploaded_at', 'title', 'access_count', 'file_size']
    ordering = ['-uploaded_at']
    filterset_fields = [
        'status',
        'category',
        'file_type',
        'is_public',
        'uploaded_by',
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
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return DocumentListSerializer
        elif self.action == 'create':
            return DocumentCreateSerializer
        return DocumentDetailSerializer
    
    def perform_create(self, serializer):
        """Save document with current user as uploader"""
        serializer.save(uploaded_by=self.request.user)
    
    def retrieve(self, request, *args, **kwargs):
        """Retrieve document and log access"""
        instance = self.get_object()
        
        # Log access
        log_document_access(
            document=instance,
            user=request.user,
            action='viewed',
            request=request
        )
        
        # Increment access count
        instance.increment_access_count()
        
        serializer = self.get_serializer(instance)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """Download document file"""
        document = self.get_object()
        
        # Log download
        log_document_access(
            document=document,
            user=request.user,
            action='downloaded',
            request=request
        )
        
        # Increment access count
        document.increment_access_count()
        
        # Return file
        file_handle = document.file.open('rb')
        response = FileResponse(file_handle, content_type=document.file_type)
        response['Content-Disposition'] = f'attachment; filename="{document.original_filename}"'
        response['Content-Length'] = document.file_size
        
        return response
    
    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        """Preview document (inline display)"""
        document = self.get_object()
        
        # Log preview
        log_document_access(
            document=document,
            user=request.user,
            action='viewed',
            request=request,
            notes='Preview'
        )
        
        # Return file for inline display
        file_handle = document.file.open('rb')
        response = FileResponse(file_handle, content_type=document.file_type)
        response['Content-Disposition'] = f'inline; filename="{document.original_filename}"'
        
        return response
    
    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload_version(self, request, pk=None):
        """Upload a new version of the document"""
        document = self.get_object()
        
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response(
                {'error': 'No file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        changes_description = request.data.get('changes_description', '')
        
        # Create new version
        new_version_number = document.version_number + 1
        
        version = DocumentVersion.objects.create(
            document=document,
            version_number=new_version_number,
            file=file_obj,
            file_size=file_obj.size,
            file_type=file_obj.content_type,
            original_filename=file_obj.name,
            changes_description=changes_description,
            uploaded_by=request.user
        )
        
        # Update document
        document.file = file_obj
        document.version_number = new_version_number
        document.save()
        
        # Log action
        log_document_access(
            document=document,
            user=request.user,
            action='version_created',
            request=request,
            notes=f'Version {new_version_number} created'
        )
        
        serializer = DocumentVersionSerializer(version)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['get'])
    def versions(self, request, pk=None):
        """Get all versions of document"""
        document = self.get_object()
        versions = document.versions.all()
        serializer = DocumentVersionSerializer(versions, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def restore_version(self, request, pk=None):
        """Restore a specific version"""
        document = self.get_object()
        version_id = request.data.get('version_id')
        
        if not version_id:
            return Response(
                {'error': 'version_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        version = get_object_or_404(DocumentVersion, id=version_id, document=document)
        
        # Create new version from restored version
        new_version_number = document.version_number + 1
        
        DocumentVersion.objects.create(
            document=document,
            version_number=new_version_number,
            file=version.file,
            file_size=version.file_size,
            file_type=version.file_type,
            original_filename=version.original_filename,
            changes_description=f'Restored from version {version.version_number}',
            uploaded_by=request.user
        )
        
        # Update document
        document.file = version.file
        document.version_number = new_version_number
        document.save()
        
        # Log action
        log_document_access(
            document=document,
            user=request.user,
            action='version_restored',
            request=request,
            notes=f'Restored version {version.version_number}'
        )
        
        return Response({
            'message': f'Version {version.version_number} restored successfully',
            'new_version': new_version_number
        })
    
    @action(detail=True, methods=['post'])
    def share(self, request, pk=None):
        """Create a share link for document"""
        document = self.get_object()
        
        serializer = DocumentShareCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Calculate expiration
        expires_in_days = serializer.validated_data.get('expires_in_days', 7)
        expires_at = timezone.now() + timedelta(days=expires_in_days)
        
        # Create share
        share = DocumentShare.objects.create(
            document=document,
            shared_by=request.user,
            shared_with_email=serializer.validated_data.get('shared_with_email', ''),
            access_code=serializer.validated_data.get('access_code', ''),
            expires_at=expires_at,
            max_views=serializer.validated_data.get('max_views')
        )
        
        # Log action
        log_document_access(
            document=document,
            user=request.user,
            action='shared',
            request=request,
            notes=f'Shared with {share.shared_with_email or "anyone"}'
        )
        
        if serializer.validated_data.get('send_email', True) and share.shared_with_email:
            try:
                from django.core.mail import send_mail
                from django.conf import settings as django_settings
                from apps.accounts.settings_utils import get_site_url
                site_url = get_site_url()
                share_url = f"{site_url}/portal/documents/{share.share_token}"
                company_name = get_setting('company_name', 'Vehicle Repairs')
                send_mail(
                    subject=f"{company_name} – Document Shared: {document.title}",
                    message=(
                        f"Hello,\n\n"
                        f"{request.user.get_full_name() or request.user.email} has shared a document with you.\n\n"
                        f"Document: {document.title}\n"
                        f"Access link: {share_url}\n"
                        + (f"Access code required: {share.access_code}\n" if share.access_code else "")
                        + f"\nThis link expires on {share.expires_at.strftime('%Y-%m-%d %H:%M UTC') if share.expires_at else 'never'}.\n"
                    ),
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[share.shared_with_email],
                    fail_silently=True,
                )
            except Exception:
                pass  # Email failure must not block the API response

        response_serializer = DocumentShareSerializer(share)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'])
    def request_signature(self, request, pk=None):
        """Request a signature on document"""
        document = self.get_object()
        
        serializer = DocumentSignatureRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Calculate expiration
        expires_in_days = serializer.validated_data.get('expires_in_days', 7)
        expires_at = timezone.now() + timedelta(days=expires_in_days)
        
        # Create signature request
        signature = DocumentSignature.objects.create(
            document=document,
            signer_name=serializer.validated_data['signer_name'],
            signer_email=serializer.validated_data['signer_email'],
            expires_at=expires_at,
            notes=serializer.validated_data.get('notes', ''),
            requested_by=request.user
        )
        
        if serializer.validated_data.get('send_email', True):
            try:
                from django.core.mail import send_mail
                from django.conf import settings as django_settings
                from apps.accounts.settings_utils import get_site_url
                site_url = get_site_url()
                sign_url = f"{site_url}/portal/sign/{signature.request_token}"
                company_name = get_setting('company_name', 'Vehicle Repairs')
                send_mail(
                    subject=f"{company_name} – Signature Requested: {document.title}",
                    message=(
                        f"Hello {signature.signer_name},\n\n"
                        f"Your signature has been requested on the following document:\n\n"
                        f"Document: {document.title}\n"
                        f"Requested by: {request.user.get_full_name() or request.user.email}\n"
                        f"Sign here: {sign_url}\n"
                        + (f"Notes: {signature.notes}\n" if signature.notes else "")
                        + f"\nThis request expires on {signature.expires_at.strftime('%Y-%m-%d %H:%M UTC')}.\n"
                    ),
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[signature.signer_email],
                    fail_silently=True,
                )
            except Exception:
                pass  # Email failure must not block the API response

        response_serializer = DocumentSignatureSerializer(signature)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['get'])
    def signatures(self, request, pk=None):
        """Get all signature requests for document"""
        document = self.get_object()
        signatures = document.signatures.all()
        serializer = DocumentSignatureSerializer(signatures, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def access_logs(self, request, pk=None):
        """Get access logs for document"""
        document = self.get_object()
        logs = document.access_logs.all()[:100]  # Limit to last 100
        serializer = DocumentAccessSerializer(logs, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def search(self, request):
        """Advanced document search"""
        serializer = DocumentSearchSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        
        queryset = self.get_queryset()
        
        # Text search
        query = serializer.validated_data.get('query')
        if query:
            queryset = queryset.filter(
                Q(title__icontains=query) |
                Q(description__icontains=query) |
                Q(tags__icontains=query) |
                Q(document_number__icontains=query) |
                Q(original_filename__icontains=query)
            )
        
        # Filters
        if 'category' in serializer.validated_data:
            queryset = queryset.filter(category_id=serializer.validated_data['category'])
        
        if 'status' in serializer.validated_data:
            queryset = queryset.filter(status=serializer.validated_data['status'])
        
        if 'file_type' in serializer.validated_data:
            queryset = queryset.filter(file_type__icontains=serializer.validated_data['file_type'])
        
        if 'uploaded_by' in serializer.validated_data:
            queryset = queryset.filter(uploaded_by_id=serializer.validated_data['uploaded_by'])
        
        if 'customer' in serializer.validated_data:
            queryset = queryset.filter(customer_id=serializer.validated_data['customer'])
        
        if 'vehicle' in serializer.validated_data:
            queryset = queryset.filter(vehicle_id=serializer.validated_data['vehicle'])
        
        if 'work_order' in serializer.validated_data:
            queryset = queryset.filter(work_order_id=serializer.validated_data['work_order'])
        
        # Date range
        if 'date_from' in serializer.validated_data:
            queryset = queryset.filter(uploaded_at__gte=serializer.validated_data['date_from'])
        
        if 'date_to' in serializer.validated_data:
            queryset = queryset.filter(uploaded_at__lte=serializer.validated_data['date_to'])
        
        # Tags
        if 'tags' in serializer.validated_data:
            tags = serializer.validated_data['tags'].split(',')
            for tag in tags:
                queryset = queryset.filter(tags__icontains=tag.strip())
        
        # Paginate
        page = self.paginate_queryset(queryset)
        if page is not None:
            result_serializer = DocumentListSerializer(page, many=True)
            return self.get_paginated_response(result_serializer.data)
        
        result_serializer = DocumentListSerializer(queryset, many=True)
        return Response(result_serializer.data)
    
    @action(detail=True, methods=['post'])
    def process_voice_notes(self, request, pk=None):
        """Process an audio document using AI to transcribe and analyze"""
        document = self.get_object()
        
        # Simple check for audio files
        is_audio = 'audio' in document.file_type or document.original_filename.lower().endswith(('.mp3', '.wav', '.m4a', '.ogg'))
        
        if not is_audio:
            return Response(
                {'error': 'Document is not an audio file'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        from apps.core.services.ai_service import AIService
        
        try:
            # 1. Transcribe
            transcription = AIService.transcribe_audio(document.file)
            
            # 2. Analyze
            analysis = AIService.analyze_voice_data(transcription)
            
            # Store transcription in description if empty or as a tag
            if not document.description:
                document.description = transcription
            
            # Add analysis results to tags
            tags = set([t.strip() for t in document.tags.split(',')]) if document.tags else set()
            tags.add('ai_transcribed')
            tags.add(f"ai_cat_{analysis['suggested_category']}")
            tags.add(f"ai_sev_{analysis['suggested_severity']}")
            document.tags = ', '.join(filter(None, tags))
            
            document.save()
            
            return Response({
                'id': document.id,
                'transcription': transcription,
                'analysis': analysis,
                'message': 'Voice note processed successfully'
            })
            
        except Exception as e:
            return Response(
                {'error': f'Voice processing failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get document statistics"""
        queryset = self.get_queryset()
        
        # Total documents
        total_documents = queryset.count()
        
        # Total size
        total_size = queryset.aggregate(total=Sum('file_size'))['total'] or 0
        
        # By status
        by_status = {}
        for status_choice in Document.STATUS_CHOICES:
            count = queryset.filter(status=status_choice[0]).count()
            by_status[status_choice[1]] = count
        
        # By category
        by_category = {}
        categories = queryset.values('category__name').annotate(count=Count('id')).order_by('-count')[:10]
        for cat in categories:
            by_category[cat['category__name'] or 'Uncategorized'] = cat['count']
        
        # By file type
        by_file_type = {}
        file_types = queryset.values('file_type').annotate(count=Count('id')).order_by('-count')[:10]
        for ft in file_types:
            by_file_type[ft['file_type']] = ft['count']
        
        # Recent uploads
        recent = queryset.order_by('-uploaded_at')[:10]
        recent_uploads = DocumentListSerializer(recent, many=True).data
        
        # Most accessed
        most_accessed = queryset.order_by('-access_count')[:10]
        most_accessed_data = DocumentListSerializer(most_accessed, many=True).data
        
        # Human-readable total size
        size = total_size
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size < 1024.0:
                total_size_display = f"{size:.1f} {unit}"
                break
            size /= 1024.0
        else:
            total_size_display = f"{size:.1f} PB"
        
        data = {
            'total_documents': total_documents,
            'total_size': total_size,
            'total_size_display': total_size_display,
            'by_status': by_status,
            'by_category': by_category,
            'by_file_type': by_file_type,
            'recent_uploads': recent_uploads,
            'most_accessed': most_accessed_data
        }
        
        serializer = DocumentStatsSerializer(data)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def by_work_order(self, request):
        """Get documents for a specific work order"""
        work_order_id = request.query_params.get('work_order_id')
        if not work_order_id:
            return Response(
                {'error': 'work_order_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        documents = self.get_queryset().filter(work_order_id=work_order_id)
        serializer = DocumentListSerializer(documents, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def by_customer(self, request):
        """Get documents for a specific customer"""
        customer_id = request.query_params.get('customer_id')
        if not customer_id:
            return Response(
                {'error': 'customer_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        documents = self.get_queryset().filter(customer_id=customer_id)
        serializer = DocumentListSerializer(documents, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def by_vehicle(self, request):
        """Get documents for a specific vehicle"""
        vehicle_id = request.query_params.get('vehicle_id')
        if not vehicle_id:
            return Response(
                {'error': 'vehicle_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        documents = self.get_queryset().filter(vehicle_id=vehicle_id)
        serializer = DocumentListSerializer(documents, many=True)
        return Response(serializer.data)


class DocumentVersionViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for DocumentVersion (read-only)"""
    
    queryset = DocumentVersion.objects.select_related('document', 'uploaded_by').all()
    serializer_class = DocumentVersionSerializer
    permission_classes = [IsAuthenticated, IsModuleEnabled('workorders')]
    filter_backends = [filters.OrderingFilter, DjangoFilterBackend]
    ordering_fields = ['version_number', 'uploaded_at']
    ordering = ['-version_number']
    filterset_fields = ['document', 'uploaded_by']
    
    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """Download specific version"""
        version = self.get_object()
        
        # Log download
        log_document_access(
            document=version.document,
            user=request.user,
            action='downloaded',
            request=request,
            notes=f'Version {version.version_number} downloaded'
        )
        
        # Return file
        file_handle = version.file.open('rb')
        response = FileResponse(file_handle, content_type=version.file_type)
        response['Content-Disposition'] = f'attachment; filename="{version.original_filename}"'
        response['Content-Length'] = version.file_size
        
        return response


class DocumentShareViewSet(viewsets.ModelViewSet):
    """ViewSet for DocumentShare"""
    
    queryset = DocumentShare.objects.select_related('document', 'shared_by').all()
    serializer_class = DocumentShareSerializer
    permission_classes = [IsAuthenticated, IsModuleEnabled('workorders')]
    filter_backends = [filters.OrderingFilter, DjangoFilterBackend]
    ordering_fields = ['created_at', 'expires_at', 'view_count']
    ordering = ['-created_at']
    filterset_fields = ['document', 'shared_by', 'is_active']
    
    def get_permissions(self):
        """Allow public access for retrieve by token"""
        if self.action in ['retrieve_by_token', 'verify_code']:
            return [AllowAny()]
        return [IsAuthenticated(), HasPermission('view_documents')()]
    
    @action(detail=False, methods=['get'], url_path='(?P<token>[^/.]+)', permission_classes=[AllowAny])
    def retrieve_by_token(self, request, token=None):
        """Public endpoint to access shared document by token"""
        share = get_object_or_404(DocumentShare, share_token=token)
        
        # Check if expired
        if share.is_expired:
            return Response(
                {'error': 'This share link has expired'},
                status=status.HTTP_410_GONE
            )
        
        # Check if access code is required
        if share.access_code:
            # Require access code verification first
            return Response({
                'requires_code': True,
                'document_title': share.document.title,
                'shared_by': share.shared_by.get_full_name() or share.shared_by.email,
                'expires_at': share.expires_at
            })
        
        # Increment view count
        share.increment_view_count()
        
        # Log access
        log_document_access(
            document=share.document,
            user=None,
            action='viewed',
            request=request,
            share_link=share,
            notes='Accessed via share link'
        )
        
        # Return document details and file URL
        document_serializer = DocumentDetailSerializer(
            share.document,
            context={'request': request},
        )
        return Response({
            'document': document_serializer.data,
            'share_info': {
                'expires_at': share.expires_at,
                'views_remaining': share.max_views - share.view_count if share.max_views else None
            }
        })
    
    @action(
        detail=False,
        methods=['post'],
        url_path='(?P<token>[^/.]+)/verify_code',
        permission_classes=[AllowAny],
        throttle_classes=[ShareAccessCodeRateThrottle],
    )
    def verify_code(self, request, token=None):
        """Verify access code for share link"""
        share = get_object_or_404(DocumentShare, share_token=token)
        
        # Check if expired
        if share.is_expired:
            return Response(
                {'error': 'This share link has expired'},
                status=status.HTTP_410_GONE
            )
        
        access_code = request.data.get('access_code')
        if not access_code or access_code != share.access_code:
            return Response(
                {'error': 'Invalid access code'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Increment view count
        share.increment_view_count()
        
        # Log access
        log_document_access(
            document=share.document,
            user=None,
            action='viewed',
            request=request,
            share_link=share,
            notes='Accessed via share link with code'
        )
        
        # Return document details
        document_serializer = DocumentDetailSerializer(
            share.document,
            context={'request': request},
        )
        return Response({
            'document': document_serializer.data,
            'share_info': {
                'expires_at': share.expires_at,
                'views_remaining': share.max_views - share.view_count if share.max_views else None
            }
        })
    
    @action(detail=True, methods=['get'])
    def access_log(self, request, pk=None):
        """Get access log for share"""
        share = self.get_object()
        logs = share.access_logs.all()[:50]
        serializer = DocumentAccessSerializer(logs, many=True)
        return Response(serializer.data)


class DocumentAccessViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for DocumentAccess (read-only audit logs)"""
    
    queryset = DocumentAccess.objects.select_related('document', 'user', 'share_link').all()
    serializer_class = DocumentAccessSerializer
    permission_classes = [IsAuthenticated, HasPermission('view_documents')]
    filter_backends = [filters.OrderingFilter, DjangoFilterBackend]
    ordering_fields = ['accessed_at']
    ordering = ['-accessed_at']
    filterset_fields = ['document', 'user', 'action']


class DocumentSignatureViewSet(viewsets.ModelViewSet):
    """ViewSet for DocumentSignature"""
    
    queryset = DocumentSignature.objects.select_related('document', 'requested_by').all()
    serializer_class = DocumentSignatureSerializer
    filter_backends = [filters.OrderingFilter, DjangoFilterBackend]
    ordering_fields = ['request_sent_at', 'signed_at']
    ordering = ['-request_sent_at']
    filterset_fields = ['document', 'status', 'requested_by']
    
    def get_permissions(self):
        """Allow public access for signature submission"""
        if self.action in ['retrieve_by_token', 'sign', 'decline']:
            return [AllowAny()]
        return [IsAuthenticated(), HasPermission('view_documents')()]
    
    @action(detail=False, methods=['get'], url_path='(?P<token>[^/.]+)', permission_classes=[AllowAny])
    def retrieve_by_token(self, request, token=None):
        """Public endpoint to access signature request by token"""
        signature = get_object_or_404(DocumentSignature, request_token=token)
        
        # Check if expired
        if signature.is_expired:
            return Response(
                {'error': 'This signature request has expired'},
                status=status.HTTP_410_GONE
            )
        
        # Check if already signed/declined
        if signature.status in ['signed', 'declined']:
            return Response({
                'status': signature.status,
                'message': f'This document has already been {signature.status}',
                'signed_at': signature.signed_at,
                'decline_reason': signature.decline_reason if signature.status == 'declined' else None
            })
        
        # Return signature request details
        document_serializer = DocumentDetailSerializer(
            signature.document,
            context={'request': request},
        )
        return Response({
            'signature_request': {
                'signer_name': signature.signer_name,
                'signer_email': signature.signer_email,
                'notes': signature.notes,
                'expires_at': signature.expires_at,
                'requested_by': signature.requested_by.get_full_name() or signature.requested_by.email
            },
            'document': document_serializer.data
        })
    
    @action(detail=False, methods=['post'], url_path='(?P<token>[^/.]+)/sign', permission_classes=[AllowAny])
    def sign(self, request, token=None):
        """Public endpoint to submit signature"""
        signature = get_object_or_404(DocumentSignature, request_token=token)
        
        # Check if expired
        if signature.is_expired:
            return Response(
                {'error': 'This signature request has expired'},
                status=status.HTTP_410_GONE
            )
        
        # Check if already signed/declined
        if signature.status in ['signed', 'declined']:
            return Response(
                {'error': f'This document has already been {signature.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = DocumentSignatureSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Mark as signed
        signature.mark_signed(
            signature_data=serializer.validated_data['signature_data'],
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request)
        )
        
        return Response({
            'message': 'Document signed successfully',
            'signed_at': signature.signed_at
        })
    
    @action(detail=False, methods=['post'], url_path='(?P<token>[^/.]+)/decline', permission_classes=[AllowAny])
    def decline(self, request, token=None):
        """Public endpoint to decline signature"""
        signature = get_object_or_404(DocumentSignature, request_token=token)
        
        # Check if expired
        if signature.is_expired:
            return Response(
                {'error': 'This signature request has expired'},
                status=status.HTTP_410_GONE
            )
        
        # Check if already signed/declined
        if signature.status in ['signed', 'declined']:
            return Response(
                {'error': f'This document has already been {signature.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = DocumentSignatureDeclineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Mark as declined
        signature.mark_declined(
            reason=serializer.validated_data.get('reason', ''),
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request)
        )
        
        return Response({
            'message': 'Signature declined',
            'reason': signature.decline_reason
        })
