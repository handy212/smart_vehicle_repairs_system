# Phase 9: Document Management System

## Overview
Build a comprehensive document management system for storing, organizing, versioning, and sharing repair-related documents (estimates, invoices, photos, inspection reports, etc.).

## Timeline
**Estimated Duration:** 3-4 days

## Features

### 1. Core Document Management
- Upload documents (PDF, images, Word, Excel)
- Organize by categories
- Link documents to work orders, invoices, vehicles, customers
- Search and filter documents
- Preview documents (if possible)

### 2. Document Versioning
- Track document versions
- View version history
- Restore previous versions
- Compare versions

### 3. Document Sharing
- Share documents with customers
- Generate secure, time-limited access links
- Track who viewed documents and when
- Email documents to customers

### 4. Digital Signatures
- Request customer signatures on documents
- Capture digital signatures
- Track signature status
- Signature timestamp and IP tracking

### 5. Storage Management
- File upload validation (size, type)
- Thumbnail generation for images
- S3-compatible storage support
- Local filesystem fallback

## Models

### 1. DocumentCategory
```python
- name
- slug
- description
- icon
- parent (self-referential for hierarchy)
- is_active
- created_at, updated_at
```

### 2. Document
```python
- document_number (auto-generated: DOC-YYYY-MM-001)
- title
- description
- category (FK to DocumentCategory)
- file (FileField)
- file_size
- file_type (mime type)
- thumbnail (for images)
- version_number (starts at 1)
- is_latest_version
- status (draft, active, archived)
- tags (TextField for comma-separated tags)

# Relationships
- customer (FK, optional)
- vehicle (FK, optional)
- work_order (FK, optional)
- appointment (FK, optional)
- invoice (FK, optional)
- estimate (FK, optional)

# Metadata
- uploaded_by (FK to User)
- uploaded_at
- last_accessed_at
- access_count
- is_public (for public sharing)
```

### 3. DocumentVersion
```python
- document (FK to Document)
- version_number
- file (FileField)
- file_size
- file_type
- changes_description
- uploaded_by (FK to User)
- uploaded_at
```

### 4. DocumentShare
```python
- document (FK to Document)
- shared_by (FK to User)
- shared_with_email
- share_token (unique token for access)
- access_code (optional PIN for extra security)
- expires_at
- max_views (optional)
- view_count
- is_active
- created_at
- last_accessed_at
```

### 5. DocumentAccess
```python
- document (FK to Document)
- user (FK to User, optional for anonymous)
- accessed_at
- ip_address
- user_agent
- action (viewed, downloaded, shared, deleted)
```

### 6. DocumentSignature
```python
- document (FK to Document)
- signer_name
- signer_email
- signature_data (Base64 encoded signature image)
- signed_at
- ip_address
- user_agent
- status (pending, signed, declined)
- request_sent_at
- request_token (for secure access)
- notes
```

## API Endpoints (Approx. 25-30 endpoints)

### Document Categories
- `GET /api/documents/categories/` - List categories
- `POST /api/documents/categories/` - Create category
- `GET /api/documents/categories/{id}/` - Get category
- `PUT /api/documents/categories/{id}/` - Update category
- `DELETE /api/documents/categories/{id}/` - Delete category
- `GET /api/documents/categories/tree/` - Get hierarchical tree

### Documents
- `GET /api/documents/documents/` - List documents (with filters)
- `POST /api/documents/documents/` - Upload document
- `GET /api/documents/documents/{id}/` - Get document details
- `PUT /api/documents/documents/{id}/` - Update document metadata
- `DELETE /api/documents/documents/{id}/` - Delete document
- `GET /api/documents/documents/{id}/download/` - Download document
- `GET /api/documents/documents/{id}/preview/` - Preview document (if supported)
- `POST /api/documents/documents/{id}/upload_version/` - Upload new version
- `GET /api/documents/documents/search/` - Search documents
- `GET /api/documents/documents/by_work_order/{wo_id}/` - Get WO documents
- `GET /api/documents/documents/by_customer/{customer_id}/` - Get customer documents
- `GET /api/documents/documents/by_vehicle/{vehicle_id}/` - Get vehicle documents

### Document Versions
- `GET /api/documents/versions/` - List versions
- `GET /api/documents/versions/{id}/` - Get version details
- `GET /api/documents/versions/{id}/download/` - Download version
- `GET /api/documents/documents/{doc_id}/versions/` - Get all versions of document
- `POST /api/documents/documents/{doc_id}/restore_version/{version_id}/` - Restore version

### Document Sharing
- `POST /api/documents/documents/{id}/share/` - Create share link
- `GET /api/documents/shares/` - List shares
- `GET /api/documents/shares/{token}/` - Access shared document (public)
- `POST /api/documents/shares/{token}/verify_code/` - Verify access code
- `DELETE /api/documents/shares/{id}/` - Revoke share
- `GET /api/documents/shares/{id}/access_log/` - View share access log

### Document Signatures
- `POST /api/documents/documents/{id}/request_signature/` - Request signature
- `GET /api/documents/signatures/` - List signatures
- `GET /api/documents/signatures/{token}/` - Get signature request (public)
- `POST /api/documents/signatures/{token}/sign/` - Submit signature (public)
- `POST /api/documents/signatures/{token}/decline/` - Decline signature
- `GET /api/documents/documents/{id}/signatures/` - Get document signatures

### Access Logs
- `GET /api/documents/access_logs/` - List access logs
- `GET /api/documents/documents/{id}/access_logs/` - Get document access logs

## File Storage Configuration

### Settings
```python
# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Document storage
DOCUMENTS_ROOT = os.path.join(MEDIA_ROOT, 'documents')
DOCUMENT_THUMBNAILS_ROOT = os.path.join(MEDIA_ROOT, 'thumbnails')

# File upload limits
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB
ALLOWED_DOCUMENT_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

# Optional: AWS S3 Configuration (for production)
USE_S3 = os.getenv('USE_S3', 'False') == 'True'
if USE_S3:
    DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
    AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
    AWS_STORAGE_BUCKET_NAME = os.getenv('AWS_STORAGE_BUCKET_NAME')
    AWS_S3_REGION_NAME = os.getenv('AWS_S3_REGION_NAME', 'us-east-1')
```

## Security Features

1. **Access Control:**
   - Role-based permissions for upload, view, delete
   - Private documents only accessible to authorized users
   - Share links with expiration and view limits

2. **File Validation:**
   - Whitelist allowed file types
   - Scan file size limits
   - Validate file content (not just extension)

3. **Secure Sharing:**
   - Unique, cryptographically secure tokens
   - Optional PIN codes for extra security
   - Time-limited access
   - View count limits

4. **Audit Trail:**
   - Track all document access
   - Log uploads, downloads, shares, deletions
   - IP address and user agent tracking

## Additional Features

### 1. Thumbnail Generation
Use Pillow to generate thumbnails for image uploads:
```python
from PIL import Image
from io import BytesIO
from django.core.files.base import ContentFile

def generate_thumbnail(image_file, size=(300, 300)):
    img = Image.open(image_file)
    img.thumbnail(size, Image.LANCZOS)
    thumb_io = BytesIO()
    img.save(thumb_io, format='JPEG', quality=85)
    return ContentFile(thumb_io.getvalue())
```

### 2. Document Numbering
Auto-generate document numbers:
```python
def generate_document_number():
    today = timezone.now().date()
    prefix = f"DOC-{today.year}-{today.month:02d}"
    last_doc = Document.objects.filter(
        document_number__startswith=prefix
    ).order_by('-document_number').first()
    
    if last_doc:
        last_num = int(last_doc.document_number.split('-')[-1])
        new_num = last_num + 1
    else:
        new_num = 1
    
    return f"{prefix}-{new_num:04d}"
```

### 3. Search Functionality
Full-text search on:
- Document title
- Description
- Tags
- File name
- Related entity names (customer, vehicle, etc.)

## Testing Checklist

- [ ] Upload various file types (PDF, images, Office docs)
- [ ] Create document versions
- [ ] Share document with email
- [ ] Access shared document with token
- [ ] Request and submit digital signature
- [ ] Search documents by various criteria
- [ ] Download documents and versions
- [ ] Generate thumbnails for images
- [ ] Test file size limits
- [ ] Test access control (permissions)
- [ ] View access logs and audit trail
- [ ] Test expiring share links
- [ ] Test view count limits on shares

## Dependencies

```bash
pip install Pillow  # For image processing and thumbnails
# Optional for S3:
# pip install boto3 django-storages
```

## Success Criteria

- ✅ All 6 models created with proper relationships
- ✅ ~25-30 API endpoints functional
- ✅ File upload and storage working
- ✅ Document versioning functional
- ✅ Secure sharing with tokens
- ✅ Digital signature capture working
- ✅ Thumbnails generated for images
- ✅ Search and filter working
- ✅ Access logs tracking all actions
- ✅ Admin interface configured
- ✅ Comprehensive API documentation

## Future Enhancements (Post-Phase 9)

1. **OCR Integration:** Extract text from scanned documents
2. **PDF Generation:** Generate PDFs from estimates, invoices
3. **Document Templates:** Pre-defined templates for common documents
4. **Bulk Operations:** Upload multiple files, bulk share
5. **Document Approval Workflow:** Multi-step approval process
6. **Integration with Email:** Auto-attach documents to notification emails
7. **Mobile Upload:** Camera integration for mobile apps
8. **Document Comparison:** Visual diff for document versions

---

**Ready to start Phase 9?** Let's begin with creating the models! 🚀
