"""
Document Management models for file storage, versioning, sharing, and signatures
"""
from django.db import models
from django.core.validators import MinValueValidator, FileExtensionValidator
from django.utils import timezone
from django.conf import settings
from decimal import Decimal
import secrets
import os
from PIL import Image
from io import BytesIO
from django.core.files.base import ContentFile


def document_upload_path(instance, filename):
    """Generate upload path for documents"""
    # Organize by year/month/day
    now = timezone.now()
    date_path = now.strftime('%Y/%m/%d')
    # Keep original filename with timestamp prefix to avoid collisions
    safe_filename = f"{now.timestamp()}_{filename}"
    return f'documents/{date_path}/{safe_filename}'


def thumbnail_upload_path(instance, filename):
    """Generate upload path for thumbnails"""
    now = timezone.now()
    date_path = now.strftime('%Y/%m/%d')
    name, ext = os.path.splitext(filename)
    return f'thumbnails/{date_path}/{name}_thumb{ext}'


class DocumentCategory(models.Model):
    """Categories for organizing documents"""
    
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    icon = models.CharField(
        max_length=50,
        blank=True,
        help_text="Icon class (e.g., 'fa-folder', 'bi-file-earmark')"
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        help_text="Parent category for hierarchical organization"
    )
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name_plural = "Document Categories"
        ordering = ['display_order', 'name']
        indexes = [
            models.Index(fields=['slug']),
            models.Index(fields=['is_active', 'display_order']),
        ]
    
    def __str__(self):
        if self.parent:
            return f"{self.parent.name} > {self.name}"
        return self.name
    
    @property
    def full_path(self):
        """Get full hierarchical path"""
        if self.parent:
            return f"{self.parent.full_path} > {self.name}"
        return self.name


class Document(models.Model):
    """Main document/file storage model"""
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('active', 'Active'),
        ('archived', 'Archived'),
    ]
    
    # Auto-generated document number
    document_number = models.CharField(max_length=30, unique=True, editable=False, db_index=True)
    
    # Basic info
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    category = models.ForeignKey(
        DocumentCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='documents'
    )
    
    # File fields
    file = models.FileField(upload_to=document_upload_path)
    file_size = models.BigIntegerField(help_text="File size in bytes")
    file_type = models.CharField(max_length=100, help_text="MIME type")
    original_filename = models.CharField(max_length=255)
    thumbnail = models.ImageField(
        upload_to=thumbnail_upload_path,
        null=True,
        blank=True,
        help_text="Thumbnail for image files"
    )
    
    # Versioning
    version_number = models.IntegerField(default=1)
    is_latest_version = models.BooleanField(default=True)
    
    # Status and metadata
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    tags = models.TextField(
        blank=True,
        help_text="Comma-separated tags for searching"
    )
    
    # Relationships to other entities (all optional)
    customer = models.ForeignKey(
        'customers.Customer',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_documents'
    )
    vehicle = models.ForeignKey(
        'vehicles.Vehicle',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_documents'
    )
    work_order = models.ForeignKey(
        'workorders.WorkOrder',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_documents'
    )
    appointment = models.ForeignKey(
        'appointments.Appointment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_documents'
    )
    invoice = models.ForeignKey(
        'billing.Invoice',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_documents'
    )
    estimate = models.ForeignKey(
        'billing.Estimate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_documents'
    )
    
    # Access tracking
    is_public = models.BooleanField(
        default=False,
        help_text="If true, document can be accessed without authentication"
    )
    access_count = models.IntegerField(default=0)
    last_accessed_at = models.DateTimeField(null=True, blank=True)
    
    # Audit fields
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='uploaded_documents'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-uploaded_at']
        indexes = [
            models.Index(fields=['document_number']),
            models.Index(fields=['status', '-uploaded_at']),
            models.Index(fields=['category', 'status']),
            models.Index(fields=['customer', 'status']),
            models.Index(fields=['vehicle', 'status']),
            models.Index(fields=['work_order', 'status']),
            models.Index(fields=['-uploaded_at']),
        ]
    
    def __str__(self):
        return f"{self.document_number} - {self.title}"
    
    def save(self, *args, **kwargs):
        # Generate document number on creation
        if not self.document_number:
            self.document_number = self.generate_document_number()
        
        # Extract file metadata
        if self.file:
            self.file_size = self.file.size
            self.original_filename = os.path.basename(self.file.name)
            # Get MIME type (simplified - in production use python-magic)
            ext = os.path.splitext(self.original_filename)[1].lower()
            mime_types = {
                '.pdf': 'application/pdf',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.doc': 'application/msword',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.xls': 'application/vnd.ms-excel',
                '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }
            self.file_type = mime_types.get(ext, 'application/octet-stream')
        
        super().save(*args, **kwargs)
        
        # Generate thumbnail for images
        if self.file_type.startswith('image/') and not self.thumbnail:
            self.create_thumbnail()
    
    @staticmethod
    def generate_document_number():
        """Generate unique document number: DOC-YYYY-MM-001"""
        today = timezone.now().date()
        prefix = f"DOC-{today.year}-{today.month:02d}"
        
        last_doc = Document.objects.filter(
            document_number__startswith=prefix
        ).order_by('-document_number').first()
        
        if last_doc:
            try:
                last_num = int(last_doc.document_number.split('-')[-1])
                new_num = last_num + 1
            except (ValueError, IndexError):
                new_num = 1
        else:
            new_num = 1
        
        return f"{prefix}-{new_num:04d}"
    
    def create_thumbnail(self, size=(300, 300)):
        """Create thumbnail for image files"""
        if not self.file or not self.file_type.startswith('image/'):
            return
        
        try:
            img = Image.open(self.file)
            img.thumbnail(size, Image.Resampling.LANCZOS)
            
            thumb_io = BytesIO()
            # Convert RGBA to RGB if necessary
            if img.mode in ('RGBA', 'LA', 'P'):
                rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                rgb_img.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = rgb_img
            
            img.save(thumb_io, format='JPEG', quality=85)
            
            thumb_file = ContentFile(thumb_io.getvalue())
            thumb_name = f"{self.document_number}_thumb.jpg"
            
            self.thumbnail.save(thumb_name, thumb_file, save=False)
            super().save(update_fields=['thumbnail'])
        except Exception as e:
            print(f"Failed to create thumbnail: {e}")
    
    @property
    def file_size_display(self):
        """Human-readable file size"""
        size = self.file_size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024.0:
                return f"{size:.1f} {unit}"
            size /= 1024.0
        return f"{size:.1f} TB"
    
    @property
    def is_image(self):
        """Check if document is an image"""
        return self.file_type.startswith('image/')
    
    @property
    def is_pdf(self):
        """Check if document is a PDF"""
        return self.file_type == 'application/pdf'
    
    def increment_access_count(self):
        """Increment access counter"""
        self.access_count += 1
        self.last_accessed_at = timezone.now()
        self.save(update_fields=['access_count', 'last_accessed_at'])


class DocumentVersion(models.Model):
    """Version history for documents"""
    
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='versions'
    )
    version_number = models.IntegerField()
    
    # File for this version
    file = models.FileField(upload_to=document_upload_path)
    file_size = models.BigIntegerField()
    file_type = models.CharField(max_length=100)
    original_filename = models.CharField(max_length=255)
    
    # Version metadata
    changes_description = models.TextField(
        blank=True,
        help_text="Description of changes in this version"
    )
    
    # Audit fields
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='uploaded_document_versions'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-version_number']
        unique_together = ['document', 'version_number']
        indexes = [
            models.Index(fields=['document', '-version_number']),
        ]
    
    def __str__(self):
        return f"{self.document.document_number} v{self.version_number}"


class DocumentShare(models.Model):
    """Sharing documents via secure links"""
    
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='shares'
    )
    
    # Who shared it
    shared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='document_shares_created'
    )
    
    # Who it's shared with
    shared_with_email = models.EmailField(
        blank=True,
        help_text="Email address of recipient (optional)"
    )
    
    # Access control
    share_token = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        editable=False
    )
    access_code = models.CharField(
        max_length=20,
        blank=True,
        help_text="Optional PIN code for extra security"
    )
    
    # Expiration and limits
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the share link expires"
    )
    max_views = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1)],
        help_text="Maximum number of times document can be viewed"
    )
    view_count = models.IntegerField(default=0)
    
    # Status
    is_active = models.BooleanField(default=True)
    
    # Tracking
    created_at = models.DateTimeField(auto_now_add=True)
    last_accessed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['share_token']),
            models.Index(fields=['document', 'is_active']),
            models.Index(fields=['-created_at']),
        ]
    
    def __str__(self):
        return f"Share {self.document.document_number} with {self.shared_with_email or 'anyone'}"
    
    def save(self, *args, **kwargs):
        if not self.share_token:
            self.share_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)
    
    @property
    def is_expired(self):
        """Check if share has expired"""
        if not self.is_active:
            return True
        if self.expires_at and timezone.now() > self.expires_at:
            return True
        if self.max_views and self.view_count >= self.max_views:
            return True
        return False
    
    @property
    def share_url(self):
        """Get the full share URL"""
        from django.conf import settings
        base_url = getattr(settings, 'SITE_URL', 'http://localhost:8000')
        return f"{base_url}/api/documents/shares/{self.share_token}/"
    
    def increment_view_count(self):
        """Increment view counter"""
        self.view_count += 1
        self.last_accessed_at = timezone.now()
        self.save(update_fields=['view_count', 'last_accessed_at'])


class DocumentAccess(models.Model):
    """Audit log for document access"""
    
    ACTION_CHOICES = [
        ('viewed', 'Viewed'),
        ('downloaded', 'Downloaded'),
        ('shared', 'Shared'),
        ('deleted', 'Deleted'),
        ('updated', 'Updated'),
        ('version_created', 'Version Created'),
        ('version_restored', 'Version Restored'),
    ]
    
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='access_logs'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='document_accesses',
        help_text="Null for anonymous access via share links"
    )
    
    # Access details
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    accessed_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    
    # Additional context
    share_link = models.ForeignKey(
        DocumentShare,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='access_logs'
    )
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-accessed_at']
        indexes = [
            models.Index(fields=['document', '-accessed_at']),
            models.Index(fields=['user', '-accessed_at']),
            models.Index(fields=['-accessed_at']),
        ]
    
    def __str__(self):
        user_str = self.user.email if self.user else 'Anonymous'
        return f"{user_str} {self.action} {self.document.document_number}"


class DocumentSignature(models.Model):
    """Digital signature requests and submissions"""
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('signed', 'Signed'),
        ('declined', 'Declined'),
        ('expired', 'Expired'),
    ]
    
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='signatures'
    )
    
    # Signer info
    signer_name = models.CharField(max_length=200)
    signer_email = models.EmailField()
    
    # Signature data
    signature_data = models.TextField(
        blank=True,
        help_text="Base64 encoded signature image"
    )
    
    # Status and timing
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    request_sent_at = models.DateTimeField(auto_now_add=True)
    signed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the signature request expires"
    )
    
    # Security
    request_token = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        editable=False
    )
    
    # Tracking
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    
    # Additional info
    notes = models.TextField(blank=True)
    decline_reason = models.TextField(blank=True)
    
    # Who requested the signature
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='signature_requests_created'
    )
    
    class Meta:
        ordering = ['-request_sent_at']
        indexes = [
            models.Index(fields=['request_token']),
            models.Index(fields=['document', 'status']),
            models.Index(fields=['status', '-request_sent_at']),
            models.Index(fields=['-request_sent_at']),
        ]
    
    def __str__(self):
        return f"Signature request for {self.document.document_number} - {self.signer_name} ({self.status})"
    
    def save(self, *args, **kwargs):
        if not self.request_token:
            self.request_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)
    
    @property
    def is_expired(self):
        """Check if signature request has expired"""
        if self.status in ['signed', 'declined']:
            return False
        if self.expires_at and timezone.now() > self.expires_at:
            return True
        return False
    
    @property
    def signature_url(self):
        """Get the signature request URL"""
        from django.conf import settings
        base_url = getattr(settings, 'SITE_URL', 'http://localhost:8000')
        return f"{base_url}/api/documents/signatures/{self.request_token}/"
    
    def mark_signed(self, signature_data, ip_address=None, user_agent=None):
        """Mark signature as signed"""
        self.signature_data = signature_data
        self.status = 'signed'
        self.signed_at = timezone.now()
        if ip_address:
            self.ip_address = ip_address
        if user_agent:
            self.user_agent = user_agent
        self.save()
    
    def mark_declined(self, reason='', ip_address=None, user_agent=None):
        """Mark signature as declined"""
        self.status = 'declined'
        self.decline_reason = reason
        if ip_address:
            self.ip_address = ip_address
        if user_agent:
            self.user_agent = user_agent
        self.save()
